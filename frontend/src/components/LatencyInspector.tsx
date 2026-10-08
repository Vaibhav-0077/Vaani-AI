import React from 'react';
import { Activity, Zap, Volume2, Cpu, CheckCircle2, AlertTriangle, ShieldAlert } from 'lucide-react';
import type { LatencyMetrics, VoiceState } from '../types';

interface LatencyInspectorProps {
  metrics: LatencyMetrics | null;
  voiceState: VoiceState;
  onInterrupt?: () => void;
}

export const LatencyInspector: React.FC<LatencyInspectorProps> = ({
  metrics,
  voiceState,
  onInterrupt,
}) => {
  if (!metrics) return null;

  const ttfa = metrics.ttfaMs ?? 0;
  const ttft = metrics.ttftMs ?? 0;
  const total = metrics.totalTurnMs ?? 0;
  const stt = metrics.sttLatencyMs ?? 0;
  const tts = metrics.ttsDurationMs ?? 0;

  // Latency health grading
  const isOptimal = total < 650;
  const isAcceptable = total >= 650 && total <= 850;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-xl backdrop-blur-md text-xs">
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span className="font-semibold text-slate-200 uppercase tracking-wider text-[11px]">
            Streaming Latency Inspector
          </span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-950/60 text-cyan-400 border border-cyan-800/40">
            Phase 4
          </span>
        </div>

        {/* Manual Barge-In Trigger */}
        {(voiceState === 'SPEAKING' || voiceState === 'THINKING') && onInterrupt && (
          <button
            onClick={onInterrupt}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-rose-600/20 text-rose-300 border border-rose-500/40 hover:bg-rose-600/30 transition-colors text-[10px] font-medium cursor-pointer"
            title="Trigger instant barge-in interruption"
          >
            <ShieldAlert className="w-3 h-3 text-rose-400" />
            Interrupt
          </button>
        )}
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        {/* TTFT Card */}
        <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/60 flex flex-col items-center">
          <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-0.5">
            <Cpu className="w-3 h-3 text-indigo-400" />
            <span>TTFT</span>
          </div>
          <span className="text-sm font-mono font-bold text-indigo-300">
            {ttft ? `${Math.round(ttft)}ms` : '—'}
          </span>
          <span className="text-[9px] text-slate-500">First Token</span>
        </div>

        {/* TTFA Card (Hero Metric) */}
        <div className="p-2 rounded-lg bg-cyan-950/20 border border-cyan-500/30 flex flex-col items-center shadow-inner">
          <div className="flex items-center gap-1 text-[10px] text-cyan-400 mb-0.5 font-medium">
            <Zap className="w-3 h-3 text-cyan-400" />
            <span>TTFA</span>
          </div>
          <span className="text-sm font-mono font-bold text-cyan-300">
            {ttfa ? `${Math.round(ttfa)}ms` : '—'}
          </span>
          <span className="text-[9px] text-cyan-500/80">First Audio</span>
        </div>

        {/* STT Duration Card */}
        <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/60 flex flex-col items-center">
          <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-0.5">
            <Activity className="w-3 h-3 text-emerald-400" />
            <span>STT</span>
          </div>
          <span className="text-sm font-mono font-bold text-slate-200">
            {stt ? `${Math.round(stt)}ms` : '—'}
          </span>
          <span className="text-[9px] text-slate-500">Transcript</span>
        </div>

        {/* Total Turn Card */}
        <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/60 flex flex-col items-center">
          <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-0.5">
            <Volume2 className="w-3 h-3 text-amber-400" />
            <span>Total Turn</span>
          </div>
          <span
            className={`text-sm font-mono font-bold ${
              isOptimal ? 'text-emerald-400' : isAcceptable ? 'text-amber-400' : 'text-rose-400'
            }`}
          >
            {total ? `${Math.round(total)}ms` : '—'}
          </span>
          <span className="text-[9px] text-slate-500">Budget &lt;800ms</span>
        </div>
      </div>

      {/* Bottom Health Bar */}
      <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400">
        <span className="flex items-center gap-1">
          {isOptimal ? (
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-3 h-3 text-amber-400" />
          )}
          <span>
            {isOptimal
              ? 'Sub-650ms Low-Latency Target Met'
              : isAcceptable
              ? 'Within <800ms Baseline Budget'
              : 'Elevated Turn Latency'}
          </span>
        </span>
        <span className="font-mono text-slate-500">TTS Synth: {Math.round(tts)}ms</span>
      </div>
    </div>
  );
};
