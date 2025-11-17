// server.js
// IPTV secure backend with stateless tokens

const express = require("express");
const crypto = require("crypto");
const axios = require("axios");

const app = express();
app.use(express.json());

// ===== إعداد بيانات سيرفر IPTV =====
// يفضّل تحط دول كـ Environment Variables في Railway
const IPTV_SERVER =
  (process.env.IPTV_SERVER_URL || "http://xtvip.net").replace(/\/$/, "");
const IPTV_USER = process.env.IPTV_USERNAME || "watch1235";
const IPTV_PASS = process.env.IPTV_PASSWORD || "742837399";

// مدة صلاحية التوكن (مثلاً 60 دقيقة)
const TOKEN_EXPIRY_MS = 60 * 60 * 1000;

// سر داخلي لتوقيع التوكن
const BACKEND_SECRET = process.env.BACKEND_SECRET || "very-strong-secret-change-me";

// ===== دوال التوكن stateless =====
function generateToken() {
  const expiresAt = Date.now() + TOKEN_EXPIRY_MS;
  const payload = String(expiresAt);
  const signature = crypto
    .createHmac("sha256", BACKEND_SECRET)
    .update(payload)
    .digest("hex");

  // التوكن عبارة عن: expiresAt.signature
  const token = `${expiresAt}.${signature}`;
  return { token, expiresAt };
}

function verifyToken(token) {
  if (!token || typeof token !== "string") return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const expiresAt = Number(parts[0]);
  const signature = parts[1];

  if (!expiresAt || !signature) return false;
  if (Date.now() > expiresAt) return false;

  const expectedSig = crypto
    .createHmac("sha256", BACKEND_SECRET)
    .update(String(expiresAt))
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSig)
  );
}

// ميدل وير لفحص التوكن في كل طلب محمي
function requireToken(req, res, next) {
  const token =
    req.query.token ||
    req.headers["x-token"] ||
    req.headers["x-access-token"];

  if (!verifyToken(token)) {
    return res
      .status(401)
      .json({ success: false, error: "Invalid token" });
  }
  next();
}

// ==================== Routes ====================

// 🎫 GET /token → يرجّع توكن جديد للتطبيق
app.get("/token", (req, res) => {
  const { token, expiresAt } = generateToken();
  res.json({ success: true, token, expiresAt });
});

// 🩺 اختبار بسيط: GET /ping
app.get("/ping", (req, res) => {
  res.json({ ok: true, time: Date.now() });
});

// 🧠 دالة عامة تطلب من player_api.php
async function callXtream(action, extra = {}) {
  const params = {
    username: IPTV_USER,
    password: IPTV_PASS,
    action,
    ...extra,
  };

  const url = `${IPTV_SERVER}/player_api.php`;
  const resp = await axios.get(url, { params, timeout: 15000 });
  return resp.data;
}

// ========= API للـقوائم (VOD / Series / Live) =========

// كل الـ /api/* محتاجة توكن
app.use("/api", requireToken);

// VOD
app.get("/api/vod/streams", async (req, res) => {
  try {
    const data = await callXtream("get_vod_streams");
    res.json({ success: true, data });
  } catch (e) {
    console.error("vod/streams error", e.message);
    res.status(500).json({ success: false, error: "vod error" });
  }
});

app.get("/api/vod/categories", async (req, res) => {
  try {
    const data = await callXtream("get_vod_categories");
    res.json({ success: true, data });
  } catch (e) {
    console.error("vod/categories error", e.message);
    res.status(500).json({ success: false, error: "vod cat error" });
  }
});

// Series
app.get("/api/series/list", async (req, res) => {
  try {
    const data = await callXtream("get_series");
    res.json({ success: true, data });
  } catch (e) {
    console.error("series/list error", e.message);
    res.status(500).json({ success: false, error: "series error" });
  }
});

app.get("/api/series/categories", async (req, res) => {
  try {
    const data = await callXtream("get_series_categories");
    res.json({ success: true, data });
  } catch (e) {
    console.error("series/categories error", e.message);
    res.status(500).json({ success: false, error: "series cat error" });
  }
});

app.get("/api/series/info/:id", async (req, res) => {
  try {
    const series_id = req.params.id;
    const data = await callXtream("get_series_info", { series_id });
    res.json({ success: true, data });
  } catch (e) {
    console.error("series/info error", e.message);
    res.status(500).json({ success: false, error: "series info error" });
  }
});

// Live
app.get("/api/live/streams", async (req, res) => {
  try {
    const data = await callXtream("get_live_streams");
    res.json({ success: true, data });
  } catch (e) {
    console.error("live/streams error", e.message);
    res.status(500).json({ success: false, error: "live error" });
  }
});

app.get("/api/live/categories", async (req, res) => {
  try {
    const data = await callXtream("get_live_categories");
    res.json({ success: true, data });
  } catch (e) {
    console.error("live/categories error", e.message);
    res.status(500).json({ success: false, error: "live cat error" });
  }
});

// ========= Stream redirect (live / vod / series) =========
// GET /api/stream?type=live|vod|series&id=XXXX&token=...

app.get("/api/stream", requireToken, (req, res) => {
  const type = req.query.type;
  const id = req.query.id;

  if (!type || !id) {
    return res.status(400).send("Missing type or id");
  }

  let path;
  if (type === "live") {
    path = `/live/${IPTV_USER}/${IPTV_PASS}/${id}.m3u8`;
  } else if (type === "vod") {
    path = `/movie/${IPTV_USER}/${IPTV_PASS}/${id}.m3u8`;
  } else if (type === "series") {
    path = `/series/${IPTV_USER}/${IPTV_PASS}/${id}.m3u8`;
  } else {
    return res.status(400).send("Invalid type");
  }

  const redirectUrl = IPTV_SERVER + path;
  return res.redirect(redirectUrl);
});

// ===== تشغيل السيرفر على Railway =====
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
