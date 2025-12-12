import express from "express";
import fetchPkg from "node-fetch";

const fetchFn = globalThis.fetch ?? fetchPkg;
const app = express();
app.disable("x-powered-by");

// ===== Security Headers =====
app.use((req, res, next) => {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; frame-src 'none'; object-src 'none'; connect-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline';"
  );
  next();
});

// ===== Secrets from ENV =====
const SUB_BASE_URL = process.env.SUB_BASE_URL;   // https://xtvip.net
const SUB_USERNAME = process.env.SUB_USERNAME;   // watch1235
const SUB_PASSWORD = process.env.SUB_PASSWORD;   // 742837399

function base() {
  return SUB_BASE_URL.replace(/\/$/, "");
}

// ===== Health check =====
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// ===== Xtream Codes player_api proxy =====
app.get("/api/player_api", async (req, res) => {
  try {
    const action = req.query.action;
    const series_id = req.query.series_id;

    if (!action) return res.status(400).json({ error: "missing action" });

    const url = new URL(base() + "/player_api.php");
    url.searchParams.set("username", SUB_USERNAME);
    url.searchParams.set("password", SUB_PASSWORD);
    url.searchParams.set("action", action);
    if (series_id) url.searchParams.set("series_id", series_id);

    const r = await fetchFn(url.toString());
    const buf = Buffer.from(await r.arrayBuffer());

    res.status(r.status);
    res.setHeader("Content-Type", r.headers.get("content-type") || "application/json");
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: "player_api_failed", message: e.message });
  }
});

// ===== Stream proxy (movie / live / series) =====
app.get("/api/stream", async (req, res) => {
  try {
    const { type = "movie", id, ext = "mp4" } = req.query;
    if (!id) return res.status(400).json({ error: "missing id" });

    const path =
      type === "live"
        ? "live"
        : type === "series"
        ? "series"
        : "movie";

    const url = `${base()}/${path}/${SUB_USERNAME}/${SUB_PASSWORD}/${id}.${ext}`;

    const r = await fetchFn(url);
    const buf = Buffer.from(await r.arrayBuffer());

    res.status(r.status);
    if (r.headers.get("content-type")) {
      res.setHeader("Content-Type", r.headers.get("content-type"));
    }
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: "stream_failed", message: e.message });
  }
});

// ===== Serve HTML =====
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port", PORT));
