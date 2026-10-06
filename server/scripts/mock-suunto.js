/**
 * Mock Suunto Cloud API for local testing (no Suunto account or watch needed).
 *
 *   node scripts/mock-suunto.js            # listens on :4010
 *
 * Then in server/.env set:
 *   SUUNTO_OAUTH_BASE=http://<your-LAN-IP>:4010
 *   SUUNTO_API_BASE=http://<your-LAN-IP>:4010
 *   SUUNTO_CLIENT_ID=mock  SUUNTO_CLIENT_SECRET=mock  SUUNTO_SUBSCRIPTION_KEY=mock
 * and restart the rooka server. Use the LAN IP (not localhost) so a phone can open the login page.
 */
const http = require('http');
const PORT = process.env.MOCK_SUUNTO_PORT || 4010;

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const fakeJwt = (user) => `${b64({ alg: 'none' })}.${b64({ user })}.sig`;

const day = 24 * 3600 * 1000;
const workouts = [
  { workoutId: 9001, activityId: 1, startTime: Date.now() - 1 * day, totalTime: 2700, totalDistance: 8200, totalAscent: 60, hrdata: { workoutAvgHR: 152, workoutMaxHR: 176 } },
  { workoutId: 9002, activityId: 2, startTime: Date.now() - 2 * day, totalTime: 5400, totalDistance: 34000, totalAscent: 310, hrdata: { workoutAvgHR: 138, workoutMaxHR: 165 } },
  { workoutId: 9003, activityId: 21, startTime: Date.now() - 3 * day, totalTime: 2400, totalDistance: 1500, totalAscent: 0, hrdata: { workoutAvgHR: 130, workoutMaxHR: 150 } },
  { workoutId: 9004, activityId: 23, startTime: Date.now() - 4 * day, totalTime: 3600, totalDistance: 0, totalAscent: 0, hrdata: { workoutAvgHR: 2.2, workoutMaxHR: 2.9 } }, // Hz variant
  { workoutId: 9005, activityId: 99, startTime: Date.now() - 5 * day, totalTime: 1800, totalDistance: 0, totalAscent: 0 }, // unmapped -> Other
];

const guides = new Map();
let nextGuideId = 1;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  console.log(req.method, url.pathname + url.search);

  if (url.pathname === '/oauth/authorize') {
    const redirect = url.searchParams.get('redirect_uri');
    const target = `${redirect}${redirect.includes('?') ? '&' : '?'}code=mockcode123`;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(`<meta name="viewport" content="width=device-width,initial-scale=1">
      <body style="font-family:sans-serif;text-align:center;padding:40px">
      <h2>Mock Suunto</h2><p>Authorize rooka?</p>
      <a href="${target}" style="display:inline-block;padding:14px 28px;background:#d33;color:#fff;border-radius:10px;text-decoration:none">Authorize</a></body>`);
  }

  if (url.pathname === '/oauth/token' && req.method === 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      access_token: fakeJwt('mock-suunto-user'),
      token_type: 'bearer',
      refresh_token: 'mock-refresh-token',
      expires_in: 86400,
      scope: 'workout',
    }));
  }

  if (url.pathname === '/v2/workouts') {
    const since = Number(url.searchParams.get('since') || 0);
    const offset = Number(url.searchParams.get('offset') || 0);
    const limit = Number(url.searchParams.get('limit') || 100);
    const list = workouts.filter((w) => w.startTime >= since).slice(offset, offset + limit);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: null, metadata: {}, payload: list }));
  }

  // SuuntoPlus Guides (planned workout push). Accepts the zip and keeps it in memory.
  if (url.pathname.startsWith('/v2/guides/')) {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const m = url.pathname.match(/^\/v2\/guides\/files\/(.+)$/);
      if (url.pathname === '/v2/guides/files' && req.method === 'POST') {
        const id = String(nextGuideId++);
        guides.set(id, Buffer.concat(chunks));
        console.log(`  -> created guide ${id} (${Buffer.concat(chunks).length} bytes)`);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ id }));
      }
      if (m && req.method === 'PUT') {
        if (!guides.has(m[1])) { res.writeHead(404); return res.end(); }
        guides.set(m[1], Buffer.concat(chunks));
        console.log(`  -> updated guide ${m[1]}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end('{}');
      }
      if (url.pathname === '/v2/guides/items') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ payload: [...guides.keys()].map((id) => ({ id })) }));
      }
      res.writeHead(404);
      res.end('not found');
    });
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, () => console.log(`Mock Suunto listening on :${PORT}`));
