#!/bin/bash
set -euo pipefail
until [ -S /tmp/.X11-unix/X99 ] && curl --silent --fail --cacert /state/localhost.crt https://localhost:5000/ >/dev/null; do
  sleep 2
done
# The profile is exclusive to this service; discard locks from a previous container.
rm -f /state/browser/SingletonLock /state/browser/SingletonSocket /state/browser/SingletonCookie
exec chromium --no-first-run --no-default-browser-check --disable-dev-shm-usage \
  --user-data-dir=/state/browser --password-store=basic https://localhost:5000/
