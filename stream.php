<?php
// stream.php — يشغل القنوات/الأفلام/المسلسلات بدون ما يبان السيرفر الحقيقي

$server = getenv('XTVIP_SERVER');
$user   = getenv('XTVIP_USER');
$pass   = getenv('XTVIP_PASS');

if (!$server || !$user || !$pass) {
    http_response_code(500);
    echo "Missing xtream config";
    exit;
}

$type   = $_GET['type']   ?? 'vod';   // vod / series / live
$id     = $_GET['id']     ?? '';
$format = $_GET['format'] ?? '';

if (!$id) {
    http_response_code(400);
    echo "Missing id";
    exit;
}

$server = rtrim($server, '/');

$paths = [];

switch ($type) {
    case 'live':
        if ($format === 'hls') {
            $paths[] = "/live/$user/$pass/$id.m3u8";
        }
        $paths[] = "/live/$user/$pass/$id.ts";
        $paths[] = "/live/$user/$pass/$id.m3u8";
        break;

    case 'series':
        if ($format === 'mp4') {
            $paths[] = "/series/$user/$pass/$id.mp4";
        }
        $paths[] = "/series/$user/$pass/$id.mp4";
        $paths[] = "/series/$user/$pass/$id.mkv";
        break;

    case 'vod':
    default:
        if ($format === 'mp4') {
            $paths[] = "/movie/$user/$pass/$id.mp4";
        }
        $paths[] = "/movie/$user/$pass/$id.mp4";
        $paths[] = "/movie/$user/$pass/$id.mkv";
        $paths[] = "/movie/$user/$pass/$id.ts";
        break;
}

$paths[] = "/$user/$pass/$id";

function tryStream($base, $path) {
    $url = $base . $path;

    $headers = @get_headers($url, 1);
    if (!$headers || strpos($headers[0], '200') === false) {
        return false;
    }

    foreach ($headers as $key => $val) {
        $k = strtolower($key);
        if ($k === 'content-type') {
            if (is_array($val)) $val = end($val);
            header("Content-Type: $val");
        }
    }

    $fp = fopen($url, 'rb');
    if (!$fp) return false;

    while (!feof($fp)) {
        $buf = fread($fp, 8192);
        if ($buf === false) break;
        echo $buf;
        flush();
        if (connection_aborted()) {
            fclose($fp);
            exit;
        }
    }
    fclose($fp);
    return true;
}

foreach ($paths as $p) {
    if (tryStream($server, $p)) {
        exit;
    }
}

http_response_code(502);
echo "Unable to stream";
