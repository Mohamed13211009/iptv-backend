const express = require("express");
const crypto = require("crypto");
const axios = require("axios");
const app = express();

app.use(express.json());

// ========== إعدادات التوكن ==========
const TOKEN_EXPIRY = 60 * 60 * 1000; // ساعة

// تخزين التوكنات في الرام (بسيط)
const tokens = {};

// توليد توكن جديد
function generateToken() {
  const token = crypto.randomBytes(16).toString("hex");
  const expiresAt = Date.now() + TOKEN_EXPIRY;
  tokens[token] = expiresAt;
  return { token, expiresAt };
}

// التحقق من التوكن
function verifyToken(token) {
  if (!token || !tokens[token]) return false;
  if (Date.now() > tokens[token]) {
    delete tokens[token];
    return false;
  }
  return true;
}

// ========== إعدادات سيرفر Xtream ==========
const XTREAM_BASE = process.env.XTREAM_BASE || "http://xtvip.net";
const XTREAM_USER = process.env.XTREAM_USER || "watch1235";
const XTREAM_PASS = process.env.XTREAM_PASS || "742837399";

function xtreamBaseUrl() {
  return XTREAM_BASE.replace(/\/$/, "");
}

// يبني Path الخاص بالستريم حسب النوع
function buildStreamPath(kind, id, extOverride) {
  const base = xtreamBaseUrl();
  const u = encodeURIComponent(XTREAM_USER);
  const p = encodeURIComponent(XTREAM_PASS);

  let ext = (extOverride || "").toLowerCase().replace(/^\./, "");

  if (!ext) {
    if (kind === "live") ext = "m3u8";
    else ext = "mkv";
  }

  if (kind === "live") {
    return `${base}/live/${u}/${p}/${id}.${ext}`;
  }

  if (kind === "series") {
    return `${base}/series/${u}/${p}/${id}.${ext}`;
  }

  // vod / movie
  return `${base}/movie/${u}/${p}/${id}.${ext}`;
}

// دالة عامة تنادي player_api من Xtream
async function callXtreamAPI(action, extraParams = {}) {
  const base = xtreamBaseUrl();
  const params = {
    username: XTREAM_USER,
    password: XTREAM_PASS,
    action,
    ...extraParams,
  };

  const url = `${base}/player_api.php`;
  const res = await axios.get(url, { params, timeout: 10000 });
  return res.data;
}

// ========== Endpoints التوكن ==========

// GET /token → يرجّع توكن جديد
app.get("/token", (req, res) => {
  const { token, expiresAt } = generateToken();
  res.json({
    success: true,
    token,
    expiresAt,
  });
});

// ========== Endpoints XTREAM JSON (قنوات/أفلام/مسلسلات) ==========
// كل دول محتاجين token علشان التطبيق ما يناديش Xtream مباشرة

// GET /xtream/live?token=XXX
app.get("/xtream/live", async (req, res) => {
  const token = req.query.token;
  if (!verifyToken(token)) {
    return res.status(403).json({ success: false, error: "Invalid or expired token" });
  }

  try {
    const data = await callXtreamAPI("get_live_streams");
    res.json({ success: true, data });
  } catch (e) {
    console.error("xtream live error", e.message);
    res.status(500).json({ success: false, error: "xtream live failed" });
  }
});

// GET /xtream/vod?token=XXX
app.get("/xtream/vod", async (req, res) => {
  const token = req.query.token;
  if (!verifyToken(token)) {
    return res.status(403).json({ success: false, error: "Invalid or expired token" });
  }

  try {
    const data = await callXtreamAPI("get_vod_streams");
    res.json({ success: true, data });
  } catch (e) {
    console.error("xtream vod error", e.message);
    res.status(500).json({ success: false, error: "xtream vod failed" });
  }
});

// GET /xtream/series?token=XXX
app.get("/xtream/series", async (req, res) => {
  const token = req.query.token;
  if (!verifyToken(token)) {
    return res.status(403).json({ success: false, error: "Invalid or expired token" });
  }

  try {
    const data = await callXtreamAPI("get_series");
    res.json({ success: true, data });
  } catch (e) {
    console.error("xtream series error", e.message);
    res.status(500).json({ success: false, error: "xtream series failed" });
  }
});

// تقدر تزود Endpoints تانية للـ categories لو حبيت:
// get_vod_categories, get_series_categories, get_live_categories

// ========== Playlist M3U جاهزة لأي Player ==========
// GET /playlist.m3u?token=XXX&kind=live|vod
app.get("/playlist.m3u", async (req, res) => {
  const { token, kind } = req.query;

  if (!verifyToken(token)) {
    return res.status(403).send("#EXTM3U\n# Token invalid or expired");
  }

  const type = (kind || "live").toLowerCase();
  let action;
  if (type === "live") action = "get_live_streams";
  else if (type === "vod") action = "get_vod_streams";
  else action = "get_live_streams";

  try {
    const data = await callXtreamAPI(action);
    let list = [];

    // نحاول نستخرج Array من الرد
    let arr = [];
    if (Array.isArray(data)) arr = data;
    else if (data && typeof data === "object") {
      for (const k of Object.keys(data)) {
        if (Array.isArray(data[k])) {
          arr = data[k];
          break;
        }
      }
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;

    list.push("#EXTM3U");
    arr.forEach((item) => {
      const name =
        item.name ||
        item.stream_display_name ||
        item.title ||
        item.channel ||
        "No Name";

      const id =
        item.stream_id ||
        item.series_id ||
        item.movie_id ||
        item.channel_id ||
        item.epg_channel_id;

      if (!id) return;

      list.push(`#EXTINF:-1,${name}`);
      list.push(`${baseUrl}/stream/${type}/${id}?token=${token}`);
    });

    res.setHeader("Content-Type", "audio/x-mpegurl");
    res.send(list.join("\n"));
  } catch (e) {
    console.error("playlist error", e.message);
    res.status(500).send("#EXTM3U\n# error building playlist");
  }
});

// ========== Streaming Proxy (LIVE / VOD / SERIES) ==========
// GET /stream/live/:id?token=XXX&ext=m3u8
// GET /stream/vod/:id?token=XXX&ext=mkv
// GET /stream/series/:id?token=XXX&ext=mkv

async function proxyStream(kind, id, token, ext, res) {
  if (!verifyToken(token)) {
    return res.status(403).send("Invalid or expired token");
  }

  const upstreamUrl = buildStreamPath(kind, id, ext);

  console.log("proxyStream ->", kind, id, "=>", upstreamUrl);

  try {
    const upstream = await axios({
      method: "GET",
      url: upstreamUrl,
      responseType: "stream",
      timeout: 15000,
      validateStatus: () => true,
    });

    if (upstream.status >= 400) {
      console.error("upstream status", upstream.status);
      res.status(upstream.status).send("Upstream error");
      return;
    }

    // مرر Content-Type لو موجود
    const ct = upstream.headers["content-type"];
    if (ct) {
      res.setHeader("Content-Type", ct);
    }

    upstream.data.pipe(res);
  } catch (e) {
    console.error("proxyStream error", e.message);
    res.status(500).send("Proxy stream error");
  }
}

// LIVE
app.get("/stream/live/:id", async (req, res) => {
  const { id } = req.params;
  const { token, ext } = req.query;
  proxyStream("live", id, token, ext, res);
});

// VOD (أفلام)
app.get("/stream/vod/:id", async (req, res) => {
  const { id } = req.params;
  const { token, ext } = req.query;
  proxyStream("vod", id, token, ext, res);
});

// SERIES (حلقات المسلسلات)
app.get("/stream/series/:id", async (req, res) => {
  const { id } = req.params;
  const { token, ext } = req.query;
  proxyStream("series", id, token, ext, res);
});

// ========== تشغيل السيرفر على Railway ==========
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
