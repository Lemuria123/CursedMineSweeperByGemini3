// Simulates EXACT frontend flow: Web Crypto AES-256-GCM encrypt → POST /api/submit
async function test() {
  const api = 'http://localhost:38001';
  const keyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  // Auth
  const auth = await (await fetch(`${api}/api/auth`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform: 'diag', platform_id: 'browser-sim-' + Date.now() }),
  })).json();
  console.log('[1] Auth:', auth.account_id);

  // Nonce
  const nonce = (await (await fetch(`${api}/api/nonce?account_id=${auth.account_id}`)).json()).nonce;

  // Build payload (exactly what GameRecorder.buildPayload produces)
  const payload = {
    version: 1, nonce,
    grid: { rows: 9, cols: 9, mines: 19 },
    mine_seed: '9-9-19-4-4-1747968000000',
    actions: [
      { type: 'first_reveal', row: 4, col: 4, ts: 0 },
      // Simulate a complete win: open all non-mine cells with prayer
      ...(() => {
        const acts: any[] = [];
        let ts = 500;
        for (let r = 0; r < 9; r++)
          for (let c = 0; c < 9; c++)
            if (!(r >= 3 && r <= 5 && c >= 3 && c <= 5)) // skip 3x3 safe zone
              acts.push({ type: 'reveal', row: r, col: c, ts: (ts += 200), prayed: true });
        return acts;
      })(),
    ],
    prayers_used: 72,
    total_time_ms: 15000,
  };

  // Encrypt using EXACT browser-side algorithm
  const raw = new Uint8Array(keyHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
  const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  const b64 = btoa(String.fromCharCode(...combined));

  console.log('[2] Payload encrypted,', b64.length, 'bytes');

  // Submit
  const sub = await (await fetch(`${api}/api/submit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_id: auth.account_id, payload: b64 }),
  })).json();
  console.log('[3] Submit result:', JSON.stringify(sub));

  // Check DB
  console.log('[4] Now open http://localhost:38002/submissions to verify');
}

test().catch(e => console.error('FATAL:', e.message));
