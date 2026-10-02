import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { AccessToken } from 'livekit-server-sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from backend/.env or root .env
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
const PORT = process.env.PORT || 5000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

app.use(cors({
  origin: CORS_ORIGIN === '*' ? true : [CORS_ORIGIN, 'http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
}));
app.use(express.json());

// Sanitize inputs
function sanitizeString(str, defaultValue, maxLength = 64) {
  if (typeof str !== 'string' || !str.trim()) {
    return defaultValue;
  }
  return str.trim().replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, maxLength);
}

// 1. Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'vaani-ai-token-service',
    timestamp: new Date().toISOString(),
    livekitConfigured: Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET),
  });
});

// 2. LiveKit configuration status endpoint (Safe: never exposes secrets)
app.get('/api/status', (req, res) => {
  const configured = Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);
  res.json({
    livekitConfigured: configured,
    serverUrl: configured ? process.env.LIVEKIT_URL : null,
  });
});

// 3. Ephemeral LiveKit Token Generation endpoint
app.post('/api/token', async (req, res) => {
  try {
    const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;

    if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
      return res.status(503).json({
        error: 'LiveKit credentials missing',
        message: 'LIVEKIT_URL, LIVEKIT_API_KEY, or LIVEKIT_API_SECRET are not configured on the server. Please configure them in your .env file.',
        hint: 'Sign up at https://cloud.livekit.io for free credentials, then copy them into your root .env file.',
      });
    }

    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const roomName = sanitizeString(req.body?.roomName, `vaani-room-${randomSuffix}`);
    const participantName = sanitizeString(req.body?.participantName, `user-${randomSuffix}`);

    // Create a secure token with 15-minute validity (least privilege)
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: participantName,
      name: participantName,
      ttl: '15m',
    });

    // Grant granular room permissions (audio publishing, subscribing, data channel)
    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    return res.json({
      serverUrl: LIVEKIT_URL,
      roomName,
      participantName,
      token,
      expiresIn: '15m',
    });
  } catch (err) {
    console.error('[Token Generation Error]', err);
    return res.status(500).json({
      error: 'Failed to generate connection token',
      message: err.message,
    });
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Server Error]', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

export { app };

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule && process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[Vaani-AI Backend] Token service listening on http://localhost:${PORT}`);
    const configured = Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);
    if (configured) {
      console.log(`[Vaani-AI Backend] LiveKit configured: ${process.env.LIVEKIT_URL}`);
    } else {
      console.warn(`[Vaani-AI Backend] Warning: LiveKit credentials not yet set in .env. /api/token will prompt to configure them.`);
    }
  });
}

