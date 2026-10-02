"""
Base provider interfaces for the Voice Agent pipeline.
All VAD, STT, LLM, and TTS providers adhere to these abstract contracts.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List, Dict, Any, Tuple, Optional


@dataclass
class STTResult:
    text: str
    confidence: float = 1.0
    language: str = "en"
    duration_ms: float = 0.0


@dataclass
class LLMResult:
    text: str
    tokens_used: int = 0
    duration_ms: float = 0.0


@dataclass
class TTSResult:
    audio_bytes: bytes
    audio_format: str = "wav"  # wav, pcm, mp3
    sample_rate: int = 16000
    duration_ms: float = 0.0


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


class BaseSTT(ABC):
    """Abstract Speech-to-Text provider."""

    @abstractmethod
    def transcribe(self, audio_bytes: bytes, language: str = "auto") -> STTResult:
        """Transcribes raw audio bytes into text."""
        pass


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


class BaseTTS(ABC):
    """Abstract Text-to-Speech provider."""

    @abstractmethod
    def synthesize(self, text: str, language: str = "en") -> TTSResult:
        """Synthesizes text into audio bytes."""
        pass
