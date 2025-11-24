<?php
// config.php

// بيانات سيرفر الـ IPTV
const XTREAM_HOST = 'https://xtvip.net';   // بدون / في الآخر
const XTREAM_USER = 'watch1235';
const XTREAM_PASS = '742837399';

/**
 * دالة مساعدة لو حبيت تستخدمها بعدين في أي سكربت تاني
 */
function xtream_build_url(string $path, array $query = []): string {
    $base = rtrim(XTREAM_HOST, '/');

    $query = array_merge([
        'username' => XTREAM_USER,
        'password' => XTREAM_PASS,
    ], $query);

    return $base . '/' . ltrim($path, '/') . '?' . http_build_query($query);
}
