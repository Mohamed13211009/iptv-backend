<?php
// vpn-check.php
// تم إيقاف فحص الـ VPN مؤقتاً – بيرجع دائماً أن الاتصال سليم

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// طلب OPTIONS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

echo json_encode([
    'status' => 'ok',
    'is_vpn' => false,
    'reason' => 'vpn_check_disabled_temporarily'
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
