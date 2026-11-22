#!/usr/bin/env bash
# Sync the repo to the server and (re)build/start the production stack.
# Usage: [SSH_KEY=~/.ssh/key] [REMOTE_DIR=ajaia-docs] deploy/deploy.sh user@SERVER_IP
# REMOTE_DIR is relative to the remote user's home. The server's <REMOTE_DIR>/.env is created once
# (deploy/make-env.sh) and never overwritten. Only this project's compose stack is (re)started.
set -euo pipefail
HOST=${1:?usage: deploy/deploy.sh root@SERVER_IP}
SSH="ssh ${SSH_KEY:+-i $SSH_KEY} -o StrictHostKeyChecking=accept-new"

cd "$(dirname "$0")/.."
REMOTE_DIR=${REMOTE_DIR:-ajaia-docs}
$SSH "$HOST" "mkdir -p $REMOTE_DIR"
rsync -az --delete -e "$SSH" \
  --include '.env.example' --exclude '.env*' --exclude node_modules --exclude .next --exclude .git --exclude coverage \
  ./ "$HOST:$REMOTE_DIR/"
$SSH "$HOST" "cd $REMOTE_DIR && docker compose --profile prod up -d --build && docker compose ps"
