#!/bin/sh
set -e

# Fall back to the public URL a PaaS injects, so one-click deploys need no
# manual BETTER_AUTH_URL. An explicit value (e.g. a custom domain) always wins.
if [ -z "$BETTER_AUTH_URL" ]; then
  if [ -n "$RENDER_EXTERNAL_URL" ]; then
    export BETTER_AUTH_URL="$RENDER_EXTERNAL_URL"
  elif [ -n "$RAILWAY_PUBLIC_DOMAIN" ]; then
    export BETTER_AUTH_URL="https://$RAILWAY_PUBLIC_DOMAIN"
  fi
fi

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
    # Let instrumentation.node.ts stop the embedded worker gracefully on
    # SIGTERM instead of Next exiting mid-delivery.
    export NEXT_MANUAL_SIG_HANDLE=1
    exec node server.js
    ;;
  *)
    # instrumentation.node.ts only embeds the worker for MODE=all, so a typo
    # would silently run web-only.
    echo "Unknown MODE '${MODE}': expected all, web, or worker" >&2
    exit 1
    ;;
esac
