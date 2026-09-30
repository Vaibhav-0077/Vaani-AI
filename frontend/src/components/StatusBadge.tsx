import React from 'react';
import type { VoiceState } from '../types';
import { STATE_CONFIGS } from '../utils/stateConfig';

interface StatusBadgeProps {
  state: VoiceState;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ state, className = '' }) => {
  const config = STATE_CONFIGS[state];

  return (
    <div
      id="agent-status-badge"
      className={`inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full border text-xs font-medium tracking-wide backdrop-blur-md transition-all duration-300 ${config.badgeBg} ${config.badgeText} ${config.borderColor} ${config.ringColor} ${className}`}
    >
      <span className="relative flex h-2 w-2">
        {state !== 'IDLE' && (
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
              state === 'LISTENING'
                ? 'bg-emerald-400'
                : state === 'THINKING'
                ? 'bg-indigo-400'
                : state === 'SPEAKING'
                ? 'bg-cyan-400'
                : state === 'CONNECTING'
                ? 'bg-amber-400'
                : 'bg-rose-400'
            }`}
          />
        )}
        <span
          className={`relative inline-flex rounded-full h-2 w-2 ${
            state === 'LISTENING'
              ? 'bg-emerald-500'
              : state === 'THINKING'
              ? 'bg-indigo-500'
              : state === 'SPEAKING'
              ? 'bg-cyan-500'
              : state === 'CONNECTING'
              ? 'bg-amber-500'
              : state === 'ERROR'
              ? 'bg-rose-500'
              : 'bg-slate-400'
          }`}
        />
      </span>
      <span className="font-semibold">{config.label}</span>
    </div>
  );
};
