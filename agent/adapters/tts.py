"""
Text-to-Speech (TTS) Provider Implementations.
Includes MockTTS, Pyttsx3TTS (offline, zero-key Windows SAPI5), and Qwen3TTSAdapter.
"""

import time
import io
import wave
import math
import struct
from typing import Optional
from .base import BaseTTS, TTSResult


class MockTTS(BaseTTS):
    """
    Mock TTS provider producing valid 16kHz mono linear PCM / WAV audio frames.
    Useful for offline testing, CI/CD, and benchmarking without speech model overhead.
    """

    def __init__(self, sample_rate: int = 16000):
        self.sample_rate = sample_rate

    def synthesize(self, text: str, language: str = "en") -> TTSResult:
        start_time = time.perf_counter()
        time.sleep(0.06)  # Simulate ~60ms synthesis time

        # Generate ~1.5s of gentle multi-tone PCM audio (simulating speech envelope)
        duration_seconds = max(0.5, min(3.0, len(text.split()) * 0.25))
        total_samples = int(self.sample_rate * duration_seconds)

        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as wav_file:
            wav_file.setnchannels(1)  # Mono
            wav_file.setsampwidth(2)  # 16-bit
            wav_file.setframerate(self.sample_rate)

            # Generate gentle synthesized tone envelope
            frames = bytearray()
            for i in range(total_samples):
                t = float(i) / self.sample_rate
                # Formant-like harmonic mixture
                val = (
                    math.sin(2.0 * math.pi * 220.0 * t) * 0.3
                    + math.sin(2.0 * math.pi * 440.0 * t) * 0.2
                    + math.sin(2.0 * math.pi * 880.0 * t) * 0.1
                )
                # Apply envelope fade in/out
                envelope = min(1.0, t * 10) * min(1.0, (duration_seconds - t) * 10)
                sample = int(val * envelope * 12000.0)
                frames.extend(struct.pack("<h", sample))

            wav_file.writeframes(frames)

        duration = (time.perf_counter() - start_time) * 1000
        audio_data = buffer.getvalue()

        return TTSResult(
            audio_bytes=audio_data,
            audio_format="wav",
            sample_rate=self.sample_rate,
            duration_ms=round(duration, 2),
        )


class Pyttsx3TTS(BaseTTS):
    """
    Offline Text-to-Speech provider using native OS speech engine (SAPI5 on Windows).
    Requires zero internet connection, zero API keys, and zero GPU.
    """

    def __init__(self, sample_rate: int = 16000, rate: int = 160):
        self.sample_rate = sample_rate
        self.rate = rate
        self._fallback = MockTTS(sample_rate=sample_rate)

    def synthesize(self, text: str, language: str = "en") -> TTSResult:
        start_time = time.perf_counter()
        try:
            import pyttsx3
            import tempfile
            import os

            engine = pyttsx3.init()
            engine.setProperty("rate", self.rate)

            # Save speech to temporary WAV file
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp_path = tmp.name

            try:
                engine.save_to_file(text, tmp_path)
                engine.runAndWait()

                with open(tmp_path, "rb") as f:
                    audio_bytes = f.read()

                duration = (time.perf_counter() - start_time) * 1000
                return TTSResult(
                    audio_bytes=audio_bytes,
                    audio_format="wav",
                    sample_rate=self.sample_rate,
                    duration_ms=round(duration, 2),
                )
            finally:
                if os.path.exists(tmp_path):
                    try:
                        os.remove(tmp_path)
                    except Exception:
                        pass
        except Exception as e:
            # Fallback to mock tone
            res = self._fallback.synthesize(text, language)
            res.duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
            return res


class Qwen3TTSAdapter(BaseTTS):
    """
    Pluggable adapter for open-source Qwen3-TTS or remote neural synthesis server.
    Falls back gracefully to Pyttsx3TTS / MockTTS when local neural server is unavailable.
    """

    def __init__(self, endpoint_url: Optional[str] = None):
        self.endpoint_url = endpoint_url
        self._fallback = Pyttsx3TTS()

    def synthesize(self, text: str, language: str = "en") -> TTSResult:
        start_time = time.perf_counter()
        if self.endpoint_url:
            try:
                import httpx
                resp = httpx.post(
                    f"{self.endpoint_url}/v1/audio/speech",
                    json={"input": text, "voice": "vaani", "response_format": "wav"},
                    timeout=6.0,
                )
                if resp.status_code == 200:
                    duration = (time.perf_counter() - start_time) * 1000
                    return TTSResult(
                        audio_bytes=resp.content,
                        audio_format="wav",
                        sample_rate=24000,
                        duration_ms=round(duration, 2),
                    )
            except Exception:
                pass

        # Fallback to offline OS TTS
        res = self._fallback.synthesize(text, language)
        res.duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
        return res
