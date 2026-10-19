#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
echo "n8n: http://localhost:5678"
npm run n8n
