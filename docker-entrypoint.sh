#!/bin/sh
set -e

# Run database migrations
# Set NODE_PATH to resolve all pnpm store dependencies for prisma CLI
export NODE_PATH=$(echo node_modules/.pnpm/*/node_modules | tr ' ' ':')
PRISMA_CLI="node $(cat .prisma-cli-path)"
$PRISMA_CLI migrate deploy
unset NODE_PATH

# Start based on MODE
case "${MODE:-all}" in
  web)
    echo "Starting Alphorn (web only)..."
    exec node server.js
    ;;
  worker)
    echo "Starting Alphorn (worker only)..."
    exec node worker.mjs
    ;;
  *)
    echo "Starting Alphorn (web + worker)..."
    exec node server.js
    ;;
esac
