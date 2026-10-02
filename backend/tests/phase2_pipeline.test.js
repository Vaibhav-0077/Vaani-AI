import assert from 'assert';
import http from 'http';
import { app } from '../src/server.js';

console.log('=== PHASE 2: Realtime Connection & Microphone Pipeline Acceptance Tests ===\n');

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

async function runPipelineTests() {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    // 1. Secure Token Flow & No Secrets in Frontend
    console.log('[Acceptance 1] Secure Token Flow: Ephemeral LiveKit JWT generation');
    process.env.LIVEKIT_URL = 'wss://vaani-cloud.livekit.cloud';
    process.env.LIVEKIT_API_KEY = 'API_KEY_SECRET_NOT_SHARED_TO_CLIENT';
    process.env.LIVEKIT_API_SECRET = 'SECRET_KEY_NEVER_TRANSMITTED_TO_BROWSER_12345';

    const tokenResponse = await makeRequest(server, '/api/token', 'POST', {
      roomName: 'vaani-demo-room',
      participantName: 'vaibhav',
    });

    assert.strictEqual(tokenResponse.status, 200);
    assert.strictEqual(tokenResponse.body.serverUrl, 'wss://vaani-cloud.livekit.cloud');
    assert.strictEqual(tokenResponse.body.roomName, 'vaani-demo-room');
    assert.strictEqual(tokenResponse.body.participantName, 'vaibhav');
    assert(tokenResponse.body.token.startsWith('ey'), 'Token must be a valid signed JWT');
    // Ensure API SECRET is NEVER returned in response
    assert.strictEqual(tokenResponse.body.token.includes('SECRET_KEY_NEVER_TRANSMITTED'), false);
    console.log('✓ Verified: Token issued securely with zero client secrets exposure');

    // 2. Error Handling & Connection Failure: Missing Credentials
    console.log('\n[Acceptance 2] Connection Failure Handling: Missing server credentials');
    delete process.env.LIVEKIT_URL;
    delete process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_SECRET;

    const failureResponse = await makeRequest(server, '/api/token', 'POST');
    assert.strictEqual(failureResponse.status, 503);
    assert.strictEqual(failureResponse.body.error, 'LiveKit credentials missing');
    assert(failureResponse.body.message.includes('LIVEKIT_URL'), 'Clear error explanation must be provided');
    console.log('✓ Verified: Clear 503 HTTP response and guidance returned on connection failure');

    // 3. Status endpoint: Safe configuration check
    console.log('\n[Acceptance 3] Safe Server Configuration Status');
    const statusBefore = await makeRequest(server, '/api/status');
    assert.strictEqual(statusBefore.status, 200);
    assert.strictEqual(statusBefore.body.livekitConfigured, false);
    assert.strictEqual(statusBefore.body.serverUrl, null);

    process.env.LIVEKIT_URL = 'wss://vaani-cloud.livekit.cloud';
    process.env.LIVEKIT_API_KEY = 'key';
    process.env.LIVEKIT_API_SECRET = 'secret';
    const statusAfter = await makeRequest(server, '/api/status');
    assert.strictEqual(statusAfter.body.livekitConfigured, true);
    assert.strictEqual(statusAfter.body.serverUrl, 'wss://vaani-cloud.livekit.cloud');
    console.log('✓ Verified: Safe status check reflects backend readiness');

    // 4. Input Sanitization on roomName & participantName
    console.log('\n[Acceptance 4] Input Sanitization & Injection Prevention');
    const sanitizedResponse = await makeRequest(server, '/api/token', 'POST', {
      roomName: '<script>alert("xss")</script> room!@#$%',
      participantName: 'user; DROP TABLE participants;--',
    });
    assert.strictEqual(sanitizedResponse.status, 200);
    assert(!sanitizedResponse.body.roomName.includes('<script>'));
    assert(!sanitizedResponse.body.participantName.includes(';'));
    console.log('✓ Verified: Input names sanitized to safe alphanumeric/underscore characters:', {
      room: sanitizedResponse.body.roomName,
      user: sanitizedResponse.body.participantName,
    });

    console.log('\n=== All Phase 2 Pipeline Acceptance Tests Passed! ===\n');
    process.exit(0);
  } finally {
    server.close();
  }
}

runPipelineTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
