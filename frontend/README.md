# Frontend Client (React + TypeScript + Tailwind CSS)

This directory hosts the web client application for the Realtime Voice Agent.

## Scope & Implementation Plan
* **Target Phase:** Phase 1 (UI Shell & Voice State Indicators) & Phase 2 (LiveKit WebRTC Connection & Audio Metering).
* **Stack:**
  * React 19 / Vite
  * TypeScript (Strict)
  * Tailwind CSS
  * Lucide Icons
  * LiveKit Client SDK (`@livekit/components-react`, `livekit-client`)

## Structure (Planned)
```
frontend/
├── src/
│   ├── assets/           # Static assets, branding, and audio cues
│   ├── components/       # Visualizer, transcript panel, controls, state badge
│   ├── hooks/            # useLiveKitVoice, useAudioVisualizer, useVoiceState
│   ├── types/            # TypeScript interfaces and state enums
│   ├── App.tsx           # Primary application container
│   ├── main.tsx          # React DOM entrypoint
│   └── index.css         # Tailwind & theme variables
├── index.html
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── vite.config.ts
```
