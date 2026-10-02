"""
Vaani-AI Voice Agent Entrypoint & CLI Runner.
Provides benchmark execution, single-turn evaluation, and interactive conversation.
"""

import sys
import os
import math
import struct
from pathlib import Path

# Add project root to sys.path so imports resolve
sys.path.insert(0, str(Path(__file__).parent.parent))

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

from agent.core.pipeline import VoicePipeline, PipelineResult
from agent.core.config import get_config
from agent.adapters.vad import EnergyVAD
from agent.adapters.stt import MockSTT
from agent.adapters.llm import MockLLM
from agent.adapters.tts import MockTTS, Pyttsx3TTS


def generate_synthetic_audio(duration_sec: float = 1.0, is_speech: bool = True, sample_rate: int = 16000) -> bytes:
    """Generates synthetic PCM audio frames for pipeline testing (sine wave for speech, silence for non-speech)."""
    total_samples = int(sample_rate * duration_sec)
    frames = bytearray()
    freq = 300.0  # Formant-range frequency

    for i in range(total_samples):
        if is_speech:
            t = float(i) / sample_rate
            val = math.sin(2.0 * math.pi * freq * t)
            sample = int(val * 12000.0)  # High RMS to trigger VAD
        else:
            sample = 0  # Silence (RMS = 0)
        frames.extend(struct.pack("<h", sample))

    return bytes(frames)


def run_benchmark():
    """Runs a complete end-to-end benchmark across VAD, STT, LLM, and TTS and outputs latency metrics."""
    print("=" * 65)
    print("      VAANI-AI VOICE PIPELINE BENCHMARK (PHASE 3)")
    print("=" * 65)

    config = get_config()
    print(f"Configured Providers:")
    print(f"  • VAD Provider : {config.vad_provider}")
    print(f"  • STT Provider : {config.stt_provider}")
    print(f"  • LLM Provider : {config.llm_provider} ({config.llm_model})")
    print(f"  • TTS Provider : {config.tts_provider}")
    print("-" * 65)

    pipeline = VoicePipeline.create_from_config(config)

    # Test 1: Silence audio (VAD should detect non-speech)
    print("\n[Benchmark 1] Silence Frame Processing (VAD Early-Exit):")
    silence_audio = generate_synthetic_audio(1.0, is_speech=False)
    silence_res = pipeline.process_audio(silence_audio)
    print(f"  • Speech Detected : {silence_res.is_speech}")
    print(f"  • VAD Latency     : {silence_res.latencies.get('vad_ms', 0)} ms")
    print(f"  • Total Turn Time : {silence_res.latencies.get('total_ms', 0)} ms")

    # Test 2: Voice Audio Turn (English)
    print("\n[Benchmark 2] Full Voice Turn (English):")
    speech_audio = generate_synthetic_audio(1.5, is_speech=True)
    voice_res = pipeline.process_audio(speech_audio, language="en")
    print(f"  • Speech Detected : {voice_res.is_speech}")
    print(f"  • User Transcript : \"{voice_res.transcript}\"")
    print(f"  • Agent Response  : \"{voice_res.response_text}\"")
    print(f"  • Audio Generated : {len(voice_res.audio_bytes)} bytes ({voice_res.audio_format})")
    print(f"  • Latency Profile :")
    print(f"      - VAD         : {voice_res.latencies.get('vad_ms', 0)} ms")
    print(f"      - STT         : {voice_res.latencies.get('stt_ms', 0)} ms")
    print(f"      - LLM         : {voice_res.latencies.get('llm_ms', 0)} ms")
    print(f"      - TTS         : {voice_res.latencies.get('tts_ms', 0)} ms")
    print(f"      - TOTAL TURN  : {voice_res.latencies.get('total_ms', 0)} ms")

    # Test 3: Text Fallback Turn (Hinglish)
    print("\n[Benchmark 3] Text Fallback Turn (Hinglish):")
    text_input = "Namaste Vaani, kya aap mujhe project roadmap bata sakte ho?"
    text_res = pipeline.process_text(text_input)
    print(f"  • User Input      : \"{text_res.transcript}\"")
    print(f"  • Agent Response  : \"{text_res.response_text}\"")
    print(f"  • Audio Generated : {len(text_res.audio_bytes)} bytes")
    print(f"  • Latency Profile :")
    print(f"      - LLM         : {text_res.latencies.get('llm_ms', 0)} ms")
    print(f"      - TTS         : {text_res.latencies.get('tts_ms', 0)} ms")
    print(f"      - TOTAL TURN  : {text_res.latencies.get('total_ms', 0)} ms")

    print("\n" + "=" * 65)
    print("[OK] Phase 3 Voice Pipeline Benchmark Complete!")
    print("=" * 65)


def run_interactive():
    """Runs interactive terminal chat with live audio synthesis."""
    print("Starting Vaani-AI Interactive Mode (Type 'exit' to quit)...")
    pipeline = VoicePipeline.create_from_config()

    while True:
        try:
            user_input = input("\nYou: ").strip()
            if not user_input or user_input.lower() in ("exit", "quit"):
                break
            result = pipeline.process_text(user_input)
            print(f"Vaani: {result.response_text}")
            print(f"[{result.latencies.get('total_ms', 0)}ms | {len(result.audio_bytes)} bytes audio synthesized]")
        except (KeyboardInterrupt, EOFError):
            break


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "interactive":
        run_interactive()
    else:
        run_benchmark()
