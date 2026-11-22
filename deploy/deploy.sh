#!/usr/bin/env bash
# Sync the repo to the server and (re)build/start the production stack.
# Usage: SSH_KEY=~/.ssh/ajaia_vps deploy/deploy.sh root@SERVER_IP
# The server's /opt/ajaia-docs/.env is created once by hand (see README) and never overwritten.
set -euo pipefail
HOST=${1:?usage: deploy/deploy.sh root@SERVER_IP}
SSH="ssh ${SSH_KEY:+-i $SSH_KEY} -o StrictHostKeyChecking=accept-new"

cd "$(dirname "$0")/.."
rsync -az --delete -e "$SSH" \
  --include '.env.example' --exclude '.env*' --exclude node_modules --exclude .next --exclude .git --exclude coverage \
  ./ "$HOST:/opt/ajaia-docs/"
$SSH "$HOST" 'cd /opt/ajaia-docs && docker compose --profile prod up -d --build && docker compose ps'
