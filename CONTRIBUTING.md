# Contributing to Open Source Realtime Voice Agent

Thank you for your interest in contributing to this project! We are building a production-grade, low-latency, modular realtime voice agent supporting English, Hindi, and Hinglish.

---

## 1. Development Philosophy: Strict Phased Execution

To maintain rock-solid architecture, stability, and clean documentation, this project follows an incremental phased roadmap:

* **PHASE 0:** Project architecture, repository setup, and documentation foundation.
* **PHASE 1:** Frontend shell and voice-agent UI.
* **PHASE 2:** Realtime connection and microphone pipeline.
* **PHASE 3:** Basic STT → LLM → TTS voice pipeline.
* **PHASE 4:** Streaming optimization and interruption handling.
* **PHASE 5:** Conversation history, authentication, and user settings.
* **PHASE 6:** Tool calling and useful built-in tools.
* **PHASE 7:** Memory, RAG, and document support.
* **PHASE 8:** Advanced integrations, observability, and production optimization.
* **PHASE 9:** Deployment, GitHub release preparation, and public documentation.

**Core Rule:** Only work on the current designated phase. Do not skip phases or introduce features scheduled for future phases prematurely.

---

## 2. Code Quality & Standards

### TypeScript / Frontend
* Strict TypeScript (`"strict": true` in `tsconfig.json`).
* Component modularity: Small, single-responsibility components.
* No inline business logic inside presentation components.
* Use Tailwind CSS or modular CSS for styles; avoid massive CSS blobs.

### Python / Voice Agent
* Python 3.10+ required (Python 3.12 recommended).
* Full type annotations on all function signatures (`def process_chunk(chunk: AudioChunk) -> AsyncIterator[TextToken]:`).
* Asynchronous execution (`asyncio`) without blocking the event loop.
* Clear adapter boundaries for VAD, STT, LLM, and TTS providers.

### Security
* **Zero Secrets in Code:** Never hardcode API keys, LiveKit credentials, or database connection strings.
* Validate all inputs at network boundaries.
* Never send server-side keys to the browser client.

---

## 3. Mandatory Documentation Rule

**Every Pull Request or feature increment MUST update documentation in the same change:**
1. Update [README.md](file:///c:/Users/VAIBHAV/Desktop/CODING/VOICE%20AGENT/README.md) if setup, dependencies, or user behavior changed.
2. Update the relevant documentation in [`docs/`](file:///c:/Users/VAIBHAV/Desktop/CODING/VOICE%20AGENT/docs).
3. Update [docs/CHANGELOG.md](file:///c:/Users/VAIBHAV/Desktop/CODING/VOICE%20AGENT/docs/CHANGELOG.md) under the active phase.
4. Update [docs/ROADMAP.md](file:///c:/Users/VAIBHAV/Desktop/CODING/VOICE%20AGENT/docs/ROADMAP.md) to reflect completed tasks.
5. If new environment variables are added, document them in [.env.example](file:///c:/Users/VAIBHAV/Desktop/CODING/VOICE%20AGENT/.env.example).

---

## 4. Git & Commit Guidelines

We enforce Conventional Commits:

* `feat:` A new feature or capability.
* `fix:` A bug fix.
* `docs:` Documentation changes only.
* `perf:` A code change that improves latency or performance.
* `refactor:` Code restructuring without behavioral changes.
* `test:` Adding or updating tests.
* `chore:` Build process, tooling, or dependency updates.

**Examples:**
* `feat(agent): add streaming Deepgram STT adapter`
* `perf(audio): reduce chunk buffer latency to 50ms`
* `docs(roadmap): mark phase 0 completed`

---

## 5. Testing & Acceptance

Before submitting code:
* Run linting across frontend, backend, and agent.
* Execute unit and integration tests.
* Complete the documented manual test checklist for realtime audio flows.
