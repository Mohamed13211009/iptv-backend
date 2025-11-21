FROM php:8.2-cli

# ننسخ ملفات المشروع كلها
WORKDIR /app
COPY . /app

# نشغّل سيرفر PHP على البورت 8080 (Railway بيطلب كده)
CMD ["php", "-S", "0.0.0.0:8080", "vpn-check.php"]
