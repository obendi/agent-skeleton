#!/bin/bash
set -euo pipefail
curl -fsS --max-time 5 --cacert /state/localhost.crt https://localhost:5000/ >/dev/null
curl -fsS --max-time 5 http://localhost:8080/health >/dev/null
curl -fsS --max-time 5 http://localhost:6080/vnc.html >/dev/null
supervisorctl -c /etc/ibkr/supervisord.conf status | awk '
  $2 != "RUNNING" { failed = 1 }
  END { exit (failed || NR != 7) }
'
