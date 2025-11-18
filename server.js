// server.js
// IPTV proxy backend with Proxy/VPN detection middleware (proxycheck.io)
//
// Requirements:
//   npm i express cors node-fetch crypto
//
// Environment variables:
//   XTREAM_SERVER, XTREAM_USER, XTREAM_PASS
//   TOKEN_TTL_SECONDS (optional, default 600)
//   PROXYCHECK_KEY (optional - if missing, proxy checks are skipped)
//   PROXYCHECK_TTL_SECONDS (optional, default 300)
//   PROXYCHECK_FAIL_OPEN (optional, default true) - if true, fail-open on proxy-check errors
//   PROXYCHECK_BLOCK_RISK (optional, default 3)
//   PORT (optional)

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // v2
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ================= config =================
const XTREAM_SERVER = ((process.env.XTREAM_SERVER || process.env.XTREAM_BASE || '') + '').replace(/\/$/, '');
const XTREAM_USER   = process.env.XTREAM_USER || '';
const XTREAM_PASS   = process.env.XTREAM_PASS || '';
const TOKEN_TTL_SECONDS = parseInt(process.env.TOKEN_TTL_SECONDS || '600', 10);

const PROXYCHECK_KEY = process.env.PROXYCHECK_KEY || '';
const PROXYCHECK_TTL_SECONDS = parseInt(process.env.PROXYCHECK_TTL_SECONDS || '300', 10);
const PROXYCHECK_FAIL_OPEN = (process.env.PROXYCHECK_FAIL_OPEN || 'true') === 'true';
const PROXYCHECK_BLOCK_RISK = parseInt(process.env.PROXYCHECK_BLOCK_RISK || '3', 10);

if (!XTREAM_SERVER || !XTREAM_USER || !XTREAM_PASS) {
  console.error('⚠️ WARNING: Missing XTREAM_SERVER/XTREAM_USER/XTREAM_PASS environment variables.');
}

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - ip=${req.ip}`);
  next();
});

// =============== tokens in-memory ===============
const tokens = new Map();
function createToken(ip) {
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + TOKEN_TTL_SECONDS * 1000;
  tokens.set(token, { expiresAt, ip, createdAt: Date.now() });
  return { token, expiresAt };
}
function isTokenValid(token, ip) {
  if (!token) return false;
  const entry = tokens.get(token);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    tokens.delete(token);
    return false;
  }
  // optional bind by IP:
  // if (entry.ip && entry.ip !== ip) return false;
  return true;
}

// =============== Proxy/VPN detection middleware ===============
const proxyCache = new Map();

function getClientIp(req){
  const xf = req.headers['x-forwarded-for'];
  if(xf && typeof xf === 'string') {
    const ips = xf.split(',').map(s=>s.trim()).filter(Boolean);
    if(ips.length) return ips[0];
  }
  let ip = req.ip || (req.connection && req.connection.remoteAddress) || '';
  if(ip && ip.startsWith('::ffff:')) ip = ip.split(':').pop();
  return ip;
}

async function queryProxyCheck(ip){
  if(!PROXYCHECK_KEY) throw new Error('proxycheck key missing');
  const url = `https://proxycheck.io/v2/${encodeURIComponent(ip)}?key=${encodeURIComponent(PROXYCHECK_KEY)}&vpn=1&risk=1&asn=1`;
  const r = await fetch(url, { timeout: 10000 });
  const text = await r.text();
  try {
    const j = JSON.parse(text);
    return j;
  } catch (e) {
    throw new Error('invalid-proxycheck-response');
  }
}

async function checkProxyMiddleware(req, res, next){
  try {
    const ip = getClientIp(req);
    if(!ip) return res.status(400).json({ error: 'ip-not-determined' });

    const cached = proxyCache.get(ip);
    if(cached && cached.expiresAt > Date.now()){
      if(!cached.ok) {
        return res.status(403).json({ error:'proxy-or-vpn-blocked', reason: cached.info });
      } else {
        req.proxyCheck = cached.info;
        return next();
      }
    }

    if(!PROXYCHECK_KEY){
      console.warn('PROXYCHECK_KEY not set — skipping proxy check');
      return next();
    }

    let result;
    try {
      result = await queryProxyCheck(ip);
    } catch (err) {
      console.error('Proxy check failed for', ip, err.message || err);
      if(PROXYCHECK_FAIL_OPEN) return next();
      return res.status(503).json({ error:'proxy-check-failed', message: err.message || String(err) });
    }

    // proxycheck response shape: { status: 'ok', '1.2.3.4': { proxy:'yes', vpn:'yes', risk:'3', ... } }
    const info = result[ip] || result;
    const isProxy = info && (info.proxy === 'yes' || info.vpn === 'yes' || info.type === 'VPN' || info.type === 'Proxy');
    const risk = info && info.risk ? parseInt(info.risk,10) : 0;
    const blocked = !!isProxy || (risk >= PROXYCHECK_BLOCK_RISK);

    proxyCache.set(ip, {
      ok: !blocked,
      info,
      expiresAt: Date.now() + PROXYCHECK_TTL_SECONDS*1000
    });

    if(blocked) {
      console.warn(`Blocking IP ${ip} by proxycheck`, info);
      return res.status(403).json({ error:'proxy-or-vpn-blocked', reason: info });
    }

    req.proxyCheck = info;
    return next();
  } catch (e) {
    console.error('proxy middleware error', e && e.message ? e.message : e);
    if(PROXYCHECK_FAIL_OPEN) return next();
    return res.status(500).json({ error:'proxy-middleware-error', message: e.message || String(e) });
  }
}

// =============== Browser-like fetch helper ===============
function browserHeaders() {
  const origin = XTREAM_SERVER || '';
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Referer': origin,
    'Origin': origin,
    'Accept-Language': 'en-US,en;q=0.9',
  };
}

async function fetchWithBrowserHeaders(url, options = {}) {
  const opts = {
    method: options.method || 'GET',
    headers: Object.assign({}, browserHeaders(), options.headers || {}),
    timeout: options.timeout || 15000
  };
  return await fetch(url, opts);
}

// =============== Endpoints ===============

// Root
app.get('/', (req, res) => res.json({ ok: true, message: 'IPTV backend running ✅' }));
app.get('/health', (req, res) => res.json({ ok: true }));

// Token generation - protected by proxy check
app.get('/token', checkProxyMiddleware, (req, res) => {
  const ip = getClientIp(req) || req.ip;
  const { token, expiresAt } = createToken(ip);
  res.json({ token, expiresAt });
});

// Proxy Xtream API - optionally protected (you can enable if desired)
app.get('/api/xtream', /* checkProxyMiddleware, */ async (req, res) => {
  try {
    const action = req.query.action;
    if (!action) return res.status(400).json({ error: 'action query is required' });
    if (!XTREAM_SERVER || !XTREAM_USER || !XTREAM_PASS) {
      return res.status(500).json({ error: 'XTREAM credentials not configured on server' });
    }

    const url =
      `${XTREAM_SERVER}/player_api.php` +
      `?username=${encodeURIComponent(XTREAM_USER)}` +
      `&password=${encodeURIComponent(XTREAM_PASS)}` +
      `&action=${encodeURIComponent(action)}`;

    console.log('⏩ Proxying Xtream API:', url);

    const upstream = await fetchWithBrowserHeaders(url, { timeout: 15000 });
    console.log('Upstream status:', upstream.status);

    const text = await upstream.text().catch(()=> '');
    console.log('Upstream sampleLength:', text ? text.length : 0);

    try {
      const json = JSON.parse(text);
      return res.status(upstream.status).json(json);
    } catch (e) {
      return res.status(upstream.status).send(text);
    }
  } catch (err) {
    console.error('❌ Error in /api/xtream:', err && err.message ? err.message : String(err));
    return res.status(500).json({ error: 'upstream-error', message: err && err.message });
  }
});

// Series info
app.get('/api/series-info', /* checkProxyMiddleware, */ async (req, res) => {
  try {
    const series_id = req.query.series_id;
    if (!series_id) return res.status(400).json({ error: 'series_id query is required' });
    if (!XTREAM_SERVER || !XTREAM_USER || !XTREAM_PASS) {
      return res.status(500).json({ error: 'XTREAM credentials not configured on server' });
    }

    const url =
      `${XTREAM_SERVER}/player_api.php` +
      `?username=${encodeURIComponent(XTREAM_USER)}` +
      `&password=${encodeURIComponent(XTREAM_PASS)}` +
      `&action=get_series_info` +
      `&series_id=${encodeURIComponent(series_id)}`;

    console.log('⏩ Proxying Xtream series-info:', url);

    const upstream = await fetchWithBrowserHeaders(url, { timeout: 15000 });
    console.log('Upstream status:', upstream.status);

    const text = await upstream.text().catch(()=> '');
    console.log('Upstream sampleLength:', text ? text.length : 0);

    try {
      const json = JSON.parse(text);
      return res.status(upstream.status).json(json);
    } catch (e) {
      return res.status(upstream.status).send(text);
    }
  } catch (err) {
    console.error('❌ Error in /api/series-info:', err && err.message ? err.message : String(err));
    return res.status(500).json({ error: 'upstream-error', message: err && err.message });
  }
});

// Stream proxy - protected by proxy check
app.get('/stream', checkProxyMiddleware, async (req,res) => {
  try {
    const { token, type = 'vod', id, ext = '' } = req.query;
    if (!id) return res.status(400).json({ error: 'id query is required' });

    const ip = getClientIp(req) || req.ip;
    if (!isTokenValid(token, ip)) {
      return res.status(403).json({ error: 'invalid-or-expired-token' });
    }

    const safeType = String(type || 'vod').toLowerCase();
    const safeExt = (ext || 'mp4').replace(/[^a-z0-9]/gi, '') || 'mp4';

    let path;
    if (safeType === 'series') {
      path = `/series/${encodeURIComponent(XTREAM_USER)}/${encodeURIComponent(XTREAM_PASS)}/${encodeURIComponent(id)}.${safeExt}`;
    } else if (safeType === 'live') {
      path = `/live/${encodeURIComponent(XTREAM_USER)}/${encodeURIComponent(XTREAM_PASS)}/${encodeURIComponent(id)}.m3u8`;
    } else {
      path = `/movie/${encodeURIComponent(XTREAM_USER)}/${encodeURIComponent(XTREAM_PASS)}/${encodeURIComponent(id)}.${safeExt}`;
    }

    const url = `${XTREAM_SERVER}${path}`;
    console.log(`⏩ Streaming proxy URL: ${url} (requested by ${ip})`);

    const upstream = await fetchWithBrowserHeaders(url, { timeout: 20000 });
    console.log('Upstream stream status:', upstream.status);

    if (!upstream.ok) {
      console.warn('Upstream status:', upstream.status);
      const body = await upstream.text().catch(()=> '');
      return res.status(upstream.status).send(body);
    }

    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    const contentLength = upstream.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    res.setHeader('Access-Control-Allow-Origin', '*');

    const body = upstream.body;
    if (!body) return res.status(500).json({ error: 'no-stream-body' });
    body.pipe(res);
  } catch (err) {
    console.error('❌ Error in /stream:', err && err.message ? err.message : String(err));
    return res.status(500).json({ error: 'stream-error', message: err && err.message });
  }
});

// =========== Diagnostics (temporary) ===========
app.get('/debug-env', (req, res) => {
  res.json({
    xtream_server_present: !!process.env.XTREAM_SERVER,
    xtream_user_present: !!process.env.XTREAM_USER,
    xtream_pass_present: !!process.env.XTREAM_PASS,
    proxycheck_key_present: !!process.env.PROXYCHECK_KEY,
    note: 'Reports presence only (true/false), not the secret values.'
  });
});

app.get('/xtream-probe', async (req, res) => {
  try {
    if (!XTREAM_SERVER || !XTREAM_USER || !XTREAM_PASS) {
      return res.status(500).json({ ok:false, error:'XTREAM env missing' });
    }
    const url =
      `${XTREAM_SERVER.replace(/\/$/,'')}/player_api.php` +
      `?username=${encodeURIComponent(XTREAM_USER)}` +
      `&password=${encodeURIComponent(XTREAM_PASS)}` +
      `&action=get_vod_streams`;

    console.log('🔎 xtream-probe ->', url);
    const r = await fetchWithBrowserHeaders(url, { timeout: 15000 });
    console.log('Probe upstream status:', r.status);

    const headersObj = {};
    r.headers.forEach((v,k)=> headersObj[k] = v);
    const text = await r.text().catch(()=> '');
    const sample = text ? text.slice(0, 2000) : '';

    res.json({
      ok: true,
      probeUrl: url,
      upstreamStatus: r.status,
      upstreamHeaders: headersObj,
      sampleLength: text ? text.length : 0,
      sample: sample
    });
  } catch (err) {
    console.error('❌ Error in /xtream-probe:', err && err.message ? err.message : err);
    res.json({ ok:false, error: (err && err.message) ? err.message : String(err) });
  }
});

// =============== start server ===============
app.listen(PORT, () => {
  console.log('✅ Server listening on port', PORT);
});
