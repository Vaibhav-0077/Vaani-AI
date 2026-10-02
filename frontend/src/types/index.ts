export type VoiceState = 'IDLE' | 'CONNECTING' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'ERROR';

export type ConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'ERROR';

export interface TokenResponse {
  serverUrl: string;
  roomName: string;
  participantName: string;
  token: string;
  expiresIn?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  isInterim?: boolean;
  language?: 'en' | 'hi' | 'hinglish';
  latencyMs?: number;
}

export interface AgentSettings {
  language: string;
  speechRate: number;
  continuousMode: boolean;
  autoScroll: boolean;
  selectedMicrophoneId?: string;
}

export interface StateConfig {
  label: string;
  description: string;
  badgeBg: string;
  badgeText: string;
  borderColor: string;
  ringColor: string;
  glowColor: string;
}
