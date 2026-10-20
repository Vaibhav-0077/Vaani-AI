import React from 'react';
import { Settings2, Sparkles, ExternalLink } from 'lucide-react';
import type { VoiceState } from '../types';
import { StatusBadge } from './StatusBadge';

interface HeaderProps {
  voiceState: VoiceState;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({ voiceState, onOpenSettings }) => {
  return (
    <header className="w-full flex items-center justify-between py-4 px-6 border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-xl sticky top-0 z-30">
      {/* Brand Title */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
          <Sparkles className="w-5 h-5 animate-pulse" />
        </div>
        <div>
          <h1 className="text-base font-bold text-slate-100 tracking-tight flex items-center gap-2">
            Vaani-AI
            <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/30 text-emerald-300">
              Live
            </span>
          </h1>
          <p className="text-[11px] text-slate-400">
            Realtime Voice AI • English, Hindi & Hinglish
          </p>
        </div>
      </div>

      {/* Center Status Badge */}
      <div className="hidden sm:block">
        <StatusBadge state={voiceState} />
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2">
        {/* Creator Portfolio Badge */}
        <a
          href="https://vaibhavguigade.onrender.com/"
          target="_blank"
          rel="noopener noreferrer"
          title="Designed & Developed by Vaibhav"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-300 bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/50 shadow-sm transition-all group cursor-pointer"
        >
          <span className="hidden sm:inline text-slate-400">Created by</span>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400 font-semibold group-hover:from-indigo-300 group-hover:to-cyan-300">
            Vaibhav
          </span>
          <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-400 transition-colors" />
        </a>

        <button
          id="header-settings-btn"
          onClick={onOpenSettings}
          title="Open Settings"
          className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-slate-800 transition-colors cursor-pointer"
        >
          <Settings2 className="w-4 h-4" />
        </button>

        <a
          href="https://github.com/Vaibhav-0077/Vaani-AI"
          target="_blank"
          rel="noreferrer"
          title="GitHub Repository"
          className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-slate-800 transition-colors cursor-pointer flex items-center gap-1 text-xs"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    </header>
  );
};
