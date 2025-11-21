# Dockerfile backend للكشف عن الـ VPN باستخدام PHP

# صورة PHP 8.2 CLI
FROM php:8.2-cli

# تثبيت curl عشان نستخدمه جوه PHP
RUN apt-get update && apt-get install -y \
    libcurl4-openssl-dev \
 && docker-php-ext-install curl \
 && rm -rf /var/lib/apt/lists/*

# مجلد العمل
WORKDIR /app

# نسخ كل ملفات المشروع إلى /app
COPY . /app

# نستخدم السيرفر المدمج بتاع PHP على البورت 8000
EXPOSE 8000
CMD ["php", "-S", "0.0.0.0:8000", "-t", "/app"]
