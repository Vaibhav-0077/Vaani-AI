export type VoiceState = 'IDLE' | 'CONNECTING' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'ERROR';

export type ConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'ERROR';

export interface TokenResponse {
  serverUrl: string;
  roomName: string;
  participantName: string;
  token: string;
  expiresIn?: string;
}

export interface LatencyMetrics {
  speechDurationMs?: number;
  sttLatencyMs?: number;
  ttftMs?: number; // Time-to-First-Token
  ttfaMs?: number; // Time-to-First-Audio
  ttsDurationMs?: number;
  totalTurnMs?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  isInterim?: boolean;
  language?: 'en' | 'hi' | 'hinglish';
  latencyMs?: number;
  latencyMetrics?: LatencyMetrics;
  interrupted?: boolean;
}

export interface AgentSettings {
  language: string;
  speechRate: number;
  continuousMode: boolean;
  autoScroll: boolean;
  debugMode?: boolean; // Toggles real-time latency inspection panel
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
