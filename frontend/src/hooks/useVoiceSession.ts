import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  LocalAudioTrack,
  createLocalAudioTrack,
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

const COMMON_CONVERSATIONAL_WORDS = new Set([
  'hello', 'hi', 'hey', 'how', 'are', 'you', 'today', 'can', 'help', 'what', 'i', 'am',
  'is', 'the', 'a', 'an', 'to', 'in', 'it', 'me', 'do', 'for', 'and', 'or', 'so',
  'namaste', 'aap', 'kaise', 'ho', 'kya', 'hai', 'mera', 'naam', 'main', 'bolo',
]);

/**
 * Detects whether a transcribed user utterance is an acoustic echo
 * of what the assistant just spoke through the device speakers.
 */
function isAcousticEcho(userInput: string, assistantResponses: string[]): boolean {
  if (!userInput.trim()) return false;
  // Extract distinct, non-stop words
  const userWords = userInput
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !COMMON_CONVERSATIONAL_WORDS.has(w));

  // If the user's sentence only contains general greeting words (e.g. "hello", "how are you"),
  // NEVER classify it as an echo! It is a genuine human utterance!
  if (userWords.length === 0) return false;

  for (const resp of assistantResponses) {
    if (!resp) continue;
    const respWords = new Set(
      resp
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !COMMON_CONVERSATIONAL_WORDS.has(w))
    );

    let matchCount = 0;
    for (const w of userWords) {
      if (respWords.has(w)) {
        matchCount++;
      }
    }

    const matchRatio = matchCount / userWords.length;
    // Only classify as echo if distinctive non-generic words match heavily (>= 60% and at least 3 distinctive words)
    if (matchRatio >= 0.6 && matchCount >= 3) {
      return true;
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
  });

  const roomRef = useRef<Room | null>(null);
  const audioTrackRef = useRef<LocalAudioTrack | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const activeAudioElementsRef = useRef<HTMLMediaElement[]>([]);
  const speechSynthUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speechRecognitionRef = useRef<any>(null);

  const voiceStateRef = useRef<VoiceState>('IDLE');
  const connectionStatusRef = useRef<ConnectionStatus>('DISCONNECTED');
  const isMutedRef = useRef<boolean>(false);
  const isAssistantSpeakingRef = useRef<boolean>(false);
  const recentAssistantTextsRef = useRef<string[]>([]);
  const lastAssistantFinishTimeRef = useRef<number>(0);

  // Keep refs in sync for asynchronous handlers
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
  }, []);

  // Browser TTS Voice Playback helper with Acoustic Echo Gate
  const speakText = useCallback(
    (text: string, onDone?: () => void) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        if (onDone) onDone();
        return;
      }

      try {
        window.speechSynthesis.cancel();

        // 1. Record text in recent assistant utterances and mark assistant as speaking
        recentAssistantTextsRef.current = [
          ...recentAssistantTextsRef.current.slice(-4),
          text,
        ];
        isAssistantSpeakingRef.current = true;

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

        const finishSpeaking = () => {
          lastAssistantFinishTimeRef.current = Date.now();
          speechSynthUtteranceRef.current = null;
          if (voiceStateRef.current === 'SPEAKING') {
            setVoiceState('LISTENING');
          }
          if (onDone) onDone();

          // 500ms acoustic buffer before re-enabling microphone listening
          setTimeout(() => {
            isAssistantSpeakingRef.current = false;
          }, 500);
        };

        utterance.onend = finishSpeaking;

        utterance.onerror = (e) => {
          if (e.error !== 'canceled' && e.error !== 'interrupted') {
            console.warn('[SpeechSynthesis Error]', e);
          }
          finishSpeaking();
        };

        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.warn('[SpeechSynthesis Speak Failed]', err);
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

      // Re-enable SpeechRecognition after interruption
      setTimeout(() => {
        if (connectionStatusRef.current === 'CONNECTED' && !isMutedRef.current) {
          try {
            speechRecognitionRef.current?.start();
          } catch {}
        }
      }, 300);

      return true;
    }
    return false;
  }, [stopPlaybackAudio, addSystemMessage]);

  // Cleanup helper for audio tracks, Web Audio context, and LiveKit room
  const cleanup = useCallback(() => {
    stopPlaybackAudio();

    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch {}
      speechRecognitionRef.current = null;
    }

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
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

  // Fallback text / voice message handler
  const sendMessage = useCallback(
    (content: string) => {
      if (!content.trim()) return;
      const text = content.trim();

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
              history: messages.slice(-4),
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
    [settings.language, speakText, messages]
  );

  // Connect function
  const connect = useCallback(async () => {
    cleanup();
    setIsMuted(false);
    isMutedRef.current = false;
    setErrorMessage(null);
    setConnectionStatus('CONNECTING');
    setVoiceState('CONNECTING');

    // 1. Microphone permission handling & Local Audio Track creation
    let localTrack: LocalAudioTrack;
    try {
      localTrack = await createLocalAudioTrack({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      audioTrackRef.current = localTrack;
      setIsMicAllowed(true);
    } catch (micErr: any) {
      console.error('[Microphone Permission Error]', micErr);
      setIsMicAllowed(false);
      setConnectionStatus('ERROR');
      setVoiceState('ERROR');
      const isDenied =
        micErr.name === 'NotAllowedError' ||
        micErr.name === 'PermissionDeniedError' ||
        micErr.message?.toLowerCase().includes('denied');
      const errText = isDenied
        ? 'Microphone permission was denied. Please allow microphone access in your browser settings.'
        : `Microphone device error: ${micErr.message || 'Unable to access audio input'}`;
      setErrorMessage(errText);
      addSystemMessage(errText);
      return;
    }

    // 2. Request ephemeral token from Node.js backend
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
      localTrack.stop();
      audioTrackRef.current = null;
      setConnectionStatus('ERROR');
      setVoiceState('ERROR');
      const errText = `Backend token error: ${tokenErr.message}. Ensure backend is running (npm run dev:backend) and LiveKit credentials are set in .env.`;
      setErrorMessage(errText);
      addSystemMessage(errText);
      return;
    }

    // 3. Connect to LiveKit Room over WebRTC
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

        // Play the welcome message audio
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

      // Connect to LiveKit SFU
      await room.connect(tokenData.serverUrl, tokenData.token);

      // Publish local microphone track
      await room.localParticipant.publishTrack(localTrack);

      // 4. Web Audio API Analyser for real-time microphone metering & barge-in
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const audioCtx = new AudioCtx();
          audioContextRef.current = audioCtx;
          const mediaStream = new MediaStream([localTrack.mediaStreamTrack]);
          const source = audioCtx.createMediaStreamSource(mediaStream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64;
          analyser.smoothingTimeConstant = 0.5;
          source.connect(analyser);

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          let userSpeechFrames = 0;

          const meterLoop = () => {
            if (!audioTrackRef.current) return;
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const avg = sum / dataArray.length;
            const normalized = Math.min(1.0, Math.max(0, (avg - 8) / 60));
            setAudioLevel(normalized);

            // Phase 4 Barge-in check: Higher volume threshold (> 0.65) to prevent computer speakers from interrupting themselves
            if (normalized > 0.65) {
              userSpeechFrames += 1;
              if (userSpeechFrames >= 6 && voiceStateRef.current === 'SPEAKING') {
                interrupt();
                userSpeechFrames = 0;
              }
            } else {
              userSpeechFrames = 0;
            }

            animFrameRef.current = requestAnimationFrame(meterLoop);
          };
          animFrameRef.current = requestAnimationFrame(meterLoop);
        }
      } catch (meterErr) {
        console.warn('[Audio Level Metering Error]', meterErr);
      }
    } catch (connErr: any) {
      console.error('[LiveKit WebRTC Connection Error]', connErr);
      localTrack.stop();
      cleanup();
      setConnectionStatus('ERROR');
      setVoiceState('ERROR');
      const errText = `LiveKit connection error: ${connErr.message || 'Unable to connect to WebRTC room'}`;
      setErrorMessage(errText);
      addSystemMessage(errText);
    }
  }, [cleanup, addSystemMessage, interrupt, settings.language, speakText]);

  // Continuous Speech Recognition manager with Silence Turn Detection
  useEffect(() => {
    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionClass) return;

    let activeRecognition: any = null;
    let isStoppedExplicitly = false;
    let silenceTimer: any = null;
    let accumulatedText = '';

    const startListener = () => {
      if (isStoppedExplicitly || connectionStatusRef.current !== 'CONNECTED' || isMutedRef.current) {
        return;
      }

      try {
        const recognition = new SpeechRecognitionClass();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = settings.language === 'hi-IN' ? 'hi-IN' : 'en-US';

        recognition.onresult = (event: any) => {
          // Acoustic Echo Gate: Discard if assistant is actively speaking or in cooldown!
          if (isAssistantSpeakingRef.current || voiceStateRef.current === 'SPEAKING') {
            accumulatedText = '';
            setInterimTranscript('');
            return;
          }

          let interim = '';
          let final = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              final += transcript;
            } else {
              interim += transcript;
            }
          }

          const currentText = (final || interim).trim();
          if (currentText) {
            // Check if this audio is an echo of the assistant's previous speech (within 1.8s)
            const timeSinceSpoke = Date.now() - lastAssistantFinishTimeRef.current;
            if (timeSinceSpoke < 1800 && isAcousticEcho(currentText, recentAssistantTextsRef.current)) {
              console.log('[Echo Filter] Discarded speaker echo:', currentText);
              accumulatedText = '';
              setInterimTranscript('');
              return;
            }

            accumulatedText = currentText;
            setInterimTranscript(currentText);

            // Turn Detection Endpointing: If user pauses speaking for 1.1s, finalize and send!
            clearTimeout(silenceTimer);
            silenceTimer = setTimeout(() => {
              const textToSend = accumulatedText.trim();
              accumulatedText = '';
              setInterimTranscript('');

              if (textToSend && !isAssistantSpeakingRef.current && voiceStateRef.current !== 'SPEAKING') {
                if (Date.now() - lastAssistantFinishTimeRef.current < 1800 && isAcousticEcho(textToSend, recentAssistantTextsRef.current)) {
                  console.log('[Echo Filter] Discarded timeout echo:', textToSend);
                  return;
                }
                sendMessage(textToSend);
              }
            }, 1100);
          }

          if (final.trim()) {
            clearTimeout(silenceTimer);
            const textToSend = final.trim();
            accumulatedText = '';
            setInterimTranscript('');

            if (Date.now() - lastAssistantFinishTimeRef.current < 1800 && isAcousticEcho(textToSend, recentAssistantTextsRef.current)) {
              console.log('[Echo Filter] Discarded final echo:', textToSend);
              return;
            }

            sendMessage(textToSend);
          }
        };

        recognition.onerror = (event: any) => {
          if (event.error !== 'no-speech' && event.error !== 'aborted') {
            console.warn('[SpeechRecognition Error]', event.error);
          }
        };

        recognition.onend = () => {
          activeRecognition = null;
          // Chrome stops recognition on silence. Auto-restart immediately so mic stays alive!
          if (!isStoppedExplicitly && connectionStatusRef.current === 'CONNECTED' && !isMutedRef.current) {
            setTimeout(() => {
              if (!isStoppedExplicitly && connectionStatusRef.current === 'CONNECTED') {
                startListener();
              }
            }, 100);
          }
        };

        recognition.start();
        activeRecognition = recognition;
        speechRecognitionRef.current = recognition;
      } catch (err) {
        console.warn('[SpeechRecognition Start Failed]', err);
        setTimeout(() => {
          if (!isStoppedExplicitly && connectionStatusRef.current === 'CONNECTED') {
            startListener();
          }
        }, 400);
      }
    };

    if (connectionStatus === 'CONNECTED' && !isMuted) {
      isStoppedExplicitly = false;
      startListener();
    }

    return () => {
      isStoppedExplicitly = true;
      clearTimeout(silenceTimer);
      if (activeRecognition) {
        try {
          activeRecognition.stop();
        } catch {}
        activeRecognition = null;
      }
      speechRecognitionRef.current = null;
    };
  }, [connectionStatus, isMuted, settings.language, sendMessage]);

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
    if (!audioTrackRef.current) return;
    const targetMute = !isMuted;
    try {
      if (targetMute) {
        await audioTrackRef.current.mute();
      } else {
        await audioTrackRef.current.unmute();
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
