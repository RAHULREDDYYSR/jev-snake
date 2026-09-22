const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8787;
const ZEN_URL = 'https://opencode.ai/zen/v1/systemone';
const ZEN_BASE = ZEN_URL.replace(/\/v1\/systemone$/, '');
const MODELS = new Set(['jev-1.13', 'jev-1.13-free']);
const PUBLIC_DIR = path.join(__dirname, 'public');

for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const API_KEY = process.env.OPENCODE_API_KEY;
const DEFAULT_MODEL = 'jev-1.13';

let tsClient = null;
try {
  const { TypeSafeClient } = require('@typesafe-ai/sdk');
  tsClient = new TypeSafeClient({
    apiKey: API_KEY,
    baseURL: ZEN_BASE,
    defaultModel: DEFAULT_MODEL,
    timeout: 30000,
    retry: { maxRetries: 0 },
    logLevel: 'warn'
  });
} catch (e) {
  console.error('[sdk] @typesafe-ai/sdk unavailable — using raw fetch fallback (' + e.message + ')');
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function readBody(req, limit = 512 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/api/health') {
    return send(res, 200, { ok: true, model: DEFAULT_MODEL, hasKey: !!API_KEY });
  }

  if (url.pathname === '/api/decide' && req.method === 'POST') {
    if (!API_KEY) return send(res, 500, { error: 'server missing OPENCODE_API_KEY (.env)' });
    let body;
    try { body = JSON.parse(await readBody(req)); }
    catch (e) { return send(res, 400, { error: 'invalid JSON body: ' + e.message }); }
    const model = body.model || DEFAULT_MODEL;
    if (!MODELS.has(model)) return send(res, 400, { error: `model "${model}" not allowed (use jev-1.13 or jev-1.13-free)` });
    if (!body.state || !body.questions) return send(res, 400, { error: 'state and questions are required' });

    const payload = { model, state: body.state, questions: body.questions };
    const t0 = Date.now();

    if (tsClient) {
      try {
        const out = await tsClient.systemOne({ model, state: payload.state, questions: payload.questions }, { timeout: 30000 });
        console.log(`[decide/sdk] model=${model} http=200 ${Date.now() - t0}ms in=${out?.usage?.input_tokens ?? '?'}`);
        return send(res, 200, out);
      } catch (e) {
        const status = e.status || 502;
        let retryAfter = 0;
        try { retryAfter = parseInt(e.headers && (e.headers.get ? e.headers.get('retry-after') : e.headers['retry-after']), 10) || 0; } catch (_) {}
        const msg = (e.body && e.body.error && e.body.error.message) || e.message;
        console.error(`[decide/sdk] model=${model} http=${status} ${Date.now() - t0}ms ${msg}`);
        return send(res, status, { error: { message: msg, type: e.constructor.name }, retry_after: retryAfter });
      }
    }

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 30000);
    try {
      const r = await fetch(ZEN_BASE + '/v1/systemone', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: ac.signal
      });
      const text = await r.text();
      clearTimeout(timer);
      let out;
      try { out = JSON.parse(text); } catch { out = { raw: text }; }
      if (!r.ok && r.headers.get('retry-after')) {
        out.retry_after = parseInt(r.headers.get('retry-after'), 10) || 0;
      }
      console.log(`[decide/fetch] model=${model} http=${r.status} ${Date.now() - t0}ms in=${out.usage?.input_tokens ?? '?'}`);
      return send(res, r.status, out);
    } catch (e) {
      clearTimeout(timer);
      const msg = e.name === 'AbortError' ? 'upstream timeout (30s)' : e.message;
      console.error(`[decide/fetch] model=${model} FAILED ${Date.now() - t0}ms ${msg}`);
      return send(res, 502, { error: msg });
    }
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, { error: 'method not allowed' });
  }

  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(PUBLIC_DIR, file);
  if (!full.startsWith(PUBLIC_DIR)) return send(res, 403, { error: 'forbidden' });
  fs.readFile(full, (err, data) => {
    if (err) return send(res, 404, { error: 'not found' });
    const type = MIME[path.extname(full)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Jev Snake II → http://localhost:${PORT}`);
  console.log(`zen key ${API_KEY ? 'loaded (' + API_KEY.slice(0, 6) + '…)' : 'MISSING — put OPENCODE_API_KEY in .env'}`);
});
