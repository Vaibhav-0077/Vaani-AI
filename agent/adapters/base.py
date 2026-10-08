"""
Base provider interfaces for the Voice Agent pipeline.
All VAD, STT, LLM, and TTS providers adhere to these abstract contracts.
Includes streaming representations, chunk data structures, and latency instrumentation.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import List, Dict, Any, Tuple, Optional, AsyncIterator


class VADState(str, Enum):
    SILENCE = "silence"
    SPEECH_START = "speech_start"
    SPEECH_ONGOING = "speech_ongoing"
    SPEECH_END = "speech_end"


@dataclass
class VADEvent:
    state: VADState
    timestamp: float
    rms_energy: float = 0.0
    speech_probability: float = 0.0


@dataclass
class STTResult:
    text: str
    confidence: float = 1.0
    language: str = "en"
    duration_ms: float = 0.0


@dataclass
class STTChunk:
    text: str
    is_final: bool = False
    confidence: float = 1.0
    language: str = "en"
    duration_ms: float = 0.0


@dataclass
class LLMResult:
    text: str
    tokens_used: int = 0
    duration_ms: float = 0.0


@dataclass
class LLMChunk:
    delta: str
    accumulated_text: str = ""
    is_first_token: bool = False
    is_final: bool = False
    duration_ms: float = 0.0


@dataclass
class TTSResult:
    audio_bytes: bytes
    audio_format: str = "wav"  # wav, pcm, mp3
    sample_rate: int = 16000
    duration_ms: float = 0.0


@dataclass
class TTSChunk:
    audio_bytes: bytes
    text_clause: str = ""
    chunk_index: int = 0
    is_first_chunk: bool = False
    is_final: bool = False
    sample_rate: int = 16000
    audio_format: str = "wav"
    duration_ms: float = 0.0


@dataclass
class TurnLatencyProfile:
    """
    Phase 4 Latency Instrumentation:
    Measures every critical event in the speech -> token -> audio lifecycle.
    """
    speech_start_ts: float = 0.0
    speech_end_ts: float = 0.0
    transcript_start_ts: float = 0.0
    transcript_complete_ts: float = 0.0
    llm_start_ts: float = 0.0
    first_token_ts: float = 0.0
    tts_start_ts: float = 0.0
    first_audio_ts: float = 0.0
    response_complete_ts: float = 0.0

    @property
    def speech_duration_ms(self) -> float:
        if self.speech_start_ts > 0 and self.speech_end_ts >= self.speech_start_ts:
            return round((self.speech_end_ts - self.speech_start_ts) * 1000, 2)
        return 0.0

    @property
    def stt_latency_ms(self) -> float:
        if self.transcript_start_ts > 0 and self.transcript_complete_ts >= self.transcript_start_ts:
            return round((self.transcript_complete_ts - self.transcript_start_ts) * 1000, 2)
        return 0.0

    @property
    def ttft_ms(self) -> float:
        """Time-to-First-Token (LLM start to first token generated)."""
        if self.llm_start_ts > 0 and self.first_token_ts >= self.llm_start_ts:
            return round((self.first_token_ts - self.llm_start_ts) * 1000, 2)
        return 0.0

    @property
    def ttfa_ms(self) -> float:
        """Time-to-First-Audio (from user speech_end to first synthesized audio chunk ready)."""
        start = self.speech_end_ts if self.speech_end_ts > 0 else self.llm_start_ts
        if start > 0 and self.first_audio_ts >= start:
            return round((self.first_audio_ts - start) * 1000, 2)
        return 0.0

    @property
    def tts_duration_ms(self) -> float:
        if self.tts_start_ts > 0 and self.response_complete_ts >= self.tts_start_ts:
            return round((self.response_complete_ts - self.tts_start_ts) * 1000, 2)
        return 0.0

    @property
    def total_turn_ms(self) -> float:
        """Total turn time (from user speech_end to assistant response complete)."""
        start = self.speech_end_ts if self.speech_end_ts > 0 else self.llm_start_ts
        if start > 0 and self.response_complete_ts >= start:
            return round((self.response_complete_ts - start) * 1000, 2)
        return 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "speech_start": self.speech_start_ts,
            "speech_end": self.speech_end_ts,
            "transcript_start": self.transcript_start_ts,
            "transcript_complete": self.transcript_complete_ts,
            "llm_start": self.llm_start_ts,
            "first_token": self.first_token_ts,
            "tts_start": self.tts_start_ts,
            "first_audio": self.first_audio_ts,
            "response_complete": self.response_complete_ts,
            "speech_duration_ms": self.speech_duration_ms,
            "stt_latency_ms": self.stt_latency_ms,
            "ttft_ms": self.ttft_ms,
            "ttfa_ms": self.ttfa_ms,
            "tts_duration_ms": self.tts_duration_ms,
            "total_turn_ms": self.total_turn_ms,
        }


class BaseVAD(ABC):
    """Abstract Voice Activity Detection provider."""

    @abstractmethod
    def detect_speech(self, pcm_bytes: bytes, sample_rate: int = 16000) -> bool:
        """Returns True if speech is detected in the PCM audio frame."""
        pass

    @abstractmethod
    def get_speech_probability(self, pcm_bytes: bytes, sample_rate: int = 16000) -> float:
        """Returns speech probability between 0.0 and 1.0."""
        pass

    def process_frame(self, pcm_bytes: bytes, sample_rate: int = 16000) -> VADEvent:
        """Processes continuous audio frame and returns VADEvent."""
        import time
        is_speech = self.detect_speech(pcm_bytes, sample_rate)
        prob = self.get_speech_probability(pcm_bytes, sample_rate)
        state = VADState.SPEECH_ONGOING if is_speech else VADState.SILENCE
        return VADEvent(state=state, timestamp=time.perf_counter(), speech_probability=prob)


class BaseSTT(ABC):
    """Abstract Speech-to-Text provider."""

    @abstractmethod
    def transcribe(self, audio_bytes: bytes, language: str = "auto") -> STTResult:
        """Transcribes raw audio bytes into text."""
        pass

    async def stream_transcribe(
        self, audio_chunk_stream: AsyncIterator[bytes], language: str = "auto"
    ) -> AsyncIterator[STTChunk]:
        """Streaming transcription interface yielding partial and final chunks."""
        chunks = []
        async for chunk in audio_chunk_stream:
            chunks.append(chunk)
        full_audio = b"".join(chunks)
        res = self.transcribe(full_audio, language=language)
        yield STTChunk(
            text=res.text,
            is_final=True,
            confidence=res.confidence,
            language=res.language,
            duration_ms=res.duration_ms,
        )


class BaseLLM(ABC):
    """Abstract Large Language Model provider."""

    @abstractmethod
    def generate(
        self,
        messages: List[Dict[str, str]],
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 150,
    ) -> LLMResult:
        """Generates conversational response from chat messages."""
        pass

    async def stream_generate(
        self,
        messages: List[Dict[str, str]],
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 150,
    ) -> AsyncIterator[LLMChunk]:
        """Streaming token generator yielding delta chunks."""
        res = self.generate(messages, system_prompt, temperature, max_tokens)
        words = res.text.split(" ")
        accumulated = []
        for i, word in enumerate(words):
            delta = word + (" " if i < len(words) - 1 else "")
            accumulated.append(delta)
            yield LLMChunk(
                delta=delta,
                accumulated_text="".join(accumulated),
                is_first_token=(i == 0),
                is_final=(i == len(words) - 1),
                duration_ms=res.duration_ms,
            )


class BaseTTS(ABC):
    """Abstract Text-to-Speech provider."""

    @abstractmethod
    def synthesize(self, text: str, language: str = "en") -> TTSResult:
        """Synthesizes text into audio bytes."""
        pass

    async def stream_synthesize(
        self, clause_stream: AsyncIterator[str], language: str = "en"
    ) -> AsyncIterator[TTSChunk]:
        """Incremental clause synthesizer yielding audio chunks."""
        idx = 0
        async for clause in clause_stream:
            clean = clause.strip()
            if not clean:
                continue
            res = self.synthesize(clean, language=language)
            yield TTSChunk(
                audio_bytes=res.audio_bytes,
                text_clause=clean,
                chunk_index=idx,
                is_first_chunk=(idx == 0),
                is_final=False,
                sample_rate=res.sample_rate,
                audio_format=res.audio_format,
                duration_ms=res.duration_ms,
            )
            idx += 1
