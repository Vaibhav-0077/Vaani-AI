"""
Voice Pipeline Orchestration.
Connects VAD -> STT -> Context -> LLM -> TTS into a cohesive, measured audio turn.
Supports both voice processing and text fallback mode.
"""

import time
from dataclasses import dataclass, field
from typing import Dict, Optional

from ..adapters.base import (
    BaseVAD,
    BaseSTT,
    BaseLLM,
    BaseTTS,
    TurnLatencyProfile,
)
from ..adapters.vad import EnergyVAD, SileroVADAdapter
from ..adapters.stt import MockSTT, SpeechRecognitionSTT, Qwen3ASRAdapter
from ..adapters.llm import MockLLM, OpenAILLM, OllamaLLM
from ..adapters.tts import MockTTS, Pyttsx3TTS, Qwen3TTSAdapter
from .context import ConversationContext
from .config import AgentConfig, get_config
from .streaming_pipeline import StreamingVoicePipeline, StreamingPipelineResult


@dataclass
class PipelineResult:
    is_speech: bool
    transcript: str = ""
    response_text: str = ""
    audio_bytes: bytes = b""
    audio_format: str = "wav"
    detected_language: str = "en"
    latencies: Dict[str, float] = field(default_factory=dict)
    latency_profile: TurnLatencyProfile = field(default_factory=TurnLatencyProfile)
    error: Optional[str] = None


class VoicePipeline:
    """
    End-to-End Voice Pipeline:
    1. VAD (Voice Activity Detection): Checks if user is speaking.
    2. STT (Speech-to-Text): Transcribes audio stream into text.
    3. Context & Prompting: Maintains multi-turn conversation memory.
    4. LLM (Language Model): Generates concise conversational reply.
    5. TTS (Text-to-Speech): Synthesizes audio bytes for client playback.
    """

    def __init__(
        self,
        vad: BaseVAD,
        stt: BaseSTT,
        llm: BaseLLM,
        tts: BaseTTS,
        context: Optional[ConversationContext] = None,
    ):
        self.vad = vad
        self.stt = stt
        self.llm = llm
        self.tts = tts
        self.context = context or ConversationContext()

    @classmethod
    def create_from_config(cls, config: Optional[AgentConfig] = None) -> "VoicePipeline":
        """Factory method to construct pipeline from environment configuration."""
        cfg = config or get_config()

        # 1. Instantiate VAD
        if cfg.vad_provider == "silero":
            vad = SileroVADAdapter()
        else:
            vad = EnergyVAD(energy_threshold=cfg.energy_threshold)

        # 2. Instantiate STT
        if cfg.stt_provider == "qwen3-asr":
            stt = Qwen3ASRAdapter()
        elif cfg.stt_provider in ("whisper", "speechrecognition"):
            stt = SpeechRecognitionSTT(language=cfg.default_language)
        else:
            stt = MockSTT()

        # 3. Instantiate LLM
        if cfg.llm_provider in ("openai", "groq") and (cfg.openai_api_key or cfg.groq_api_key):
            api_key = cfg.groq_api_key or cfg.openai_api_key
            base_url = "https://api.groq.com/openai/v1" if cfg.groq_api_key else None
            model = "llama-3.3-70b-versatile" if cfg.groq_api_key else cfg.llm_model
            llm = OpenAILLM(api_key=api_key, base_url=base_url, model=model)
        elif cfg.llm_provider == "ollama":
            llm = OllamaLLM(base_url=cfg.ollama_base_url)
        else:
            llm = MockLLM()

        # 4. Instantiate TTS
        if cfg.tts_provider == "qwen3-tts":
            tts = Qwen3TTSAdapter()
        elif cfg.tts_provider == "pyttsx3":
            tts = Pyttsx3TTS()
        else:
            tts = MockTTS()

        return cls(vad=vad, stt=stt, llm=llm, tts=tts)

    def process_audio(self, audio_bytes: bytes, language: str = "auto") -> PipelineResult:
        """
        Processes a single conversational turn from raw audio bytes.
        Measures individual component and end-to-end latencies.
        """
        turn_start = time.perf_counter()
        latencies: Dict[str, float] = {}

        # Step 1: VAD check
        vad_start = time.perf_counter()
        is_speech = self.vad.detect_speech(audio_bytes)
        latencies["vad_ms"] = round((time.perf_counter() - vad_start) * 1000, 2)

        if not is_speech:
            latencies["total_ms"] = round((time.perf_counter() - turn_start) * 1000, 2)
            return PipelineResult(
                is_speech=False,
                latencies=latencies,
            )

        # Step 2: STT Transcription
        stt_start = time.perf_counter()
        stt_res = self.stt.transcribe(audio_bytes, language=language)
        latencies["stt_ms"] = round((time.perf_counter() - stt_start) * 1000, 2)

        user_text = stt_res.text.strip()
        if not user_text:
            latencies["total_ms"] = round((time.perf_counter() - turn_start) * 1000, 2)
            return PipelineResult(
                is_speech=True,
                transcript="",
                latencies=latencies,
            )

        # Step 3: Context update & LLM Response
        self.context.add_user_message(user_text)

        llm_start = time.perf_counter()
        llm_res = self.llm.generate(
            messages=self.context.get_messages_for_llm(),
            system_prompt=self.context.system_prompt,
        )
        latencies["llm_ms"] = round((time.perf_counter() - llm_start) * 1000, 2)

        assistant_text = llm_res.text.strip()
        self.context.add_assistant_message(assistant_text)

        # Step 4: TTS Speech Synthesis
        tts_start = time.perf_counter()
        tts_res = self.tts.synthesize(assistant_text, language=stt_res.language)
        latencies["tts_ms"] = round((time.perf_counter() - tts_start) * 1000, 2)

        latencies["total_ms"] = round((time.perf_counter() - turn_start) * 1000, 2)

        return PipelineResult(
            is_speech=True,
            transcript=user_text,
            response_text=assistant_text,
            audio_bytes=tts_res.audio_bytes,
            audio_format=tts_res.audio_format,
            detected_language=stt_res.language,
            latencies=latencies,
        )

    def process_text(self, user_text: str, language: str = "auto") -> PipelineResult:
        """
        Text fallback interface. Skips VAD/STT and processes LLM + TTS directly.
        """
        turn_start = time.perf_counter()
        latencies: Dict[str, float] = {}

        if not user_text.strip():
            return PipelineResult(is_speech=False, error="Empty text input")

        # Step 1: Context & LLM
        self.context.add_user_message(user_text.strip())

        llm_start = time.perf_counter()
        llm_res = self.llm.generate(
            messages=self.context.get_messages_for_llm(),
            system_prompt=self.context.system_prompt,
        )
        latencies["llm_ms"] = round((time.perf_counter() - llm_start) * 1000, 2)

        assistant_text = llm_res.text.strip()
        self.context.add_assistant_message(assistant_text)

        # Step 2: TTS Synthesis
        tts_start = time.perf_counter()
        detected_lang = "hi" if any(w in user_text.lower() for w in ["kya", "kaise", "namaste", "aap"]) else "en"
        tts_res = self.tts.synthesize(assistant_text, language=detected_lang)
        latencies["tts_ms"] = round((time.perf_counter() - tts_start) * 1000, 2)

        latencies["total_ms"] = round((time.perf_counter() - turn_start) * 1000, 2)

        return PipelineResult(
            is_speech=True,
            transcript=user_text.strip(),
            response_text=assistant_text,
            audio_bytes=tts_res.audio_bytes,
            audio_format=tts_res.audio_format,
            detected_language=detected_lang,
            latencies=latencies,
        )
