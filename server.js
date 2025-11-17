const express = require("express");
const crypto = require("crypto");
const axios = require("axios");

const app = express();
app.use(express.json());

// ============ إعدادات الحماية ============
const TOKEN_EXPIRY = 60 * 1000; // 60 ثانية
const IPTV_SERVER = "http://xtvip.net";
const IPTV_USER = "watch1235";
const IPTV_PASS = "742837399";

// قاعدة بيانات صغيرة داخل الذاكرة
let tokens = {};

// ============= إنشاء توكن مؤقت ============
function generateToken() {
  const token = crypto.randomBytes(16).toString("hex");
  const expiresAt = Date.now() + TOKEN_EXPIRY;
  return { token, expiresAt };
}

// API : إنشاء توكن
app.get("/token", (req, res) => {
  const { token, expiresAt } = generateToken();
  tokens[token] = expiresAt;
  res.json({ success: true, token, expiresAt });
});

// ============= التحقق من التوكن ============
function checkToken(token) {
  if (!token) return false;
  if (!tokens[token]) return false;
  if (Date.now() > tokens[token]) {
    delete tokens[token];
    return false;
  }
  return true;
}

// ============= جلب بيانات ال API من Xtream ============
async function xtream(action) {
  const url =
    `${IPTV_SERVER}/player_api.php?username=${IPTV_USER}&password=${IPTV_PASS}` +
    `&action=${action}`;

  const res = await axios.get(url, { timeout: 10000 });
  return res.data;
}

// ============= جلب قائمة الأفلام ============
app.get("/api/movies", async (req, res) => {
  const token = req.query.token;

  if (!checkToken(token)) {
    return res.status(403).json({ success: false, error: "Invalid token" });
  }

  try {
    const data = await xtream("get_vod_streams");
    res.json({ success: true, items: data });
  } catch (e) {
    res.json({ success: false, error: "Failed to fetch movies" });
  }
});

// ============= جلب قائمة المسلسلات ============
app.get("/api/series", async (req, res) => {
  const token = req.query.token;

  if (!checkToken(token)) {
    return res.status(403).json({ success: false, error: "Invalid token" });
  }

  try {
    const data = await xtream("get_series");
    res.json({ success: true, items: data });
  } catch (e) {
    res.json({ success: false, error: "Failed to fetch series" });
  }
});

// ============= جلب قائمة البث المباشر ============
app.get("/api/live", async (req, res) => {
  const token = req.query.token;

  if (!checkToken(token)) {
    return res.status(403).json({ success: false, error: "Invalid token" });
  }

  try {
    const data = await xtream("get_live_streams");
    res.json({ success: true, items: data });
  } catch (e) {
    res.json({ success: false, error: "Failed to fetch live channels" });
  }
});

// ============= تشغيل قناة / فيلم / حلقة ============
app.get("/stream/:type/:id", (req, res) => {
  const token = req.query.token;
  const { type, id } = req.params;

  if (!checkToken(token)) {
    return res.status(403).send("Invalid or expired token");
  }

  let xtreamType = "";

  if (type === "movie") xtreamType = "movie";
  else if (type === "series") xtreamType = "series";
  else if (type === "live") xtreamType = "live";
  else return res.status(400).send("Invalid type");

  // الرابط الحقيقي — لن يراه المستخدم
  const redirectUrl = `${IPTV_SERVER}/${xtreamType}/${IPTV_USER}/${IPTV_PASS}/${id}.mp4`;

  return res.redirect(redirectUrl);
});

// ============= تشغيل السيرفر ============
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("IPTV Protected Backend is running on " + PORT));
