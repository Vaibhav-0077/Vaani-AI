"""
Tests for Vaani-AI Voice Pipeline (Phase 3).
Validates VAD, STT, LLM, TTS, ConversationContext, and VoicePipeline end-to-end.
"""

import math
import struct
import unittest

from agent.adapters.vad import EnergyVAD
from agent.adapters.stt import MockSTT
from agent.adapters.llm import MockLLM
from agent.adapters.tts import MockTTS
from agent.core.context import ConversationContext
from agent.core.pipeline import VoicePipeline


def generate_pcm_sine(freq_hz: float = 440.0, duration_s: float = 0.5, sample_rate: int = 16000, amplitude: float = 16000.0) -> bytes:
    """Generate 16-bit mono PCM sine wave."""
    samples = []
    num_samples = int(sample_rate * duration_s)
    for i in range(num_samples):
        val = int(amplitude * math.sin(2.0 * math.pi * freq_hz * (i / sample_rate)))
        val = max(-32768, min(32767, val))
        samples.append(val)
    return struct.pack(f"<{len(samples)}h", *samples)


def generate_pcm_silence(duration_s: float = 0.5, sample_rate: int = 16000) -> bytes:
    """Generate 16-bit mono PCM silence."""
    num_samples = int(sample_rate * duration_s)
    return struct.pack(f"<{num_samples}h", *([0] * num_samples))


class TestEnergyVAD(unittest.TestCase):
    def setUp(self):
        self.vad = EnergyVAD(energy_threshold=500.0)

    def test_silence_detection(self):
        silence = generate_pcm_silence(duration_s=0.2)
        self.assertFalse(self.vad.detect_speech(silence))
        self.assertLess(self.vad.calculate_rms(silence), 500.0)

    def test_speech_detection(self):
        speech = generate_pcm_sine(freq_hz=440.0, duration_s=0.2, amplitude=15000.0)
        self.assertTrue(self.vad.detect_speech(speech))
        self.assertGreater(self.vad.calculate_rms(speech), 500.0)

    def test_empty_audio_handling(self):
        self.assertFalse(self.vad.detect_speech(b""))
        self.assertEqual(self.vad.calculate_rms(b""), 0.0)


class TestSTT(unittest.TestCase):
    def test_mock_stt(self):
        stt = MockSTT(default_text="Namaste, main Vaani hoon.")
        result = stt.transcribe(b"dummy_audio")
        self.assertEqual(result.text, "Namaste, main Vaani hoon.")
        self.assertEqual(result.language, "hi")
        self.assertGreater(result.confidence, 0.9)


class TestLLM(unittest.TestCase):
    def setUp(self):
        self.llm = MockLLM()

    def test_mock_llm_english(self):
        messages = [{"role": "user", "content": "Who are you?"}]
        result = self.llm.generate(messages)
        self.assertIn("Vaani", result.text)
        self.assertGreater(result.tokens_used, 0)

    def test_mock_llm_hindi(self):
        messages = [{"role": "user", "content": "Namaste, aap kaun ho?"}]
        result = self.llm.generate(messages)
        self.assertIn("Vaani", result.text)
        self.assertIn("Namaste", result.text)


class TestTTS(unittest.TestCase):
    def test_mock_tts_wav_structure(self):
        tts = MockTTS(sample_rate=16000)
        result = tts.synthesize("Test speech synthesis")
        self.assertTrue(len(result.audio_bytes) > 44)
        # Check standard RIFF WAVE header
        self.assertEqual(result.audio_bytes[:4], b"RIFF")
        self.assertEqual(result.audio_bytes[8:12], b"WAVE")
        self.assertEqual(result.audio_bytes[12:16], b"fmt ")
        self.assertEqual(result.audio_format, "wav")


class TestConversationContext(unittest.TestCase):
    def test_context_management(self):
        ctx = ConversationContext(max_turns=3)
        self.assertEqual(len(ctx.history), 0)

        ctx.add_user_message("Hi")
        ctx.add_assistant_message("Hello")
        ctx.add_user_message("How are you?")
        ctx.add_assistant_message("Doing great!")
        ctx.add_user_message("What is your name?")
        ctx.add_assistant_message("I am Vaani.")
        ctx.add_user_message("One more message.")

        # Should be trimmed to max_turns * 2 (6 messages)
        self.assertLessEqual(len(ctx.history), 6)

        messages = ctx.get_messages_for_llm()
        self.assertEqual(messages[-1]["role"], "user")

    def test_reset(self):
        ctx = ConversationContext()
        ctx.add_user_message("Hello")
        self.assertEqual(len(ctx.history), 1)
        ctx.clear()
        self.assertEqual(len(ctx.history), 0)


class TestVoicePipeline(unittest.TestCase):
    def setUp(self):
        self.pipeline = VoicePipeline(
            vad=EnergyVAD(energy_threshold=500.0),
            stt=MockSTT(default_text="Hello Vaani"),
            llm=MockLLM(),
            tts=MockTTS(),
        )

    def test_silence_early_exit(self):
        silence = generate_pcm_silence(duration_s=0.2)
        result = self.pipeline.process_audio(silence)
        self.assertFalse(result.is_speech)
        self.assertEqual(result.transcript, "")
        self.assertEqual(result.response_text, "")
        self.assertEqual(len(result.audio_bytes), 0)
        self.assertIn("vad_ms", result.latencies)
        self.assertIn("total_ms", result.latencies)

    def test_full_voice_turn(self):
        speech = generate_pcm_sine(freq_hz=440.0, duration_s=0.2, amplitude=15000.0)
        result = self.pipeline.process_audio(speech)
        self.assertTrue(result.is_speech)
        self.assertEqual(result.transcript, "Hello Vaani")
        self.assertTrue(len(result.response_text) > 0)
        self.assertTrue(len(result.audio_bytes) > 44)
        self.assertIn("vad_ms", result.latencies)
        self.assertIn("stt_ms", result.latencies)
        self.assertIn("llm_ms", result.latencies)
        self.assertIn("tts_ms", result.latencies)
        self.assertIn("total_ms", result.latencies)
        self.assertGreater(result.latencies["total_ms"], 0)

    def test_text_fallback(self):
        result = self.pipeline.process_text("Namaste!")
        self.assertTrue(result.is_speech)
        self.assertEqual(result.transcript, "Namaste!")
        self.assertTrue(len(result.response_text) > 0)
        self.assertTrue(len(result.audio_bytes) > 44)
        self.assertIn("llm_ms", result.latencies)
        self.assertIn("tts_ms", result.latencies)


if __name__ == "__main__":
    unittest.main()
