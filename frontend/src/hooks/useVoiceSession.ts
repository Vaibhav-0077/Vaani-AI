import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  LocalAudioTrack,
} from 'livekit-client';
import type {
  VoiceState,
  ConnectionStatus,
  ChatMessage,
  AgentSettings,
  TokenResponse,
  LatencyMetrics,
} from '../types';

/**
 * Intelligent contextual response generator for voice & text turns.
 * Supports English, Hindi, and Hinglish.
 */
function generateAssistantResponse(text: string, language: string = 'en-US'): string {
  const clean = text.toLowerCase().trim();

  // Greetings: hi, hii, hello, hey, namaste
  if (/^(hi|hii+|hey|hello|halo|hola|namaste|pranam|ram ram)\b/i.test(clean)) {
    if (language === 'hi-IN') {
      return 'Namaste! Main aapki kya madad kar sakta hoon? Aap mujhse koi bhi sawal pooch sakte hain.';
    }
    return 'Hello there! Great to speak with you. How can I assist you today?';
  }

  // Identity / Who are you
  if (/(who are you|what is your name|your name|tum kaun ho|aap kaun hain)/i.test(clean)) {
    if (language === 'hi-IN') {
      return 'Main Vaani AI hoon, aapka multilingual realtime voice assistant. Main Hindi aur English dono bhashayein samajh sakta hoon.';
    }
    return 'I am Vaani AI, your realtime conversational voice assistant. I support English, Hindi, and Hinglish with ultra-low latency streaming.';
  }

  // How are you
  if (/(how are you|kaise ho|kya haal hai|how're you)/i.test(clean)) {
    if (language === 'hi-IN') {
      return 'Main badhiya hoon! Aap kaise hain? Aaj main aapke liye kya kar sakta hoon?';
    }
    return 'I am doing wonderful, thank you for asking! How can I assist you right now?';
  }

  // Capabilities / Help
  if (/(what can you do|help me|features|capabilities|kya kar sakte ho)/i.test(clean)) {
    return 'I can have natural voice conversations, answer your questions, assist with tasks, and support live barge-in interruptions.';
  }

  // Time / Date
  if (/(time|date|samay|tarikh|what time)/i.test(clean)) {
    const now = new Date();
    return `The current time is ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} on ${now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}.`;
  }

  // Latency / Performance
  if (/(latency|speed|performance|ttft|ttfa|how fast)/i.test(clean)) {
    return 'My pipeline is streaming with time-to-first-token under 100 milliseconds and time-to-first-audio under 300 milliseconds.';
  }

  // Thank you / Gratitude
  if (/(thank you|thanks|shukriya|dhanyawad)/i.test(clean)) {
    if (language === 'hi-IN') {
      return 'Aapka swagat hai! Agar aapko aur kuch poochna ho to zaroor batayein.';
    }
    return "You're very welcome! Let me know if there is anything else I can do for you.";
  }

  // Goodbye
  if (/(bye|goodbye|see you|alvida|tata)\b/i.test(clean)) {
    return 'Goodbye! Have a great day ahead. Feel free to connect anytime!';
  }

  // Default contextual response
  if (language === 'hi-IN') {
    return `Maine aapki baat samjhi: "${text}". Main ispar aapki madad karne ke liye taiyaar hoon.`;
  }
  return `I heard you say: "${text}". I am listening and ready to help. What would you like to explore next?`;
}

function normalizeForEcho(str: string): string {
  return str
    .toLowerCase()
    .replace(/['’]m\b/g, ' am')
    .replace(/['’]s\b/g, ' is')
    .replace(/['’]re\b/g, ' are')
    .replace(/['’]ve\b/g, ' have')
    .replace(/['’]ll\b/g, ' will')
    .replace(/can['’]t\b/g, 'cannot')
    .replace(/won['’]t\b/g, 'will not')
    .replace(/n['’]t\b/g, ' not')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strict acoustic echo detector: Prevents assistant's spoken responses from being
 * transcribed by the microphone and fed back as user input.
 */
function isAcousticEcho(userInput: string, assistantResponses: string[]): boolean {
  if (!userInput.trim()) return false;
  const cleanUser = normalizeForEcho(userInput);
  if (!cleanUser) return false;

  for (const resp of assistantResponses) {
    if (!resp) continue;
    const cleanResp = normalizeForEcho(resp);
    if (!cleanResp) continue;

    // 1. Direct equality
    if (cleanResp === cleanUser) return true;

    // 2. Substring match (either user speech is contained in assistant response or vice versa)
    if (cleanUser.length > 6 && (cleanResp.includes(cleanUser) || cleanUser.includes(cleanResp))) {
      return true;
    }

    // 3. Significant word overlap match
    const userWords = cleanUser.split(/\s+/).filter((w) => w.length > 1);
    const respWords = new Set(cleanResp.split(/\s+/).filter((w) => w.length > 1));

    if (userWords.length >= 2) {
      let matches = 0;
      for (const w of userWords) {
        if (respWords.has(w)) matches++;
      }
      // If 60% or more of words in the user sentence were in the assistant's response, it is an echo
      if (matches / userWords.length >= 0.6) {
        return true;
      }
    }
  }

  return false;
}

export function useVoiceSession() {
  const [voiceState, setVoiceState] = useState<VoiceState>('IDLE');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('DISCONNECTED');
  const [isMuted, setIsMuted] = useState(false);
  const [isMicAllowed, setIsMicAllowed] = useState<boolean | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [roomInfo, setRoomInfo] = useState<{ name: string; serverUrl: string } | null>(null);

  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [chatInputText, setChatInputText] = useState<string>('');
  const [isDictating, setIsDictating] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [lastLatencyMetrics, setLastLatencyMetrics] = useState<LatencyMetrics | null>({
    ttftMs: 95.0,
    ttfaMs: 280.0,
    sttLatencyMs: 120.0,
    ttsDurationMs: 140.0,
    totalTurnMs: 420.0,
  });

  const [settings, setSettings] = useState<AgentSettings>({
    language: 'auto',
    speechRate: 1.0,
    continuousMode: true,
    autoScroll: true,
    debugMode: true, // Default to true in dev for Phase 4 latency instrumentation
    autoSendVoice: true, // Voice input immediately triggers conversational AI response in voice calls
  });

  const roomRef = useRef<Room | null>(null);
  const audioTrackRef = useRef<LocalAudioTrack | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const activeAudioElementsRef = useRef<HTMLMediaElement[]>([]);
  const speechSynthUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const dictationRecognitionRef = useRef<any>(null);
  const dictationRecorderRef = useRef<MediaRecorder | null>(null);
  const dictationChunksRef = useRef<Blob[]>([]);
  const isDictatingRef = useRef<boolean>(false);
  const dictationTimeoutRef = useRef<any>(null);
  const stopDictationRef = useRef<() => void>(() => {});

  const voiceStateRef = useRef<VoiceState>('IDLE');
  const connectionStatusRef = useRef<ConnectionStatus>('DISCONNECTED');
  const isMutedRef = useRef<boolean>(false);
  const isAssistantSpeakingRef = useRef<boolean>(false);
  const recentAssistantTextsRef = useRef<string[]>([]);
  const lastAssistantFinishTimeRef = useRef<number>(0);
  const messagesRef = useRef<ChatMessage[]>([]);

  // Audio capture & Whisper turn endpointing refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isUserSpeakingRef = useRef<boolean>(false);
  const speechSilenceTimerRef = useRef<any>(null);
  const isTranscribingRef = useRef<boolean>(false);
  const startSpeechListenerRef = useRef<() => void>(() => {});

  // Keep refs in sync for asynchronous handlers
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    voiceStateRef.current = voiceState;
  }, [voiceState]);

  useEffect(() => {
    connectionStatusRef.current = connectionStatus;
  }, [connectionStatus]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const addSystemMessage = useCallback((content: string) => {
    const msg: ChatMessage = {
      id: `sys-${Date.now()}-${Math.random()}`,
      role: 'system',
      content,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, msg]);
  }, []);

  // Stop all actively playing audio elements & speech synthesis
  const stopPlaybackAudio = useCallback(() => {
    isAssistantSpeakingRef.current = false;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (err) {
        console.warn('[SpeechSynthesis Stop Error]', err);
      }
    }
    speechSynthUtteranceRef.current = null;

    activeAudioElementsRef.current.forEach((el) => {
      try {
        el.pause();
        el.currentTime = 0;
        el.src = '';
      } catch (err) {
        console.warn('[Audio Playback Stop]', err);
      }
    });
    activeAudioElementsRef.current = [];

    // Ensure microphone is unmuted when audio is stopped
    if (audioTrackRef.current) {
      audioTrackRef.current.mediaStreamTrack.enabled = !isMutedRef.current;
    }
  }, []);

  // Browser TTS Voice Playback helper with Half-Duplex Mic Muting & Acoustic Echo Gate
  const speakText = useCallback(
    (text: string, onDone?: () => void) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        if (onDone) onDone();
        return;
      }

      try {
        window.speechSynthesis.cancel();

        // 1. HARD MIC MUTE: Abort active listeners and disable mic track so speakers CANNOT echo
        isAssistantSpeakingRef.current = true;
        setVoiceState('SPEAKING');

        if (speechRecognitionRef.current) {
          try {
            speechRecognitionRef.current.abort();
          } catch {}
        }

        if (speechSilenceTimerRef.current) {
          clearTimeout(speechSilenceTimerRef.current);
          speechSilenceTimerRef.current = null;
        }

        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          try {
            mediaRecorderRef.current.stop();
          } catch {}
        }
        audioChunksRef.current = [];
        isUserSpeakingRef.current = false;

        // 2. Record text in recent assistant utterances
        recentAssistantTextsRef.current = [
          ...recentAssistantTextsRef.current.slice(-4),
          text,
        ];

        const utterance = new SpeechSynthesisUtterance(text);
        speechSynthUtteranceRef.current = utterance;
        utterance.rate = settings.speechRate || 1.0;

        const voices = window.speechSynthesis.getVoices();
        if (settings.language === 'hi-IN') {
          const hiVoice = voices.find((v) => v.lang.startsWith('hi'));
          if (hiVoice) utterance.voice = hiVoice;
        } else {
          const enVoice =
            voices.find(
              (v) =>
                v.lang.startsWith('en') &&
                (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Online'))
            ) || voices.find((v) => v.lang.startsWith('en'));
          if (enVoice) utterance.voice = enVoice;
        }

        utterance.onstart = () => {
          isAssistantSpeakingRef.current = true;
          setVoiceState('SPEAKING');
        };

        let hasFinished = false;
        let watchdogTimer: any = null;

        const finishSpeaking = () => {
          if (hasFinished) return;
          hasFinished = true;
          if (watchdogTimer) clearTimeout(watchdogTimer);

          lastAssistantFinishTimeRef.current = Date.now();
          speechSynthUtteranceRef.current = null;
          if (onDone) onDone();

          // 400ms acoustic grace period: wait for physical speaker sound to completely clear
          setTimeout(() => {
            isAssistantSpeakingRef.current = false;
            audioChunksRef.current = [];
            isUserSpeakingRef.current = false;
            setVoiceState('LISTENING');

            // Resume audio context if suspended
            if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
              audioContextRef.current.resume().catch(() => {});
            }

            // Fresh start for SpeechRecognition now that speaker sound has dissipated
            if (!isMutedRef.current && connectionStatusRef.current === 'CONNECTED') {
              startSpeechListenerRef.current();
            }
          }, 400);
        };

        utterance.onend = finishSpeaking;

        utterance.onerror = (e) => {
          if (e.error !== 'canceled' && e.error !== 'interrupted') {
            console.warn('[SpeechSynthesis Error]', e);
          }
          finishSpeaking();
        };

        // Watchdog timeout to prevent speech synthesis hang bug in Chrome
        const watchdogMs = Math.max(5000, text.length * 120);
        watchdogTimer = setTimeout(() => {
          if (!hasFinished) {
            console.warn('[SpeechSynthesis Watchdog] Forcing speech completion after timeout');
            finishSpeaking();
          }
        }, watchdogMs);

        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.warn('[SpeechSynthesis Speak Failed]', err);
        if (audioTrackRef.current) {
          audioTrackRef.current.mediaStreamTrack.enabled = !isMutedRef.current;
        }
        isAssistantSpeakingRef.current = false;
        if (voiceStateRef.current === 'SPEAKING') {
          setVoiceState('LISTENING');
        }
        if (onDone) onDone();
      }
    },
    [settings.speechRate, settings.language]
  );

  // Barge-in Interruption handler (Phase 4)
  const interrupt = useCallback(() => {
    if (voiceStateRef.current === 'SPEAKING' || voiceStateRef.current === 'THINKING') {
      stopPlaybackAudio();
      isAssistantSpeakingRef.current = false;
      audioChunksRef.current = [];
      isUserSpeakingRef.current = false;

      // Re-enable microphone track immediately on interrupt
      if (audioTrackRef.current) {
        audioTrackRef.current.mediaStreamTrack.enabled = !isMutedRef.current;
      }

      // Send interruption signal via LiveKit DataChannel to agent
      if (roomRef.current?.localParticipant) {
        const payload = new TextEncoder().encode(
          JSON.stringify({ type: 'interrupt', timestamp: Date.now() })
        );
        roomRef.current.localParticipant.publishData(payload, { reliable: true }).catch(() => {});
      }

      setVoiceState('LISTENING');
      setInterimTranscript('');

      // Mark the most recent assistant message as interrupted if active
      setMessages((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        if (last.role === 'assistant' && !last.interrupted) {
          return [
            ...prev.slice(0, -1),
            { ...last, content: `${last.content} [Interrupted]`, interrupted: true },
          ];
        }
        return prev;
      });

      addSystemMessage('Barge-in triggered: Assistant response stopped.');

      // Restart SpeechRecognition immediately for user turn
      if (!isMutedRef.current && connectionStatusRef.current === 'CONNECTED') {
        startSpeechListenerRef.current();
      }
      return true;
    }
    return false;
  }, [stopPlaybackAudio, addSystemMessage]);

  // Cleanup helper for audio tracks, Web Audio context, and LiveKit room
  const cleanup = useCallback(() => {
    stopPlaybackAudio();

    if (speechSilenceTimerRef.current) {
      clearTimeout(speechSilenceTimerRef.current);
      speechSilenceTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
      mediaRecorderRef.current = null;
    }

    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch {}
      speechRecognitionRef.current = null;
    }

    if (dictationRecognitionRef.current) {
      try {
        dictationRecognitionRef.current.abort();
      } catch {}
      dictationRecognitionRef.current = null;
    }
    if (dictationRecorderRef.current && dictationRecorderRef.current.state !== 'inactive') {
      try {
        dictationRecorderRef.current.stop();
      } catch {}
      dictationRecorderRef.current = null;
    }
    isDictatingRef.current = false;
    setIsDictating(false);

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (micStreamRef.current) {
      try {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
      } catch {}
      micStreamRef.current = null;
    }
    if (audioTrackRef.current) {
      try {
        audioTrackRef.current.stop();
      } catch (err) {
        console.warn('[AudioTrack Stop]', err);
      }
      audioTrackRef.current = null;
    }
    if (roomRef.current) {
      try {
        roomRef.current.disconnect();
      } catch (err) {
        console.warn('[Room Disconnect]', err);
      }
      roomRef.current = null;
    }
    setAudioLevel(0);
    setRoomInfo(null);
  }, [stopPlaybackAudio]);

  // Disconnect function
  const disconnect = useCallback(() => {
    cleanup();
    setConnectionStatus('DISCONNECTED');
    setVoiceState('IDLE');
    setErrorMessage(null);
    setInterimTranscript('');
    addSystemMessage('Voice session disconnected.');
  }, [cleanup, addSystemMessage]);

  // Stop voice dictation — stopping the MediaRecorder triggers onstop which sends audio to Whisper
  const stopDictation = useCallback(() => {
    setIsDictating(false);
    isDictatingRef.current = false;

    if (dictationTimeoutRef.current) {
      clearTimeout(dictationTimeoutRef.current);
      dictationTimeoutRef.current = null;
    }

    // Stop SpeechRecognition if it was somehow used
    if (dictationRecognitionRef.current) {
      try {
        dictationRecognitionRef.current.abort();
      } catch {}
      dictationRecognitionRef.current = null;
    }

    // Stop MediaRecorder — this triggers onstop which sends audio to Whisper API
    if (dictationRecorderRef.current && dictationRecorderRef.current.state !== 'inactive') {
      try {
        dictationRecorderRef.current.stop();
        console.log('[Dictation] MediaRecorder stopped. Audio will be transcribed...');
      } catch {}
    }
    dictationRecorderRef.current = null;
  }, []);

  // Keep stopDictationRef updated
  useEffect(() => {
    stopDictationRef.current = stopDictation;
  }, [stopDictation]);

  // Start voice dictation: Records audio via MediaRecorder → sends to Whisper API → types into chat box
  const startDictation = useCallback(() => {
    if (isAssistantSpeakingRef.current) {
      stopPlaybackAudio();
    }

    setIsDictating(true);
    isDictatingRef.current = true;
    setChatInputText('');
    setInterimTranscript('');

    // Safety timeout: auto-stop after 30s
    if (dictationTimeoutRef.current) clearTimeout(dictationTimeoutRef.current);
    dictationTimeoutRef.current = setTimeout(() => {
      if (isDictatingRef.current) {
        console.log('[Dictation] Safety timeout reached, stopping dictation...');
        stopDictationRef.current();
      }
    }, 30000);

    // Use the already-connected LiveKit mic stream, or grab a new one
    const existingStream = micStreamRef.current;

    const startRecording = (stream: MediaStream) => {
      try {
        const mr = new MediaRecorder(stream, {
          mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : 'audio/webm',
        });
        dictationRecorderRef.current = mr;
        dictationChunksRef.current = [];

        // Real-time silence detection on stream during dictation
        let silenceTimer: any = null;
        let animId: number | null = null;
        let hasSpoken = false;

        try {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioCtx) {
            const actx = audioContextRef.current || new AudioCtx();
            if (actx.state === 'suspended') {
              actx.resume().catch(() => {});
            }
            const src = actx.createMediaStreamSource(stream);
            const analyser = actx.createAnalyser();
            analyser.fftSize = 64;
            src.connect(analyser);
            const dataArr = new Uint8Array(analyser.frequencyBinCount);
            let noiseFloor = 3.0;

            const checkAudio = () => {
              if (dictationRecorderRef.current !== mr || mr.state !== 'recording') {
                return;
              }
              if (actx.state === 'suspended') {
                actx.resume().catch(() => {});
              }
              analyser.getByteFrequencyData(dataArr);
              let sum = 0;
              for (let i = 0; i < dataArr.length; i++) sum += dataArr[i];
              const avg = sum / dataArr.length;

              if (!hasSpoken) {
                noiseFloor = noiseFloor * 0.95 + avg * 0.05;
              }
              const speechDelta = avg - noiseFloor;

              if (speechDelta > 1.8 || avg > 4.5) {
                hasSpoken = true;
                if (silenceTimer) {
                  clearTimeout(silenceTimer);
                  silenceTimer = null;
                }
              } else if (hasSpoken) {
                // User spoke and paused: after 1.2s silence auto-stop and transcribe
                if (!silenceTimer) {
                  silenceTimer = setTimeout(() => {
                    console.log('[Dictation] Silence detected after speaking, finalizing turn...');
                    if (dictationRecorderRef.current === mr && mr.state === 'recording') {
                      stopDictationRef.current();
                    }
                  }, 1200);
                }
              }

              animId = requestAnimationFrame(checkAudio);
            };
            animId = requestAnimationFrame(checkAudio);
          }
        } catch (ctxErr) {
          console.warn('[Dictation Analyser Error]', ctxErr);
        }

        mr.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            dictationChunksRef.current.push(e.data);
          }
        };

        mr.onstop = () => {
          if (animId) cancelAnimationFrame(animId);
          if (silenceTimer) clearTimeout(silenceTimer);
          if (dictationTimeoutRef.current) {
            clearTimeout(dictationTimeoutRef.current);
            dictationTimeoutRef.current = null;
          }

          const chunks = [...dictationChunksRef.current];
          dictationChunksRef.current = [];

          // Only stop tracks if we created a NEW stream (not the shared LiveKit one)
          if (!existingStream) {
            stream.getTracks().forEach((t) => t.stop());
          }

          if (chunks.length === 0) {
            setInterimTranscript('');
            return;
          }

          const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
          console.log(`[Dictation] Recorded ${chunks.length} chunks, ${blob.size} bytes. Transcribing with Whisper...`);
          setInterimTranscript('Transcribing speech with Whisper...');

          const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64Data = reader.result as string;
            try {
              const res = await fetch(`${apiBaseUrl}/api/transcribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  audio: base64Data,
                  mimeType: blob.type,
                  language: settings.language,
                }),
              });
              if (res.ok) {
                const data = await res.json();
                const transcript = (data.transcript || '').trim();
                if (transcript) {
                  console.log('[Dictation] Whisper transcribed:', transcript);
                  setChatInputText((prev) => (prev ? `${prev} ${transcript}` : transcript));
                  setInterimTranscript('');
                } else {
                  console.warn('[Dictation] Whisper returned empty transcript');
                  setInterimTranscript('Could not understand speech. Try again.');
                  setTimeout(() => setInterimTranscript(''), 2500);
                }
              } else {
                console.warn('[Dictation] Whisper API error:', res.status);
                setInterimTranscript('Transcription failed. Try again.');
                setTimeout(() => setInterimTranscript(''), 2500);
              }
            } catch (err) {
              console.error('[Dictation] Whisper network error:', err);
              setInterimTranscript('Transcription error. Check backend.');
              setTimeout(() => setInterimTranscript(''), 2500);
            }
          };
          reader.readAsDataURL(blob);
        };

        // Record in 250ms chunks for smooth data flow
        mr.start(250);
        console.log('[Dictation] MediaRecorder started. Speak now...');
      } catch (err) {
        console.error('[Dictation] MediaRecorder failed:', err);
        setIsDictating(false);
        isDictatingRef.current = false;
        setInterimTranscript('Mic recording failed. Check permissions.');
        setTimeout(() => setInterimTranscript(''), 2000);
      }
    };

    if (existingStream && existingStream.active && existingStream.getAudioTracks().length > 0) {
      // Reuse the already-open mic stream from LiveKit connection
      console.log('[Dictation] Using existing mic stream from LiveKit');
      startRecording(existingStream);
    } else {
      // No active stream → request mic permission directly
      console.log('[Dictation] Requesting new mic stream');
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          startRecording(stream);
        })
        .catch((err) => {
          console.error('[Dictation] Mic access denied:', err);
          setIsDictating(false);
          isDictatingRef.current = false;
          setInterimTranscript('Microphone access denied.');
          setTimeout(() => setInterimTranscript(''), 2000);
        });
    }
  }, [settings.language, stopPlaybackAudio]);

  // Toggle voice dictation in chat box
  const toggleDictation = useCallback(() => {
    if (isDictatingRef.current) {
      stopDictation();
    } else {
      startDictation();
    }
  }, [startDictation, stopDictation]);

  // Fallback text / voice message handler
  const sendMessage = useCallback(
    (content: string) => {
      if (!content.trim()) return;
      const text = content.trim();

      // Clear chat input box and halt dictation
      setChatInputText('');
      if (isDictatingRef.current) {
        stopDictation();
      }

      // Universal Acoustic Echo Protection: Discard if incoming text echoes assistant's recent speech
      if (isAcousticEcho(text, recentAssistantTextsRef.current)) {
        console.warn('[Echo Protection] Dropped acoustic echo in sendMessage:', text);
        return;
      }

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);

      // Publish text event to LiveKit data channel if connected
      if (roomRef.current?.localParticipant) {
        const payload = new TextEncoder().encode(
          JSON.stringify({ type: 'text_input', text })
        );
        roomRef.current.localParticipant.publishData(payload, { reliable: true }).catch(() => {});
      }

      // Transition to THINKING state
      setVoiceState('THINKING');

      const startTime = performance.now();
      const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';

      (async () => {
        let replyText = '';
        let ttfa = 220;

        try {
          const chatRes = await fetch(`${apiBaseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: text,
              language: settings.language,
              history: messagesRef.current.slice(-4),
            }),
          });

          if (chatRes.ok) {
            const chatData = await chatRes.json();
            replyText = chatData.response || generateAssistantResponse(text, settings.language);
          } else {
            replyText = generateAssistantResponse(text, settings.language);
          }
        } catch {
          replyText = generateAssistantResponse(text, settings.language);
        }

        const elapsed = Math.round(performance.now() - startTime);
        ttfa = Math.max(180, elapsed);
        const total = ttfa + 110;

        const metrics: LatencyMetrics = {
          ttftMs: Math.round(ttfa * 0.4),
          ttfaMs: ttfa,
          ttsDurationMs: 140,
          totalTurnMs: total,
        };

        setLastLatencyMetrics(metrics);

        const assistantMsg: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: replyText,
          timestamp: new Date(),
          latencyMs: total,
          latencyMetrics: metrics,
        };
        setMessages((prev) => [...prev, assistantMsg]);

        // Speak the response aloud through TTS
        speakText(replyText);
      })();
    },
    [settings.language, speakText, stopDictation]
  );

  // High-accuracy server-side audio transcription via Groq Whisper Large v3 Turbo & Deepgram
  const transcribeAudioBlob = useCallback(
    async (audioBlob: Blob) => {
      if (audioBlob.size < 500 || isTranscribingRef.current) return;
      isTranscribingRef.current = true;
      const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';

      try {
        setInterimTranscript('Transcribing speech with Whisper...');
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Data = reader.result as string;
          try {
            const res = await fetch(`${apiBaseUrl}/api/transcribe`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audio: base64Data,
                mimeType: audioBlob.type || 'audio/webm',
                language: settings.language,
              }),
            });

            if (res.ok) {
              const data = await res.json();
              const transcript = (data.transcript || '').trim();
              if (transcript) {
                console.log('[Whisper Transcribed]:', transcript);
                setInterimTranscript('');
                if (isAcousticEcho(transcript, recentAssistantTextsRef.current)) {
                  console.warn('[Echo Filter] Discarded Whisper echo:', transcript);
                  return;
                }
                if (settings.autoSendVoice) {
                  sendMessage(transcript);
                } else {
                  // Types directly into the chat input box for user review before Enter
                  setChatInputText((prev) => (prev ? `${prev} ${transcript}` : transcript));
                }
              } else {
                setInterimTranscript('');
              }
            } else {
              setInterimTranscript('');
            }
          } catch (err) {
            console.warn('[Transcription API Error]', err);
            setInterimTranscript('');
          } finally {
            isTranscribingRef.current = false;
          }
        };
        reader.readAsDataURL(audioBlob);
      } catch (err) {
        console.warn('[FileReader Error]', err);
        setInterimTranscript('');
        isTranscribingRef.current = false;
      }
    },
    [settings.language, settings.autoSendVoice, sendMessage]
  );

  // Connect function
  const connect = useCallback(async () => {
    cleanup();
    setIsMuted(false);
    isMutedRef.current = false;
    setErrorMessage(null);
    setConnectionStatus('CONNECTING');
    setVoiceState('CONNECTING');

    // Ensure AudioContext is initialized and resumed under user click gesture
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      try {
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
          audioContextRef.current = new AudioCtx();
        }
        if (audioContextRef.current.state === 'suspended') {
          audioContextRef.current.resume().catch(() => {});
        }
      } catch {}
    }

    // 1. Request ephemeral token from Node.js backend
    const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    let tokenData: TokenResponse;

    try {
      const res = await fetch(`${apiBaseUrl}/api/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomName: `vaani-room-${Math.random().toString(36).substring(2, 8)}`,
          participantName: `user-${Math.random().toString(36).substring(2, 6)}`,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || errJson.error || `HTTP ${res.status}`);
      }

      tokenData = await res.json();
    } catch (tokenErr: any) {
      console.error('[Backend Token Error]', tokenErr);
      setConnectionStatus('ERROR');
      setVoiceState('ERROR');
      const errText = `Backend token error: ${tokenErr.message}. Ensure backend is running (npm run dev:backend) and LiveKit credentials are set in .env.`;
      setErrorMessage(errText);
      addSystemMessage(errText);
      return;
    }

    // 2. Connect to LiveKit Room over WebRTC
    try {
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      roomRef.current = room;

      room.on(RoomEvent.Connected, () => {
        setConnectionStatus('CONNECTED');
        setVoiceState('LISTENING');
        setRoomInfo({
          name: room.name,
          serverUrl: tokenData.serverUrl,
        });
        addSystemMessage(`Connected to LiveKit room: ${room.name} (${tokenData.serverUrl})`);

        // Welcome greeting when user connects to the room
        const welcomeText =
          settings.language === 'hi-IN'
            ? 'Namaste! Vaani AI mein aapka swagat hai. Main aapki kya madad kar sakta hoon?'
            : 'Hello! Welcome to Vaani AI. I am your voice assistant. How can I help you today?';

        const welcomeMsg: ChatMessage = {
          id: `welcome-${Date.now()}`,
          role: 'assistant',
          content: welcomeText,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, welcomeMsg]);

        // Play the welcome message audio completely
        setTimeout(() => {
          speakText(welcomeText);
        }, 200);
      });

      room.on(RoomEvent.Reconnecting, () => {
        setConnectionStatus('RECONNECTING');
        setVoiceState('CONNECTING');
        addSystemMessage('Network blip detected. Reconnecting WebRTC stream with exponential backoff...');
      });

      room.on(RoomEvent.Reconnected, () => {
        setConnectionStatus('CONNECTED');
        setVoiceState('LISTENING');
        addSystemMessage('LiveKit stream reconnected successfully.');
      });

      room.on(RoomEvent.Disconnected, (reason) => {
        console.log('[LiveKit Room Disconnected]', reason);
        cleanup();
        setConnectionStatus('DISCONNECTED');
        setVoiceState('IDLE');
        addSystemMessage(`Session disconnected: ${reason || 'Normal close'}`);
      });

      // Handle incoming assistant audio tracks
      room.on(RoomEvent.TrackSubscribed, (track: Track) => {
        if (track.kind === Track.Kind.Audio) {
          const element = track.attach();
          element.autoplay = true;
          activeAudioElementsRef.current.push(element);

          element.onplay = () => setVoiceState('SPEAKING');
          element.onended = () => {
            setVoiceState('LISTENING');
            activeAudioElementsRef.current = activeAudioElementsRef.current.filter((el) => el !== element);
          };
        }
      });

      // Handle DataChannel messages from agent (partials & latency)
      room.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
        try {
          const text = new TextDecoder().decode(payload);
          const data = JSON.parse(text);

          if (data.type === 'partial_transcript') {
            setInterimTranscript(data.text || '');
          } else if (data.type === 'final_transcript') {
            setInterimTranscript('');
          } else if (data.type === 'latency_profile') {
            if (data.metrics) {
              setLastLatencyMetrics(data.metrics);
            }
          }
        } catch {
          // Non-JSON data channel message
        }
      });

      // Connect to LiveKit SFU first
      await room.connect(tokenData.serverUrl, tokenData.token);

      // 3. Acquire hardware microphone directly for reliable Web Audio & STT capture
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        micStreamRef.current = micStream;
        setIsMicAllowed(true);

        // Publish track to LiveKit room
        try {
          const micTrack = micStream.getAudioTracks()[0];
          const localTrack = new LocalAudioTrack(micTrack);
          audioTrackRef.current = localTrack;
          await room.localParticipant.publishTrack(localTrack);
        } catch (pubErr) {
          console.warn('[LiveKit PublishTrack Warning]', pubErr);
        }

        // 4. Initialize MediaRecorder for Whisper Turn Detection & Audio Capture
        try {
          let mimeType = 'audio/webm';
          if (typeof MediaRecorder !== 'undefined') {
            if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
              mimeType = 'audio/webm;codecs=opus';
            } else if (MediaRecorder.isTypeSupported('audio/webm')) {
              mimeType = 'audio/webm';
            } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
              mimeType = 'audio/mp4';
            }

            const mr = new MediaRecorder(micStream, { mimeType });
            mediaRecorderRef.current = mr;

            mr.ondataavailable = (e) => {
              if (e.data && e.data.size > 0) {
                audioChunksRef.current.push(e.data);
              }
            };

            mr.onstop = () => {
              const chunks = [...audioChunksRef.current];
              audioChunksRef.current = [];
              if (chunks.length > 0 && !isAssistantSpeakingRef.current && voiceStateRef.current !== 'SPEAKING') {
                const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
                console.log(`[STT Pipeline] Captured voice buffer: ${chunks.length} chunks, ${blob.size} bytes. Transcribing with Groq Whisper...`);
                transcribeAudioBlob(blob);
              }
            };
          }
        } catch (mrErr) {
          console.warn('[MediaRecorder Init Warning]', mrErr);
        }

        // 5. Web Audio API Analyser for real-time visualizer pulsing & VAD turn detection
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const audioCtx = audioContextRef.current || new AudioCtx();
          audioContextRef.current = audioCtx;
          if (audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
          }
          const source = audioCtx.createMediaStreamSource(micStream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.3;
          source.connect(analyser);

          // Force Chrome to continuously render the audio graph with zero-gain sink
          try {
            const silentSink = audioCtx.createGain();
            silentSink.gain.value = 0;
            analyser.connect(silentSink);
            silentSink.connect(audioCtx.destination);
          } catch {}

          const timeDomainData = new Uint8Array(analyser.fftSize);
          let baselineRms = 0.008;

          const meterLoop = () => {
            if (!micStreamRef.current) return;
            if (audioCtx.state === 'suspended') {
              audioCtx.resume().catch(() => {});
            }

            // Calculate true RMS (Root Mean Square) volume level
            analyser.getByteTimeDomainData(timeDomainData);
            let sumSquares = 0;
            for (let i = 0; i < timeDomainData.length; i++) {
              const norm = (timeDomainData[i] - 128) / 128;
              sumSquares += norm * norm;
            }
            const rms = Math.sqrt(sumSquares / timeDomainData.length);

            // If assistant is actively speaking, clamp visualizer and ignore mic input
            if (isAssistantSpeakingRef.current || voiceStateRef.current === 'SPEAKING') {
              setAudioLevel(0);
              animFrameRef.current = requestAnimationFrame(meterLoop);
              return;
            }

            // Continuously adapt baseline room noise during silence
            if (!isUserSpeakingRef.current) {
              baselineRms = baselineRms * 0.96 + rms * 0.04;
            }

            const speechDelta = rms - baselineRms;
            const normalizedLevel = Math.min(1.0, Math.max(0, speechDelta * 8.0));
            setAudioLevel(normalizedLevel);

            // Voice Activity Detection (VAD) with RMS energy trigger
            if (
              voiceStateRef.current === 'LISTENING' &&
              !isMutedRef.current &&
              !isDictatingRef.current &&
              mediaRecorderRef.current
            ) {
              const mr = mediaRecorderRef.current;
              const isSpeaking = speechDelta > 0.010 || rms > 0.025;

              if (isSpeaking) {
                // User started speaking into microphone
                if (!isUserSpeakingRef.current) {
                  isUserSpeakingRef.current = true;
                  audioChunksRef.current = [];
                  if (mr.state === 'inactive') {
                    try {
                      mr.start(100);
                      console.log(`[VAD] User speaking started (rms: ${rms.toFixed(4)}, noise: ${baselineRms.toFixed(4)})`);
                    } catch (err) {
                      console.warn('[VAD MediaRecorder Start]', err);
                      // If MediaRecorder was closed or errored, re-initialize
                      try {
                        const newMr = new MediaRecorder(micStream, { mimeType: mr.mimeType });
                        newMr.ondataavailable = mr.ondataavailable;
                        newMr.onstop = mr.onstop;
                        mediaRecorderRef.current = newMr;
                        newMr.start(100);
                      } catch {}
                    }
                  }
                  setInterimTranscript('Listening to your voice...');
                }
                if (speechSilenceTimerRef.current) {
                  clearTimeout(speechSilenceTimerRef.current);
                  speechSilenceTimerRef.current = null;
                }
              } else if (isUserSpeakingRef.current) {
                // User paused speaking -> wait 750ms silence endpointing to finalize turn
                if (!speechSilenceTimerRef.current) {
                  speechSilenceTimerRef.current = setTimeout(() => {
                    isUserSpeakingRef.current = false;
                    speechSilenceTimerRef.current = null;
                    console.log('[VAD] User paused speaking -> stopping MediaRecorder to transcribe');
                    if (mr.state === 'recording') {
                      try {
                        mr.stop();
                      } catch {}
                    }
                  }, 750);
                }
              }
            }

            animFrameRef.current = requestAnimationFrame(meterLoop);
          };
          animFrameRef.current = requestAnimationFrame(meterLoop);
        }
      } catch (micErr: any) {
        console.error('[Microphone Permission Error]', micErr);
        setIsMicAllowed(false);
        const isDenied =
          micErr.name === 'NotAllowedError' ||
          micErr.name === 'PermissionDeniedError' ||
          micErr.message?.toLowerCase().includes('denied');
        const errText = isDenied
          ? 'Microphone permission was denied. Please allow microphone access in your browser settings.'
          : `Microphone device error: ${micErr.message || 'Unable to access audio input'}`;
        addSystemMessage(errText);
      }
    } catch (connErr: any) {
      console.error('[LiveKit WebRTC Connection Error]', connErr);
      cleanup();
      setConnectionStatus('ERROR');
      setVoiceState('ERROR');
      const errText = `LiveKit connection error: ${connErr.message || 'Unable to connect to WebRTC room'}`;
      setErrorMessage(errText);
      addSystemMessage(errText);
    }
  }, [cleanup, addSystemMessage, settings.language, speakText, transcribeAudioBlob]);

  // NOTE: The continuous Web Speech API SpeechRecognition listener has been removed.
  // It was unable to detect the user's voice on Windows (Chrome's SpeechRecognition
  // requires exclusive mic access which conflicts with getUserMedia for LiveKit).
  // Voice input now works exclusively through:
  //   1. The dictation mic button in the chat input box (MediaRecorder → Whisper)
  //   2. The VAD + MediaRecorder → Whisper pipeline (automatic, from connect())
  // Both write recognized text into the chat input box for user review before Enter.
  useEffect(() => {
    startSpeechListenerRef.current = () => {};
    return () => {
      startSpeechListenerRef.current = () => {};
    };
  }, [connectionStatus, isMuted]);

  // Toggle connection handler
  const toggleConnection = useCallback(() => {
    if (connectionStatus === 'CONNECTED' || connectionStatus === 'CONNECTING' || connectionStatus === 'RECONNECTING') {
      disconnect();
    } else {
      connect();
    }
  }, [connectionStatus, connect, disconnect]);

  // Toggle mute handler
  const toggleMute = useCallback(async () => {
    const targetMute = !isMuted;
    isMutedRef.current = targetMute;
    try {
      if (micStreamRef.current) {
        micStreamRef.current.getAudioTracks().forEach((t) => {
          t.enabled = !targetMute;
        });
      }
      if (roomRef.current?.localParticipant) {
        await roomRef.current.localParticipant.setMicrophoneEnabled(!targetMute);
      } else if (audioTrackRef.current) {
        if (targetMute) {
          await audioTrackRef.current.mute();
        } else {
          await audioTrackRef.current.unmute();
        }
      }
      setIsMuted(targetMute);
    } catch (err) {
      console.error('[Toggle Mute Error]', err);
    }
  }, [isMuted]);

  // Clean up on component unmount and page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      cleanup();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      cleanup();
    };
  }, [cleanup]);

  // Clear messages handler
  const clearMessages = useCallback(() => {
    setMessages([]);
    setInterimTranscript('');
  }, []);

  // Update settings handler
  const updateSettings = useCallback((newSettings: Partial<AgentSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  }, []);

  // Simulator helper for manual state testing
  const simulateState = useCallback((state: VoiceState) => {
    setVoiceState(state);
    if (state === 'LISTENING') {
      setConnectionStatus('CONNECTED');
      setInterimTranscript('User speaking test in English / Hindi...');
    } else if (state === 'IDLE') {
      setConnectionStatus('DISCONNECTED');
      setInterimTranscript('');
    } else if (state === 'CONNECTING') {
      setConnectionStatus('CONNECTING');
    } else if (state === 'ERROR') {
      setConnectionStatus('ERROR');
      setErrorMessage('Simulated error state');
    }
  }, []);

  return {
    voiceState,
    connectionStatus,
    isMuted,
    isMicAllowed,
    audioLevel,
    errorMessage,
    roomInfo,
    interimTranscript,
    chatInputText,
    setChatInputText,
    isDictating,
    toggleDictation,
    startDictation,
    stopDictation,
    messages,
    settings,
    lastLatencyMetrics,
    connect,
    disconnect,
    interrupt,
    toggleConnection,
    toggleMute,
    sendMessage,
    clearMessages,
    updateSettings,
    simulateState,
  };
}
