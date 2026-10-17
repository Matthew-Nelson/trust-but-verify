#!/usr/bin/env bash
# Prism mock of spec/openapi.json on 127.0.0.1:4010, restarted whenever it crashes
# (Prism 5.16.0 dies on malformed percent-escapes such as /api/links/%zz).
cd "$(dirname "$0")/.."
trap 'kill 0' EXIT
while true; do
  ./node_modules/.bin/prism mock -h 127.0.0.1 -p "${MOCK_PORT:-4010}" ../spec/openapi.json >> results/prism.log 2>&1
  echo "[mock] prism exited ($?); restarting" >> results/prism.log
  sleep 0.2
done
