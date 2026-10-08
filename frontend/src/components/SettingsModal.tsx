import React from 'react';
import { X, Globe, Gauge, SlidersHorizontal } from 'lucide-react';
import type { AgentSettings } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AgentSettings;
  onUpdateSettings: (newSettings: Partial<AgentSettings>) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}) => {
  if (!isOpen) return null;

  return (
    <div
      id="settings-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        id="settings-modal-content"
        className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-indigo-400" />
            <h3 className="text-base font-semibold text-slate-100">
              Voice Agent Settings
            </h3>
          </div>
          <button
            id="close-settings-btn"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 text-sm">
          {/* Language Selection */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 font-medium text-slate-300">
              <Globe className="w-4 h-4 text-indigo-400" />
              <span>Conversation Language</span>
            </label>
            <select
              id="settings-language-select"
              value={settings.language}
              onChange={(e) => onUpdateSettings({ language: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
            >
              <option value="auto">Auto-Detect (English, Hindi, Hinglish)</option>
              <option value="en-US">English (US)</option>
              <option value="hi-IN">Hindi (India)</option>
            </select>
            <p className="text-[11px] text-slate-500">
              Automatic mode understands natural code-switching between English and Hindi.
            </p>
          </div>

          {/* Speech Rate */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 font-medium text-slate-300">
                <Gauge className="w-4 h-4 text-indigo-400" />
                <span>Speech Speed</span>
              </label>
              <span className="text-xs font-semibold text-indigo-400">
                {settings.speechRate.toFixed(2)}x
              </span>
            </div>
            <input
              id="settings-speech-rate-range"
              type="range"
              min="0.8"
              max="1.5"
              step="0.05"
              value={settings.speechRate}
              onChange={(e) =>
                onUpdateSettings({ speechRate: parseFloat(e.target.value) })
              }
              className="w-full accent-indigo-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>0.8x (Slower)</span>
              <span>1.0x (Normal)</span>
              <span>1.5x (Fast)</span>
            </div>
          </div>

          {/* Interaction Mode */}
          <div className="pt-2 border-t border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-300">Continuous Voice Mode</p>
                <p className="text-[11px] text-slate-500">
                  Automatically listen when the agent stops speaking
                </p>
              </div>
              <input
                id="settings-continuous-mode-toggle"
                type="checkbox"
                checked={settings.continuousMode}
                onChange={(e) =>
                  onUpdateSettings({ continuousMode: e.target.checked })
                }
                className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-300">Auto-Scroll Transcript</p>
                <p className="text-[11px] text-slate-500">
                  Keep view anchored to the latest transcribed sentence
                </p>
              </div>
              <input
                id="settings-autoscroll-toggle"
                type="checkbox"
                checked={settings.autoScroll}
                onChange={(e) =>
                  onUpdateSettings({ autoScroll: e.target.checked })
                }
                className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-cyan-300">Debug / Latency Inspector</p>
                <p className="text-[11px] text-slate-500">
                  Display real-time TTFT, TTFA, and turn latency telemetry (Phase 4)
                </p>
              </div>
              <input
                id="settings-debug-mode-toggle"
                type="checkbox"
                checked={settings.debugMode ?? true}
                onChange={(e) =>
                  onUpdateSettings({ debugMode: e.target.checked })
                }
                className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/40 flex justify-end">
          <button
            id="settings-done-btn"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
