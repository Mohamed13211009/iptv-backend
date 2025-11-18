// server.js
// IPTV proxy backend with Proxy/VPN detection (FAIL-CLOSED)
//
// Requires:
//   npm install express cors node-fetch crypto
//
// Env variables to set:
//   XTREAM_SERVER   (e.g. http://xtvip.net)
//   XTREAM_USER
//   XTREAM_PASS
//   TOKEN_TTL_SECONDS (optional, default 600)
//   PROXYCHECK_KEY    (required)
//   PROXYCHECK_TTL_SECONDS (optional, default 300)
//   PROXYCHECK_FAIL_OPEN    (optional; if "true" allows requests when proxy service fails; DEFAULT = false => FAIL-CLOSED)
//   PROXYCHECK_BLOCK_RISK   (optional, default 3)
//   PORT (optional)

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // v2
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const XTREAM_SERVER = ((process.env.XTREAM_SERVER || process.env.XTREAM_BASE || '') + '').replace(/\/$/, '');
const XTREAM_USER   = process.env.XTREAM_USER || '';
const XTREAM_PASS   = process.env.XTREAM_PASS || '';
const TOKEN_TTL_SECONDS = parseInt(process.env.TOKEN_TTL_SECONDS || '600', 10);

// Proxycheck config
const PROXYCHECK_KEY = process.env.PROXYCHECK_KEY || '';
const PROXYCHECK_TTL_SECONDS = parseInt(process.env.PROXYCHECK_TTL_SECONDS || '300', 10);
const PROXYCHECK_FAIL_OPEN = (process.env.PROXYCHECK_FAIL_OPEN || 'false') === 'true'; // default false => fail-closed
const PROXYCHECK_BLOCK_RISK = parseInt(process.env.PROXYCHECK_BLOCK_RISK || '3', 10);

if (!XTREAM_SERVER || !XTREAM_USER || !XTREAM_PASS) {
  console.error('⚠️ WARNING: Missing XTREAM_SERVER/XTREAM_USER/XTREAM_PASS environment variables.');
}
if (!PROXYCHECK_KEY) {
  console.error('⚠️ WARNING: PROXYCHECK_KEY is not set. Server is configured to FAIL-CLOSED (will block requests).');
}

app.use(cors());
app.use(express.json());

app.use((req,res,next)=>{
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - ip=${req.ip}`);
  next();
});

// simple in-memory token store
const tokens = new Map();
function createToken(ip) {
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + TOKEN_TTL_SECONDS * 1000;
  tokens.set(token, { expiresAt, ip, createdAt: Date.now() });
  return { token, expiresAt };
}
function isTokenValid(token, ip) {
  if (!token) return false;
  const e = tokens.get(token);
  if (!e) return false;
  if (Date.now() > e.expiresAt) { tokens.delete(token); return false; }
  return true;
}

function getClientIp(req){
  const xf = req.headers['x-forwarded-for'];
  if(xf && typeof xf === 'string'){
    const parts = xf.split(',').map(s=>s.trim()).filter(Boolean);
    if(parts.length) return parts[0];
  }
  let ip = req.ip || (req.connection && req.connection.remoteAddress) || '';
  if(ip && ip.startsWith('::ffff:')) ip = ip.split(':').pop();
  return ip;
}

// Proxycheck cache and probe
const proxyCache = new Map(); // ip -> { ok, info, expiresAt }

async function queryProxyCheck(ip){
  if(!PROXYCHECK_KEY) throw new Error('proxycheck key missing');
  const url = `https://proxycheck.io/v2/${encodeURIComponent(ip)}?key=${encodeURIComponent(PROXYCHECK_KEY)}&vpn=1&risk=1&asn=1`;
  const r = await fetch(url, { timeout: 10000 });
  const text = await r.text();
  try { return JSON.parse(text); } catch(e){ throw new Error('invalid-proxycheck-response'); }
}

async function probeProxyIp(ip){
  if(!ip) throw new Error('ip-not-determined');
  const cached = proxyCache.get(ip);
  if(cached && cached.expiresAt > Date.now()) return { ok: cached.ok, info: cached.info, cached:true };
  if(!PROXYCHECK_KEY){
    // fail-closed: treat missing key as blocked
    return { ok:false, info:{ error:'proxycheck_key_missing' }, cached:false };
  }
  try{
    const json = await queryProxyCheck(ip);
    const info = json[ip] || json;
    const isProxy = info && (info.proxy === 'yes' || info.vpn === 'yes' || info.type === 'VPN' || info.type === 'Proxy');
    const risk = info && info.risk ? parseInt(info.risk,10) : 0;
    const blocked = !!isProxy || (risk >= PROXYCHECK_BLOCK_RISK);
    proxyCache.set(ip, { ok: !blocked, info, expiresAt: Date.now() + PROXYCHECK_TTL_SECONDS*1000 });
    return { ok: !blocked, info, cached:false };
  } catch(err){
    console.error('probeProxyIp error for', ip, err && err.message ? err.message : err);
    if(PROXYCHECK_FAIL_OPEN) return { ok:true, info:{ error:'proxycheck-failed', message: err && err.message }, cached:false };
    return { ok:false, info:{ error:'proxycheck-failed', message: err && err.message }, cached:false };
  }
}

// middleware
async function checkProxyMiddleware(req,res,next){
  try{
    const ip = getClientIp(req);
    if(!ip) return res.status(400).json({ error:'ip-not-determined' });

    const cached = proxyCache.get(ip);
    if(cached && cached.expiresAt > Date.now()){
      if(!cached.ok) return res.status(403).json({ error:'proxy-or-vpn-blocked', info: cached.info });
      req.proxyCheck = cached.info; return next();
    }

    if(!PROXYCHECK_KEY && !PROXYCHECK_FAIL_OPEN){
      console.warn('PROXYCHECK_KEY missing - blocking by fail-closed policy');
      return res.status(503).json({ error:'proxycheck-unavailable' });
    }

    let probe;
    try { probe = await probeProxyIp(ip); } catch(e){
      console.error('probe error', e && e.message ? e.message : e);
      if(PROXYCHECK_FAIL_OPEN) return next();
      return res.status(503).json({ error:'proxy-check-failed' });
    }

    if(!probe.ok) return res.status(403).json({ error:'proxy-or-vpn-blocked', info: probe.info });
    req.proxyCheck = probe.info;
    return next();
  } catch(e){
    console.error('proxy middleware unexpected', e && e.message ? e.message : e);
    if(PROXYCHECK_FAIL_OPEN) return next();
    return res.status(500).json({ error:'proxy-middleware-error' });
  }
}

// browser-like fetch helper to talk to Xtream
function browserHeaders(){
  const origin = XTREAM_SERVER || '';
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Referer': origin,
    'Origin': origin,
    'Accept-Language': 'en-US,en;q=0.9',
  };
}
async function fetchWithBrowserHeaders(url, options = {}){
  const opts = {
    method: options.method || 'GET',
    headers: Object.assign({}, browserHeaders(), options.headers || {}),
    timeout: options.timeout || 15000
  };
  return await fetch(url, opts);
}

// Endpoints

app.get('/', (req,res)=> res.json({ ok:true, message:'IPTV backend running ✅' }));
app.get('/health', (req,res)=> res.json({ ok:true }));

app.get('/token', checkProxyMiddleware, (req,res)=>{
  const ip = getClientIp(req) || req.ip;
  const t = createToken(ip);
  res.json(t);
});

app.get('/check-vpn', async (req,res)=>{
  try{
    const ip = getClientIp(req) || req.ip;
    const r = await probeProxyIp(ip);
    return res.json({
      blocked: !r.ok,
      reason: r.info && (r.info.proxy || r.info.vpn || r.info.type || r.info.error) || null,
      detail: r.info,
      cached: !!r.cached
    });
  }catch(err){
    console.error('/check-vpn err', err && err.message ? err.message : err);
    if(PROXYCHECK_FAIL_OPEN) return res.json({ blocked:false, reason:'probe-error' });
    return res.status(500).json({ blocked:true, reason:'probe-error' });
  }
});

app.get('/api/xtream', /* checkProxyMiddleware, */ async (req,res)=> {
  try{
    const action = req.query.action;
    if(!action) return res.status(400).json({ error:'action required' });
    if(!XTREAM_SERVER || !XTREAM_USER || !XTREAM_PASS) return res.status(500).json({ error:'xtream not configured' });

    const url = `${XTREAM_SERVER}/player_api.php?username=${encodeURIComponent(XTREAM_USER)}&password=${encodeURIComponent(XTREAM_PASS)}&action=${encodeURIComponent(action)}`;
    console.log('Proxy Xtream:', url);
    const upstream = await fetchWithBrowserHeaders(url, { timeout:15000 });
    const txt = await upstream.text().catch(()=> '');
    try { const j = JSON.parse(txt); return res.status(upstream.status).json(j); } catch(e){ return res.status(upstream.status).send(txt); }
  }catch(e){
    console.error('api/xtream error', e && e.message ? e.message : e);
    return res.status(500).json({ error:'upstream-error', message: e && e.message });
  }
});

app.get('/api/series-info', /* checkProxyMiddleware, */ async (req,res)=>{
  try{
    const series_id = req.query.series_id;
    if(!series_id) return res.status(400).json({ error:'series_id required' });
    if(!XTREAM_SERVER || !XTREAM_USER || !XTREAM_PASS) return res.status(500).json({ error:'xtream not configured' });

    const url = `${XTREAM_SERVER}/player_api.php?username=${encodeURIComponent(XTREAM_USER)}&password=${encodeURIComponent(XTREAM_PASS)}&action=get_series_info&series_id=${encodeURIComponent(series_id)}`;
    console.log('Proxy series-info:', url);
    const upstream = await fetchWithBrowserHeaders(url, { timeout:15000 });
    const txt = await upstream.text().catch(()=> '');
    try { const j = JSON.parse(txt); return res.status(upstream.status).json(j); } catch(e){ return res.status(upstream.status).send(txt); }
  }catch(e){
    console.error('api/series-info error', e && e.message ? e.message : e);
    return res.status(500).json({ error:'upstream-error', message: e && e.message });
  }
});

app.get('/stream', checkProxyMiddleware, async (req,res)=>{
  try{
    const { token, type='vod', id, ext='' } = req.query;
    if(!id) return res.status(400).json({ error:'id required' });

    const ip = getClientIp(req) || req.ip;
    if(!isTokenValid(token, ip)) return res.status(403).json({ error:'invalid-or-expired-token' });

    const safeType = String(type||'vod').toLowerCase();
    const safeExt = (ext||'mp4').replace(/[^a-z0-9]/gi,'') || 'mp4';
    let path;
    if(safeType === 'series') path = `/series/${encodeURIComponent(XTREAM_USER)}/${encodeURIComponent(XTREAM_PASS)}/${encodeURIComponent(id)}.${safeExt}`;
    else if(safeType === 'live') path = `/live/${encodeURIComponent(XTREAM_USER)}/${encodeURIComponent(XTREAM_PASS)}/${encodeURIComponent(id)}.m3u8`;
    else path = `/movie/${encodeURIComponent(XTREAM_USER)}/${encodeURIComponent(XTREAM_PASS)}/${encodeURIComponent(id)}.${safeExt}`;

    const url = `${XTREAM_SERVER}${path}`;
    console.log('Streaming proxied URL:', url, 'from IP:', ip);
    const upstream = await fetchWithBrowserHeaders(url, { timeout:20000 });
    if(!upstream.ok){
      const body = await upstream.text().catch(()=> '');
      return res.status(upstream.status).send(body);
    }
    const ct = upstream.headers.get('content-type');
    if(ct) res.setHeader('Content-Type', ct);
    const cl = upstream.headers.get('content-length');
    if(cl) res.setHeader('Content-Length', cl);
    res.setHeader('Access-Control-Allow-Origin','*');
    const body = upstream.body;
    if(!body) return res.status(500).json({ error:'no-stream-body' });
    body.pipe(res);
  }catch(e){
    console.error('/stream error', e && e.message ? e.message : e);
    return res.status(500).json({ error:'stream-error', message: e && e.message });
  }
});

app.get('/xtream-probe', async (req,res)=>{
  try{
    if(!XTREAM_SERVER || !XTREAM_USER || !XTREAM_PASS) return res.status(500).json({ ok:false, error:'XTREAM env missing' });
    const url = `${XTREAM_SERVER}/player_api.php?username=${encodeURIComponent(XTREAM_USER)}&password=${encodeURIComponent(XTREAM_PASS)}&action=get_vod_streams`;
    console.log('xtream-probe ->', url);
    const r = await fetchWithBrowserHeaders(url, { timeout:15000 });
    const headersObj = {}; r.headers.forEach((v,k)=> headersObj[k]=v);
    const txt = await r.text().catch(()=> '');
    const sample = txt ? txt.slice(0,2000) : '';
    return res.json({ ok:true, probeUrl:url, upstreamStatus: r.status, upstreamHeaders: headersObj, sampleLength: txt?txt.length:0, sample });
  }catch(e){
    console.error('xtream-probe error', e && e.message ? e.message : e);
    return res.json({ ok:false, error: (e && e.message) ? e.message : String(e) });
  }
});

app.get('/debug-env', (req,res) => {
  res.json({
    xtream_server_present: !!process.env.XTREAM_SERVER,
    xtream_user_present: !!process.env.XTREAM_USER,
    xtream_pass_present: !!process.env.XTREAM_PASS,
    proxycheck_key_present: !!process.env.PROXYCHECK_KEY,
    note: 'presence only (true/false)'
  });
});

app.listen(PORT, ()=> console.log('✅ Server listening on port', PORT));
