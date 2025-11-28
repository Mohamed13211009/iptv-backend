app.get("/check", async (req, res) => {
  if (!PROXYCHECK_API_KEY) {
    return res.status(500).json({
      allow: true,              // اسمح لو مفيش API KEY، ما تقفلش على الناس
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

    // في بعض الأحيان الـ IP بيبقى مكتوب ::ffff:1.2.3.4 أو شبيه
    // فنجيب أول مفتاح غير status ونستخدمه
    let ipKey = Object.keys(data).find((k) => k !== "status");
    let info = ipKey ? data[ipKey] : null;

    let allow = true;
    let reason = "clean";

    if (info) {
      const isProxy = info.proxy === "yes";
      const type = (info.type || "").toLowerCase();
      const isVpnType =
        type === "vpn" || type === "tor" || type === "webproxy";

      // هنا بس بنقفل لو فعلاً Proxy/VPN
      if (isProxy || isVpnType) {
        allow = false;
        reason = "vpn_or_proxy";
      }
      // لو حابب تستخدم الـ risk بعدين، ممكن تضيف شرط تاني هنا
      // const risk = info.risk ? parseInt(info.risk) : 0;
    } else {
      // لو مش راجع داتا عن الـ IP، نسمح كافتراضي
      allow = true;
      reason = "no_ip_data";
    }

    return res.json({ allow, reason, ip: ipKey || ip });
  } catch (err) {
    console.error("proxycheck error:", err);

    // مهم: ما نقفلش لو حصل خطأ في Proxycheck، نخليه يسمح
    return res.status(200).json({
      allow: true,
      reason: "proxycheck_error_but_allowed",
    });
  }
});
