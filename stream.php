<?php
// stream.php
// Placeholder – هنستخدمه بعدين لو حبينا نمرر كل الاستريمات عن طريق الباك إند

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

echo json_encode([
    'status'  => 'error',
    'message' => 'Streaming endpoint is not configured yet.'
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
