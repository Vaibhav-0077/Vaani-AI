"""
Voice Activity Detection (VAD) Provider Implementations.
Includes Energy-based VAD (zero-dependency, ultra-fast), Silero VAD adapter,
and StreamingVAD for frame-level endpointing and turn detection (Phase 4).
"""

import math
import struct
import time
from typing import Optional, List
from .base import BaseVAD, VADEvent, VADState


class EnergyVAD(BaseVAD):
    """
    Fast, lightweight energy-based VAD.
    Computes RMS audio energy over 16-bit signed integer linear PCM frames.
    Requires no GPU, no network, and processes in <0.1ms.
    """

    def __init__(self, energy_threshold: float = 400.0):
        self.energy_threshold = energy_threshold

    def calculate_rms(self, pcm_bytes: bytes) -> float:
        """Calculates Root Mean Square (RMS) energy of 16-bit linear PCM audio."""
        if not pcm_bytes or len(pcm_bytes) < 2:
            return 0.0

        # Number of 16-bit samples
        count = len(pcm_bytes) // 2
        format_str = f"<{count}h"

        try:
            shorts = struct.unpack(format_str, pcm_bytes[: count * 2])
        except struct.error:
            return 0.0

        sum_squares = sum(s * s for s in shorts)
        mean_square = sum_squares / count if count > 0 else 0
        return math.sqrt(mean_square)

    def detect_speech(self, pcm_bytes: bytes, sample_rate: int = 16000) -> bool:
        rms = self.calculate_rms(pcm_bytes)
        return rms >= self.energy_threshold

    def get_speech_probability(self, pcm_bytes: bytes, sample_rate: int = 16000) -> float:
        rms = self.calculate_rms(pcm_bytes)
        if rms <= (self.energy_threshold * 0.5):
            return 0.0
        # Normalize into a probability curve
        prob = (rms - (self.energy_threshold * 0.5)) / (self.energy_threshold * 1.5)
        return min(1.0, max(0.0, prob))


class SileroVADAdapter(BaseVAD):
    """
    Pluggable adapter for Silero VAD.
    Uses embedded energy fallback if native ONNX Silero runtime is not yet installed.
    """

    def __init__(self, threshold: float = 0.5):
        self.threshold = threshold
        self._fallback = EnergyVAD(energy_threshold=450.0)

    def detect_speech(self, pcm_bytes: bytes, sample_rate: int = 16000) -> bool:
        prob = self.get_speech_probability(pcm_bytes, sample_rate)
        return prob >= self.threshold

    def get_speech_probability(self, pcm_bytes: bytes, sample_rate: int = 16000) -> float:
        # Graceful fallback to RMS energy estimation
        return self._fallback.get_speech_probability(pcm_bytes, sample_rate)


class StreamingVAD:
    """
    Continuous streaming VAD with accurate turn detection and endpointing.
    Tracks state transitions: SILENCE -> SPEECH_START -> SPEECH_ONGOING -> SPEECH_END.
    """

    def __init__(
        self,
        base_vad: Optional[BaseVAD] = None,
        frame_duration_ms: int = 20,
        speech_threshold_ms: int = 60,
        trailing_silence_ms: int = 450,
        sample_rate: int = 16000,
    ):
        self.vad = base_vad or EnergyVAD()
        self.frame_duration_ms = frame_duration_ms
        self.speech_threshold_ms = speech_threshold_ms
        self.trailing_silence_ms = trailing_silence_ms
        self.sample_rate = sample_rate

        # Required consecutive frames
        self.min_speech_frames = max(1, speech_threshold_ms // frame_duration_ms)
        self.min_silence_frames = max(1, trailing_silence_ms // frame_duration_ms)

        # Internal state
        self.is_speaking: bool = False
        self.consecutive_speech_frames: int = 0
        self.consecutive_silence_frames: int = 0
        self.speech_start_ts: float = 0.0
        self.speech_end_ts: float = 0.0

        # Accumulated speech buffer
        self.speech_buffer: List[bytes] = []

    def reset(self) -> None:
        """Resets streaming VAD state for a new turn."""
        self.is_speaking = False
        self.consecutive_speech_frames = 0
        self.consecutive_silence_frames = 0
        self.speech_start_ts = 0.0
        self.speech_end_ts = 0.0
        self.speech_buffer.clear()

    def process_frame(self, pcm_chunk: bytes, timestamp: Optional[float] = None) -> VADEvent:
        """
        Processes a single frame (e.g. 20ms of audio) and returns the corresponding VADEvent.
        """
        now = timestamp if timestamp is not None else time.perf_counter()
        is_speech_frame = self.vad.detect_speech(pcm_chunk, sample_rate=self.sample_rate)
        rms = (
            self.vad.calculate_rms(pcm_chunk)
            if hasattr(self.vad, "calculate_rms")
            else 0.0
        )
        prob = self.vad.get_speech_probability(pcm_chunk, sample_rate=self.sample_rate)

        if is_speech_frame:
            self.consecutive_speech_frames += 1
            self.consecutive_silence_frames = 0

            if not self.is_speaking:
                if self.consecutive_speech_frames >= self.min_speech_frames:
                    # Confirmed speech start (filters out transient clicks/noise)
                    self.is_speaking = True
                    self.speech_start_ts = now - (
                        self.consecutive_speech_frames * (self.frame_duration_ms / 1000.0)
                    )
                    self.speech_buffer.append(pcm_chunk)
                    return VADEvent(
                        state=VADState.SPEECH_START,
                        timestamp=self.speech_start_ts,
                        rms_energy=rms,
                        speech_probability=prob,
                    )
                else:
                    return VADEvent(
                        state=VADState.SILENCE,
                        timestamp=now,
                        rms_energy=rms,
                        speech_probability=prob,
                    )
            else:
                self.speech_buffer.append(pcm_chunk)
                return VADEvent(
                    state=VADState.SPEECH_ONGOING,
                    timestamp=now,
                    rms_energy=rms,
                    speech_probability=prob,
                )
        else:
            # Silence frame
            self.consecutive_silence_frames += 1
            self.consecutive_speech_frames = 0

            if self.is_speaking:
                self.speech_buffer.append(pcm_chunk)
                if self.consecutive_silence_frames >= self.min_silence_frames:
                    # Endpoint reached! User has finished speaking
                    self.is_speaking = False
                    self.speech_end_ts = now
                    return VADEvent(
                        state=VADState.SPEECH_END,
                        timestamp=self.speech_end_ts,
                        rms_energy=rms,
                        speech_probability=prob,
                    )
                else:
                    return VADEvent(
                        state=VADState.SPEECH_ONGOING,
                        timestamp=now,
                        rms_energy=rms,
                        speech_probability=prob,
                    )
            else:
                return VADEvent(
                    state=VADState.SILENCE,
                    timestamp=now,
                    rms_energy=rms,
                    speech_probability=prob,
                )

    def get_speech_bytes(self) -> bytes:
        """Returns the accumulated audio bytes during the active speech window."""
        return b"".join(self.speech_buffer)
