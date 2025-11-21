<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$apiKey = 'v38707-3l46jr-9395ag-3272tb';

$ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'];
if (strpos($ip, ',') !== false) {
    $parts = explode(',', $ip);
    $ip = trim($parts[0]);
}

if (!filter_var($ip, FILTER_VALIDATE_IP)) {
    echo json_encode([
        'status' => 'error',
        'reason' => 'invalid_ip',
        'message' => 'لم يتم التعرف على عنوان IP صالح'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$url = 'https://proxycheck.io/v2/' . urlencode($ip)
     . '?key=' . urlencode($apiKey)
     . '&vpn=1&asn=1&risk=1';

$response = @file_get_contents($url);

if ($response === false) {
    echo json_encode([
        'status' => 'error',
        'reason' => 'proxycheck_unreachable',
        'message' => 'تعذر الاتصال بخدمة proxycheck.io'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$data = json_decode($response, true);

if (!$data || !isset($data['status']) || $data['status'] !== 'ok' || !isset($data[$ip])) {
    echo json_encode([
        'status' => 'error',
        'reason' => 'bad_response',
        'message' => 'استجابة غير متوقعة من خدمة الحماية',
        'raw'     => $data
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$info = $data[$ip];

$isProxy       = (isset($info['proxy']) && $info['proxy'] === 'yes');
$isVpnType     = isset($info['type']) && strtoupper($info['type']) === 'VPN';
$isVpnProvider = isset($info['provider']) && stripos($info['provider'], 'vpn') !== false;
$risk          = isset($info['risk']) ? (int)$info['risk'] : 0;
$isRisky       = $risk >= 50;

$isVpn = ($isProxy || $isVpnType || $isVpnProvider || $isRisky);

echo json_encode([
    'status'  => 'ok',
    'ip'      => $ip,
    'is_vpn'  => $isVpn,
    'details' => $info
], JSON_UNESCAPED_UNICODE);
