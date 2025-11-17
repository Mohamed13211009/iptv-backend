const express = require("express");
const crypto = require("crypto");
const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;

// مدة صلاحية التوكن 10 دقايق
const TOKEN_EXPIRY = 10 * 60 * 1000;

// توليد توكن مؤقت
function generateToken() {
  const token = crypto.randomBytes(16).toString("hex");
  const expiresAt = Date.now() + TOKEN_EXPIRY;

  return { token, expiresAt };
}

// قاعدة بيانات بسيطة في الذاكرة
let tokens = {};

// API لتوليد توكن جديد
app.get("/token", (req, res) => {
  const { token, expiresAt } = generateToken();
  tokens[token] = expiresAt;

  res.json({
    success: true,
    token,
    expiresAt,
  });
});

// API لجلب رابط IPTV محمي
app.get("/stream", (req, res) => {
  const token = req.query.token;
  const originalUrl = req.query.url;

  if (!token || !originalUrl)
    return res.json({ success: false, error: "Missing parameters" });

  if (!tokens[token])
    return res.json({ success: false, error: "Invalid token" });

  if (Date.now() > tokens[token]) {
    delete tokens[token];
    return res.json({ success: false, error: "Token expired" });
  }

  res.json({
    success: true,
    stream: originalUrl,
  });
});

// تشغيل السيرفر
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
