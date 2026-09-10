#!/bin/bash
set -euo pipefail
umask 077
mkdir -p /state/browser "$HOME/.pki/nssdb" /tmp/nginx
if [ ! -s /run/secrets/vnc_password ]; then
  echo 'Create the vnc_password secret before starting IBKR.' >&2
  exit 1
fi
# Classic VNC uses the first eight characters; SSH supplies transport security.
x11vnc -storepasswd "$(head -c 8 /run/secrets/vnc_password)" /tmp/vnc-password >/dev/null
if [ ! -s /state/localhost.jks ]; then
  keytool -genkeypair -alias localhost -keyalg RSA -keysize 3072 -validity 3650 \
    -dname 'CN=localhost' -ext 'SAN=dns:localhost,ip:127.0.0.1' \
    -storetype JKS -keystore /state/localhost.jks -storepass local-keystore -keypass local-keystore
fi
keytool -exportcert -rfc -alias localhost -keystore /state/localhost.jks \
  -storepass local-keystore -file /state/localhost.crt >/dev/null
if [ ! -f "$HOME/.pki/nssdb/cert9.db" ]; then
  certutil -N -d "sql:$HOME/.pki/nssdb" --empty-password
fi
certutil -A -d "sql:$HOME/.pki/nssdb" -n ibkr-localhost -t 'C,,' -i /state/localhost.crt
exec supervisord -c /etc/ibkr/supervisord.conf
