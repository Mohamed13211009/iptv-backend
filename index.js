const express = require("express");

const app = express();

// السماح للـ HTML بتاعك يطلب من الباك إند
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

// بيانات السيرفر الحقيقية تيجي من الـ env (مش في الكود)
const IPTV_BASE = process.env.IPTV_BASE;       // مثال: https://xtvip.net
const IPTV_USER = process.env.IPTV_USER;       // مثال: watch1235
const IPTV_PASS = process.env.IPTV_PASS;       // مثال: 742837399

if (!IPTV_BASE || !IPTV_USER || !IPTV_PASS) {
  console.warn("⚠️ لازم تضيف IPTV_BASE, IPTV_USER, IPTV_PASS في Variables على Railway");
}

// دالة تساعدنا ننقل الهيدر ونستقبل الستريم
async function proxyStream(upstreamUrl, clientRes) {
  try {
    const upstreamRes = await fetch(upstreamUrl);

    clientRes.status(upstreamRes.status);

    upstreamRes.headers.forEach((value, name) => {
      if (name.toLowerCase() === "transfer-encoding") return;
      clientRes.setHeader(name, value);
    });

    if (!upstreamRes.body) {
      const text = await upstreamRes.text();
      clientRes.send(text);
      return;
    }

    upstreamRes.body.pipe(clientRes);
  } catch (err) {
    console.error("stream error:", err);
    if (!clientRes.headersSent) {
      clientRes.status(500).send("Proxy stream error");
    } else {
      clientRes.end();
    }
  }
}

// ====== API الرئيسي: player_api.php ======
app.get("/player_api.php", async (req, res) => {
  if (!IPTV_BASE || !IPTV_USER || !IPTV_PASS) {
    return res.status(500).json({ error: "IPTV config missing" });
  }

  try {
    const params = new URLSearchParams(req.query);

    params.set("username", IPTV_USER);
    params.set("password", IPTV_PASS);

    const upstreamUrl =
      IPTV_BASE.replace(/\/$/, "") + "/player_api.php?" + params.toString();

    const upstreamRes = await fetch(upstreamUrl);
    const text = await upstreamRes.text();

    const contentType = upstreamRes.headers.get("content-type");
    if (contentType) {
      res.setHeader("content-type", contentType);
    } else {
      res.setHeader("content-type", "application/json; charset=utf-8");
    }

    res.status(upstreamRes.status).send(text);
  } catch (err) {
    console.error("player_api error:", err);
    res.status(500).json({ error: "Proxy error" });
  }
});

// ====== مسارات تشغيل الفيديو ======

// فيلم/VOD
app.get("/movie/:fakeUser/:fakePass/:id.:ext", async (req, res) => {
  if (!IPTV_BASE || !IPTV_USER || !IPTV_PASS) {
    return res.status(500).send("IPTV config missing");
  }

  const { id, ext } = req.params;
  const qs = new URLSearchParams(req.query || {});
  const upstreamUrl =
    IPTV_BASE.replace(/\/$/, "") +
    `/movie/${encodeURIComponent(IPTV_USER)}/${encodeURIComponent(
      IPTV_PASS
    )}/${encodeURIComponent(id)}.${ext}` +
    (qs.toString() ? `?${qs.toString()}` : "");

  await proxyStream(upstreamUrl, res);
});

// مسلسل/series
app.get("/series/:fakeUser/:fakePass/:id.:ext", async (req, res) => {
  if (!IPTV_BASE || !IPTV_USER || !IPTV_PASS) {
    return res.status(500).send("IPTV config missing");
  }

  const { id, ext } = req.params;
  const qs = new URLSearchParams(req.query || {});
  const upstreamUrl =
    IPTV_BASE.replace(/\/$/, "") +
    `/series/${encodeURIComponent(IPTV_USER)}/${encodeURIComponent(
      IPTV_PASS
    )}/${encodeURIComponent(id)}.${ext}` +
    (qs.toString() ? `?${qs.toString()}` : "");

  await proxyStream(upstreamUrl, res);
});

// مسار عام: /user/pass/id
app.get("/:fakeUser/:fakePass/:id", async (req, res) => {
  if (!IPTV_BASE || !IPTV_USER || !IPTV_PASS) {
    return res.status(500).send("IPTV config missing");
  }

  const { id } = req.params;
  const qs = new URLSearchParams(req.query || {});
  const upstreamUrl =
    IPTV_BASE.replace(/\/$/, "") +
    `/${encodeURIComponent(IPTV_USER)}/${encodeURIComponent(
      IPTV_PASS
    )}/${encodeURIComponent(id)}` +
    (qs.toString() ? `?${qs.toString()}` : "");

  await proxyStream(upstreamUrl, res);
});

// بورت Railway
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("IPTV backend running on port", PORT);
});
