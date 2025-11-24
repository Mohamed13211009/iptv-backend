<?php
// stream.php
require __DIR__ . '/config.php';

// ------------------ قراءة البارامترات ------------------
$type = $_GET['type'] ?? '';   // live | vod | series
$id   = $_GET['id']   ?? '';   // stream_id / movie_id / series_id
$ext  = $_GET['ext']  ?? '';   // mp4 | m3u8 (اختياري)

// تحقق أساسي
if (!$id || !in_array($type, ['live', 'vod', 'series'], true)) {
    http_response_code(400);
    echo "Bad request";
    exit;
}

// فلترة الإمتداد (لو مبعوت)
$ext = preg_replace('/[^a-z0-9]/i', '', $ext);
if ($ext === '') {
    // الافتراضي
    if ($type === 'live') {
        $ext = 'm3u8';
    } else {
        $ext = 'mp4';
    }
}

// ------------------ بناء رابط سيرفر الـ IPTV ------------------
$userEnc = rawurlencode(XTREAM_USER);
$passEnc = rawurlencode(XTREAM_PASS);
$idEnc   = rawurlencode($id);

switch ($type) {
    case 'live':
        $remoteUrl = rtrim(XTREAM_HOST, '/') . "/live/$userEnc/$passEnc/$idEnc.$ext";
        break;

    case 'vod':
        // أفلام
        $remoteUrl = rtrim(XTREAM_HOST, '/') . "/movie/$userEnc/$passEnc/$idEnc.$ext";
        break;

    case 'series':
        // حلقات مسلسلات
        $remoteUrl = rtrim(XTREAM_HOST, '/') . "/series/$userEnc/$passEnc/$idEnc.$ext";
        break;

    default:
        http_response_code(400);
        echo "Unsupported type";
        exit;
}

// ------------------ طلب الستريم وتمريره للعميل ------------------
$ch = curl_init($remoteUrl);
curl_setopt_array($ch, [
    CURLOPT_HEADER         => true,   // ناخد الهيدر + البودي سوا
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_TIMEOUT        => 0,      // ستريم، فمش هنحط تايم آوت قصير
    CURLOPT_CONNECTTIMEOUT => 10,
]);

$response = curl_exec($ch);

if ($response === false) {
    http_response_code(502);
    echo "Stream error";
    exit;
}

$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$headerStr  = substr($response, 0, $headerSize);
$body       = substr($response, $headerSize);
$httpCode   = curl_getinfo($ch, CURLINFO_HTTP_CODE);

curl_close($ch);

// نمرّر نفس كود الاستجابة
if ($httpCode > 0) {
    http_response_code($httpCode);
}

// نمرّر نوع المحتوى وطول البيانات بس (ونسيب باقي الهيدر)
foreach (explode("\r\n", $headerStr) as $line) {
    $line = trim($line);
    if ($line === '' || stripos($line, 'HTTP/') === 0) continue;

    if (stripos($line, 'Content-Type:') === 0 ||
        stripos($line, 'Content-Length:') === 0) {
        header($line);
    }
}

// إرسال الستريم
echo $body;
