const express = require("express");
const crypto = require("crypto");

const app = express();

// خلي Railway يختار البورت من المتغير PORT
const PORT = process.env.PORT || 3000;

app.use(express.json());

// مدة صلاحية التوكن 10 دقائق
const TOKEN_EXPIRY = 10 * 60 * 1000;

// قاعدة بيانات بسيطة في الذاكرة لتخزين التوكنات
let tokens = {};

// دالة لتوليد توكن جديد
function generateToken() {
  const token = crypto.randomBytes(16).toString("hex");
  const expiresAt = Date.now() + TOKEN_EXPIRY;
  return { token, expiresAt };
}

// صفحة تجريب بسيطة على /
app.get("/", (req, res) => {
  res.json({
    message: "IPTV backend is running ✅",
    endpoints: {
      token: "/token",
      stream: "/stream?token=YOUR_TOKEN&url=YOUR_IPTV_URL",
    },
  });
});

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

// API لجلب رابط IPTV محمي بالتوكن
app.get("/stream", (req, res) => {
  const token = req.query.token;
  const originalUrl = req.query.url;

  if (!token || !originalUrl) {
    return res.status(400).json({
      success: false,
      error: "Missing parameters: token or url",
    });
  }

  if (!tokens[token]) {
    return res.status(401).json({
      success: false,
      error: "Invalid token",
    });
  }

  if (Date.now() > tokens[token]) {
    delete tokens[token];
    return res.status(401).json({
      success: false,
      error: "Token expired",
    });
  }

  // هنا تقدر ترجع الرابط زي ما هو أو تولّد رابط Proxy
  res.json({
    success: true,
    stream: originalUrl,
  });
});

// تشغيل السيرفر
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
