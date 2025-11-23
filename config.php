<?php
// config.php
// يرجّع بيانات الدخول للتطبيق (سيرفر + يوزر + باس)

// السماح للـ CORS
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// طلب OPTIONS للمتصفحات
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// هنا بتحط بيانات السيرفر الحقيقية
$config = [
    // تقدر تستخدمه في المستقبل لو حبيت ترجع للسيرفر من الباك إند
    'server'   => 'https://xtvip.net',

    // اليوزر والباس اللي التطبيق هيستخدمهم
    'username' => 'watch1235',
    'password' => '742837399',
];

// ريسبونس موحّد
echo json_encode([
    'status' => 'ok',
    'config' => $config
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
