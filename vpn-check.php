<?php
// vpn-check.php
// خدمة بسيطة لفحص VPN / Proxy / Tor باستخدام ipwho.is مع كاش محلي في ملف JSON

header('Content-Type: application/json; charset=utf-8');
// لو عايز تقفل دومينات معينة اشيل * وحط الدومين بتاعك
header('Access-Control-Allow-Origin: *'); 

// ---------------- إعدادات الكاش ----------------
$CACHE_FILE = __DIR__ . '/vpn_cache.json'; // ملف الكاش
$CACHE_TTL  = 6 * 60 * 60;                 // مدة صلاحية الكاش = 6 ساعات

// قراءة الكاش من الملف
function load_cache($file) {
    if (!file_exists($file)) return [];
    $json = @file_get_contents($file);
    if (!$json) return [];
    $data = json_decode($json, true);
    return is_array($data) ? $data : [];
}

// حفظ الكاش في الملف
function save_cache($file, $data) {
    @file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

// محاولة الحصول على IP حقيقي قدر الإمكان
function get_client_ip() {
    $keys = [
        'HTTP_CF_CONNECTING_IP',
        'HTTP_X_FORWARDED_FOR',
        'HTTP_X_REAL_IP',
        'REMOTE_ADDR'
    ];
    foreach ($keys as $k) {
        if (!empty($_SERVER[$k])) {
            // لو في قائمة، ناخد أول IP
            $parts = explode(',', $_SERVER[$k]);
            return trim($parts[0]);
        }
    }
    return '0.0.0.0';
}

$ip  = get_client_ip();
$now = time();

// ---------------- كاش محلي ----------------
$cache = load_cache($CACHE_FILE);

// لو عندنا نتيجة حديثة لنفس الـ IP ولسه في المدة
if (isset($cache[$ip])) {
    $entry = $cache[$ip];
    if (isset($entry['ts']) && ($now - $entry['ts']) < $CACHE_TTL) {
        echo json_encode([
            'ok'    => true,
            'from'  => 'cache',
            'ip'    => $ip,
            'block' => !empty($entry['block']),
            'reason'=> $entry['reason'] ?? null
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

// ---------------- اتصال بـ ipwho.is ----------------
$url = 'https://ipwho.is/' . urlencode($ip);

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 5,
    CURLOPT_CONNECTTIMEOUT => 3
]);
$response = curl_exec($ch);
$err      = curl_error($ch);
curl_close($ch);

// في حالة فشل الاتصال نهائياً
if ($err || !$response) {
    $cache[$ip] = [
        'ts'    => $now,
        'block' => true,
        'reason'=> 'network_error'
    ];
    save_cache($CACHE_FILE, $cache);

    echo json_encode([
        'ok'    => false,
        'from'  => 'error',
        'ip'    => $ip,
        'block' => true,
        'reason'=> 'network_error'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$data = json_decode($response, true);
if (!is_array($data) || empty($data['success'])) {
    // الرد مش مفهوم أو فيه مشكلة → نحظر بحذر
    $cache[$ip] = [
        'ts'    => $now,
        'block' => true,
        'reason'=> 'api_failed'
    ];
    save_cache($CACHE_FILE, $cache);

    echo json_encode([
        'ok'    => false,
        'from'  => 'api_failed',
        'ip'    => $ip,
        'block' => true,
        'reason'=> 'api_failed'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// الرد ناجح
$sec   = $data['security'] ?? [];
$block = !empty($sec['vpn']) || !empty($sec['proxy']) || !empty($sec['tor']);

$reason = null;
if (!empty($sec['vpn']))   $reason = 'vpn';
if (!empty($sec['proxy'])) $reason = $reason ? ($reason . '+proxy') : 'proxy';
if (!empty($sec['tor']))   $reason = $reason ? ($reason . '+tor')   : 'tor';

// خزّن في الكاش
$cache[$ip] = [
    'ts'    => $now,
    'block' => $block,
    'reason'=> $reason
];
save_cache($CACHE_FILE, $cache);

// رجّع رد بسيط للتطبيق
echo json_encode([
    'ok'    => true,
    'from'  => 'live',
    'ip'    => $ip,
    'block' => $block,
    'reason'=> $reason
], JSON_UNESCAPED_UNICODE);
