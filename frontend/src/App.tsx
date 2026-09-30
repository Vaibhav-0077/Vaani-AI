import { useState } from 'react';
import { Header } from './components/Header';
import { VoiceVisualizer } from './components/VoiceVisualizer';
import { TranscriptArea } from './components/TranscriptArea';
import { ControlBar } from './components/ControlBar';
import { SettingsModal } from './components/SettingsModal';
import { StatusBadge } from './components/StatusBadge';
import { useVoiceSession } from './hooks/useVoiceSession';

export function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const {
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
  } = useVoiceSession();

  return (
    <div className="flex flex-col min-h-screen bg-[#07090e] text-slate-100 font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Top Header */}
      <Header
        voiceState={voiceState}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Mobile-only status badge below header */}
      <div className="sm:hidden px-6 pt-3 flex justify-center">
        <StatusBadge state={voiceState} />
      </div>

      {/* Main Workspace Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left Column: Visualizer & Voice Orb Core (5 cols on lg) */}
        <section
          id="voice-visualizer-container"
          aria-label="Voice Activity & Visualizer"
          className="lg:col-span-5 flex flex-col justify-between bg-slate-950/40 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 shadow-2xl relative overflow-hidden min-h-[380px] lg:min-h-[520px]"
        >
          {/* Subtle Ambient Background Gradient */}
          <div className="absolute -top-24 -left-24 w-72 h-72 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex items-center justify-between z-10">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Audio Core
            </span>
            <span className="text-[11px] text-slate-500">
              WebRTC Opus 48kHz
            </span>
          </div>

          {/* Interactive Voice Orb Visualizer */}
          <VoiceVisualizer
            state={voiceState}
            isMuted={isMuted}
            onToggleMic={toggleMute}
            onRetry={toggleConnection}
          />

          {/* Bottom Audio Info Footer */}
          <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-900 pt-3 z-10">
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${voiceState !== 'IDLE' && voiceState !== 'ERROR' ? 'bg-emerald-400' : 'bg-slate-600'}`} />
              {voiceState !== 'IDLE' && voiceState !== 'ERROR' ? 'Room Active' : 'Disconnected'}
            </span>
            <span>Target Latency: &lt;800ms</span>
          </div>
        </section>

        {/* Right Column: Transcript Area (7 cols on lg) */}
        <section
          id="conversation-transcript-container"
          aria-label="Conversation Transcript"
          className="lg:col-span-7 flex flex-col h-[480px] lg:h-[580px]"
        >
          <TranscriptArea
            messages={messages}
            interimTranscript={interimTranscript}
            voiceState={voiceState}
            onClear={clearMessages}
            autoScroll={settings.autoScroll}
          />
        </section>
      </main>

      {/* Bottom Sticky Control Bar */}
      <footer className="sticky bottom-0 z-30 p-4 max-w-5xl w-full mx-auto">
        <ControlBar
          voiceState={voiceState}
          isMuted={isMuted}
          onToggleMic={toggleMute}
          onToggleConnection={toggleConnection}
          onSendMessage={sendMessage}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onSimulateState={simulateState}
        />
      </footer>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={updateSettings}
      />
    </div>
  );
}

export default App;
