# Python Voice Agent Worker (LiveKit Agents)

This directory hosts the core Python automated participant worker that connects to LiveKit rooms and executes the real-time voice pipeline (VAD → STT → LLM → TTS).

## Scope & Implementation Plan
* **Target Phase:** Phase 3 (Basic Voice Pipeline) & Phase 4 (Streaming Optimization & Barge-In Interruption).
* **Stack:**
  * Python 3.10+ (3.12 recommended)
  * `livekit-agents` runtime & SDK
  * Silero VAD (ONNX)
  * Deepgram / Qwen3-ASR (Speech-to-Text)
  * Groq / OpenAI / Ollama (LLM)
  * Cartesia / ElevenLabs / Qwen3-TTS (Text-to-Speech)
  * `asyncio`

## Structure (Planned)
```
agent/
├── adapters/
│   ├── vad/              # VAD provider implementations (Silero)
│   ├── stt/              # STT provider implementations (Deepgram, Whisper)
│   ├── llm/              # LLM provider implementations (Groq, OpenAI, Ollama)
│   └── tts/              # TTS provider implementations (Cartesia, ElevenLabs)
├── core/
│   ├── config.py         # Environment parsing and typed settings
│   ├── orchestrator.py   # Turn detection, barge-in cancellation, state sync
│   └── pipeline.py       # Audio stream routing and chunking
├── tools/                # Registered functions for LLM execution (Phase 6)
├── tests/                # Unit tests and mock stream test fixtures
├── main.py               # LiveKit Worker entrypoint
└── requirements.txt      # Python dependencies
```
