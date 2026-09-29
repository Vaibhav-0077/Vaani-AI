# Project Roadmap & Phase Tracker

This document tracks development progress according to the 10-phase incremental engineering plan.

---

## Progress Overview

| Phase | Description | Status |
| :--- | :--- | :--- |
| **Phase 0** | Project architecture, repository setup, and documentation foundation | **Completed** |
| **Phase 1** | Frontend shell and voice-agent UI | Planned (Next) |
| **Phase 2** | Realtime connection and microphone pipeline | Planned |
| **Phase 3** | Basic STT → LLM → TTS voice pipeline | Planned |
| **Phase 4** | Streaming optimization and interruption handling | Planned |
| **Phase 5** | Conversation history, authentication, and user settings | Planned |
| **Phase 6** | Tool calling and useful built-in tools | Planned |
| **Phase 7** | Memory, RAG, and document support | Planned |
| **Phase 8** | Advanced integrations, observability, and production optimization | Planned |
| **Phase 9** | Deployment, GitHub release preparation, and public documentation | Planned |

---

## Detailed Phase Breakdown

### [x] PHASE 0: Project Architecture & Documentation Foundation
* [x] Initialize repository and version control conventions.
* [x] Establish modular monorepo directory layout (`frontend/`, `backend/`, `agent/`, `docs/`).
* [x] Document system architecture, WebRTC dataflow, and latency budgets ([docs/ARCHITECTURE.md](file:///c:/Users/VAIBHAV/Desktop/CODING/VOICE%20AGENT/docs/ARCHITECTURE.md)).
* [x] Define local development prerequisites, hardware tiers, and setup instructions ([docs/SETUP.md](file:///c:/Users/VAIBHAV/Desktop/CODING/VOICE%20AGENT/docs/SETUP.md)).
* [x] Create comprehensive environment configuration template ([.env.example](file:///c:/Users/VAIBHAV/Desktop/CODING/VOICE%20AGENT/.env.example)).
* [x] Establish changelog tracking and contribution guidelines ([docs/CHANGELOG.md](file:///c:/Users/VAIBHAV/Desktop/CODING/VOICE%20AGENT/docs/CHANGELOG.md), [CONTRIBUTING.md](file:///c:/Users/VAIBHAV/Desktop/CODING/VOICE%20AGENT/CONTRIBUTING.md), [LICENSE](file:///c:/Users/VAIBHAV/Desktop/CODING/VOICE%20AGENT/LICENSE)).
* [x] Define Voice State Machine and pipeline specifications ([docs/STATE_MACHINE.md](file:///c:/Users/VAIBHAV/Desktop/CODING/VOICE%20AGENT/docs/STATE_MACHINE.md), [docs/VOICE_PIPELINE.md](file:///c:/Users/VAIBHAV/Desktop/CODING/VOICE%20AGENT/docs/VOICE_PIPELINE.md)).

---

### [ ] PHASE 1: Frontend Shell and Voice-Agent UI
* [ ] Initialize React + TypeScript application with Tailwind CSS and Lucide icons.
* [ ] Build responsive, modern dark-mode voice assistant interface.
* [ ] Implement Voice State indicator badge (`IDLE`, `CONNECTING`, `LISTENING`, `THINKING`, `SPEAKING`, `ERROR`).
* [ ] Implement interactive visualizer component (audio waveform / pulsing ring).
* [ ] Build conversation transcript panel with auto-scroll.
* [ ] Implement Push-to-Talk and continuous voice toggle controls.
* [ ] Implement manual text input fallback.

---

### [ ] PHASE 2: Realtime Connection & Microphone Pipeline
* [ ] Build Node.js / Express backend with `/api/token` endpoint using LiveKit Server SDK.
* [ ] Connect frontend to LiveKit room using `@livekit/components-react` / `livekit-client`.
* [ ] Implement microphone permission handling and device selector.
* [ ] AudioWorklet / Web Audio API setup for client-side audio level metering.
* [ ] Connection recovery, reconnect exponential backoff, and error reporting.

---

### [ ] PHASE 3: Basic STT → LLM → TTS Voice Pipeline
* [ ] Set up Python LiveKit Agent worker foundation.
* [ ] Integrate Voice Activity Detection (Silero VAD).
* [ ] Integrate Speech-to-Text adapter (Deepgram Nova-2 / local Whisper).
* [ ] Integrate LLM adapter (Groq / OpenAI / Ollama) with multilingual prompt (English, Hindi, Hinglish).
* [ ] Integrate Text-to-Speech adapter (Cartesia / ElevenLabs / Qwen3-TTS).
* [ ] Validate end-to-end turn: User speaks → Agent responds with audio.

---

### [ ] PHASE 4: Streaming Optimization & Interruption Handling
* [ ] Implement sentence/clause chunking for incremental TTS synthesis.
* [ ] Implement barge-in interruption detection (VAD triggers cancellation of in-flight TTS & LLM).
* [ ] Truncate outbound audio playback in client immediately upon interruption.
* [ ] Benchmark and record latency metrics (micro-to-VAD, VAD-to-STT, TTFT, TTFA, total latency).
* [ ] Optimize buffer sizes to achieve sub-800ms end-to-end response.

---

### [ ] PHASE 5: Conversation History, Authentication & User Settings
* [ ] Integrate MongoDB & Mongoose in backend for conversation persistence.
* [ ] User authentication (JWT / sessions) and personal settings.
* [ ] Voice preferences (speed, voice timbre, default language: English, Hindi, Hinglish).
* [ ] Context pruning to maintain low latency while preserving conversational memory.

---

### [ ] PHASE 6: Tool Calling & Useful Built-In Tools
* [ ] Design tool registration and schema generation framework for Python Agent.
* [ ] Implement core tools: Calculator, Current Time/Date, Weather, Unit Converter.
* [ ] Implement developer tools: Web Search / Wikipedia search, GitHub lookup.
* [ ] Handle tool execution latency with auditory cues ("Let me check that for you...").

---

### [ ] PHASE 7: Memory, RAG & Document Support
* [ ] Implement semantic long-term memory for user preferences.
* [ ] Document ingestion pipeline (PDF, Markdown, text).
* [ ] Vector embeddings and retrieval-augmented generation (RAG) during voice calls.
* [ ] Latency-bounded context injection.

---

### [ ] PHASE 8: Advanced Integrations, Observability & Production Optimization
* [ ] Structured logging, Prometheus metrics, and OpenTelemetry tracing.
* [ ] Wake-word detection integration.
* [ ] Multimodal support (screen / camera image context understanding).
* [ ] Connection load testing and benchmark suite.

---

### [ ] PHASE 9: Deployment, GitHub Release & Public Documentation
* [ ] Containerization: Production Dockerfiles for frontend, backend, and agent.
* [ ] Docker Compose for single-command local multi-service startup.
* [ ] Render deployment configuration for frontend and backend token service.
* [ ] Dedicated GPU runtime deployment guide (RunPod, Modal, or AWS EC2).
* [ ] Final user documentation, demo videos, and GitHub release checklist.

---

## Future Ideas & Explorations
* On-device whisper.wasm client-side speech preprocessing.
* Multi-speaker diarization and multi-agent debate rooms.
* Native mobile client using React Native / Flutter.
* Custom localized fine-tuned voices for regional Indian languages (Tamil, Telugu, Bengali).
