const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

// خلي المفتاح في Environment Variable على Railway
const PROXYCHECK_API_KEY = process.env.PROXYCHECK_API_KEY;
const MAX_RISK = 75;

// مسموح ندي API لأي دومين (عشان AppCreator24 يطلبه)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// دالة للحصول على الـ IP الحقيقي قدر الإمكان
function getClientIp(req) {
  const xfwd = req.headers["x-forwarded-for"];
  if (xfwd) {
    return xfwd.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "0.0.0.0";
}

app.get("/check", async (req, res) => {
  if (!PROXYCHECK_API_KEY) {
    return res.status(500).json({
      allow: false,
      reason: "no_api_key_configured",
    });
  }

  const ip = getClientIp(req);

  try {
    const url =
      "https://proxycheck.io/v2/" +
      encodeURIComponent(ip) +
      "?key=" +
      encodeURIComponent(PROXYCHECK_API_KEY) +
      "&vpn=1&asn=1&risk=1&days=7&tag=LegendTV";

    // fetch موجود في Node 18+
    const response = await fetch(url);
    const data = await response.json();

    let allow = false;
    let reason = "unknown";

    if (data && data[ip]) {
      const info = data[ip];
      const isProxy = info.proxy === "yes";
      const isVpn =
        info.type && typeof info.type === "string"
          ? info.type.toLowerCase() === "vpn"
          : false;
      const risk = info.risk ? parseInt(info.risk) : 0;

      if (isProxy || isVpn || risk >= MAX_RISK) {
        allow = false;
        reason = "vpn_or_proxy_or_high_risk";
      } else {
        allow = true;
        reason = "clean";
      }
    } else {
      allow = false;
      reason = "no_ip_data";
    }

    res.json({ allow, reason, ip });
  } catch (err) {
    console.error("proxycheck error:", err);
    // تقدر تخليها تسمح أو تمنع في حالة الخطأ، هنا خالّيها تمنع
    res.status(500).json({
      allow: false,
      reason: "proxycheck_error",
    });
  }
});

app.get("/", (req, res) => {
  res.send("ProxyCheck backend is running ✅");
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
