import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  LocalAudioTrack,
  createLocalAudioTrack,
} from 'livekit-client';
import type { VoiceState, ConnectionStatus, ChatMessage, AgentSettings, TokenResponse } from '../types';

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
  const [settings, setSettings] = useState<AgentSettings>({
    language: 'auto',
    speechRate: 1.0,
    continuousMode: true,
    autoScroll: true,
  });

  const roomRef = useRef<Room | null>(null);
  const audioTrackRef = useRef<LocalAudioTrack | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const addSystemMessage = useCallback((content: string) => {
    const msg: ChatMessage = {
      id: `sys-${Date.now()}-${Math.random()}`,
      role: 'system',
      content,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, msg]);
  }, []);

  // Cleanup helper for audio tracks, Web Audio context, and LiveKit room
  const cleanup = useCallback(() => {
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
  }, []);

  // Disconnect function
  const disconnect = useCallback(() => {
    cleanup();
    setConnectionStatus('DISCONNECTED');
    setVoiceState('IDLE');
    setErrorMessage(null);
    setInterimTranscript('');
    addSystemMessage('Voice session disconnected.');
  }, [cleanup, addSystemMessage]);

  // Connect function
  const connect = useCallback(async () => {
    cleanup();
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
      });

      room.on(RoomEvent.Reconnecting, () => {
        setConnectionStatus('RECONNECTING');
        setVoiceState('CONNECTING');
        addSystemMessage('Network blip detected. Reconnecting WebRTC stream...');
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

      room.on(RoomEvent.TrackSubscribed, (track: Track) => {
        if (track.kind === Track.Kind.Audio) {
          const element = track.attach();
          element.autoplay = true;
        }
      });

      // Connect to LiveKit SFU
      await room.connect(tokenData.serverUrl, tokenData.token);

      // Publish local microphone track
      await room.localParticipant.publishTrack(localTrack);

      // 4. Web Audio API Analyser for real-time microphone metering
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
  }, [cleanup, addSystemMessage]);

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

  // Fallback text message handler
  const sendMessage = useCallback((content: string) => {
    if (!content.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);

    if (connectionStatus === 'CONNECTED') {
      // Send message via LiveKit DataChannel if available
      if (roomRef.current?.localParticipant) {
        const payload = new TextEncoder().encode(
          JSON.stringify({ type: 'text_input', text: content.trim() })
        );
        roomRef.current.localParticipant.publishData(payload, { reliable: true }).catch((err) => {
          console.warn('[DataChannel Publish Warning]', err);
        });
      }

      setVoiceState('THINKING');
      setTimeout(() => {
        setVoiceState('SPEAKING');
        const assistantMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `[Realtime Transport Active] Received message: "${content}". Voice agent worker pipeline will generate speech in Phase 3.`,
          timestamp: new Date(),
          latencyMs: 140,
        };
        setMessages((prev) => [...prev, assistantMsg]);

        setTimeout(() => {
          setVoiceState('LISTENING');
        }, 2200);
      }, 700);
    } else {
      addSystemMessage('Note: Connect to voice room to transmit data over WebRTC.');
    }
  }, [connectionStatus, addSystemMessage]);

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
    connect,
    disconnect,
    toggleConnection,
    toggleMute,
    sendMessage,
    clearMessages,
    updateSettings,
    simulateState,
  };
}
