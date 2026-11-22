#!/usr/bin/env bash
# Prints a production .env with fresh random secrets.
#   deploy/make-env.sh <ipv4>              → HTTPS on 80/443 via https://<ip-dashed>.sslip.io (dedicated VPS)
#   deploy/make-env.sh <ipv4> <http-port>  → plain HTTP on that port (shared host whose 80/443 are taken)
set -euo pipefail
IP=${1:?usage: deploy/make-env.sh <server-ipv4> [http-port]}
PORT=${2:-}
rnd() { openssl rand -hex "${1:-24}"; }
if [ -n "$PORT" ]; then
  cat <<ENV
DOMAIN=:80
APP_URL=http://${IP}:${PORT}
HTTP_BIND=${PORT}
HTTPS_BIND=127.0.0.1:8453
ENV
else
  DOMAIN="${IP//./-}.sslip.io"
  cat <<ENV
DOMAIN=${DOMAIN}
APP_URL=https://${DOMAIN}
ENV
fi
cat <<ENV
# Keycloak is internal-only; the app reaches it over the Docker network.
KC_HOSTNAME=http://keycloak:8080
KC_COMMAND=start --import-realm
# Host ports bound to 127.0.0.1 only (admin/debug via SSH tunnel); chosen to avoid common clashes.
DB_PORT=54329
MINIO_PORT=9100
MINIO_CONSOLE_PORT=9101
KC_PORT=8281
POSTGRES_PASSWORD=$(rnd)
S3_ACCESS_KEY=ajaia
S3_SECRET_KEY=$(rnd)
AUTH_SECRET=$(openssl rand -base64 32)
KC_CLIENT_SECRET=$(rnd)
KC_ADMIN_PASSWORD=$(rnd 12)
ENV
