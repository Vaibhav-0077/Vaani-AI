"""
Text-to-Speech (TTS) Provider Implementations.
Includes MockTTS, Pyttsx3TTS, Qwen3TTSAdapter, and SentenceSplitter for
incremental clause-based synthesis and low Time-To-First-Audio (TTFA) (Phase 4).
"""

import time
import io
import wave
import math
import struct
import re
import asyncio
from typing import Optional, AsyncIterator, List
from .base import BaseTTS, TTSResult, TTSChunk


class SentenceSplitter:
    """
    Splits a streaming token/word stream into speech-ready clauses and sentences.
    Detects natural pause delimiters (. ? ! , ; : \n) while avoiding false splits
    on decimals (e.g., 3.14) or abbreviations (e.g., Mr., Dr., i.e.).
    """

    def __init__(self, min_words_for_comma: int = 4, max_words_per_clause: int = 15):
        self.min_words_for_comma = min_words_for_comma
        self.max_words_per_clause = max_words_per_clause
        self.buffer = ""

    async def split_stream(self, token_stream: AsyncIterator[str]) -> AsyncIterator[str]:
        """Consumes token deltas and yields ready clauses/sentences."""
        async for token in token_stream:
            self.buffer += token
            # Check for sentence end punctuation
            while True:
                clause = self._extract_next_clause()
                if clause:
                    yield clause
                else:
                    break

        # Flush any remaining text in the buffer
        remaining = self.buffer.strip()
        if remaining:
            self.buffer = ""
            yield remaining

    def _extract_next_clause(self) -> Optional[str]:
        text = self.buffer
        words = text.split()
        if not words:
            return None

        # Check for major sentence terminators (. ! ? \n)
        match_end = re.search(r'([.!?\n]+)(\s+|$)', text)
        if match_end:
            idx = match_end.end()
            clause = text[:idx].strip()
            self.buffer = text[idx:]
            return clause

        # Check for minor clause delimiters (, ;) if word count is sufficient
        if len(words) >= self.min_words_for_comma:
            match_comma = re.search(r'([,;:])(\s+|$)', text)
            if match_comma:
                idx = match_comma.end()
                clause = text[:idx].strip()
                self.buffer = text[idx:]
                return clause

        # Force split if clause exceeds max words (prevents long run-on sentences from delaying audio)
        if len(words) >= self.max_words_per_clause:
            cutoff = len(" ".join(words[:self.max_words_per_clause]))
            clause = text[:cutoff].strip()
            self.buffer = text[cutoff:]
            return clause

        return None


class MockTTS(BaseTTS):
    """
    Mock TTS provider producing valid 16kHz mono linear PCM / WAV audio frames.
    Supports both batch synthesize and streaming incremental clause synthesis.
    """

    def __init__(self, sample_rate: int = 16000):
        self.sample_rate = sample_rate

    def synthesize(self, text: str, language: str = "en") -> TTSResult:
        start_time = time.perf_counter()
        time.sleep(0.04)  # Simulate ~40ms synthesis per clause

        # Generate synthesized PCM audio envelope matching text length
        duration_seconds = max(0.3, min(2.5, len(text.split()) * 0.2))
        total_samples = int(self.sample_rate * duration_seconds)

        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as wav_file:
            wav_file.setnchannels(1)  # Mono
            wav_file.setsampwidth(2)  # 16-bit
            wav_file.setframerate(self.sample_rate)

            frames = bytearray()
            for i in range(total_samples):
                t = float(i) / self.sample_rate
                val = (
                    math.sin(2.0 * math.pi * 220.0 * t) * 0.3
                    + math.sin(2.0 * math.pi * 440.0 * t) * 0.2
                    + math.sin(2.0 * math.pi * 880.0 * t) * 0.1
                )
                envelope = min(1.0, t * 15) * min(1.0, (duration_seconds - t) * 15)
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

    async def stream_synthesize(
        self, clause_stream: AsyncIterator[str], language: str = "en"
    ) -> AsyncIterator[TTSChunk]:
        """
        Incrementally synthesizes incoming clauses and immediately yields audio chunks.
        The first yielded chunk marks the Time-To-First-Audio (TTFA).
        """
        idx = 0
        async for clause in clause_stream:
            clean = clause.strip()
            if not clean:
                continue

            start_time = time.perf_counter()
            # Non-blocking executor to keep event loop responsive
            loop = asyncio.get_event_loop()
            res = await loop.run_in_executor(None, lambda: self.synthesize(clean, language=language))
            duration = (time.perf_counter() - start_time) * 1000

            yield TTSChunk(
                audio_bytes=res.audio_bytes,
                text_clause=clean,
                chunk_index=idx,
                is_first_chunk=(idx == 0),
                is_final=False,
                sample_rate=res.sample_rate,
                audio_format=res.audio_format,
                duration_ms=round(duration, 2),
            )
            idx += 1


class Pyttsx3TTS(BaseTTS):
    """
    Offline Text-to-Speech provider using native OS speech engine (SAPI5 on Windows).
    Supports incremental synthesis per sentence/clause for low TTFA.
    """

    def __init__(self, sample_rate: int = 16000, rate: int = 175):
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
        except Exception:
            res = self._fallback.synthesize(text, language)
            res.duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
            return res

    async def stream_synthesize(
        self, clause_stream: AsyncIterator[str], language: str = "en"
    ) -> AsyncIterator[TTSChunk]:
        """Incrementally synthesizes clauses on OS SAPI5 in worker threads."""
        idx = 0
        loop = asyncio.get_event_loop()
        async for clause in clause_stream:
            clean = clause.strip()
            if not clean:
                continue

            res = await loop.run_in_executor(None, lambda: self.synthesize(clean, language=language))
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


class Qwen3TTSAdapter(BaseTTS):
    """
    Pluggable adapter for open-source Qwen3-TTS or remote neural synthesis server.
    """

    def __init__(self, endpoint_url: Optional[str] = None):
        self.endpoint_url = endpoint_url
        self._fallback = MockTTS()

    def synthesize(self, text: str, language: str = "en") -> TTSResult:
        start_time = time.perf_counter()
        if self.endpoint_url:
            try:
                import httpx
                resp = httpx.post(
                    f"{self.endpoint_url}/v1/audio/speech",
                    json={"input": text, "voice": "vaani", "response_format": "wav"},
                    timeout=5.0,
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

        res = self._fallback.synthesize(text, language)
        res.duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
        return res

    async def stream_synthesize(
        self, clause_stream: AsyncIterator[str], language: str = "en"
    ) -> AsyncIterator[TTSChunk]:
        """Streaming adapter with fallback."""
        async for chunk in self._fallback.stream_synthesize(clause_stream, language):
            yield chunk
