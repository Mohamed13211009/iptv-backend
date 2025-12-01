// ====== IMPORTS ======
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// ====== MIDDLEWARE ======

// السماح للفرونت إند يطلب من أي دومين (CORS)
app.use(
  cors({
    origin: "*", // تقدر تقفلها بعدين وتسيب دومين واحد بس
  })
);

// عشان نقدر نقرا JSON لو حبيت تستخدم POST بعدين
app.use(express.json());

// ====== HELPER: جلب IP الحقيقي من الهيدر أو من req.ip ======
function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) {
    return fwd.split(",")[0].trim();
  }

  let ip = req.ip || req.connection?.remoteAddress || "";
  if (ip.startsWith("::ffff:")) {
    ip = ip.replace("::ffff:", "");
  }
  return ip;
}

// ====== HELPER: كشف VPN بشكل تقريبي من ISP/ORG ======
function isVpnOrHosting(isp = "", org = "") {
  const text = (isp + " " + org).toLowerCase();

  const suspiciousKeywords = [
    "vpn",
    "proxy",
    "hosting",
    "host",
    "datacenter",
    "data center",
    "colo",
    "cloud",
    "digitalocean",
    "ovh",
    "hetzner",
    "aws",
    "amazon web services",
    "google cloud",
    "gcp",
    "azure",
    "linode",
    "contabo",
    "vultr"
  ];

  const matched = suspiciousKeywords.filter((k) => text.includes(k));
  return {
    suspected: matched.length > 0,
    matchedKeywords: matched,
  };
}

// ====== HEALTH CHECK ======
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "IPTV VPN backend is running ✅",
  });
});

// ====== MAIN API: /check-ip ======
app.get("/check-ip", async (req, res) => {
  try {
    const ipFromQuery = req.query.ip;
    const ip =
      ipFromQuery && ipFromQuery.trim() !== ""
        ? ipFromQuery
        : getClientIp(req);

    if (!ip) {
      return res.status(400).json({
        success: false,
        error: "Could not determine client IP",
      });
    }

    const url = `http://ip-api.com/json/${ip}?fields=status,message,country,city,isp,org,query`;

    const { data } = await axios.get(url, {
      timeout: 5000,
    });

    if (data.status !== "success") {
      return res.status(400).json({
        success: false,
        ip,
        error: data.message || "IP lookup failed",
      });
    }

    const isp = data.isp || "";
    const org = data.org || "";
    const { suspected, matchedKeywords } = isVpnOrHosting(isp, org);

    return res.json({
      success: true,
      ip: data.query || ip,
      country: data.country || null,
      city: data.city || null,
      isp,
      org,
      suspected_vpn: suspected,
      matched_keywords: matchedKeywords,
    });
  } catch (err) {
    console.error("Error in /check-ip:", err.message);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
      details: err.message,
    });
  }
});

// ====== START SERVER ======
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
