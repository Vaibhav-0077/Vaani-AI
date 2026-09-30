import React, { useState } from 'react';
import { Mic, MicOff, Send, PhoneCall, PhoneOff, Settings2, Sliders } from 'lucide-react';
import type { VoiceState } from '../types';

interface ControlBarProps {
  voiceState: VoiceState;
  isMuted: boolean;
  onToggleMic: () => void;
  onToggleConnection: () => void;
  onSendMessage: (text: string) => void;
  onOpenSettings: () => void;
  onSimulateState?: (state: VoiceState) => void;
}

export const ControlBar: React.FC<ControlBarProps> = ({
  voiceState,
  isMuted,
  onToggleMic,
  onToggleConnection,
  onSendMessage,
  onOpenSettings,
  onSimulateState,
}) => {
  const [inputText, setInputText] = useState('');
  const [showSimMenu, setShowSimMenu] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
      onSendMessage(inputText.trim());
      setInputText('');
    }
  };

  const isConnected = voiceState !== 'IDLE' && voiceState !== 'ERROR';

  return (
    <div className="w-full bg-slate-950/80 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-3 md:p-4 shadow-2xl">
      {/* State Simulator (Development / Testing Helper for Phase 1 verification) */}
      {showSimMenu && onSimulateState && (
        <div className="mb-3 p-2.5 bg-slate-900 border border-indigo-500/30 rounded-xl flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400 font-medium flex items-center gap-1">
            <Sliders className="w-3.5 h-3.5 text-indigo-400" />
            Simulate Voice State:
          </span>
          {(['IDLE', 'CONNECTING', 'LISTENING', 'THINKING', 'SPEAKING', 'ERROR'] as VoiceState[]).map(
            (st) => (
              <button
                key={st}
                id={`simulate-${st.toLowerCase()}-btn`}
                onClick={() => {
                  onSimulateState(st);
                  setShowSimMenu(false);
                }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                  voiceState === st
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {st}
              </button>
            )
          )}
        </div>
      )}

      <div className="flex flex-col md:flex-row items-center gap-3">
        {/* Connection & Mic Toggle Actions */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-start">
          {/* Main Connect / Disconnect button */}
          <button
            id="toggle-connection-btn"
            onClick={onToggleConnection}
            className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium text-xs tracking-wide transition-all duration-300 cursor-pointer ${
              isConnected
                ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/40'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 hover:scale-[1.02]'
            }`}
          >
            {isConnected ? (
              <>
                <PhoneOff className="w-4 h-4" />
                <span>Disconnect</span>
              </>
            ) : (
              <>
                <PhoneCall className="w-4 h-4" />
                <span>Start Voice Call</span>
              </>
            )}
          </button>

          {/* Mic Mute / Unmute Button */}
          <button
            id="toggle-mic-btn"
            onClick={onToggleMic}
            disabled={!isConnected}
            title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
              !isConnected
                ? 'opacity-40 cursor-not-allowed border-slate-800 bg-slate-900 text-slate-500'
                : isMuted
                ? 'bg-rose-500/20 text-rose-400 border-rose-500/40 hover:bg-rose-500/30'
                : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
            }`}
          >
            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          {/* Quick Settings Trigger */}
          <button
            id="open-settings-btn"
            onClick={onOpenSettings}
            title="Settings"
            className="p-2.5 rounded-xl border border-slate-800 bg-slate-900/80 text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Settings2 className="w-4 h-4" />
          </button>

          {/* State Simulator toggle */}
          {onSimulateState && (
            <button
              id="toggle-simulator-menu-btn"
              onClick={() => setShowSimMenu(!showSimMenu)}
              title="Test Voice States"
              className="p-2.5 rounded-xl border border-indigo-900/60 bg-indigo-950/40 text-indigo-300 hover:bg-indigo-900/50 transition-colors cursor-pointer"
            >
              <Sliders className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Text Input Fallback with Send Button */}
        <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-2 w-full">
          <div className="relative flex-1">
            <input
              id="text-fallback-input"
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Or type a message to the agent (fallback)..."
              className="w-full bg-slate-900/90 text-slate-100 placeholder-slate-500 text-sm px-4 py-2.5 rounded-xl border border-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
            />
          </div>

          <button
            id="send-message-btn"
            type="submit"
            disabled={!inputText.trim()}
            aria-label="Send message"
            className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
              inputText.trim()
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500 shadow-md shadow-indigo-600/20 hover:scale-105 active:scale-95'
                : 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed opacity-50'
            }`}
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
