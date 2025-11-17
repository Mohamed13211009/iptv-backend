const express = require("express");
const crypto  = require("crypto");
const app     = express();

app.use(express.json());

// 🕒 مدة صلاحية التوكن (ساعة)
const TOKEN_EXPIRY = 60 * 60 * 1000;

// 🔐 بيانات سيرفر Xtream
// الأفضل تحطهم كـ Environment Variables في Railway
const XTREAM_BASE = process.env.XTREAM_BASE || "http://xtvip.net";
const XTREAM_USER = process.env.XTREAM_USER || "watch1235";
const XTREAM_PASS = process.env.XTREAM_PASS || "742837399";

// "قاعدة بيانات" بسيطة للتوكنات في الرام
let tokens = {};

// توليد توكن جديد
function generateToken() {
  const token     = crypto.randomBytes(16).toString("hex");
  const expiresAt = Date.now() + TOKEN_EXPIRY;
  tokens[token]   = expiresAt;
  return { token, expiresAt };
}

// التحقق من التوكن
function validateToken(token) {
  if (!token) return { ok: false, reason: "Missing token" };
  const expiresAt = tokens[token];
  if (!expiresAt) return { ok: false, reason: "Invalid token" };

  if (Date.now() > expiresAt) {
    delete tokens[token];
    return { ok: false, reason: "Token expired" };
  }
  return { ok: true, expiresAt };
}

// ميدل وير إلزام التوكن
function requireToken(req, res, next) {
  const token = req.query.token;
  const check = validateToken(token);

  if (!check.ok) {
    return res.status(403).send(check.reason);
  }

  req.token = token;
  next();
}

// بناء لينك Xtream حسب النوع
function buildXtreamUrl(kind, id, ext) {
  const base = XTREAM_BASE.replace(/\/$/, "");
  const user = encodeURIComponent(XTREAM_USER);
  const pass = encodeURIComponent(XTREAM_PASS);
  const sid  = encodeURIComponent(id);

  const cleanExt = ext && String(ext).trim()
    ? String(ext).replace(/^\./, "")
    : null;

  if (kind === "live") {
    const e = cleanExt || "m3u8";
    return `${base}/live/${user}/${pass}/${sid}.${e}`;
  }

  if (kind === "series") {
    const e = cleanExt || "mp4";
    return `${base}/series/${user}/${pass}/${sid}.${e}`;
  }

  // VOD / Movies
  const e = cleanExt || "mkv";
  return `${base}/movie/${user}/${pass}/${sid}.${e}`;
}

// ==================== APIs ====================

// GET /token → يرجّع توكن جديد
app.get("/token", (req, res) => {
  const { token, expiresAt } = generateToken();
  res.json({ success: true, token, expiresAt });
});

// 🔴 بث مباشر: GET /stream/live/:id?token=...&ext=m3u8
app.get("/stream/live/:id", requireToken, (req, res) => {
  const { id } = req.params;
  const ext    = req.query.ext || "m3u8";
  const url    = buildXtreamUrl("live", id, ext);
  return res.redirect(url);
});

// 🎬 أفلام (VOD): GET /stream/vod/:id?token=...&ext=mkv
app.get("/stream/vod/:id", requireToken, (req, res) => {
  const { id } = req.params;
  const ext    = req.query.ext || req.query.container || "mkv";
  const url    = buildXtreamUrl("vod", id, ext);
  return res.redirect(url);
});

// 📺 مسلسلات (حلقات): GET /stream/series/:id?token=...&ext=mp4
app.get("/stream/series/:id", requireToken, (req, res) => {
  const { id } = req.params;
  const ext    = req.query.ext || "mp4";
  const url    = buildXtreamUrl("series", id, ext);
  return res.redirect(url);
});

// اختبار بسيط
app.get("/", (req, res) => {
  res.json({ ok: true, message: "IPTV backend running" });
});

// تشغيل السيرفر على Railway
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
