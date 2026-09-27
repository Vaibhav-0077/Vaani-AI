# Backend Token & Session Service (Node.js + Express + MongoDB)

This directory hosts the server-side API responsible for issuing authenticated LiveKit WebRTC tokens, managing user sessions, and persisting conversation histories.

## Scope & Implementation Plan
* **Target Phase:** Phase 2 (LiveKit Token Generation & Room Authorization) & Phase 5 (MongoDB Persistence & User Settings).
* **Stack:**
  * Node.js (v18+)
  * Express.js
  * LiveKit Server SDK (`livekit-server-sdk`)
  * MongoDB Atlas & Mongoose
  * CORS, Helmet, Dotenv

## Structure (Planned)
```
backend/
├── src/
│   ├── config/           # Database & LiveKit client configurations
│   ├── controllers/      # Token generation and conversation handlers
│   ├── models/           # Mongoose schemas (User, Conversation, Message)
│   ├── routes/           # Express API endpoints (/api/token, /api/history)
│   ├── middleware/       # Error handling, rate limiting, auth checks
│   └── server.js         # HTTP server entrypoint
├── package.json
└── tsconfig.json
```
