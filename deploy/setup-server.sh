#!/usr/bin/env bash
# One-time preparation of a fresh Ubuntu 24.04 VPS. Run as root on the server.
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

# Only SSH + HTTP(S) are reachable. Internal services are bound to 127.0.0.1 in compose.
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

mkdir -p /opt/ajaia-docs
docker --version && docker compose version
