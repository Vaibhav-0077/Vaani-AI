"""
Agent runtime configuration and component factory.
Loads settings from root .env or agent/.env and builds provider instances.
"""

import os
from pathlib import Path
from dataclasses import dataclass
from typing import Optional

try:
    from dotenv import load_dotenv
    # Load from agent/.env or root .env
    current_dir = Path(__file__).parent.parent
    root_env = current_dir.parent / ".env"
    agent_env = current_dir / ".env"

    if agent_env.exists():
        load_dotenv(agent_env)
    if root_env.exists():
        load_dotenv(root_env)
except ImportError:
    pass


@dataclass
class AgentConfig:
    # Providers
    vad_provider: str = os.getenv("VAD_PROVIDER", "energy").lower()
    stt_provider: str = os.getenv("STT_PROVIDER", "mock").lower()
    llm_provider: str = os.getenv("LLM_PROVIDER", "mock").lower()
    tts_provider: str = os.getenv("TTS_PROVIDER", "pyttsx3").lower()

    # Model & Language Settings
    default_language: str = os.getenv("DEFAULT_LANGUAGE", "auto")
    llm_model: str = os.getenv("LLM_MODEL", "gpt-4o-mini")

    # API Keys & Endpoints
    openai_api_key: Optional[str] = os.getenv("OPENAI_API_KEY")
    groq_api_key: Optional[str] = os.getenv("GROQ_API_KEY")
    ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

    # LiveKit credentials
    livekit_url: Optional[str] = os.getenv("LIVEKIT_URL")
    livekit_api_key: Optional[str] = os.getenv("LIVEKIT_API_KEY")
    livekit_api_secret: Optional[str] = os.getenv("LIVEKIT_API_SECRET")

    # Thresholds
    energy_threshold: float = float(os.getenv("VAD_ENERGY_THRESHOLD", "400.0"))


def get_config() -> AgentConfig:
    return AgentConfig()
