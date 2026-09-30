import React, { useRef, useEffect } from 'react';
import { User, Bot, Clock, Sparkles, MessageSquare, Trash2 } from 'lucide-react';
import type { ChatMessage, VoiceState } from '../types';

interface TranscriptAreaProps {
  messages: ChatMessage[];
  interimTranscript?: string;
  voiceState: VoiceState;
  onClear: () => void;
  autoScroll?: boolean;
}

export const TranscriptArea: React.FC<TranscriptAreaProps> = ({
  messages,
  interimTranscript,
  voiceState,
  onClear,
  autoScroll = true,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, interimTranscript, autoScroll]);

  return (
    <div className="flex flex-col h-full bg-slate-950/40 backdrop-blur-xl border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl">
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800/80 bg-slate-900/50">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-slate-200 tracking-wide">
            Live Conversation Transcript
          </h2>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700/50">
            {messages.length} messages
          </span>
        </div>

        {messages.length > 0 && (
          <button
            id="clear-transcript-btn"
            onClick={onClear}
            title="Clear Conversation"
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors border border-transparent hover:border-rose-900/40 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Clear</span>
          </button>
        )}
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {messages.length === 0 && !interimTranscript ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12 px-4 select-none">
            <div className="w-14 h-14 rounded-2xl bg-indigo-950/40 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4 shadow-inner">
              <Sparkles className="w-7 h-7 animate-pulse" />
            </div>
            <h3 className="text-base font-semibold text-slate-300">
              Ready to start speaking
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mt-1 leading-relaxed">
              Speak naturally in English, Hindi, or Hinglish. Your words will transcribe here in real-time.
            </p>
            <div className="flex flex-wrap gap-2 mt-4 justify-center">
              <span className="text-[11px] px-2.5 py-1 rounded-md bg-slate-900/80 text-slate-400 border border-slate-800">
                "Hello, how can you help me today?"
              </span>
              <span className="text-[11px] px-2.5 py-1 rounded-md bg-slate-900/80 text-slate-400 border border-slate-800">
                "Kya aap mujhe voice agent ke baare me bata sakte ho?"
              </span>
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-[88%] md:max-w-[78%] ${
                  msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
                }`}
              >
                {/* Avatar */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${
                    msg.role === 'user'
                      ? 'bg-indigo-600/30 border-indigo-400/40 text-indigo-200'
                      : 'bg-emerald-600/20 border-emerald-400/40 text-emerald-300'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <User className="w-4 h-4" />
                  ) : (
                    <Bot className="w-4 h-4" />
                  )}
                </div>

                {/* Message Bubble */}
                <div
                  className={`rounded-2xl px-4 py-3 text-sm leading-relaxed border shadow-md transition-all ${
                    msg.role === 'user'
                      ? 'bg-indigo-600/20 border-indigo-500/30 text-indigo-100 rounded-tr-none'
                      : 'bg-slate-900/80 border-slate-800 text-slate-200 rounded-tl-none'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>

                  {/* Metadata footer */}
                  <div
                    className={`flex items-center gap-2 mt-1.5 text-[10px] text-slate-400 ${
                      msg.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {msg.timestamp.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>

                    {msg.latencyMs && (
                      <span className="px-1.5 py-0.2 rounded bg-slate-800 text-emerald-400 border border-slate-700">
                        {msg.latencyMs}ms
                      </span>
                    )}

                    {msg.language && (
                      <span className="uppercase text-[9px] px-1 py-0.2 rounded bg-slate-800 text-slate-300">
                        {msg.language}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* In-Flight Interim Transcript Indicator */}
            {interimTranscript && (
              <div className="flex gap-3 max-w-[88%] md:max-w-[78%] ml-auto flex-row-reverse animate-pulse">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border bg-indigo-600/20 border-indigo-400/30 text-indigo-300">
                  <User className="w-4 h-4" />
                </div>
                <div className="rounded-2xl rounded-tr-none px-4 py-2.5 text-sm bg-indigo-950/30 border border-dashed border-indigo-500/50 text-indigo-200">
                  <p className="italic">{interimTranscript} ...</p>
                  <span className="text-[10px] text-indigo-400 block mt-1">Transcribing speech...</span>
                </div>
              </div>
            )}

            {/* Assistant Thinking Indicator */}
            {voiceState === 'THINKING' && (
              <div className="flex gap-3 max-w-[80%] mr-auto items-center">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border bg-indigo-600/20 border-indigo-400/30 text-indigo-300">
                  <Bot className="w-4 h-4 animate-spin" />
                </div>
                <div className="rounded-2xl rounded-tl-none px-4 py-2 text-xs bg-slate-900 border border-slate-800 text-slate-400 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                  <span>Agent is formulating response...</span>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </>
        )}
      </div>
    </div>
  );
};
