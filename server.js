const express = require("express");
const crypto = require("crypto");
const axios = require("axios");

const app = express();
app.use(express.json());

// ================= إعدادات التوكن =================

// مدة صلاحية التوكن (ساعة واحدة)
const TOKEN_EXPIRY = 60 * 60 * 1000;

// توليد توكن جديد
function generateToken() {
  const token = crypto.randomBytes(16).toString("hex");
  const expiresAt = Date.now() + TOKEN_EXPIRY;
  return { token, expiresAt };
}

// "قاعدة بيانات" بسيطة في الرام (مش قاعدة بيانات حقيقية)
let tokens = {};

// ================= إعدادات Xtream =================

// عنوان السيرفر الأساسي (لو ما حطيناش Env هيستخدم xtvip.net)
const XTREAM_BASE = process.env.XTREAM_BASE || "http://xtvip.net";

// اسم المستخدم والباسورد (مينفعش نكتبهم في الكود عشان الريبو Public)
const XTREAM_USERNAME = process.env.XTREAM_USERNAME;
const XTREAM_PASSWORD = process.env.XTREAM_PASSWORD;

// هنا هنتخزن القنوات بعد ما نسحبها من Xtream
// الشكل هيبقى مثلاً: { "1234": { name: "Channel name", url: "http://...m3u8" } }
let CHANNELS = {};

// دالة تسحب القنوات (live streams) من Xtream تلقائيًا
async function loadChannelsFromXtream() {
  try {
    if (!XTREAM_USERNAME || !XTREAM_PASSWORD) {
      console.error("❌ XTREAM_USERNAME أو XTREAM_PASSWORD مش متضبوطة في Environment Variables");
      return;
    }

    const apiUrl = `${XTREAM_BASE}/player_api.php?username=${XTREAM_USERNAME}&password=${XTREAM_PASSWORD}&action=get_live_streams`;

    console.log("🔄 Fetching channels from:", apiUrl);

    const response = await axios.get(apiUrl, { timeout: 15000 });
    const data = response.data;

    if (!Array.isArray(data)) {
      console.error("❌ رد Xtream مش Array زي المتوقع");
      return;
    }

    const map = {};

    // كل قناة ليها stream_id و name
    for (const ch of data) {
      const id = String(ch.stream_id);
      map[id] = {
        name: ch.name || `Channel ${id}`,
        // لينك التشغيل الحقيقي من Xtream:
        url: `${XTREAM_BASE}/live/${XTREAM_USERNAME}/${XTREAM_PASSWORD}/${id}.m3u8`
      };
    }

    CHANNELS = map;

    console.log(`✅ Loaded ${Object.keys(CHANNELS).length} channels from Xtream`);
  } catch (err) {
    console.error("❌ Error loading channels from Xtream:", err.message);
  }
}

// نحمّل القنوات أول ما السيرفر يشتغل
loadChannelsFromXtream();

// ونجدد القنوات كل 15 دقيقة
setInterval(loadChannelsFromXtream, 15 * 60 * 1000);

// ==================== APIs ====================

// صفحة بسيطة للتجربة
app.get("/", (req, res) => {
  res.json({
    message: "IPTV Backend is running ✅",
    info: "Use /token then /playlist.m3u?token=... or /stream/:id?token=...",
  });
});

// GET /token  → يرجّع توكن جديد
app.get("/token", (req, res) => {
  const { token, expiresAt } = generateToken();
  tokens[token] = expiresAt;

  res.json({
    success: true,
    token,
    expiresAt
  });
});

// GET /channels → يرجّع قائمة القنوات (من Xtream بعد ما اتحملت)
app.get("/channels", (req, res) => {
  res.json({
    success: true,
    count: Object.keys(CHANNELS).length,
    channels: CHANNELS
  });
});

// GET /playlist.m3u?token=XXXXX
// يرجّع ملف M3U جاهز يتحط في أي IPTV Player
app.get("/playlist.m3u", (req, res) => {
  const token = req.query.token;

  if (!token) return res.status(400).send("Missing token");
  if (!tokens[token]) return res.status(403).send("Invalid token");

  if (Date.now() > tokens[token]) {
    delete tokens[token];
    return res.status(403).send("Token expired");
  }

  if (Object.keys(CHANNELS).length === 0) {
    return res.status(500).send("Channels not loaded yet");
  }

  const baseUrl = `${req.protocol}://${req.get("host")}`;
  let lines = ["#EXTM3U"];

  for (const [id, ch] of Object.entries(CHANNELS)) {
    lines.push(`#EXTINF:-1,${ch.name}`);
    lines.push(`${baseUrl}/stream/${id}?token=${token}`);
  }

  res.setHeader("Content-Type", "audio/x-mpegurl");
  res.send(lines.join("\n"));
});

// GET /stream/:id?token=XXXXX
// يشغّل قناة واحدة عن طريق الـ id (Redirect للينك الأصلي من Xtream)
app.get("/stream/:id", (req, res) => {
  const token = req.query.token;
  const id = req.params.id;

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

  const channel = CHANNELS[id];

  if (!channel) {
    return res.status(404).send("Channel not found");
  }

  console.log("▶ Redirect channel:", id, "->", channel.url);

  return res.redirect(channel.url);
});

// تشغيل السيرفر على Railway
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT);
});
