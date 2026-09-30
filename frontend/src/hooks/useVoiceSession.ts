import { useState, useCallback, useRef } from 'react';
import type { VoiceState, ChatMessage, AgentSettings } from '../types';

export function useVoiceSession() {
  const [voiceState, setVoiceState] = useState<VoiceState>('IDLE');
  const [isMuted, setIsMuted] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [settings, setSettings] = useState<AgentSettings>({
    language: 'auto',
    speechRate: 1.0,
    continuousMode: true,
    autoScroll: true,
  });

  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimeouts = () => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  };

  // Toggle connection state (Mock handshake for Phase 1 UI verification)
  const toggleConnection = useCallback(() => {
    clearTimeouts();
    if (voiceState === 'IDLE' || voiceState === 'ERROR') {
      setVoiceState('CONNECTING');
      const t1 = setTimeout(() => {
        setVoiceState('LISTENING');
      }, 1200);
      timeoutsRef.current.push(t1);
    } else {
      setVoiceState('IDLE');
      setInterimTranscript('');
    }
  }, [voiceState]);

  // Toggle hardware mute
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  // Text fallback message handler
  const sendMessage = useCallback((content: string) => {
    if (!content.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setVoiceState('THINKING');

    // Simulate mock turn response (Phase 1 UI demonstration only)
    const t1 = setTimeout(() => {
      setVoiceState('SPEAKING');
      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `[UI Shell Response] Received: "${content}". Voice pipeline and model inference will be active in Phase 3.`,
        timestamp: new Date(),
        latencyMs: 380,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      const t2 = setTimeout(() => {
        setVoiceState('LISTENING');
      }, 2500);
      timeoutsRef.current.push(t2);
    }, 1000);

    timeoutsRef.current.push(t1);
  }, []);

  // Clear conversation history
  const clearMessages = useCallback(() => {
    setMessages([]);
    setInterimTranscript('');
  }, []);

  // Update configuration settings
  const updateSettings = useCallback((newSettings: Partial<AgentSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  }, []);

  // Manual state simulator for comprehensive UI testing
  const simulateState = useCallback((state: VoiceState) => {
    clearTimeouts();
    setVoiceState(state);
    if (state === 'LISTENING') {
      setInterimTranscript('User speaking test in English / Hindi...');
    } else {
      setInterimTranscript('');
    }
  }, []);

  return {
    voiceState,
    isMuted,
    interimTranscript,
    messages,
    settings,
    toggleConnection,
    toggleMute,
    sendMessage,
    clearMessages,
    updateSettings,
    simulateState,
  };
}
