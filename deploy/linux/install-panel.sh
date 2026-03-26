#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
WEB_INTERFACE="${PROJECT_ROOT}/Web-interface"

cd "${WEB_INTERFACE}"
npm install
npm run build

echo "Build completed."
echo "Use the provided systemd unit and Caddyfile template for production."
