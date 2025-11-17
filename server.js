const express = require("express");
const crypto = require("crypto");
const app = express();

app.use(express.json());

// مدة صلاحية التوكن (ساعة)
const TOKEN_EXPIRY = 60 * 60 * 1000;

// بيانات سيرفر Xtream (حطها في ENV أو سيب الديفولت لو انت نفس البيانات)
const XTREAM_SERVER = process.env.XTREAM_SERVER || "http://xtvip.net";
const XTREAM_USER   = process.env.XTREAM_USER   || "watch1235";
const XTREAM_PASS   = process.env.XTREAM_PASS   || "742837399";

// دالة تبني لينك Xtream من غير ما نكشف البيانات للعميل
function buildXtreamUrl(kind, id, ext) {
  const base = XTREAM_SERVER.replace(/\/$/, "");
  const u = encodeURIComponent(XTREAM_USER);
  const p = encodeURIComponent(XTREAM_PASS);

  if (kind === "live") {
    // البث المباشر m3u8
    return `${base}/live/${u}/${p}/${id}.${ext || "m3u8"}`;
  }

  if (kind === "series") {
    // حلقات المسلسلات
    return `${base}/series/${u}/${p}/${id}.${ext || "mkv"}`;
  }

  // أفلام VOD (movie)
  return `${base}/movie/${u}/${p}/${id}.${ext || "mkv"}`;
}

// "قاعدة بيانات" التوكنات في الرام
let tokens = {};

// ---------------- توكن جديد ----------------
function generateToken() {
  const token = crypto.randomBytes(16).toString("hex");
  const expiresAt = Date.now() + TOKEN_EXPIRY;
  return { token, expiresAt };
}

app.get("/token", (req, res) => {
  const { token, expiresAt } = generateToken();
  tokens[token] = expiresAt;

  res.json({
    success: true,
    token,
    expiresAt,
  });
});

// ---------------- ستريم محمي ----------------
// GET /stream/:id?token=XXX&kind=live|movie|series&ext=m3u8
app.get("/stream/:id", (req, res) => {
  const id = req.params.id;
  const { token, kind, ext } = req.query;

  if (!token || !id) {
    return res.status(400).send("Missing parameters");
  }

  if (!tokens[token]) {
    return res.status(403).send("Invalid token");
  }

  if (Date.now() > tokens[token]) {
    delete tokens[token];
    return res.status(403).send("Token expired");
  }

  // ابني لينك Xtream الحقيقي
  const url = buildXtreamUrl(kind || "movie", id, ext || "");

  if (!url) {
    return res.status(404).send("Channel not found");
  }

  // Redirect مباشر لللينك الحقيقي – العميل ما يشوفش بيانات Xtream
  return res.redirect(url);
});

// تشغيل السيرفر على Railway
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
