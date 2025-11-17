const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ================= إعداد بيانات سيرفر IPTV (من ENV) =================

const XTREAM_SERVER = (process.env.XTREAM_SERVER || '').replace(/\/$/, '');
const XTREAM_USER   = process.env.XTREAM_USER || '';
const XTREAM_PASS   = process.env.XTREAM_PASS || '';

// مدة صلاحية التوكن (ثواني) – افتراضي 10 دقائق
const TOKEN_TTL_SECONDS = parseInt(process.env.TOKEN_TTL_SECONDS || '600', 10);

// تحذير لو البيانات مش متظبطة
if (!XTREAM_SERVER || !XTREAM_USER || !XTREAM_PASS) {
  console.error('⚠️ لازم تضبط متغيرات البيئة: XTREAM_SERVER / XTREAM_USER / XTREAM_PASS');
}

app.use(cors());          // السماح للـ HTML يتصل بالسيرفر
app.use(express.json());

// لوج بسيط للطلبات
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ================ تخزين التوكنات في الذاكرة ================

const tokens = new Map();

function createToken() {
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + TOKEN_TTL_SECONDS * 1000;
  tokens.set(token, expiresAt);
  return { token, expiresAt };
}

function isTokenValid(token) {
  if (!token) return false;
  const exp = tokens.get(token);
  if (!exp) return false;
  if (Date.now() > exp) {
    tokens.delete(token);
    return false;
  }
  return true;
}

// ================ Endpoints بسيطة للفحص ================

app.get('/', (req, res) => {
  res.json({ ok: true, message: 'IPTV backend running ✅' });
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// ================ /token => يرجع توكن مؤقت ================

app.get('/token', (req, res) => {
  const { token, expiresAt } = createToken();
  res.json({ token, expiresAt });
});

// ================ /api/xtream => Proxy لـ Xtream API ================

app.get('/api/xtream', async (req, res) => {
  const action = req.query.action;
  if (!action) {
    return res.status(400).json({ error: 'action query is required' });
  }

  const url =
    `${XTREAM_SERVER}/player_api.php` +
    `?username=${encodeURIComponent(XTREAM_USER)}` +
    `&password=${encodeURIComponent(XTREAM_PASS)}` +
    `&action=${encodeURIComponent(action)}`;

  try {
    const r = await fetch(url);
    const text = await r.text();

    try {
      const data = JSON.parse(text);
      res.status(r.status).json(data);
    } catch (e) {
      // لو الرد مش JSON نظيف، نرجعه زي ما هو
      res.status(r.status).send(text);
    }
  } catch (err) {
    console.error('❌ Error in /api/xtream:', err.message);
    res.status(500).json({ error: 'upstream-error' });
  }
});

// ================ /api/series-info => حلقات مسلسل ================

app.get('/api/series-info', async (req, res) => {
  const series_id = req.query.series_id;
  if (!series_id) {
    return res.status(400).json({ error: 'series_id query is required' });
  }

  const url =
    `${XTREAM_SERVER}/player_api.php` +
    `?username=${encodeURIComponent(XTREAM_USER)}` +
    `&password=${encodeURIComponent(XTREAM_PASS)}` +
    `&action=get_series_info` +
    `&series_id=${encodeURIComponent(series_id)}`;

  try {
    const r = await fetch(url);
    const text = await r.text();

    try {
      const data = JSON.parse(text);
      res.status(r.status).json(data);
    } catch (e) {
      res.status(r.status).send(text);
    }
  } catch (err) {
    console.error('❌ Error in /api/series-info:', err.message);
    res.status(500).json({ error: 'upstream-error' });
  }
});

// ================ /stream => Proxy للستريم نفسه ================
// الكلاينت يبعت: /stream?type=vod&id=123&ext=mp4&token=...

app.get('/stream', async (req, res) => {
  const { token, type = 'vod', id, ext } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'id query is required' });
  }

  if (!isTokenValid(token)) {
    return res.status(403).json({ error: 'invalid-or-expired-token' });
  }

  const safeType = String(type || 'vod').toLowerCase();
  const safeExt = (ext || 'mp4').replace(/[^a-z0-9]/gi, '') || 'mp4';

  let path;

  if (safeType === 'series') {
    // حلقات المسلسلات
    path = `/series/${encodeURIComponent(XTREAM_USER)}/${encodeURIComponent(XTREAM_PASS)}/${encodeURIComponent(id)}.${safeExt}`;
  } else if (safeType === 'live') {
    // قنوات لايف (لو حبيت تستخدمها بعدين)
    path = `/live/${encodeURIComponent(XTREAM_USER)}/${encodeURIComponent(XTREAM_PASS)}/${encodeURIComponent(id)}.m3u8`;
  } else {
    // أفلام (VOD)
    path = `/movie/${encodeURIComponent(XTREAM_USER)}/${encodeURIComponent(XTREAM_PASS)}/${encodeURIComponent(id)}.${safeExt}`;
  }

  const url = `${XTREAM_SERVER}${path}`;
  console.log('⏩ Streaming from:', url);

  try {
    const upstream = await fetch(url);

    if (!upstream.ok) {
      console.error('Upstream status:', upstream.status);
      res.status(upstream.status);
    }

    // ننقل شوية هيدرات مهمة
    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);

    const contentLength = upstream.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);

    // نخلي CORS موجود برضه
    res.setHeader('Access-Control-Allow-Origin', '*');

    // نعمل Proxy للستريم
    upstream.body.pipe(res);
  } catch (err) {
    console.error('❌ Error in /stream:', err.message);
    res.status(500).json({ error: 'stream-error' });
  }
});

// ================ تشغيل السيرفر ================

app.listen(PORT, () => {
  console.log('✅ Server listening on port', PORT);
});
