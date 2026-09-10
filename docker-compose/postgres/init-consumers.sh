#!/bin/sh
set -eu
# Runs only when initializing an empty volume. Migration owner is NOT a cluster admin.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  --set=owner_password="$WEBAPP_OWNER_PASSWORD" \
  --set=app_password="$WEBAPP_APP_PASSWORD" <<'SQL'
CREATE ROLE webapp LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'owner_password';
CREATE ROLE webapp_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'app_password';
REVOKE CONNECT, TEMPORARY ON DATABASE postgres FROM PUBLIC;
REVOKE CONNECT, TEMPORARY ON DATABASE template1 FROM PUBLIC;
CREATE DATABASE webapp OWNER webapp;
REVOKE ALL ON DATABASE webapp FROM PUBLIC;
GRANT CONNECT ON DATABASE webapp TO webapp, webapp_app;
\connect webapp
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO webapp;
GRANT USAGE ON SCHEMA public TO webapp_app;
SQL
