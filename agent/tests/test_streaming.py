"""
Phase 4 Automated Test Suite: Streaming, Low Latency & Interruption.
Validates:
- SentenceSplitter boundary detection & token buffering
- StreamingVAD turn detection & endpointing
- Streaming STT partial transcripts
- Streaming LLM token generation & TTFT tracking
- Incremental TTS synthesis & TTFA tracking
- Barge-in interruption & task cancellation
- Prevention of overlapping responses
"""

import math
import struct
import asyncio
import unittest

from agent.adapters.base import VADState, TurnLatencyProfile
from agent.adapters.vad import EnergyVAD, StreamingVAD
from agent.adapters.stt import MockSTT
from agent.adapters.llm import MockLLM
from agent.adapters.tts import MockTTS, SentenceSplitter
from agent.core.context import ConversationContext
from agent.core.streaming_pipeline import StreamingVoicePipeline


def generate_pcm_frame(freq_hz: float = 440.0, duration_ms: int = 20, sample_rate: int = 16000, amplitude: float = 16000.0) -> bytes:
    """Generate 16-bit mono PCM sine wave frame."""
    num_samples = int(sample_rate * (duration_ms / 1000.0))
    samples = []
    for i in range(num_samples):
        val = int(amplitude * math.sin(2.0 * math.pi * freq_hz * (i / sample_rate)))
        val = max(-32768, min(32767, val))
        samples.append(val)
    return struct.pack(f"<{len(samples)}h", *samples)


def generate_silence_frame(duration_ms: int = 20, sample_rate: int = 16000) -> bytes:
    """Generate 16-bit mono PCM silence frame."""
    num_samples = int(sample_rate * (duration_ms / 1000.0))
    return struct.pack(f"<{num_samples}h", *([0] * num_samples))


class TestSentenceSplitter(unittest.IsolatedAsyncioTestCase):
    async def test_standard_sentence_splitting(self):
        splitter = SentenceSplitter(min_words_for_comma=3, max_words_per_clause=10)

        async def _tokens():
            tokens = ["Hello ", "there! ", "How ", "are ", "you ", "today? ", "I ", "am ", "fine."]
            for t in tokens:
                yield t

        clauses = []
        async for clause in splitter.split_stream(_tokens()):
            clauses.append(clause)

        self.assertGreaterEqual(len(clauses), 2)
        self.assertEqual(clauses[0], "Hello there!")
        self.assertEqual(clauses[1], "How are you today?")
        self.assertEqual(clauses[2], "I am fine.")

    async def test_comma_clause_splitting(self):
        splitter = SentenceSplitter(min_words_for_comma=3, max_words_per_clause=10)

        async def _tokens():
            tokens = ["React ", "is ", "great, ", "especially ", "for ", "UIs."]
            for t in tokens:
                yield t

        clauses = []
        async for clause in splitter.split_stream(_tokens()):
            clauses.append(clause)

        self.assertEqual(len(clauses), 2)
        self.assertEqual(clauses[0], "React is great,")
        self.assertEqual(clauses[1], "especially for UIs.")


class TestStreamingVAD(unittest.TestCase):
    def setUp(self):
        self.streaming_vad = StreamingVAD(
            base_vad=EnergyVAD(energy_threshold=500.0),
            frame_duration_ms=20,
            speech_threshold_ms=60,
            trailing_silence_ms=100,
        )

    def test_turn_detection_and_endpointing(self):
        # 1. Send silence
        for _ in range(5):
            event = self.streaming_vad.process_frame(generate_silence_frame(20))
            self.assertEqual(event.state, VADState.SILENCE)

        # 2. Send 3 speech frames (60ms) to trigger speech start
        events = []
        for _ in range(3):
            events.append(self.streaming_vad.process_frame(generate_pcm_frame(duration_ms=20, amplitude=15000.0)))

        self.assertEqual(events[-1].state, VADState.SPEECH_START)
        self.assertTrue(self.streaming_vad.is_speaking)

        # 3. Send speech ongoing
        ongoing_event = self.streaming_vad.process_frame(generate_pcm_frame(duration_ms=20, amplitude=15000.0))
        self.assertEqual(ongoing_event.state, VADState.SPEECH_ONGOING)

        # 4. Send trailing silence (5 frames = 100ms) to trigger endpoint
        endpoint_event = None
        for _ in range(5):
            endpoint_event = self.streaming_vad.process_frame(generate_silence_frame(20))

        self.assertEqual(endpoint_event.state, VADState.SPEECH_END)
        self.assertFalse(self.streaming_vad.is_speaking)
        self.assertGreater(len(self.streaming_vad.get_speech_bytes()), 0)


class TestStreamingSTT(unittest.IsolatedAsyncioTestCase):
    async def test_partial_transcript_emission(self):
        stt = MockSTT(default_text="Hello Vaani, how does streaming work?")

        async def _frames():
            for _ in range(6):
                yield generate_pcm_frame(20)

        chunks = []
        async for chunk in stt.stream_transcribe(_frames()):
            chunks.append(chunk)

        # Should have partial chunk(s) and a final chunk
        self.assertGreaterEqual(len(chunks), 2)
        self.assertTrue(chunks[-1].is_final)
        self.assertEqual(chunks[-1].text, "Hello Vaani, how does streaming work?")


class TestStreamingLLM(unittest.IsolatedAsyncioTestCase):
    async def test_ttft_and_token_stream(self):
        llm = MockLLM()
        messages = [{"role": "user", "content": "Tell me about streaming."}]

        chunks = []
        async for chunk in llm.stream_generate(messages):
            chunks.append(chunk)

        self.assertGreater(len(chunks), 0)
        self.assertTrue(chunks[0].is_first_token)
        self.assertTrue(chunks[-1].is_final)
        self.assertTrue(len(chunks[-1].accumulated_text) > 0)


class TestStreamingTTS(unittest.IsolatedAsyncioTestCase):
    async def test_ttfa_and_incremental_audio(self):
        tts = MockTTS()

        async def _clauses():
            yield "First short sentence."
            yield "Second short sentence."

        chunks = []
        async for chunk in tts.stream_synthesize(_clauses()):
            chunks.append(chunk)

        self.assertEqual(len(chunks), 2)
        self.assertTrue(chunks[0].is_first_chunk)
        self.assertFalse(chunks[1].is_first_chunk)
        self.assertEqual(chunks[0].audio_format, "wav")
        self.assertGreater(len(chunks[0].audio_bytes), 44)


class TestStreamingVoicePipeline(unittest.IsolatedAsyncioTestCase):
    async def test_end_to_end_streaming_turn(self):
        pipeline = StreamingVoicePipeline(
            vad=EnergyVAD(energy_threshold=500.0),
            stt=MockSTT(default_text="Namaste Vaani."),
            llm=MockLLM(),
            tts=MockTTS(),
        )

        async def _user_audio():
            # Initial silence
            for _ in range(2):
                yield generate_silence_frame(20)
            # Speech frames
            for _ in range(5):
                yield generate_pcm_frame(20, amplitude=15000.0)
            # Trailing silence (150ms to trigger endpoint)
            for _ in range(8):
                yield generate_silence_frame(20)

        res = await pipeline.process_streaming_turn(_user_audio())

        self.assertTrue(res.is_speech)
        self.assertEqual(res.transcript, "Namaste Vaani.")
        self.assertTrue(len(res.response_text) > 0)
        self.assertGreater(len(res.audio_chunks), 0)

        # Verify complete latency instrumentation
        p = res.latency_profile
        self.assertGreater(p.speech_start_ts, 0)
        self.assertGreater(p.speech_end_ts, 0)
        self.assertGreater(p.transcript_start_ts, 0)
        self.assertGreater(p.transcript_complete_ts, 0)
        self.assertGreater(p.llm_start_ts, 0)
        self.assertGreater(p.first_token_ts, 0)
        self.assertGreater(p.tts_start_ts, 0)
        self.assertGreater(p.first_audio_ts, 0)
        self.assertGreater(p.response_complete_ts, 0)

        # Derived metrics verification
        self.assertGreater(p.ttft_ms, 0)
        self.assertGreater(p.ttfa_ms, 0)
        self.assertGreater(p.total_turn_ms, 0)

    async def test_barge_in_interruption(self):
        pipeline = StreamingVoicePipeline(
            vad=EnergyVAD(energy_threshold=500.0),
            stt=MockSTT(default_text="Long answer request."),
            llm=MockLLM(),
            tts=MockTTS(),
        )

        interrupted_called = False

        def _on_interrupt():
            nonlocal interrupted_called
            interrupted_called = True

        pipeline.on_interrupted = _on_interrupt

        # Start a turn
        async def _speech():
            for _ in range(4):
                yield generate_pcm_frame(20, amplitude=15000.0)
            for _ in range(6):
                yield generate_silence_frame(20)

        task = asyncio.create_task(pipeline.process_streaming_turn(_speech()))
        for _ in range(50):
            if pipeline.is_active:
                break
            await asyncio.sleep(0.01)

        # Trigger barge-in
        was_interrupted = pipeline.interrupt()
        self.assertTrue(was_interrupted)
        self.assertTrue(interrupted_called)

        res = await task
        self.assertTrue(res.interrupted)


if __name__ == "__main__":
    unittest.main()
