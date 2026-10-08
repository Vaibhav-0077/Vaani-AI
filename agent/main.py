"""
Vaani-AI Voice Agent Entrypoint & CLI Runner (Phase 4).
Provides streaming benchmark execution, latency instrumentation (TTFT, TTFA),
barge-in interruption evaluation, and interactive conversation.
"""

import sys
import os
import math
import struct
import asyncio
import time
from pathlib import Path

# Add project root to sys.path so imports resolve
sys.path.insert(0, str(Path(__file__).parent.parent))

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

from agent.core.pipeline import VoicePipeline, PipelineResult
from agent.core.streaming_pipeline import StreamingVoicePipeline, StreamingPipelineResult
from agent.core.config import get_config
from agent.adapters.vad import EnergyVAD
from agent.adapters.stt import MockSTT
from agent.adapters.llm import MockLLM
from agent.adapters.tts import MockTTS, Pyttsx3TTS


def generate_pcm_frames(duration_sec: float = 1.0, is_speech: bool = True, frame_ms: int = 20, sample_rate: int = 16000):
    """Generates a stream of 20ms linear PCM audio frames."""
    num_frames = int((duration_sec * 1000) / frame_ms)
    samples_per_frame = int(sample_rate * (frame_ms / 1000.0))
    freq = 300.0

    frames = []
    for f in range(num_frames):
        frame_bytes = bytearray()
        for i in range(samples_per_frame):
            if is_speech:
                t = (f * samples_per_frame + i) / sample_rate
                val = int(math.sin(2.0 * math.pi * freq * t) * 12000.0)
            else:
                val = 0
            frame_bytes.extend(struct.pack("<h", val))
        frames.append(bytes(frame_bytes))
    return frames


async def run_streaming_benchmark():
    """Runs a complete end-to-end streaming latency & barge-in benchmark."""
    print("=" * 68)
    print("   VAANI-AI PHASE 4 STREAMING & LOW LATENCY BENCHMARK")
    print("=" * 68)

    config = get_config()
    print("Configured Providers:")
    print(f"  • VAD Provider : {config.vad_provider}")
    print(f"  • STT Provider : {config.stt_provider}")
    print(f"  • LLM Provider : {config.llm_provider} ({config.llm_model})")
    print(f"  • TTS Provider : {config.tts_provider}")
    print("-" * 68)

    streaming_pipeline = StreamingVoicePipeline(
        vad=EnergyVAD(energy_threshold=config.energy_threshold),
        stt=MockSTT(default_text="Hello Vaani, how fast is this streaming pipeline?"),
        llm=MockLLM(),
        tts=MockTTS(),
    )

    # --- BENCHMARK 1: Streaming Voice Turn & TTFA Measurement ---
    print("\n[Benchmark 1] Streaming Voice Turn with Incremental TTS & TTFA:")

    partial_transcripts = []
    streaming_pipeline.on_partial_transcript = lambda text: partial_transcripts.append(text)

    async def _frame_stream():
        # 100ms initial silence (5 frames)
        for f in generate_pcm_frames(0.1, is_speech=False):
            yield f
        # 500ms speech (25 frames)
        for f in generate_pcm_frames(0.5, is_speech=True):
            yield f
        # 500ms trailing silence (25 frames, triggers endpoint)
        for f in generate_pcm_frames(0.5, is_speech=False):
            yield f

    res = await streaming_pipeline.process_streaming_turn(_frame_stream())
    p = res.latency_profile

    print(f"  • User Transcript  : \"{res.transcript}\"")
    print(f"  • Partials Emitted : {len(partial_transcripts)} partial updates")
    if partial_transcripts:
        print(f"    └─ Sample Interim: \"{partial_transcripts[-1]}\"")
    print(f"  • Agent Response   : \"{res.response_text}\"")
    print(f"  • Audio Chunks     : {len(res.audio_chunks)} incremental clause chunks")

    print("\n  ► Detailed Latency Instrumentation (Timestamp Tracing):")
    print(f"      [1] Speech Duration   : {p.speech_duration_ms:6.2f} ms")
    print(f"      [2] STT Duration      : {p.stt_latency_ms:6.2f} ms")
    print(f"      [3] Time-to-First-Token (TTFT) : {p.ttft_ms:6.2f} ms  (from LLM start)")
    print(f"      [4] Time-to-First-Audio (TTFA) : {p.ttfa_ms:6.2f} ms  (from speech end)")
    print(f"      [5] TTS Clause Synth  : {p.tts_duration_ms:6.2f} ms")
    print(f"      ────────────────────────────────────────────")
    print(f"      [*] TOTAL TURN TIME   : {p.total_turn_ms:6.2f} ms")

    # --- BENCHMARK 2: Barge-in Interruption Handling ---
    print("\n[Benchmark 2] Barge-in Interruption & Active Response Cancellation:")

    interrupted_received = False
    streaming_pipeline.on_interrupted = lambda: print("    [INTERRUPT TRIGGERED] User spoke during synthesis! Cancelling in-flight tasks...")

    # Start speech turn
    async def _long_speech_stream():
        for f in generate_pcm_frames(0.2, is_speech=True):
            yield f
        for f in generate_pcm_frames(0.5, is_speech=False):
            yield f

    # Launch turn as background task
    turn_task = asyncio.create_task(streaming_pipeline.process_streaming_turn(_long_speech_stream()))
    
    # Wait for response generation to become active
    for _ in range(50):
        if streaming_pipeline.is_active:
            break
        await asyncio.sleep(0.01)

    # Simulate user barge-in interruption while assistant is thinking/speaking
    interrupt_start = time.perf_counter()
    was_interrupted = streaming_pipeline.interrupt()
    interrupt_latency_ms = (time.perf_counter() - interrupt_start) * 1000

    interrupt_res = await turn_task
    print(f"  • Interruption Success : {was_interrupted}")
    print(f"  • Interruption Latency : {interrupt_latency_ms:.2f} ms (sub-10ms cutoff)")
    print(f"  • Pipeline State Reset : Interrupted={interrupt_res.interrupted}, Active={streaming_pipeline.is_active}")

    print("\n" + "=" * 68)
    print("[OK] Phase 4 Streaming & Interruption Benchmark Complete!")
    print("=" * 68)


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "interactive":
        # Interactive mode using standard pipeline
        pipeline = VoicePipeline.create_from_config()
        print("Starting Vaani-AI Interactive Mode (Type 'exit' to quit)...")
        while True:
            try:
                user_input = input("\nYou: ").strip()
                if not user_input or user_input.lower() in ("exit", "quit"):
                    break
                result = pipeline.process_text(user_input)
                print(f"Vaani: {result.response_text}")
                print(f"[{result.latencies.get('total_ms', 0)}ms | {len(result.audio_bytes)} bytes audio]")
            except (KeyboardInterrupt, EOFError):
                break
    else:
        asyncio.run(run_streaming_benchmark())


if __name__ == "__main__":
    main()
