// ====== IMPORTS ======
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// ====== إعدادات ======

// البلد المسموح بيه (لو انت من دولة تانية غيّرها)
const ALLOWED_COUNTRY = "Egypt";

// ====== MIDDLEWARE ======

app.use(
  cors({
    origin: "*", // عادي دلوقتي مفتوح، لو عايز تقفله بعدين عدّلها
  })
);

app.use(express.json());

// ====== HELPER: جلب IP ======
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

// ====== HELPER: تحليل بيانات الـ IP ======
function analyzeIp(data) {
  const isp = data.isp || "";
  const org = data.org || "";
  const country = data.country || null;

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
    "vultr",
    "warp",
    "m247",
    "nordvpn",
    "surfshark",
    "private internet access",
    "pia"
  ];

  const matchedKeywords = suspiciousKeywords.filter((k) =>
    text.includes(k)
  );

  let suspected = matchedKeywords.length > 0;

  // قاعدة البلد: لو البلد مش مصر نعتبره VPN / اتصال ممنوع
  if (country && country !== ALLOWED_COUNTRY) {
    suspected = true;
    matchedKeywords.push("country_mismatch");
  }

  return { suspected, matchedKeywords, isp, org, country };
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

    const { data } = await axios.get(url, { timeout: 5000 });

    if (data.status !== "success") {
      return res.status(400).json({
        success: false,
        ip,
        error: data.message || "IP lookup failed",
      });
    }

    const analysis = analyzeIp(data);

    // ترجيع النتيجة للفرونت إند
    return res.json({
      success: true,
      ip: data.query || ip,
      country: analysis.country,
      city: data.city || null,
      isp: analysis.isp,
      org: analysis.org,
      suspected_vpn: analysis.suspected,
      matched_keywords: analysis.matchedKeywords,
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
