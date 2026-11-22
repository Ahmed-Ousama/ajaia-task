#!/usr/bin/env bash
# Prints a production .env for a server IP, with fresh random secrets.
# Usage: deploy/make-env.sh 203.0.113.10 > .env.prod   (then copy it to /opt/ajaia-docs/.env on the server)
set -euo pipefail
IP=${1:?usage: deploy/make-env.sh <server-ipv4>}
DOMAIN="${IP//./-}.sslip.io"
rnd() { openssl rand -hex "${1:-24}"; }
cat <<ENV
DOMAIN=${DOMAIN}
APP_URL=https://${DOMAIN}
# Keycloak is internal-only; the app reaches it over the Docker network.
KC_HOSTNAME=http://keycloak:8080
KC_COMMAND=start --import-realm
POSTGRES_PASSWORD=$(rnd)
S3_ACCESS_KEY=ajaia
S3_SECRET_KEY=$(rnd)
AUTH_SECRET=$(openssl rand -base64 32)
KC_CLIENT_SECRET=$(rnd)
KC_ADMIN_PASSWORD=$(rnd 12)
ENV
