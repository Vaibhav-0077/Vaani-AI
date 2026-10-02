import assert from 'assert';
import { AccessToken } from 'livekit-server-sdk';
import { app } from '../src/server.js';
import http from 'http';

console.log('--- Starting Backend Token Service Tests ---');

// Helper to make local HTTP requests to Express app
function makeRequest(server, path, method = 'GET', body = null) {
  const address = server.address();
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: address.port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    // Test 1: Health check
    console.log('[Test 1] GET /api/health');
    const health = await makeRequest(server, '/api/health');
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.body.status, 'ok');
    assert.strictEqual(health.body.service, 'vaani-ai-token-service');
    console.log('✓ Health check passed');

    // Test 2: Token generation with mocked credentials
    console.log('[Test 2] POST /api/token with valid LiveKit credentials');
    process.env.LIVEKIT_URL = 'wss://test-project.livekit.cloud';
    process.env.LIVEKIT_API_KEY = 'test_api_key_123';
    process.env.LIVEKIT_API_SECRET = 'test_api_secret_abcdef1234567890abcdef1234567890';

    const tokenRes = await makeRequest(server, '/api/token', 'POST', {
      roomName: 'my-test-room',
      participantName: 'test-user',
    });

    assert.strictEqual(tokenRes.status, 200);
    assert.strictEqual(tokenRes.body.serverUrl, 'wss://test-project.livekit.cloud');
    assert.strictEqual(tokenRes.body.roomName, 'my-test-room');
    assert.strictEqual(tokenRes.body.participantName, 'test-user');
    assert(typeof tokenRes.body.token === 'string' && tokenRes.body.token.length > 20);
    console.log('✓ Token generation returns valid JWT payload');

    // Test 3: Token generation with missing credentials returns 503
    console.log('[Test 3] POST /api/token when LiveKit credentials are unset');
    delete process.env.LIVEKIT_URL;
    delete process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_SECRET;

    const unconfiguredRes = await makeRequest(server, '/api/token', 'POST');
    assert.strictEqual(unconfiguredRes.status, 503);
    assert.strictEqual(unconfiguredRes.body.error, 'LiveKit credentials missing');
    console.log('✓ Missing credentials handled with clear 503 error message');

    console.log('\nAll backend token service tests passed successfully!');
    process.exit(0);
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
