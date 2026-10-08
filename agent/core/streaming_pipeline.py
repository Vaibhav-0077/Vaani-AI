"""
Streaming Voice Pipeline Orchestration (Phase 4).
Connects StreamingVAD -> Streaming STT -> SentenceSplitter -> Streaming LLM -> Incremental TTS.
Features:
- Instant barge-in & interruption handling
- Proper task cancellation (asyncio.CancelledError)
- Overlapping response prevention (atomic turn mutex)
- Partial transcript callback
- Complete sub-millisecond latency profile instrumentation (speech_start, speech_end,
  transcript_start, transcript_complete, llm_start, first_token, tts_start, first_audio, response_complete)
"""

import asyncio
import time
from dataclasses import dataclass, field
from typing import AsyncIterator, Callable, Optional, List, Dict, Any, Tuple

from ..adapters.base import (
    BaseVAD,
    BaseSTT,
    BaseLLM,
    BaseTTS,
    VADState,
    VADEvent,
    STTChunk,
    LLMChunk,
    TTSChunk,
    TurnLatencyProfile,
)
from ..adapters.vad import StreamingVAD, EnergyVAD
from ..adapters.tts import SentenceSplitter
from .context import ConversationContext
from .config import AgentConfig, get_config


@dataclass
class StreamingPipelineResult:
    is_speech: bool
    transcript: str = ""
    response_text: str = ""
    audio_chunks: List[bytes] = field(default_factory=list)
    audio_format: str = "wav"
    detected_language: str = "en"
    latency_profile: TurnLatencyProfile = field(default_factory=TurnLatencyProfile)
    interrupted: bool = False
    error: Optional[str] = None


class StreamingVoicePipeline:
    """
    High-performance streaming voice pipeline with barge-in interruption.
    """

    def __init__(
        self,
        vad: Optional[BaseVAD] = None,
        stt: Optional[BaseSTT] = None,
        llm: Optional[BaseLLM] = None,
        tts: Optional[BaseTTS] = None,
        context: Optional[ConversationContext] = None,
        on_partial_transcript: Optional[Callable[[str], None]] = None,
        on_audio_chunk: Optional[Callable[[TTSChunk], None]] = None,
        on_interrupted: Optional[Callable[[], None]] = None,
    ):
        self.raw_vad = vad or EnergyVAD()
        self.streaming_vad = StreamingVAD(base_vad=self.raw_vad)
        self.stt = stt
        self.llm = llm
        self.tts = tts
        self.context = context or ConversationContext()
        self.sentence_splitter = SentenceSplitter()

        # Callbacks
        self.on_partial_transcript = on_partial_transcript
        self.on_audio_chunk = on_audio_chunk
        self.on_interrupted = on_interrupted

        # Concurrency & Interruption Management
        self._turn_lock = asyncio.Lock()
        self._active_task: Optional[asyncio.Task] = None
        self._current_turn_id: int = 0
        self._is_interrupted: bool = False

    @property
    def is_active(self) -> bool:
        """Returns True if the assistant is actively thinking or speaking."""
        return self._active_task is not None and not self._active_task.done()

    def interrupt(self) -> bool:
        """
        Immediately interrupts active assistant processing.
        Cancels in-flight LLM token generation, clause splitting, and TTS synthesis.
        """
        if self.is_active:
            self._is_interrupted = True
            if self._active_task and not self._active_task.done():
                self._active_task.cancel()
            if self.on_interrupted:
                self.on_interrupted()
            return True
        return False

    async def process_streaming_turn(
        self,
        audio_frame_stream: AsyncIterator[bytes],
        language: str = "auto",
    ) -> StreamingPipelineResult:
        """
        Processes a full streaming voice turn from 20ms PCM audio frames:
        1. StreamingVAD turn detection (speech_start, speech_end)
        2. Streaming STT with partial transcripts
        3. Streaming LLM with TTFT tracking
        4. Incremental TTS clause synthesis with TTFA tracking
        5. Instant cancellation if interrupted by user
        """
        # Ensure single active turn at a time (prevent overlapping responses)
        async with self._turn_lock:
            self._current_turn_id += 1
            turn_id = self._current_turn_id
            self._is_interrupted = False
            self.streaming_vad.reset()

            profile = TurnLatencyProfile()
            result = StreamingPipelineResult(
                is_speech=False,
                latency_profile=profile,
            )

            speech_frames: List[bytes] = []
            speech_started = False
            speech_ended = False

            # --- STEP 1: Streaming VAD & Endpointing ---
            async for frame in audio_frame_stream:
                vad_event = self.streaming_vad.process_frame(frame)

                if vad_event.state == VADState.SPEECH_START:
                    # User started speaking!
                    profile.speech_start_ts = vad_event.timestamp
                    speech_started = True
                    speech_frames.append(frame)

                    # Barge-in: if any prior response was running, interrupt it
                    if self.is_active:
                        self.interrupt()

                elif vad_event.state == VADState.SPEECH_ONGOING and speech_started:
                    speech_frames.append(frame)

                elif vad_event.state == VADState.SPEECH_END and speech_started:
                    profile.speech_end_ts = vad_event.timestamp
                    speech_ended = True
                    speech_frames.append(frame)
                    break

            if not speech_started:
                # Pure silence turn
                return result

            result.is_speech = True
            if not speech_ended:
                profile.speech_end_ts = time.perf_counter()

            # --- STEP 2: Streaming STT with Partial Transcripts ---
            profile.transcript_start_ts = time.perf_counter()

            async def _frame_generator():
                for f in speech_frames:
                    yield f

            final_text = ""
            if self.stt:
                async for stt_chunk in self.stt.stream_transcribe(_frame_generator(), language=language):
                    if not stt_chunk.is_final:
                        if self.on_partial_transcript:
                            self.on_partial_transcript(stt_chunk.text)
                    else:
                        final_text = stt_chunk.text.strip()
                        result.detected_language = stt_chunk.language

            profile.transcript_complete_ts = time.perf_counter()
            result.transcript = final_text

            if not final_text:
                return result

            # Update dialogue context
            self.context.add_user_message(final_text)

            # --- STEP 3 & 4: Streaming LLM + Incremental TTS Task ---
            # Launch response generation as an interruptible task
            generation_coro = self._generate_and_synthesize(
                turn_id=turn_id,
                profile=profile,
                language=result.detected_language,
            )
            self._active_task = asyncio.create_task(generation_coro)

            try:
                response_text, audio_chunks = await self._active_task
                result.response_text = response_text
                result.audio_chunks = audio_chunks
                self.context.add_assistant_message(response_text)
            except asyncio.CancelledError:
                result.interrupted = True
                self._is_interrupted = True
            finally:
                self._active_task = None

            profile.response_complete_ts = time.perf_counter()
            return result

    async def _generate_and_synthesize(
        self,
        turn_id: int,
        profile: TurnLatencyProfile,
        language: str = "en",
    ) -> Tuple[str, List[bytes]]:
        """
        Executes streaming LLM token generation, pipes tokens into SentenceSplitter,
        and streams audio chunks from incremental TTS.
        """
        profile.llm_start_ts = time.perf_counter()
        messages = self.context.get_messages_for_llm()
        system_prompt = self.context.system_prompt

        accumulated_text = ""
        audio_chunks: List[bytes] = []

        if not self.llm or not self.tts:
            return "", []

        # Create token queue to pipe from LLM stream into SentenceSplitter
        token_queue: asyncio.Queue[Optional[str]] = asyncio.Queue()

        async def _llm_producer():
            nonlocal accumulated_text
            first_token_marked = False
            try:
                async for chunk in self.llm.stream_generate(messages, system_prompt=system_prompt):
                    # Check for turn interruption
                    if self._is_interrupted or turn_id != self._current_turn_id:
                        break

                    if not first_token_marked and chunk.delta.strip():
                        profile.first_token_ts = time.perf_counter()
                        first_token_marked = True

                    accumulated_text += chunk.delta
                    await token_queue.put(chunk.delta)
            finally:
                await token_queue.put(None)  # Sentinel to close queue

        async def _queue_to_token_stream():
            while True:
                item = await token_queue.get()
                if item is None:
                    break
                yield item

        # Start LLM producer task
        producer_task = asyncio.create_task(_llm_producer())

        try:
            profile.tts_start_ts = time.perf_counter()
            clause_stream = self.sentence_splitter.split_stream(_queue_to_token_stream())

            first_audio_marked = False
            async for tts_chunk in self.tts.stream_synthesize(clause_stream, language=language):
                if self._is_interrupted or turn_id != self._current_turn_id:
                    break

                if not first_audio_marked:
                    profile.first_audio_ts = time.perf_counter()
                    first_audio_marked = True

                audio_chunks.append(tts_chunk.audio_bytes)
                if self.on_audio_chunk:
                    self.on_audio_chunk(tts_chunk)

            await producer_task
        except asyncio.CancelledError:
            producer_task.cancel()
            raise

        return accumulated_text.strip(), audio_chunks
