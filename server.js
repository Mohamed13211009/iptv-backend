// server.js
const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 8080;

// ===== إعداد حساب Xtream =====
const XTREAM_BASE = (process.env.XTREAM_BASE || "http://xtvip.net").replace(/\/$/, "");
const XTREAM_USER = process.env.XTREAM_USER || "watch1235";
const XTREAM_PASS = process.env.XTREAM_PASS || "742837399";

// دالة بسيطة لاستدعاء player_api
async function xtreamApi(params) {
  const url = `${XTREAM_BASE}/player_api.php`;
  const res = await axios.get(url, {
    params: {
      username: XTREAM_USER,
      password: XTREAM_PASS,
      ...params,
    },
    timeout: 10000,
  });
  return res.data;
}

app.get("/", (req, res) => {
  res.send("Backend running");
});

// ===== أفلام VOD =====
app.get("/api/movies", async (req, res) => {
  try {
    const [streams, cats] = await Promise.all([
      xtreamApi({ action: "get_vod_streams" }),
      xtreamApi({ action: "get_vod_categories" }),
    ]);

    res.json({
      success: true,
      cats,
      items: streams,
    });
  } catch (err) {
    res.json({ success: false, error: "movies_failed" });
  }
});

// ===== المسلسلات =====
app.get("/api/series", async (req, res) => {
  try {
    const [streams, cats] = await Promise.all([
      xtreamApi({ action: "get_series" }),
      xtreamApi({ action: "get_series_categories" }),
    ]);

    res.json({
      success: true,
      cats,
      items: streams,
    });
  } catch (err) {
    res.json({ success: false, error: "series_failed" });
  }
});

// ===== البث المباشر =====
app.get("/api/live", async (req, res) => {
  try {
    const [streams, cats] = await Promise.all([
      xtreamApi({ action: "get_live_streams" }),
      xtreamApi({ action: "get_live_categories" }),
    ]);

    res.json({
      success: true,
      cats,
      items: streams,
    });
  } catch (err) {
    res.json({ success: false, error: "live_failed" });
  }
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
