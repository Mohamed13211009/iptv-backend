export default {
  async fetch(request) {
    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    if (!action) {
      return new Response("❌ يجب تحديد action", { status: 400 });
    }

    const target = `https://xtvip.net/player_api.php?username=watch1235&password=742837399&action=${action}`;

    try {
      const res = await fetch(target, {
        method: "GET",
        headers: {
          "User-Agent": request.headers.get("User-Agent") || "CF-Proxy"
        }
      });

      const contentType = res.headers.get("Content-Type") || "application/json";
      const data = await res.text();

      return new Response(data, {
        status: res.status,
        headers: {
          "Content-Type": contentType,
          "Access-Control-Allow-Origin": "*"
        }
      });
    } catch (err) {
      return new Response("🔥 خطأ في الاتصال بالسيرفر", { status: 502 });
    }
  }
}
