const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

// خزن الـ API Key في متغير البيئة PROXYCHECK_API_KEY على Railway
const PROXYCHECK_API_KEY = process.env.PROXYCHECK_API_KEY;

// نسمح لكل الدومينات (عشان AppCreator24 يقدر يعمل طلب)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// دالة للحصول على IP الحقيقي قدر الإمكان من هيدرات Railway
function getClientIp(req) {
  const xfwd = req.headers["x-forwarded-for"];
  if (xfwd) {
    // ممكن يكون فيها أكثر من IP
    return xfwd.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "0.0.0.0";
}

app.get("/check", async (req, res) => {
  // لو مفيش API KEY متضبوط، ما نقفلش على الناس
  if (!PROXYCHECK_API_KEY) {
    return res.status(200).json({
      allow: true,
      reason: "no_api_key_configured",
    });
  }

  const ip = getClientIp(req);
  console.log("Client IP:", ip);

  try {
    const url =
      "https://proxycheck.io/v2/" +
      encodeURIComponent(ip) +
      "?key=" +
      encodeURIComponent(PROXYCHECK_API_KEY) +
      "&vpn=1&asn=1&risk=1&days=7&tag=LegendTV";

    const response = await fetch(url);
    const data = await response.json();

    console.log("Proxycheck raw response:", data);

    // أحيانًا الـ JSON بيبقى فيه status + IP
    // فنجيب أول مفتاح مش اسمه status
    let ipKey = Object.keys(data).find((k) => k !== "status");
    let info = ipKey ? data[ipKey] : null;

    let allow = true;
    let reason = "clean";

    if (info) {
      const isProxy = info.proxy === "yes";
      const type = (info.type || "").toLowerCase();

      // نوع الاتصال من proxycheck
      const isVpnType =
        type === "vpn" ||
        type === "tor" ||
        type === "webproxy" ||
        type === "datacenter";

      // ✅ هنا بس بنحظر لو فعلاً مكتوب Proxy/VPN
      if (isProxy || isVpnType) {
        allow = false;
        reason = "vpn_or_proxy";
      }

      // لو حابب تستخدم risk بعدين:
      // const risk = info.risk ? parseInt(info.risk) : 0;
      // وممكن تضيف شرط لو حابب
    } else {
      // لو مفيش أي داتا للـ IP → نسمح
      allow = true;
      reason = "no_ip_data";
    }

    return res.status(200).json({ allow, reason, ip: ipKey || ip });
  } catch (err) {
    console.error("proxycheck error:", err);

    // لو حصل Error من proxycheck → ما نقفلش، نسمح
    return res.status(200).json({
      allow: true,
      reason: "proxycheck_error_but_allowed",
    });
  }
});

app.get("/", (req, res) => {
  res.send("ProxyCheck backend is running ✅");
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
