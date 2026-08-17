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

# ---- 3. Install Nginx ----
echo "[3/8] Installing Nginx..."
if ! command -v nginx &> /dev/null; then
  sudo yum install -y nginx
  sudo systemctl enable nginx
  sudo systemctl start nginx
fi

# ---- 4. Clone the repo ----
echo "[4/8] Cloning repo..."
if [ ! -d /home/ec2-user/app ]; then
  git clone https://github.com/priyankshahdev-alt/UCS_CRM.git /home/ec2-user/app
else
  cd /home/ec2-user/app
  git pull origin master
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

# ---- 8. Configure Nginx for staging ----
echo "[8/8] Configuring Nginx..."
sudo tee /etc/nginx/conf.d/staging.conf > /dev/null << 'NGINXEOF'
server {
    listen 80;
    server_name _;

    # Staging frontend
    location / {
        root /var/www/staging-crm;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Staging backend API
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # Socket.io support
    location /socket.io/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }
}
NGINXEOF

# Remove default config that conflicts
sudo rm -f /etc/nginx/conf.d/default.conf 2>/dev/null || true

# Test and reload
sudo nginx -t
sudo systemctl reload nginx

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
