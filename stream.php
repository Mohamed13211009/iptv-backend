<?php
// stream.php
require __DIR__ . '/config.php';

// نجبر الرد يبقى نص عادي في حالة الخطأ
header('Content-Type: text/plain; charset=utf-8');

// استقبال البرامترز من الرابط
$id   = isset($_GET['id'])   ? trim($_GET['id'])   : '';
$type = isset($_GET['type']) ? trim($_GET['type']) : 'vod'; // vod / live / series
$key  = isset($_GET['key'])  ? trim($_GET['key'])  : '';

// حماية بسيطة بالمفتاح السري
if (!empty($STREAM_SECRET) && $key !== $STREAM_SECRET) {
    http_response_code(403);
    echo "Forbidden";
    exit;
}

// لازم يكون فيه id
if ($id === '') {
    http_response_code(400);
    echo "Missing stream id";
    exit;
}

// نضبط بيانات السيرفر
$base = rtrim($XTREAM_SERVER, '/');
$user = rawurlencode($XTREAM_USER);
$pass = rawurlencode($XTREAM_PASS);

// نحدد نوع الرابط حسب النوع
switch ($type) {
    case 'live':
        // قناة بث مباشر
        $path = "/live/{$user}/{$pass}/{$id}.m3u8";
        break;

    case 'series':
        // نعامله نفس معاملة الفيلم (غالباً السيرفر بيستخدم movie برضه)
    case 'vod':
    default:
        // فيلم / VOD
        $path = "/movie/{$user}/{$pass}/{$id}.mp4";
        break;
}

// نبني الرابط النهائي
$targetUrl = $base . $path;

// نعمل Redirect للرابط الحقيقي
header("Location: {$targetUrl}", true, 302);
exit;
