# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to strict phase-by-phase delivery.

---

## [Phase 0] - Project Architecture & Documentation Foundation

### Added
* Modular repository directory layout: `frontend/`, `backend/`, `agent/`, and `docs/`.
* Root `.gitignore` configured for Node.js, Python, virtual environments, audio artifacts, and model weights.
* Comprehensive root `.env.example` defining LiveKit, Backend, Python Agent, and Frontend configurations.
* Open source standard `LICENSE` (MIT).
* Project `CONTRIBUTING.md` defining code quality standards, phased workflow rules, and conventional commit rules.
* Complete system architecture guide in `docs/ARCHITECTURE.md` with Mermaid sequence and component diagrams.
* Local development and hardware sizing guide in `docs/SETUP.md` with 3-tier model options.
* Full 10-phase development roadmap in `docs/ROADMAP.md`.
* Voice state machine specification in `docs/STATE_MACHINE.md`.
* Audio streaming and adapter pipeline architecture in `docs/VOICE_PIPELINE.md`.
* Root `package.json` with multi-tier workflow automation scripts.

### Changed
* Initial repository creation and structure establishment.

### Fixed
* N/A (Initial foundation phase).

### Performance
* Defined end-to-end latency budget (< 800ms) and streaming clause-based TTS design specifications.

### Documentation
* Created comprehensive root `README.md` containing architectural overview, tech stack, installation instructions, and phase status.
