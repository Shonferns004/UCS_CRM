#!/bin/bash
# ============================================================
# STAGING EC2 SETUP SCRIPT
# Run this ONCE on your new staging EC2 instance after launching it.
#
# Usage:
#   ssh -i your-key.pem ec2-user@<STAGING_IP>
#   curl -sL https://raw.githubusercontent.com/... or paste this script
#   bash setup-staging.sh
# ============================================================

set -e

echo "=== UCS CRM Staging Setup ==="
echo ""

# ---- 1. Install Node.js 24 ----
echo "[1/8] Installing Node.js 24..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://rpm.nodesource.com/setup_24.x | sudo bash -
  sudo yum install -y nodejs
fi
echo "  Node: $(node -v)"
echo "  npm:  $(npm -v)"

# ---- 2. Install PM2 globally ----
echo "[2/8] Installing PM2..."
if ! command -v pm2 &> /dev/null; then
  sudo npm install -g pm2
  sudo pm2 startup systemd -u ec2-user --hp /home/ec2-user
fi

# ---- 3. Install Caddy ----
echo "[3/8] Installing Caddy..."
if ! command -v caddy &> /dev/null; then
  CADDY_VERSION=$(curl -s https://api.github.com/repos/caddyserver/caddy/releases/latest | grep tag_name | cut -d '"' -f4)
  curl -L "https://github.com/caddyserver/caddy/releases/download/${CADDY_VERSION}/caddy_${CADDY_VERSION#v}_linux_amd64.tar.gz" | sudo tar -C /usr/local/bin -xz caddy
  sudo chmod +x /usr/local/bin/caddy
  sudo mkdir -p /etc/caddy
fi

# ---- 4. Clone the repo ----
echo "[4/8] Cloning repo..."
if [ ! -d /home/ec2-user/app ]; then
  git clone https://github.com/priyankshahdev-alt/UCS_CRM.git /home/ec2-user/app
else
  cd /home/ec2-user/app
  git fetch origin
  git reset --hard origin/master
fi

# ---- 5. Install backend dependencies ----
echo "[5/8] Installing backend dependencies..."
cd /home/ec2-user/app/backend
npm ci

# ---- 6. Create .env.staging ----
echo "[6/8] Creating .env.staging..."
if [ ! -f /home/ec2-user/app/backend/.env ]; then
  cat > /home/ec2-user/app/backend/.env << 'ENVEOF'
# ──── JWT (for Express auth) ────
JWT_SECRET=staging-jwt-secret-change-me

# ──── Server ────
PORT=5000

# ──── Database ────
DATABASE_URL=postgresql://ucs_staging:CHANGE_ME@CHANGE_ME.rds.amazonaws.com:5432/ucs_crm_staging

# ──── WhatsApp Master Admin ────
WHATSAPP_MASTER_EMAIL=admin@whatsapp.com
WHATSAPP_MASTER_PASSWORD=Admin123!

# ──── WhatsApp Cloud API (Meta) ────
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
WHATSAPP_ACCESS_TOKEN=your-access-token
WHATSAPP_API_VERSION=v23.0
WHATSAPP_WABA_ID=your-waba-id
WHATSAPP_VERIFY_TOKEN=ucscompany123

# ──── WhatsApp Templates ────
WHATSAPP_TEMPLATE_NAME=bsct_receipt

# ──── Admin Seed ────
ADMIN_EMAIL=admin@ufs.com
ADMIN_PASSWORD=123456

# ──── S3 (can share with production or use separate bucket) ────
S3_BUCKET=ucs-crm-uploads-mumbai
S3_REGION=ap-south-1
AWS_REGION=ap-south-1

# ──── Disable optional services for staging ────
IMAP_ENABLED=false
RAZORPAY_ENABLED=false
PAYTM_ENABLED=false
ENVEOF
  echo "  WARNING: Edit .env with your staging database credentials!"
  echo "  Run: nano /home/ec2-user/app/backend/.env"
else
  echo "  .env already exists, skipping."
fi

# ---- 7. Start backend with PM2 ----
echo "[7/8] Starting backend..."
cd /home/ec2-user/app/backend
pm2 delete backend-staging 2>/dev/null || true
pm2 start src/index.js --name backend-staging --update-env
pm2 save

# ---- 8. Configure Caddy for staging ----
echo "[8/8] Configuring Caddy..."
sudo tee /etc/caddy/Caddyfile > /dev/null << 'CADDYEOF'
:80 {
    @api path /api/*
    @socket path /socket.io/*

    handle @api {
        reverse_proxy 127.0.0.1:5000
    }

    handle @socket {
        reverse_proxy 127.0.0.1:5000
    }

    handle {
        root * /var/www/staging-crm
        try_files {path} /index.html
        encode gzip
        file_server
    }
}
CADDYEOF

sudo tee /etc/systemd/system/caddy.service > /dev/null << 'SERVICEEOF'
[Unit]
Description=Caddy
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
ExecReload=/usr/local/bin/caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
Restart=always
RestartSec=5
LimitNOFILE=1048576
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
SERVICEEOF

sudo systemctl daemon-reload
sudo systemctl enable caddy
sudo systemctl restart caddy

# ---- Done ----
echo ""
echo "=== Setup Complete ==="
echo ""
echo "Backend:  pm2 logs backend-staging"
echo "Health:   curl http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)/api/health"
echo ""
echo "Next steps:"
echo "  1. Edit .env with your staging database credentials:"
echo "     nano /home/ec2-user/app/backend/.env"
echo "  2. Restart backend:"
echo "     pm2 restart backend-staging --update-env"
echo "  3. Add this EC2's public IP to GitHub Secrets as STAGING_HOST"
echo ""
