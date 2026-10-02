"""
Conversation Context & Dialogue History Manager.
Maintains sliding conversational memory, role formatting, and multilingual guidance.
"""

from typing import List, Dict, Optional
from datetime import datetime


class ConversationContext:
    """
    Maintains dialogue turns between user and agent.
    Truncates oldest messages to keep prompt context concise and latency minimal.
    """

    def __init__(
        self,
        max_turns: int = 10,
        system_prompt: Optional[str] = None,
    ):
        self.max_turns = max_turns
        self.system_prompt = system_prompt or (
            "You are Vaani, a friendly, concise, and articulate AI voice assistant. "
            "You understand English, Hindi, and Hinglish. Match the user's spoken language naturally. "
            "Keep responses to 1-2 conversational sentences without bullet points, emojis, or markdown, "
            "as your output will be spoken aloud to the user."
        )
        self.history: List[Dict[str, str]] = []

    def add_user_message(self, content: str) -> None:
        """Appends user utterance to dialogue history."""
        if content.strip():
            self.history.append({"role": "user", "content": content.strip()})
            self._prune()

    def add_assistant_message(self, content: str) -> None:
        """Appends assistant response to dialogue history."""
        if content.strip():
            self.history.append({"role": "assistant", "content": content.strip()})
            self._prune()

    def get_messages_for_llm(self) -> List[Dict[str, str]]:
        """Returns the formatted chat messages for the LLM."""
        return list(self.history)

    def clear(self) -> None:
        """Clears all conversation history."""
        self.history.clear()

    def _prune(self) -> None:
        """Ensures dialogue does not exceed max_turns."""
        max_messages = self.max_turns * 2
        if len(self.history) > max_messages:
            self.history = self.history[-max_messages:]
