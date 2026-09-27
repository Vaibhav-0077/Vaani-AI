# Open Source Realtime Voice Agent

> A production-grade, low-latency, modular voice agent supporting natural conversational speech in English, Hindi, and Hinglish with sub-800ms response times, streaming audio, and instant barge-in interruption.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](file:///c:/Users/VAIBHAV/Desktop/CODING/VOICE%20AGENT/LICENSE)
[![Status: Phase 0 Complete](https://img.shields.io/badge/Status-Phase%200%20Complete-green.svg)](file:///c:/Users/VAIBHAV/Desktop/CODING/VOICE%20AGENT/docs/ROADMAP.md)
[![Architecture: Pluggable](https://img.shields.io/badge/Architecture-Modular%20%26%20Pluggable-purple.svg)](file:///c:/Users/VAIBHAV/Desktop/CODING/VOICE%20AGENT/docs/ARCHITECTURE.md)

---

## 1. Project Overview

The **Open Source Realtime Voice Agent** is engineered to transform conversational AI from traditional, awkward "push-to-talk-and-wait" chatbots into a fluid, human-like voice assistant. 

By unifying **LiveKit WebRTC**, **Silero VAD**, streaming **STT**, ultra-fast **LLMs** (Groq/OpenAI/Ollama), and real-time **TTS** (Cartesia/ElevenLabs/Qwen3-TTS), this system starts speaking the initial words of a response before the full answer is finished generating. If you interrupt the assistant mid-sentence, it ceases speech instantly and listens to your new thought.

---

## 2. Interactive Voice States

The agent cycles cleanly through 6 states, visually synchronized across client and server:

```
[ IDLE ] ──> [ CONNECTING ] ──> [ LISTENING ] ──> [ THINKING ] ──> [ SPEAKING ]
   ^                                   ^                                  │
   │                                   └─────── (Barge-in / Done) ────────┘
   └─────────────────────────── [ ERROR ]
```

* **IDLE:** Ready to connect.
* **CONNECTING:** Secure WebRTC negotiation and room initialization.
* **LISTENING:** Capturing user microphone stream, processing real-time VAD.
* **THINKING:** Turn finalized; token generation and tool execution active.
* **SPEAKING:** Streaming audio synthesis to browser speaker.
* **ERROR:** Network or hardware disruption with graceful recovery.

---

## 3. Feature Highlights

* **Ultra-Low Latency:** Streamed end-to-end pipeline with target Time-to-First-Audio under 800ms.
* **True Barge-In Interruption:** Real-time VAD detects when you speak while the agent is talking, instantly aborting in-flight audio playback and generation.
* **Multilingual Intelligence:** Native support for English, Hindi, and colloquial Hinglish.
* **Pluggable & Vendor-Neutral:** Replace VAD, STT, LLM, or TTS providers without rewriting core application code.
* **Local or Cloud Flexibility:** Run with fast cloud APIs (Groq, Deepgram, Cartesia) or completely self-hosted local models (Ollama, Whisper, Qwen3-TTS).
* **Enterprise Security:** Zero client secrets; ephemeral room tokens issued by a dedicated Node.js/Express service.
* **Tool & Memory Ready:** Designed from the ground up for function calling, web search, calculator, and long-term memory.

---

## 4. Architecture Overview

```
Browser (React + TS UI)
       │  ▲
       ▼  │  (Opus WebRTC Audio Stream)
 LiveKit SFU (Realtime Audio Transport)
       │  ▲
       ▼  │  (Low-Latency Worker Dispatch)
 Python Voice Agent Worker
 ┌────────────────────────────────────────────────────────┐
 │ 1. Silero VAD (Speech boundary detection)              │
 │ 2. Deepgram / Qwen3-ASR (Streaming transcript)        │
 │ 3. Groq / OpenAI / Ollama (Streaming token generation)│
 │ 4. Cartesia / ElevenLabs / Qwen3-TTS (Streaming audio) │
 └────────────────────────────────────────────────────────┘
```

*For complete architectural specifications, sequence diagrams, and buffer details, refer to [docs/ARCHITECTURE.md](file:///c:/Users/VAIBHAV/Desktop/CODING/VOICE%20AGENT/docs/ARCHITECTURE.md).*

---

## 5. Technology Stack

* **Frontend Client:** React 19, TypeScript (strict), Vite, Tailwind CSS, Web Audio API, `@livekit/components-react`.
* **Backend Token Service:** Node.js, Express, MongoDB Atlas, Mongoose, `livekit-server-sdk`.
* **Python Voice Agent:** Python 3.10+ (3.12 recommended), `livekit-agents`, `asyncio`, PyTorch, Silero VAD.
* **Speech & AI Providers:** Deepgram Nova-2, Groq Llama-3.3, OpenAI GPT-4o-mini, Cartesia Sonic, Ollama.
* **Containerization:** Docker, Docker Compose.

---

## 6. Project Structure

```
VOICE AGENT/
├── .env.example              # Environment variables template
├── .gitignore                # Git ignore for Node, Python, models, secrets
├── LICENSE                   # Open-source MIT License
├── CONTRIBUTING.md           # Engineering guidelines and phase workflow
├── README.md                 # Primary project documentation
├── package.json              # Monorepo orchestration scripts
├── docs/                     # Comprehensive architectural documentation
│   ├── ARCHITECTURE.md       # Detailed system design and diagrams
│   ├── SETUP.md              # Local installation & hardware guide
│   ├── ROADMAP.md            # 10-Phase tracker and milestones
│   ├── CHANGELOG.md          # Version changelog
│   ├── VOICE_PIPELINE.md     # Audio stream & adapter interfaces
│   └── STATE_MACHINE.md      # Voice states and barge-in triggers
├── frontend/                 # React + TypeScript client (Phase 1)
├── backend/                  # Node.js token & persistence service (Phase 2/5)
└── agent/                    # Python LiveKit Voice Agent worker (Phase 3+)
```

---

## 7. Local Installation & Quick Start

### 7.1 Prerequisites
* Node.js v18+ & npm v9+
* Python 3.10+ (Python 3.12 recommended)
* A free [LiveKit Cloud](https://cloud.livekit.io) account (or self-hosted LiveKit server)

### 7.2 Configure Environment
```bash
cp .env.example .env
```
Fill in your `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and chosen model API keys in `.env`.

*For comprehensive local setup instructions, see [docs/SETUP.md](file:///c:/Users/VAIBHAV/Desktop/CODING/VOICE%20AGENT/docs/SETUP.md).*

---

## 8. Running the Application Components

### Running Frontend
```bash
cd frontend
npm install
npm run dev
```

### Running Backend Token Service
```bash
cd backend
npm install
npm run dev
```

### Running Python Voice Agent
```bash
cd agent
python -m venv .venv
# On Windows: .venv\Scripts\Activate.ps1 | On Mac/Linux: source .venv/bin/activate
pip install -r requirements.txt
python main.py dev
```

---

## 9. Performance & Latency Budgets

| Metric | Target | Cloud Stack (Default) | Local Stack (GPU) |
| :--- | :--- | :--- | :--- |
| **VAD Latency** | < 50ms | ~25ms (Silero VAD) | ~25ms |
| **STT Time to Final** | < 250ms | ~180ms (Deepgram Nova-2) | ~220ms (Whisper GPU) |
| **LLM Time-to-First-Token** | < 300ms | ~160ms (Groq Llama-3.3) | ~300ms (Ollama local) |
| **TTS Time-to-First-Audio** | < 200ms | ~120ms (Cartesia Sonic) | ~250ms (Kokoro GPU) |
| **Total First Spoken Audio**| **< 800ms** | **~500ms - 750ms** | **~800ms - 1100ms** |

---

## 10. Troubleshooting

* **No Audio in Browser:** Check browser permissions for microphone access. Ensure headphones are used to avoid acoustic feedback.
* **Agent Does Not Join Room:** Confirm `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` match across backend and agent configurations.
* **High Latency:** Ensure you are not waiting for the complete LLM response before sending text to the TTS engine; verify sentence streaming is enabled.

---

## 11. Phased Development Roadmap

* [x] **PHASE 0:** Project architecture, repository setup, and documentation foundation.
* [ ] **PHASE 1:** Frontend shell and voice-agent UI.
* [ ] **PHASE 2:** Realtime connection and microphone pipeline.
* [ ] **PHASE 3:** Basic STT → LLM → TTS voice pipeline.
* [ ] **PHASE 4:** Streaming optimization and interruption handling.
* [ ] **PHASE 5:** Conversation history, authentication, and user settings.
* [ ] **PHASE 6:** Tool calling and useful built-in tools.
* [ ] **PHASE 7:** Memory, RAG, and document support.
* [ ] **PHASE 8:** Advanced integrations, observability, and production optimization.
* [ ] **PHASE 9:** Deployment, GitHub release preparation, and public documentation.

*Read [docs/ROADMAP.md](file:///c:/Users/VAIBHAV/Desktop/CODING/VOICE%20AGENT/docs/ROADMAP.md) for detailed tasks and deliverables.*

---

## 12. Contribution & Community

Contributions are welcome! Please review [CONTRIBUTING.md](file:///c:/Users/VAIBHAV/Desktop/CODING/VOICE%20AGENT/CONTRIBUTING.md) for code quality guidelines, phase-by-phase rules, and commit message conventions.

---

## 13. License

This project is licensed under the [MIT License](file:///c:/Users/VAIBHAV/Desktop/CODING/VOICE%20AGENT/LICENSE).
