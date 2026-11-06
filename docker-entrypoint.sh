#!/bin/sh
set -e

# Run database migrations (isolated Prisma CLI, see Dockerfile)
(cd /opt/prisma && node node_modules/prisma/build/index.js migrate deploy)

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
  all)
    echo "Starting Alphorn (web + worker)..."
    exec node server.js
    ;;
  *)
    # instrumentation.node.ts only embeds the worker for MODE=all, so a typo
    # would silently run web-only.
    echo "Unknown MODE '${MODE}': expected all, web, or worker" >&2
    exit 1
    ;;
esac
