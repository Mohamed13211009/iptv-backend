const express = require("express");
const crypto = require("crypto");
const app = express();

app.use(express.json());

// 🕒 مدة صلاحية التوكن (هنا 60 دقيقة = ساعة واحدة)
const TOKEN_EXPIRY = 60 * 60 * 1000;

// 📺 هنا بتحط قنواتك
// غيّر الأمثلة دي وحط لينكات الـ m3u8 الحقيقية
const CHANNELS = {
  test1: {
    name: "Test Channel 1",
    url: "http://example.com/channel1.m3u8",
  },
  test2: {
    name: "Test Channel 2",
    url: "http://example.com/channel2.m3u8",
  },
  // زوّد قنوات كده:
  // bein1: { name: "Bein Sports 1", url: "http://.....m3u8" },
};

// 🔐 توليد توكن
function generateToken() {
  const token = crypto.randomBytes(16).toString("hex");
  const expiresAt = Date.now() + TOKEN_EXPIRY;
  return { token, expiresAt };
}

// "قاعدة بيانات" بسيطة في الرام
let tokens = {};

// ==================== APIs ====================

// GET /token  → يرجّع توكن جديد
app.get("/token", (req, res) => {
  const { token, expiresAt } = generateToken();
  tokens[token] = expiresAt;

  res.json({
    success: true,
    token,
    expiresAt,
  });
});

// GET /channels → يرجّع قائمة القنوات (JSON) عادي لو حابب تشوفها
app.get("/channels", (req, res) => {
  res.json({ success: true, channels: CHANNELS });
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
// يشغّل قناة واحدة عن طريق الـ id
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

  // 🔁 Redirect مباشر لللينك الحقيقي للقناة
  return res.redirect(channel.url);
});

// تشغيل السيرفر على Railway
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
