# Voice Pipeline Architecture & Audio Streaming Design

This document details the streaming audio pipeline, buffering strategies, and adapter interfaces for VAD, STT, LLM, and TTS.

---

## 1. Streaming vs. Request/Response Audio

Traditional voice bots follow a high-latency request/response approach:
1. Wait for user to finish recording.
2. Send whole `.wav` file to STT.
3. Wait for entire LLM answer to generate.
4. Send full text to TTS.
5. Play complete audio file.
* **Resulting Latency:** 3000ms - 6000ms (Unusable for natural conversation).

Our pipeline operates with continuous stream processing:
```
Microphone -> WebRTC Opus Frames (20ms) -> LiveKit SFU -> Silero VAD
                                                                |
                                             Speech Frames (100ms chunks)
                                                                v
                                              Streaming STT (WebSocket)
                                                                |
                                             Partial & Final Transcripts
                                                                v
                                              Streaming LLM (Tokens)
                                                                |
                                             Token Delimiters (Punctuation)
                                                                v
                                              Streaming TTS (WebSocket)
                                                                |
                                              Opus Audio Stream back to WebRTC
```
* **Resulting Latency:** 600ms - 800ms Time-to-First-Audio.

---

## 2. Pluggable Adapter Interfaces

### 2.1 Voice Activity Detection (`BaseVAD`)
```python
from abc import ABC, abstractmethod
from typing import AsyncIterator

class VADEvent:
    START_OF_SPEECH = "start"
    END_OF_SPEECH = "end"
    INFERENCE = "inference"

class BaseVAD(ABC):
    @abstractmethod
    async def process_frame(self, frame_bytes: bytes) -> VADEvent | None:
        """Processes 20ms of 16kHz/48kHz PCM audio and returns VAD state change."""
        pass
```
* **Default:** Silero VAD (ONNX runtime embedded in Python). Runs in ~2ms per 30ms window on CPU.

---

### 2.2 Speech-to-Text (`BaseSTT`)
```python
from abc import ABC, abstractmethod
from typing import AsyncIterator

class STTTranscript:
    text: str
    is_final: bool
    language: str
    confidence: float

class BaseSTT(ABC):
    @abstractmethod
    async def stream_transcribe(
        self, audio_stream: AsyncIterator[bytes]
    ) -> AsyncIterator[STTTranscript]:
        """Consumes PCM audio chunks and yields interim and final transcripts."""
        pass
```
* **Default Cloud:** Deepgram Nova-2 (WebSocket streaming, multilingual: English, Hindi, Hinglish auto-switch).
* **Local Alternative:** Qwen3-ASR / Whisper.cpp / Faster-Whisper.

---

### 2.3 Large Language Model (`BaseLLM`)
```python
from abc import ABC, abstractmethod
from typing import AsyncIterator, List, Dict, Any

class BaseLLM(ABC):
    @abstractmethod
    async def chat_stream(
        self,
        messages: List[Dict[str, str]],
        tools: List[Dict[str, Any]] | None = None
    ) -> AsyncIterator[str]:
        """Streams text tokens and tool invocation requests asynchronously."""
        pass
```
* **Default Cloud:** Groq (Llama-3.3 70B Versatile, ~250 tokens/sec) or OpenAI GPT-4o-mini.
* **Local Alternative:** Ollama (`ollama run llama3.2` or `qwen2.5`).

---

### 2.4 Text-to-Speech (`BaseTTS`)
```python
from abc import ABC, abstractmethod
from typing import AsyncIterator

class BaseTTS(ABC):
    @abstractmethod
    async def stream_synthesize(
        self, text_stream: AsyncIterator[str]
    ) -> AsyncIterator[bytes]:
        """Consumes text tokens and yields raw audio frames for WebRTC transmission."""
        pass
```
* **Default Cloud:** Cartesia Sonic (WebSocket low-latency streaming) or ElevenLabs Turbo v2.5.
* **Local Alternative:** Qwen3-TTS / Kokoro / Piper.

---

## 3. Multilingual Handling (English, Hindi, Hinglish)

Conversational AI in Indian and global contexts frequently mixes English and Hindi (Hinglish):
1. **STT Layer:** Selected model (Deepgram Nova-2 with `language: "hi"` or `multilingual` flag) accurately transcribes phonemes like *"Kya aap mujhe React hooks explain kar sakte ho?"*.
2. **LLM Layer:** The system prompt explicitly guides the agent:
   > "You are an articulate, friendly AI voice assistant. You understand English, Hindi, and Hinglish. Match the user's spoken language naturally. Keep sentences conversational and concise for spoken dialogue."
3. **TTS Layer:** The TTS voice must support multilingual phonemes without sounding robotic. Cartesia and ElevenLabs provide voices trained on South Asian English and Hindi.
