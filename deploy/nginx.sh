#!/usr/bin/env bash
# Installs the nginx vhost for Reputa and obtains a Let's Encrypt certificate.
#
#   DOMAIN=app.example.com bash deploy/nginx.sh
#   DOMAIN=app.example.com CERT_EMAIL=ops@example.com bash deploy/nginx.sh
set -euo pipefail

DOMAIN=${DOMAIN:?Set DOMAIN=your.domain}
APP_DIR=${APP_DIR:-/opt/reputa}
CONF=/etc/nginx/conf.d/reputa.conf
mkdir -p /etc/nginx/conf.d

sed -e "s|__DOMAIN__|$DOMAIN|g" -e "s|__APP_DIR__|$APP_DIR|g" "$APP_DIR/deploy/nginx.conf.template" > "$CONF"

# gzip once, globally
cat > /etc/nginx/conf.d/gzip.conf <<'EOF'
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_comp_level 6;
gzip_min_length 1024;
gzip_types text/plain text/css text/javascript application/javascript application/json application/xml image/svg+xml;
EOF

nginx -t
systemctl enable --now nginx
systemctl reload nginx

# HTTPS
if [ -n "${CERT_EMAIL:-}" ]; then
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$CERT_EMAIL" --redirect
else
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect
fi
systemctl enable --now certbot.timer 2>/dev/null || systemctl enable --now certbot-renew.timer 2>/dev/null || true
certbot renew --dry-run
echo "nginx + HTTPS ready for https://$DOMAIN"
