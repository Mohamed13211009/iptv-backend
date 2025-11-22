<?php
require __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

// ==================
// 1) دوال مساعدة
// ==================

function getClientIp(): string {
    $keys = [
        'HTTP_CF_CONNECTING_IP',
        'HTTP_X_FORWARDED_FOR',
        'HTTP_X_REAL_IP',
        'REMOTE_ADDR'
    ];
    foreach ($keys as $key) {
        if (!empty($_SERVER[$key])) {
            $ipList = explode(',', $_SERVER[$key]);
            $ip = trim($ipList[0]);
            if (filter_var($ip, FILTER_VALIDATE_IP)) {
                return $ip;
            }
        }
    }
    return '0.0.0.0';
}

function loadVpnCache(): array {
    if (!file_exists(VPN_CACHE_FILE)) {
        return [];
    }
    $raw = @file_get_contents(VPN_CACHE_FILE);
    if ($raw === false) return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function saveVpnCache(array $cache): void {
    @file_put_contents(
        VPN_CACHE_FILE,
        json_encode($cache, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)
    );
}

function flagTrue($v): bool {
    if ($v === true || $v === 1) return true;
    if (is_string($v)) {
        $v = strtolower($v);
        return $v === '1' || $v === 'true' || $v === 'yes';
    }
    return false;
}

function checkVpnWithCache(string $ip): array {
    $cache = loadVpnCache();
    $now   = time();

    if (isset($cache[$ip]) && isset($cache[$ip]['checked_at'])) {
        $age = $now - (int)$cache[$ip]['checked_at'];
        if ($age < VPN_CACHE_TTL) {
            return $cache[$ip];
        }
    }

    $info = [
        'ip'         => $ip,
        'is_vpn'     => false,
        'details'    => null,
        'checked_at' => $now,
    ];

    $url = 'https://ipwho.is/' . urlencode($ip) . '?fields=ip,connection,security';
    if (defined('IPWHO_TOKEN') && IPWHO_TOKEN) {
        $url .= '&token=' . urlencode(IPWHO_TOKEN);
    }

    $resp = @file_get_contents($url);
    if ($resp !== false) {
        $data = json_decode($resp, true);
        if (is_array($data)) {
            $sec  = $data['security']   ?? [];
            $conn = $data['connection'] ?? [];

            $flags = [
                $sec['is_proxy']     ?? null,
                $sec['is_vpn']       ?? null,
                $sec['is_tor']       ?? null,
                $sec['is_anonymous'] ?? null,
                $conn['proxy']       ?? null,
                $conn['vpn']         ?? null
            ];
            $isVpn = false;
            foreach ($flags as $f) {
                if (flagTrue($f)) {
                    $isVpn = true;
                    break;
                }
            }

            $info['is_vpn']  = $isVpn;
            $info['details'] = $data;
        }
    }

    $cache[$ip] = $info;
    saveVpnCache($cache);

    return $info;
}

// ===================
// 2) حماية ضد VPN
// ===================

$clientIp = getClientIp();
$vpnInfo  = checkVpnWithCache($clientIp);

if (!empty($vpnInfo['is_vpn'])) {
    http_response_code(403);
    echo json_encode([
        'status'  => 'blocked',
        'reason'  => 'vpn_detected',
        'ip'      => $clientIp,
        'message' => 'تم حظر الوصول بسبب استخدام VPN أو بروكسي.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// ===================
// 3) إعداد طلب السيرفر
// ===================

$action = $_GET['action'] ?? null;
if (!$action) {
    http_response_code(400);
    echo json_encode([
        'status'  => 'error',
        'message' => 'action مطلوب'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$allowedActions = [
    'get_vod_streams',
    'get_vod_categories',
    'get_series',
    'get_series_info',
    'get_live_streams',
];

if (!in_array($action, $allowedActions)) {
    http_response_code(403);
    echo json_encode([
        'status'  => 'error',
        'message' => 'هذا الإجراء غير مسموح',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$allowedParams = [
    'category_id',
    'series_id',
    'limit',
    'page',
    'search'
];

$params = [
    'username' => IPTV_USERNAME,
    'password' => IPTV_PASSWORD,
    'action'   => $action
];

foreach ($_GET as $key => $val) {
    if (in_array($key, $allowedParams)) {
        $params[$key] = $val;
    }
}

$upstreamUrl = rtrim(IPTV_SERVER, '/') . '/player_api.php?' . http_build_query($params);

// ===================
// 4) اتصال بالسيرفر الأصلي
// ===================

$ch = curl_init($upstreamUrl);

curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 4,
    CURLOPT_TIMEOUT        => 10,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_HTTPHEADER     => [
        'User-Agent: LegendTV-Backend/1.0',
        'X-Forwarded-For: ' . $clientIp
    ]
]);

$response = curl_exec($ch);
$error    = curl_error($ch);
$code     = curl_getinfo($ch, CURLINFO_HTTP_CODE);

curl_close($ch);

if ($response === false) {
    http_response_code(502);
    echo json_encode([
        'status'  => 'error',
        'message' => 'فشل الاتصال بالسيرفر',
        'error'   => $error
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

echo $response;
