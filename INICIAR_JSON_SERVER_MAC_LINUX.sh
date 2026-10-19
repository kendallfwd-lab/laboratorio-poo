#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
echo "JSON Server: http://127.0.0.1:3001/facturas"
npm run db
