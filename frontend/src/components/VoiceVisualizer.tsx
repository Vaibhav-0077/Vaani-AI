import React from 'react';
import { Mic, MicOff, RefreshCw, Sparkles, Volume2, AlertCircle } from 'lucide-react';
import type { VoiceState } from '../types';
import { STATE_CONFIGS } from '../utils/stateConfig';

interface VoiceVisualizerProps {
  state: VoiceState;
  isMuted: boolean;
  audioLevel?: number;
  errorMessage?: string | null;
  roomName?: string | null;
  onToggleMic: () => void;
  onRetry: () => void;
}

export const VoiceVisualizer: React.FC<VoiceVisualizerProps> = ({
  state,
  isMuted,
  audioLevel = 0,
  errorMessage,
  roomName,
  onToggleMic,
  onRetry,
}) => {
  const config = STATE_CONFIGS[state];

  // Visualizer base bar distribution
  const bars = [16, 28, 48, 70, 95, 60, 85, 45, 65, 35, 20];

  const getBarHeight = (baseHeight: number, idx: number): string => {
    if (state === 'LISTENING') {
      if (isMuted) return '4px';
      if (audioLevel > 0.03) {
        const variation = Math.sin(idx * 0.8) * 0.35 + 0.65;
        const dynamicH = Math.min(48, Math.max(6, Math.round(baseHeight * audioLevel * variation * 1.8)));
        return `${dynamicH}px`;
      }
      return `${Math.max(4, Math.round(Math.sin(idx * 1.1) * 3 + 6))}px`;
    }
    if (state === 'SPEAKING') {
      return `${Math.max(12, Math.round(baseHeight * (Math.sin(idx + 1) * 0.4 + 0.6)))}px`;
    }
    if (state === 'THINKING') {
      return `${Math.max(6, Math.round(18 + Math.sin(idx) * 12))}px`;
    }
    return '4px';
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 my-auto select-none">
      {/* Outer Glow & Ambient Rings */}
      <div className="relative flex items-center justify-center w-64 h-64 md:w-80 md:h-80">
        {/* State-specific background ambient aura */}
        <div
          className={`absolute inset-0 rounded-full blur-3xl opacity-20 transition-all duration-700 ${
            state === 'LISTENING'
              ? 'bg-emerald-500 scale-110'
              : state === 'THINKING'
              ? 'bg-indigo-600 scale-110'
              : state === 'SPEAKING'
              ? 'bg-cyan-500 scale-125'
              : state === 'CONNECTING'
              ? 'bg-amber-500 scale-100'
              : state === 'ERROR'
              ? 'bg-rose-600 scale-100'
              : 'bg-slate-700 scale-90'
          }`}
          style={{
            transform: state === 'LISTENING' && audioLevel > 0.1 ? `scale(${1.1 + audioLevel * 0.3})` : undefined,
          }}
        />

        {/* Concentric Pulsing Ripples */}
        {(state === 'LISTENING' || state === 'SPEAKING') && (
          <>
            <div
              className={`absolute inset-0 rounded-full border border-dashed animate-ping opacity-25 ${
                state === 'LISTENING' ? 'border-emerald-400' : 'border-cyan-400'
              }`}
              style={{
                animationDuration: state === 'SPEAKING' ? '1.8s' : audioLevel > 0.2 ? '1.2s' : '2.5s',
              }}
            />
            <div
              className={`absolute inset-4 rounded-full border opacity-30 ${
                state === 'LISTENING' ? 'border-emerald-500' : 'border-cyan-500'
              }`}
            />
          </>
        )}

        {state === 'THINKING' && (
          <div
            className="absolute inset-2 rounded-full border-2 border-indigo-500/40 border-t-indigo-400 animate-spin"
            style={{ animationDuration: '3s' }}
          />
        )}

        {state === 'CONNECTING' && (
          <div
            className="absolute inset-2 rounded-full border-2 border-amber-500/40 border-t-amber-400 animate-spin"
            style={{ animationDuration: '1.5s' }}
          />
        )}

        {/* Center Orb Core */}
        <div
          className={`relative z-10 flex flex-col items-center justify-center w-40 h-40 md:w-48 md:h-48 rounded-full border-2 backdrop-blur-xl shadow-2xl transition-all duration-300 ${config.borderColor} ${
            state === 'LISTENING'
              ? 'bg-gradient-to-b from-emerald-950/70 to-slate-950/80 shadow-emerald-500/30'
              : state === 'THINKING'
              ? 'bg-gradient-to-b from-indigo-950/70 to-slate-950/80 shadow-indigo-500/30'
              : state === 'SPEAKING'
              ? 'bg-gradient-to-b from-cyan-950/70 to-slate-950/80 shadow-cyan-500/30'
              : state === 'CONNECTING'
              ? 'bg-gradient-to-b from-amber-950/70 to-slate-950/80 shadow-amber-500/20'
              : state === 'ERROR'
              ? 'bg-gradient-to-b from-rose-950/70 to-slate-950/80 shadow-rose-500/30'
              : 'bg-gradient-to-b from-slate-900/80 to-slate-950/90 shadow-slate-900/50'
          }`}
        >
          {/* Animated Waveform Equalizer in Center */}
          <div className="flex items-center justify-center gap-1.5 h-12 mb-2">
            {bars.map((height, idx) => (
              <span
                key={idx}
                className={`w-1 rounded-full transition-all duration-100 ${
                  state === 'LISTENING'
                    ? isMuted
                      ? 'bg-slate-600'
                      : audioLevel > 0.05
                      ? 'bg-emerald-300'
                      : 'bg-emerald-500/70'
                    : state === 'THINKING'
                    ? 'bg-indigo-400'
                    : state === 'SPEAKING'
                    ? 'bg-cyan-400'
                    : state === 'CONNECTING'
                    ? 'bg-amber-400'
                    : state === 'ERROR'
                    ? 'bg-rose-400'
                    : 'bg-slate-600'
                }`}
                style={{
                  height: getBarHeight(height, idx),
                }}
              />
            ))}
          </div>

          {/* Interactive Trigger Button inside Core */}
          {state === 'ERROR' ? (
            <button
              id="voice-retry-btn"
              onClick={onRetry}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-medium cursor-pointer transition-all hover:scale-105 active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          ) : (
            <button
              id="voice-mic-core-btn"
              onClick={onToggleMic}
              aria-label={isMuted ? 'Unmute microphone' : 'Toggle voice capture'}
              className={`p-3 rounded-full border cursor-pointer transition-all duration-300 hover:scale-110 active:scale-95 ${
                isMuted
                  ? 'bg-rose-500/20 border-rose-500/40 text-rose-400 hover:bg-rose-500/30'
                  : state === 'LISTENING'
                  ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300 hover:bg-emerald-500/30 ring-4 ring-emerald-500/20'
                  : state === 'SPEAKING'
                  ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300 hover:bg-cyan-500/30'
                  : 'bg-indigo-600/30 border-indigo-400/30 text-indigo-200 hover:bg-indigo-600/40'
              }`}
            >
              {isMuted ? (
                <MicOff className="w-5 h-5" />
              ) : state === 'SPEAKING' ? (
                <Volume2 className="w-5 h-5 animate-pulse" />
              ) : state === 'THINKING' ? (
                <Sparkles className="w-5 h-5 animate-spin" />
              ) : (
                <Mic className="w-5 h-5" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* State Guidance & Description Text */}
      <div className="mt-4 text-center">
        <p className="text-sm font-semibold text-slate-200 tracking-wide uppercase">
          {config.label}
        </p>
        <p className="text-xs text-slate-400 mt-1 max-w-xs md:max-w-sm">
          {state === 'ERROR' && errorMessage ? errorMessage : config.description}
        </p>

        {roomName && state === 'LISTENING' && (
          <p className="text-[11px] text-emerald-400/80 font-mono mt-1">
            Room: {roomName}
          </p>
        )}

        {state === 'ERROR' && (
          <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-rose-400 bg-rose-950/40 border border-rose-800/50 px-3 py-1.5 rounded-lg max-w-sm mx-auto">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="text-left text-[11px]">
              {errorMessage || 'Connection failed. Verify microphone permissions and server status.'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
