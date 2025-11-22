<?php
// config.php  — يرجّع بيانات السيرفر للتطبيق

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *'); // لو محتاج تمنع، عدّلها

$server = getenv('XTVIP_SERVER');
$user   = getenv('XTVIP_USER');
$pass   = getenv('XTVIP_PASS');

echo json_encode([
    'server' => $server,
    'user'   => $user,
    'pass'   => $pass,
]);
