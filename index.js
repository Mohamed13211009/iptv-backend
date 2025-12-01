const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.json({ message: "VPN Detector API is running ✔️" });
});

// مثال: /check-ip?ip=8.8.8.8
app.get("/check-ip", async (req, res) => {
  try {
    const ip = req.query.ip;

    if (!ip) {
      return res.status(400).json({ error: "Please provide IP using ?ip=" });
    }

    // نستخدم API مجانية بدون مفتاح
    const { data } = await axios.get(`http://ip-api.com/json/${ip}`);

    if (data.status !== "success") {
      return res.status(400).json({ error: "Invalid IP address" });
    }

    // كلمات لو ظهرت في ISP/ORG تعتبر VPN / Hosting
    const suspicious = [
      "vpn",
      "hosting",
      "datacenter",
      "data center",
      "digitalocean",
      "ovh",
      "hetzner",
      "google cloud",
      "aws",
      "azure",
      "linode"
    ];

    const isp = (data.isp || "").toLowerCase();
    const org = (data.org || "").toLowerCase();

    const matches = suspicious.filter(
      (k) => isp.includes(k) || org.includes(k)
    );

    const suspected_vpn = matches.length > 0;

    res.json({
      ip,
      country: data.country,
      city: data.city,
      isp: data.isp,
      org: data.org,
      suspected_vpn,
      matched_keywords: matches
    });

  } catch (e) {
    res.status(500).json({ error: "Server error", details: e.message });
  }
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
