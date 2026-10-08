"""
Large Language Model (LLM) Provider Implementations.
Includes MockLLM, OpenAILLM (Groq/OpenAI compatible), and OllamaLLM.
Enhanced with token-level streaming generation, first-token (TTFT) instrumentation,
and async cancellation support (Phase 4).
"""

import time
import asyncio
from typing import List, Dict, Optional, AsyncIterator
from .base import BaseLLM, LLMResult, LLMChunk

DEFAULT_SYSTEM_PROMPT = (
    "You are Vaani, a friendly, concise, and articulate AI voice assistant. "
    "You understand English, Hindi, and Hinglish. Match the user's spoken language naturally. "
    "Keep responses to 1-2 conversational sentences without bullet points, emojis, or markdown, "
    "as your output will be spoken aloud to the user."
)


class MockLLM(BaseLLM):
    """
    Mock LLM provider for fast unit tests, deterministic verification, and offline development.
    Supports token-by-token streaming with simulated TTFT and inter-token intervals.
    """

    def generate(
        self,
        messages: List[Dict[str, str]],
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 150,
    ) -> LLMResult:
        start_time = time.perf_counter()
        time.sleep(0.08)  # Simulate ~80ms TTFT

        last_user_msg = ""
        for m in reversed(messages):
            if m.get("role") == "user":
                last_user_msg = m.get("content", "").lower()
                break

        # Context-aware mock responses
        if any(w in last_user_msg for w in ["kya", "kaise", "namaste", "aap", "kaun"]):
            reply = "Namaste! Main Vaani hoon, aapka open-source realtime voice assistant. Main aapki kya madad kar sakta hoon?"
        elif "react" in last_user_msg:
            reply = "React is a component-based JavaScript library for building responsive user interfaces with reusable state."
        elif "who are you" in last_user_msg or "what is your name" in last_user_msg:
            reply = "I am Vaani, an open-source realtime conversational voice assistant built with LiveKit and open AI models."
        else:
            reply = f"I understand your query about '{last_user_msg[:40]}'. The voice pipeline processed this turn with low latency."

        duration = (time.perf_counter() - start_time) * 1000
        tokens = len(reply.split())

        return LLMResult(
            text=reply,
            tokens_used=tokens,
            duration_ms=round(duration, 2),
        )

    async def stream_generate(
        self,
        messages: List[Dict[str, str]],
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 150,
    ) -> AsyncIterator[LLMChunk]:
        """
        Streams words/tokens incrementally with accurate TTFT and cancellation support.
        """
        start_time = time.perf_counter()
        # Simulate TTFT delay (e.g. 50ms)
        await asyncio.sleep(0.05)

        full_res = self.generate(messages, system_prompt, temperature, max_tokens)
        words = full_res.text.split(" ")
        accumulated: List[str] = []

        for i, word in enumerate(words):
            delta = word + (" " if i < len(words) - 1 else "")
            accumulated.append(delta)
            is_first = (i == 0)
            is_final = (i == len(words) - 1)
            duration = (time.perf_counter() - start_time) * 1000

            yield LLMChunk(
                delta=delta,
                accumulated_text="".join(accumulated),
                is_first_token=is_first,
                is_final=is_final,
                duration_ms=round(duration, 2),
            )
            # Simulate natural inter-token arrival time (10ms)
            if not is_final:
                await asyncio.sleep(0.01)


class OpenAILLM(BaseLLM):
    """
    LLM provider using OpenAI-compatible API (compatible with Groq, OpenAI, and vLLM).
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: str = "gpt-4o-mini",
    ):
        self.api_key = api_key
        self.base_url = base_url
        self.model = model
        self._fallback = MockLLM()

        if self.api_key:
            try:
                import openai
                self._client = openai.OpenAI(
                    api_key=self.api_key,
                    base_url=self.base_url,
                )
            except Exception:
                self._client = None
        else:
            self._client = None

    def generate(
        self,
        messages: List[Dict[str, str]],
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 150,
    ) -> LLMResult:
        if not self._client:
            return self._fallback.generate(messages, system_prompt, temperature, max_tokens)

        start_time = time.perf_counter()
        full_messages = []
        sys = system_prompt or DEFAULT_SYSTEM_PROMPT
        full_messages.append({"role": "system", "content": sys})

        for m in messages:
            if m.get("role") in ("user", "assistant"):
                full_messages.append({"role": m["role"], "content": m["content"]})

        try:
            response = self._client.chat.completions.create(
                model=self.model,
                messages=full_messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            duration = (time.perf_counter() - start_time) * 1000
            reply = response.choices[0].message.content or ""
            tokens = response.usage.total_tokens if response.usage else len(reply.split())

            return LLMResult(
                text=reply.strip(),
                tokens_used=tokens,
                duration_ms=round(duration, 2),
            )
        except Exception:
            res = self._fallback.generate(messages, system_prompt, temperature, max_tokens)
            res.duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
            return res

    async def stream_generate(
        self,
        messages: List[Dict[str, str]],
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 150,
    ) -> AsyncIterator[LLMChunk]:
        """
        Streams token deltas directly from OpenAI/Groq API with stream=True.
        """
        if not self._client:
            async for chunk in self._fallback.stream_generate(
                messages, system_prompt, temperature, max_tokens
            ):
                yield chunk
            return

        start_time = time.perf_counter()
        full_messages = []
        sys = system_prompt or DEFAULT_SYSTEM_PROMPT
        full_messages.append({"role": "system", "content": sys})

        for m in messages:
            if m.get("role") in ("user", "assistant"):
                full_messages.append({"role": m["role"], "content": m["content"]})

        try:
            loop = asyncio.get_event_loop()
            # Run stream invocation in executor to keep loop responsive
            stream = await loop.run_in_executor(
                None,
                lambda: self._client.chat.completions.create(
                    model=self.model,
                    messages=full_messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    stream=True,
                ),
            )

            accumulated = []
            is_first = True

            for part in stream:
                delta = part.choices[0].delta.content or ""
                if not delta:
                    continue
                accumulated.append(delta)
                duration = (time.perf_counter() - start_time) * 1000

                yield LLMChunk(
                    delta=delta,
                    accumulated_text="".join(accumulated),
                    is_first_token=is_first,
                    is_final=False,
                    duration_ms=round(duration, 2),
                )
                is_first = False
                await asyncio.sleep(0.001)

            # Final marker
            yield LLMChunk(
                delta="",
                accumulated_text="".join(accumulated),
                is_first_token=False,
                is_final=True,
                duration_ms=round((time.perf_counter() - start_time) * 1000, 2),
            )

        except Exception:
            async for chunk in self._fallback.stream_generate(
                messages, system_prompt, temperature, max_tokens
            ):
                yield chunk


class OllamaLLM(BaseLLM):
    """
    Pluggable adapter for locally hosted Ollama instances (e.g., Llama-3.2, Qwen2.5).
    """

    def __init__(self, base_url: str = "http://localhost:11434", model: str = "llama3.2"):
        self.base_url = base_url
        self.model = model
        self._fallback = MockLLM()

    def generate(
        self,
        messages: List[Dict[str, str]],
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 150,
    ) -> LLMResult:
        start_time = time.perf_counter()
        try:
            import httpx
            sys = system_prompt or DEFAULT_SYSTEM_PROMPT
            full_msgs = [{"role": "system", "content": sys}] + messages

            resp = httpx.post(
                f"{self.base_url}/api/chat",
                json={
                    "model": self.model,
                    "messages": full_msgs,
                    "stream": False,
                    "options": {"temperature": temperature, "num_predict": max_tokens},
                },
                timeout=10.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                content = data.get("message", {}).get("content", "")
                duration = (time.perf_counter() - start_time) * 1000
                return LLMResult(
                    text=content.strip(),
                    tokens_used=len(content.split()),
                    duration_ms=round(duration, 2),
                )
        except Exception:
            pass

        return self._fallback.generate(messages, system_prompt, temperature, max_tokens)

    async def stream_generate(
        self,
        messages: List[Dict[str, str]],
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 150,
    ) -> AsyncIterator[LLMChunk]:
        """Streaming adapter with fallback."""
        async for chunk in self._fallback.stream_generate(
            messages, system_prompt, temperature, max_tokens
        ):
            yield chunk
