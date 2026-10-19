# 🎙️ Vaani-AI

> **Production-Quality, Low-Latency Realtime Voice & Chat AI Assistant**  
> Conversational AI in **English**, **Hindi**, and **Hinglish** with sub-second response times, live audio streaming, and intelligent voice-to-chat capabilities.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Frontend: React 19](https://img.shields.io/badge/Frontend-React%2019%20%2B%20Vite-61DAFB.svg)](frontend/)
[![Backend: Node.js](https://img.shields.io/badge/Backend-Node.js%20%2B%20Express-339933.svg)](backend/)
[![LiveKit: WebRTC](https://img.shields.io/badge/Transport-LiveKit%20WebRTC-FF6B6B.svg)](https://livekit.io)
[![STT: Groq Whisper](https://img.shields.io/badge/STT-Groq%20Whisper%20Large%20v3-F55036.svg)](https://groq.com)

---

## 🌟 What is Vaani-AI?

**Vaani-AI** is a realtime conversational voice and chat agent built for fluid, natural human-to-AI interaction. Unlike traditional push-to-talk chatbots where you wait awkwardly for long transcriptions, Vaani-AI works like a real phone call: you speak, your voice is detected in real time, transcribed in milliseconds, processed by advanced LLMs, and spoken back to you immediately.

### ✨ Key Capabilities

* 📞 **Live Full-Duplex Voice Call:** Connect over WebRTC (LiveKit) and converse naturally without pressing buttons.
* ⌨️ **Chat with In-Input Voice Dictation:** Type normally or click the in-input microphone to dictate speech straight into the text box for review before sending.
* 🌐 **Native Multilingual (English, Hindi, Hinglish):** Seamlessly recognizes and replies in English, Hindi, and colloquial Hinglish (e.g., *"Aaj ka weather kaisa hai aur Python decorators kaise kaam karte hain?"*).
* ⚡ **Ultra-Low Latency:** Powered by Groq's LPU hardware for sub-300ms Whisper STT and high-speed LLM inference.
* 🛑 **Instant Barge-In / Interruption:** Interrupt the assistant mid-sentence; playback immediately halts and switches back to listening.
* 🌊 **Dynamic Visualizer:** Real-time audio waveform and ambient orb that pulse in direct response to your voice volume.

---

## 🧠 How It Works (End-to-End Pipeline)

Vaani-AI operates a continuous voice streaming pipeline:

```
[ User Speaks into Microphone ]
             │
             ▼
[ 1. Web Audio RMS Voice Activity Detection (VAD) ]
   ├── Continuously monitors real-time amplitude & baseline noise
   ├── Detects speech onset immediately
   └── Triggers turn completion after 800ms of natural silence
             │
             ▼
[ 2. Fast Speech-to-Text (STT) ]
   ├── Encodes audio into lightweight WebM Opus buffers
   ├── Server `/api/transcribe` strips base64 headers & cleans MIME type
   ├── Transcribes via Groq Whisper Large v3 Turbo (~150ms-250ms)
   └── Fallback to Deepgram Nova-2 if needed
             │
             ▼
[ 3. LLM Conversational Brain ]
   ├── Multilingual prompt engineering (English, Hindi, Hinglish)
   ├── Fast streaming reasoning via Groq (Llama-3.3-70B / GPT-OSS)
   └── Tracks conversation history & context
             │
             ▼
[ 4. Speech Synthesis & Audio Response ]
   ├── Streams synthesized speech aloud to the user
   ├── Accommodates instant barge-in if the user speaks again
   └── Appends transcript to live conversation history
```

---

## 🏗️ System Architecture & Tech Stack

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Frontend UI** | **React 19 + TypeScript + Vite + Tailwind CSS** | Real-time audio visualizer, conversation transcript, control bar, and settings. |
| **Realtime WebRTC** | **LiveKit Client & Server SDK** | Low-latency bi-directional audio streaming and room management. |
| **Voice Detection (VAD)** | **Web Audio API (Time-Domain RMS)** | Measures true sound pressure level to distinguish voice from room noise. |
| **Speech-to-Text (STT)** | **Groq Whisper Large v3 Turbo** *(Fallback: Deepgram Nova-2)* | Multilingual transcription in ~200ms with silence hallucination filtering. |
| **Language Model (LLM)** | **Groq Cloud / OpenAI** | High-speed conversational reasoning and multi-turn dialogue. |
| **Text-to-Speech (TTS)** | **Web Speech API / Cartesia / ElevenLabs** | Natural, expressive audio voice generation. |
| **Backend Server** | **Node.js + Express** | Ephemeral LiveKit JWT issuance, session management, and `/api/transcribe` endpoint. |
| **Python Agent** | **Python 3.10+ (`livekit-agents`)** | Pluggable modular agent architecture for dedicated server-side voice workers. |

---

## 📂 Repository Structure

```
Vaani-AI/
├── frontend/                 # React 19 Client
│   ├── src/
│   │   ├── components/       # VoiceVisualizer, ControlBar, TranscriptArea, SettingsModal
│   │   ├── hooks/            # useVoiceSession.ts (RMS VAD, Dictation, WebRTC)
│   │   ├── types/            # TypeScript interfaces
│   │   └── App.tsx           # Main application view
│   └── package.json
│
├── backend/                  # Node.js API Service
│   ├── src/
│   │   └── server.js         # Token issuance, /api/transcribe, and /api/chat
│   └── package.json
│
├── agent/                    # Python LiveKit Voice Agent
│   ├── adapters/             # Modular VAD, STT, LLM, TTS providers
│   ├── core/                 # Pipeline orchestrator and dialogue context
│   ├── tests/                # Automated unit test suite
│   └── main.py               # Python agent entry point
│
├── .env.example              # Environment variables template
└── package.json              # Monorepo orchestration scripts
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites
* **Node.js** v18+ and **npm** v9+
* **Python** 3.10+ (optional, for Python voice agent worker)
* A free [LiveKit Cloud](https://cloud.livekit.io) account (or self-hosted LiveKit instance)
* A free [Groq Cloud](https://console.groq.com) API key (for ultra-fast Whisper & LLM)

---

### 2. Configure Environment Variables

Copy `.env.example` to `.env` in the root directory:

```bash
cp .env.example .env
```

Open `.env` and fill in your keys:

```ini
# LiveKit Cloud Credentials
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret

# Groq API Key (For Whisper STT & LLM)
GROQ_API_KEY=gsk_your_groq_api_key_here

# Backend Port
PORT=5000
```

---

### 3. Install Dependencies

Install root, backend, and frontend packages:

```bash
# Install backend dependencies
cd backend && npm install && cd ..

# Install frontend dependencies
cd frontend && npm install && cd ..
```

---

### 4. Run the Application

Start both the backend server and frontend client:

**Terminal 1 (Backend API):**
```bash
npm run dev:backend
# Server runs on http://localhost:5000
```

**Terminal 2 (Frontend Client):**
```bash
npm run dev:frontend
# Client runs on http://localhost:5173
```

Open **`http://localhost:5173`** in your browser!

---

## 🎯 How to Use

1. **Live Realtime Voice Call:**
   * Click **"Start Voice Call"**.
   * Speak naturally into your microphone (e.g., *"Hello! How are you?"* or *"Namaste, kya haal hai?"*).
   * Once you pause, Vaani-AI automatically detects the end of your sentence, transcribes your voice, and speaks back immediately.

2. **In-Input Voice Dictation:**
   * Click the **microphone icon** inside the chat box at the bottom.
   * Speak your query.
   * Your words will be transcribed directly into the input box.
   * Review or edit your message, then press **Enter** to send.

3. **Settings Customization:**
   * Click the **gear icon** to configure language preferences (English, Hindi, Auto/Hinglish), speech speed multiplier, and debug latency metrics.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
