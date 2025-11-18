// server.js
// Backend آمن بسيط لـ Xtream + فحص VPN اختياري عن طريق proxycheck.io

const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const morgan = require('morgan');

const app = express();

app.use(cors());              // السماح بالوصول من أي دومين (التطبيق / AppCreator24)
app.use(express.json());
app.use(morgan('tiny'));

// ====== متغيرات البيئة (تتحط في Railway) ======
const PORT = process.env.PORT || 8080;

const XTREAM_SERVER = process.env.XTREAM_SERVER; // مثلا: http://xtvip.net
const XTREAM_USER   = process.env.XTREAM_USER;   // watch1235
const XTREAM_PASS   = process.env.XTREAM_PASS;   // 742837399

const PROXYCHECK_KEY        = process.env.PROXYCHECK_KEY || '';   // مفتاح proxycheck (اختياري)
const PROXYCHECK_FAIL_OPEN  = process.env.PROXYCHECK_FAIL_OPEN !== 'false'; // الافتراضي: يسمح لو حصل خطأ
const PROXYCHECK_BLOCK_RISK = parseInt(process.env.PROXYCHECK_BLOCK_RISK || '3', 10);

// شوية رسائل لوج عند التشغيل
if (!XTREAM_SERVER || !XTREAM_USER || !XTREAM_PASS) {
  console.warn('⚠️ XTREAM_SERVER أو XTREAM_USER أو XTREAM_PASS مش متضبطين في Railway – السيرفر مش هيشتغل صح.');
} else {
  console.log('✅ XTREAM config loaded.');
}

if (!PROXYCHECK_KEY) {
  console.warn('ℹ️ PROXYCHECK_KEY مش متضبط – فحص الـ VPN هيشتغل في وضع FAIL-OPEN (لو حصل خطأ هيسمح بالطلب).');
}

// ============== دوال مساعدة ==============

// جلب IP العميل من X-Forwarded-For (اللي Railway بيحطه)
function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) {
    return xff.split(',')[0].trim();
  }
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : '';
}

// فحص IP عن طريق proxycheck
async function checkVpn(ip) {
  if (!PROXYCHECK_KEY) {
    // لو مفيش مفتاح أصلاً نسمح على طول
    return { blocked: false, reason: 'no-proxycheck-key' };
  }

  try {
    const url = `https://proxycheck.io/v2/${encodeURIComponent(ip)}?key=${encodeURIComponent(PROXYCHECK_KEY)}&vpn=1&risk=1`;
    const res = await fetch(url, { timeout: 6000 });

    if (!res.ok) {
      throw new Error('proxycheck HTTP ' + res.status);
    }

    const data = await res.json();
    const info = data[ip] || data;
    const isProxy = info && (info.proxy === 'yes' || info.vpn === 'yes');
    const risk    = info && info.risk ? parseInt(info.risk, 10) : 0;

    const blocked = !!isProxy || risk >= PROXYCHECK_BLOCK_RISK;

    return {
      blocked,
      reason: blocked ? (info.type || `risk:${risk}`) : 'ok',
      detail: info
    };

  } catch (e) {
    console.error('proxycheck failed:', e.message || e);

    if (PROXYCHECK_FAIL_OPEN) {
      // في وضع FAIL-OPEN: لو حصل خطأ في خدمة الفحص → نسمح
      return { blocked: false, reason: 'proxycheck-failed-allowed' };
    } else {
      // في وضع FAIL-CLOSED: لو حصل خطأ → نحجب
      return { blocked: true, reason: 'proxycheck-failed-blocked' };
    }
  }
}

// Middleware لفحص الـ VPN قبل بعض المسارات
async function vpnGuard(req, res, next) {
  const ip = getClientIp(req);

  if (!ip) {
    // لو مش عارفين نجيب IP، نخلي الطلب يعدّي علشان ما نكسرش التطبيق
    return next();
  }

  try {
    const result = await checkVpn(ip);
    if (result.blocked) {
      return res.status(403).json({
        ok: false,
        blocked: true,
        reason: result.reason || 'vpn-blocked'
      });
    }
    next();
  } catch (e) {
    console.error('vpnGuard error:', e.message || e);
    // لو حصل خطأ غير متوقع، نسمح برضه (ما نوقفش السيرفر)
    next();
  }
}

// ============== مسارات السيرفر ==============

// Health check بسيط
app.get('/', (req, res) => {
  res.json({ ok: true, message: 'iptv-backend running' });
});

// Proxy لـ Xtream player_api (قوائم / بيانات)
// مثال من التطبيق: GET /api/xtream?action=get_vod_streams
app.get('/api/xtream', vpnGuard, async (req, res) => {
  if (!XTREAM_SERVER || !XTREAM_USER || !XTREAM_PASS) {
    return res.status(500).json({ ok: false, error: 'XTREAM env vars not set' });
  }

  const base = XTREAM_SERVER.replace(/\/$/, '');
  const params = new URLSearchParams();

  // نضيف بيانات الاشتراك من السيرفر (مش من العميل)
  params.set('username', XTREAM_USER);
  params.set('password', XTREAM_PASS);

  // ننقل باقي الـ query parameters زي action, series_id, category_id, ... الخ
  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'username' || key === 'password') continue;
    params.set(key, String(value));
  }

  const target = `${base}/player_api.php?${params.toString()}`;
  console.log('⏩ Proxy Xtream:', target);

  try {
    const upstream = await fetch(target, { timeout: 15000 });
    const contentType = upstream.headers.get('content-type') || 'application/json';

    res.status(upstream.status);
    res.set('content-type', contentType);

    const buf = await upstream.buffer();
    res.send(buf);
  } catch (e) {
    console.error('xtream proxy error:', e.message || e);
    res.status(502).json({ ok: false, error: 'xtream-upstream-error' });
  }
});

// Proxy للـ stream نفسه (اختياري - لو حابب تشغّل الفيديو عبر Railway)
// GET /stream/:type/:id?ext=mp4
// type = movie | series | live
app.get('/stream/:type/:id', vpnGuard, async (req, res) => {
  if (!XTREAM_SERVER || !XTREAM_USER || !XTREAM_PASS) {
    return res.status(500).json({ ok: false, error: 'XTREAM env vars not set' });
  }

  const { type, id } = req.params;
  const ext = (req.query.ext || 'mp4').toString().replace(/[^0-9a-z]/gi, '');

  const base = XTREAM_SERVER.replace(/\/$/, '');
  let pathType = 'movie';
  if (type === 'live')   pathType = 'live';
  if (type === 'series') pathType = 'series';

  const target = `${base}/${pathType}/${encodeURIComponent(XTREAM_USER)}/${encodeURIComponent(XTREAM_PASS)}/${encodeURIComponent(id)}.${ext}`;
  console.log('⏩ Proxy stream:', target);

  try {
    const upstream = await fetch(target);

    if (!upstream.ok) {
      console.error('upstream stream status:', upstream.status);
      res.status(upstream.status).end();
      return;
    }

    // نسخ الهيدر (بدون transfer-encoding)
    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'transfer-encoding') return;
      res.setHeader(key, value);
    });

    // تمرير الستريم مباشرة للعميل
    upstream.body.pipe(res);

  } catch (e) {
    console.error('stream proxy error:', e.message || e);
    res.status(502).end();
  }
});

// تشغيل السيرفر
app.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
});
