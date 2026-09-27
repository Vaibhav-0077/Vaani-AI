# Environment & Local Setup Guide

This guide walks you through setting up and running the Open Source Realtime Voice Agent locally.

---

## 1. Prerequisites

Ensure your development environment meets the following specifications:

| Requirement | Minimum Version | Recommended / Tested |
| :--- | :--- | :--- |
| **Node.js** | v18.0.0+ | v22.17+ |
| **npm** | v9.0.0+ | v10.9+ |
| **Python** | 3.10+ | 3.12+ |
| **LiveKit** | LiveKit Cloud account OR local server | LiveKit Cloud (Free tier) |
| **Database** | MongoDB 6.0+ | MongoDB Atlas (Free M0 cluster) or local |
| **Microphone** | Standard input device | Headset recommended to prevent echo |

---

## 2. Hardware Tiers & Model Selection

You do **not** need an expensive GPU to run this project. Choose the tier that matches your hardware:

### Tier 1: Cloud-Assisted (Recommended for Standard Laptops & Fast Development)
* **Hardware:** Any modern dual-core CPU, 8GB RAM, no GPU required.
* **Services:**
  * LiveKit Cloud (WebRTC transport)
  * Deepgram Nova-2 (STT - ultra-fast multilingual)
  * Groq or OpenAI (LLM - Llama 3.3 70B on Groq yields ~250 token/s TTFT)
  * Cartesia Sonic or ElevenLabs (TTS - sub-150ms TTFA)
* **Latency:** ~600ms - 800ms end-to-end.

### Tier 2: Hybrid (Local LLM + Cloud Speech)
* **Hardware:** Modern 6-core+ CPU or 16GB+ RAM (Apple Silicon M1/M2/M3 or PC with 6GB+ VRAM).
* **Services:** Local Ollama (e.g., `llama3.2:3b` or `qwen2.5:7b`), Deepgram STT, Cartesia TTS.
* **Latency:** ~900ms - 1300ms.

### Tier 3: Fully Self-Hosted / Offline (Advanced)
* **Hardware:** Dedicated NVIDIA GPU (minimum 12GB VRAM, recommended 16GB+ VRAM e.g. RTX 3090/4090) or Apple Silicon with 32GB+ Unified Memory.
* **Services:** Self-hosted LiveKit Server, local Whisper/Qwen3-ASR, local vLLM/Ollama, local Qwen3-TTS/Kokoro.
* **Notice:** Do not attempt to run heavy local neural models on free hosting tiers (e.g., Render free web services).

---

## 3. Step-by-Step Installation

### Step 3.1: Clone and Configure Environment Variables

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/voice-agent.git
   cd "VOICE AGENT"
   ```

2. Generate your `.env` configuration from the root template:
   ```bash
   cp .env.example .env
   ```

3. Fill in your credentials in `.env`:
   * **LiveKit:** Sign up at [cloud.livekit.io](https://cloud.livekit.io), create a project, and copy `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET`.
   * **STT / LLM / TTS Keys:** Add Deepgram, Groq/OpenAI, and Cartesia keys.

---

### Step 3.2: Backend Service Setup (`backend/`)

The backend issues authenticated WebRTC tokens and manages user session data.

```bash
cd backend
npm install
cp ../.env .env
npm run dev
```

* Backend will start on `http://localhost:5000`.
* Verification: Visit `http://localhost:5000/api/health` in your browser.

---

### Step 3.3: Python Voice Agent Setup (`agent/`)

The Python agent connects as a worker to LiveKit and orchestrates VAD, STT, LLM, and TTS.

1. Navigate to the agent directory:
   ```bash
   cd ../agent
   ```

2. Create and activate a Python virtual environment:
   * **Windows (PowerShell):**
     ```powershell
     python -m venv .venv
     .\.venv\Scripts\Activate.ps1
     ```
   * **macOS / Linux:**
     ```bash
     python3 -m venv .venv
     source .venv/bin/activate
     ```

3. Install required dependencies:
   ```bash
   pip install --upgrade pip
   pip install -r requirements.txt
   ```

4. Run the agent worker in development mode:
   ```bash
   python main.py dev
   ```

---

### Step 3.4: Frontend UI Setup (`frontend/`)

1. Open a new terminal window:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

2. Open `http://localhost:5173` in your browser.
3. Grant microphone permissions when prompted.

---

## 4. Smoke Testing & Verification

1. **Backend Health Check:** Verify `GET /api/health` returns `{"status": "ok"}`.
2. **Token Generation Test:** Verify `POST /api/token` returns a valid JWT LiveKit token.
3. **Agent Registration:** Check Python agent console logs; it should indicate successful connection to `LIVEKIT_URL` and wait for room dispatches.
4. **End-to-End Test:** Open frontend, click "Connect", speak a prompt into your microphone, and verify:
   * Voice visualizer registers microphone activity.
   * State changes: `LISTENING` → `THINKING` → `SPEAKING`.
   * Audio response is heard clearly with low latency.
   * Interruption test: Speak while the agent is speaking; agent audio stops immediately.
