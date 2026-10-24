#!/usr/bin/env bash
# ==============================================================================
# SCRIPT TRIỂN KHAI TELEGRAM BOT LÊN VPS DÙNG CHUNG VỚI WEB HOÀN THIỆN
# Không ảnh hưởng đến web_hoanthien đang chạy!
# Domain Bot: bot.vasnet360.site (hoặc tên miền con bạn chọn)
# ==============================================================================

set -e

DOMAIN=${1:-"bot.vasnet360.site"}
APP_DIR="/var/www/telegram_bot_store"

echo "=========================================================="
echo ">>> TRIỂN KHAI BOT TELEGRAM LÊN CÙNG VPS VỚI WEB HOÀN THIỆN"
echo ">>> Subdomain dành cho Bot: $DOMAIN"
echo ">>> Thư mục lưu trữ: $APP_DIR"
echo "=========================================================="

# 1. Cài đặt các gói phụ trợ nếu chưa có
echo ">>> [1/5] Kiểm tra gói hệ thống..."
apt update -y
apt install -y curl wget git unzip nginx certbot python3-certbot-nginx

# 2. Cài đặt Node.js LTS nếu chưa có
echo ">>> [2/5] Kiểm tra môi trường Node.js & PM2..."
if ! command -v node &> /dev/null; then
    echo "Cài đặt Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi

if ! command -v pm2 &> /dev/null; then
    echo "Cài đặt PM2..."
    npm install -g pm2
fi

echo "Node version: $(node -v)"
echo "PM2 version: $(pm2 -v)"

# 3. Chuẩn bị thư mục mã nguồn riêng biệt cho Bot
echo ">>> [3/5] Chuẩn bị mã nguồn tại $APP_DIR..."
mkdir -p "$APP_DIR/logs"

CURRENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ "$CURRENT_DIR" != "$APP_DIR" ]; then
    cp -rf "$CURRENT_DIR"/* "$APP_DIR"/ 2>/dev/null || true
fi

cd "$APP_DIR"

# 4. Cấu hình Nginx Virtual Host riêng cho Subdomain Bot (KHÔNG chạm vào web_hoanthien)
echo ">>> [4/5] Cấu hình Nginx Virtual Host riêng cho $DOMAIN..."
NGINX_CONF="/etc/nginx/sites-available/$DOMAIN"

cat << 'EOF' > "$NGINX_CONF"
server {
    listen 80;
    listen [::]:80;
    server_name DOMAIN_PLACEHOLDER;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_buffering off;
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
    }
}
EOF

sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" "$NGINX_CONF"
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/

# Kiểm tra cú pháp Nginx và reload (không làm gián đoạn web_hoanthien)
nginx -t
systemctl reload nginx

# 5. Khởi động Bot bằng PM2
echo ">>> [5/5] Khởi động Bot & Web Quản trị với PM2..."
pm2 stop bot-vasnet360 2>/dev/null || true
pm2 delete bot-vasnet360 2>/dev/null || true

pm2 start serve.js --name "bot-vasnet360"
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

echo "=========================================================="
echo ">>> HOÀN TẤT TRIỂN KHAI!"
pm2 status
echo "=========================================================="
echo "CÁC BƯỚC HOÀN TẤT CUỐI CÙNG:"
echo "1. Trên Cloudflare DNS của vasnet360.site:"
echo "   Thêm bản ghi: Type A | Name: bot | IPv4: [IP của VPS này]"
echo "2. Chạy lệnh cài SSL HTTPS tự động:"
echo "   certbot --nginx -d $DOMAIN"
echo "3. Truy cập trang quản trị:"
echo "   https://$DOMAIN/telegram-bot-manager.html"
echo "=========================================================="
