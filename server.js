// ================================
// IPTV Backend + VPN Protection
// ================================

import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// ================================
// Environment Variables
// ================================
const PORT = process.env.PORT || 8080;
const XTREAM_SERVER = process.env.XTREAM_SERVER;
const XTREAM_USER = process.env.XTREAM_USER;
const XTREAM_PASS = process.env.XTREAM_PASS;

const PROXYCHECK_KEY = process.env.PROXYCHECK_KEY || "";
const PROXYCHECK_TIMEOUT = parseInt(process.env.PROXYCHECK_TIMEOUT || "3000", 10);

// ================================
// VPN CHECK FUNCTION
// ================================
async function isVpn(ip) {
  try {
    const url = `https://proxycheck.io/v2/${ip}?key=${PROXYCHECK_KEY}&vpn=1&asn=1`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROXYCHECK_TIMEOUT);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    const data = await res.json();

    if (data[ip] && data[ip].proxy === "yes") return true;
    return false;
  } catch (e) {
    console.log("VPN API Error:", e.message);
    return false; // فشل الفحص = نسمح بالمرور
  }
}

// ================================
// Request Logger
// ================================
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ip=${req.ip}`);
  next();
});

// ================================
// VPN PROTECTION MIDDLEWARE
// ================================
app.use(async (req, res, next) => {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.ip;

  if (!PROXYCHECK_KEY) {
    console.log("WARNING: PROXYCHECK_KEY missing ➜ allowing traffic");
    return next();
  }

  const blocked = await isVpn(ip);
  if (blocked) {
    return res.status(403).json({
      ok: false,
      message: "VPN Detected — Access Denied"
    });
  }

  next();
});

// ================================
// BASIC HOME ROUTE
// ================================
app.get("/", (req, res) => {
  res.send("API Running ✓");
});

// ================================
// XTREAM API PROXY
// ================================
app.get("/api/xtream", async (req, res) => {
  if (!XTREAM_SERVER || !XTREAM_USER || !XTREAM_PASS) {
    return res.status(500).json({ ok: false, error: "XTREAM variables missing" });
  }

  const { action, stream_id, series_id } = req.query;

  try {
    const url = `${XTREAM_SERVER}/player_api.php?username=${XTREAM_USER}&password=${XTREAM_PASS}&action=${action}${
      stream_id ? `&stream_id=${stream_id}` : ""
    }${series_id ? `&series_id=${series_id}` : ""}`;

    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ================================
// START SERVER
// ================================
app.listen(PORT, () => {
  console.log(`🔥 Server Running on port ${PORT}`);
});
