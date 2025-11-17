const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const app = express();
app.use(express.json());

// ====================== CONFIG ======================
const BASE = process.env.XTREAM_BASE;       // http://xtvip.net
const USER = process.env.XTREAM_USERNAME;   // watch1235
const PASS = process.env.XTREAM_PASSWORD;   // 742837399

// مدة صلاحية التوكن (ساعة)
const TOKEN_EXP = 60 * 60 * 1000;

// حفظ التوكنات في الرام
let tokens = {};

// ====================== TOKEN SYSTEM ======================
function generateToken() {
  const token = Date.now() + "." + crypto.randomBytes(32).toString("hex");
  const exp = Date.now() + TOKEN_EXP;
  tokens[token] = exp;
  return { token, exp };
}

function checkToken(tk) {
  if (!tk) return false;
  if (!tokens[tk]) return false;
  if (Date.now() > tokens[tk]) {
    delete tokens[tk];
    return false;
  }
  return true;
}

// ====================== ROUTES ======================

// الحصول على توكن جديد
app.get("/api/token", (req, res) => {
  const { token, exp } = generateToken();
  res.json({ success: true, token, expiresAt: exp });
});

// ---------------- LIVE CATEGORIES ----------------
app.get("/api/live/categories", async (req, res) => {
  const token = req.query.token;
  if (!checkToken(token)) return res.json({ success: false, error: "Invalid token" });

  try {
    const url = `${BASE}/player_api.php?username=${USER}&password=${PASS}&action=get_live_categories`;
    const { data } = await axios.get(url);
    res.json({ success: true, data });
  } catch (err) {
    res.json({ success: false, error: "live cat error" });
  }
});

// ---------------- LIVE CHANNELS ----------------
app.get("/api/live/channels", async (req, res) => {
  const token = req.query.token;
  if (!checkToken(token)) return res.json({ success: false, error: "Invalid token" });

  try {
    const url = `${BASE}/player_api.php?username=${USER}&password=${PASS}&action=get_live_streams`;
    const { data } = await axios.get(url);
    res.json({ success: true, data });
  } catch {
    res.json({ success: false, error: "live list error" });
  }
});

// ---------------- PLAY LIVE STREAM ----------------
app.get("/api/live/play", async (req, res) => {
  const token = req.query.token;
  const id = req.query.id;

  if (!checkToken(token)) return res.json({ success: false, error: "Invalid token" });
  if (!id) return res.json({ success: false, error: "missing stream id" });

  const streamURL = `${BASE}/live/${USER}/${PASS}/${id}.m3u8`;

  res.json({
    success: true,
    url: streamURL
  });
});

// ====================== SERVER ======================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("SERVER RUNNING on " + PORT));
