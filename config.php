<?php
// =======================
// إعدادات الـ IPTV
// =======================
define('IPTV_SERVER',   'https://xtvip.net');
define('IPTV_USERNAME', 'watch1235');
define('IPTV_PASSWORD', '742837399');

// =======================
// إعدادات كاش الـ VPN
// =======================
define('VPN_CACHE_FILE', __DIR__ . '/vpn_cache.json');
// 6 ساعات كاش لكل IP
define('VPN_CACHE_TTL', 6 * 60 * 60);

// لو معاك توكن من ipwho.is حطه هنا (اختياري)
// define('IPWHO_TOKEN', 'YOUR_TOKEN_HERE');
