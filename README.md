# Hermes site-publishing stack

Docker infrastructure for self-hosting services behind Traefik as reverse
proxy, with automatic HTTPS via Let's Encrypt. The Hermes agent authors static
sites into a shared directory that nginx serves, with no build or deploy step.

## Services

| Service        | Image                                  | Description                                           |
|----------------|----------------------------------------|-------------------------------------------------------|
| `traefik`      | `traefik:v3.7.12`                      | Edge proxy: routing, TLS and HTTP → HTTPS redirection |
| `socket-proxy` | `tecnativa/docker-socket-proxy:0.3.0`  | Read-only Docker API gateway for Traefik              |
| `web`          | `nginx:1.30.4-alpine`                  | Static sites, one per subdirectory of `/opt/site`     |
| `hermes`       | `nousresearch/hermes-agent:v2026.8.31` | Hermes agent (gateway) with dashboard; authors the sites |

Every image is pinned by digest in its `docker-compose.yml`, so a moved tag
cannot silently change what runs.

Each service lives in its own folder under `docker-compose/` and is deployed
independently. Traefik reaches each backend over a dedicated network.

## Getting started

1. Create the external networks (one-time). There is one per backend, so a
   compromised container cannot reach another service directly:

   ```bash
   docker network create proxy-web
   docker network create proxy-hermes
   ```

2. Copy each folder's `.env.example` to `.env` and fill in the values. For
   `hermes-agent`, also copy `app.env.example` to `app.env`:

   ```bash
   cp docker-compose/traefik/.env.example       docker-compose/traefik/.env
   cp docker-compose/nginx/.env.example         docker-compose/nginx/.env
   cp docker-compose/hermes-agent/.env.example  docker-compose/hermes-agent/.env
   cp docker-compose/hermes-agent/app.env.example docker-compose/hermes-agent/app.env
   ```

   The split matters: `.env` holds only values used to interpolate the Compose
   file — the Let's Encrypt email and the domain(s) in the Traefik labels — and
   is never injected into a container. `app.env` holds the agent's own
   configuration and secrets and is injected into `hermes` via `env_file`.
   Neither is versioned.

   | File                   | Variable    | Purpose                                      |
   |------------------------|-------------|----------------------------------------------|
   | `traefik/.env`         | `ACME_EMAIL` | Email for Let's Encrypt                     |
   | `nginx/.env`           | `DOMAIN`    | Domain serving the published sites           |
   | `hermes-agent/.env`    | `DOMAIN`    | Domain the dashboard is served under         |
   | `hermes-agent/app.env` | —           | Hermes configuration, see below              |

   In `app.env`:

   - `OPENCODE_GO_API_KEY` — API key of the model provider (OpenCode Go).
   - `TELEGRAM_BOT_TOKEN` / `TELEGRAM_ALLOWED_USERS` — Telegram bot credentials
     and the allowlisted user IDs that may talk to it.
   - `HERMES_DASHBOARD_BASIC_AUTH_USERNAME` / `HERMES_DASHBOARD_BASIC_AUTH_PASSWORD`
     / `HERMES_DASHBOARD_BASIC_AUTH_SECRET` — HTTP Basic Auth protecting the
     dashboard. Generate the secret with `openssl rand -base64 32`.
   - `HERMES_DATA_DIR` — persistent data directory; set to `/opt/data`.

   Note: `env_file` values are passed verbatim, so do **not** escape `$` as
   `$$` in `app.env`.

3. Create `/opt/site`, the directory both `web` and `hermes` share. It must
   exist before the stacks start because it is bind-mounted. nginx reads it:
   its master process starts as root and drops to the unprivileged `nginx`
   user, so the tree must be readable and traversable by everyone. Hermes
   writes to it as UID `10000`, which needs ACL write access:

   ```bash
   sudo install -d -m 755 /opt/site
   sudo setfacl -R -m u:10000:rwX /opt/site
   sudo find /opt/site -type d -exec setfacl -m d:u:10000:rwx {} +
   ```

   `setfacl` ships with the `acl` package and is a Linux tool, so this step
   runs on the Docker host.

4. Start the stacks:

   ```bash
   docker compose -f docker-compose/traefik/docker-compose.yml up -d
   docker compose -f docker-compose/nginx/docker-compose.yml up -d
   docker compose -f docker-compose/hermes-agent/docker-compose.yml up -d
   ```

To avoid burning Let's Encrypt rate limits while testing, uncomment the ACME
staging `caserver` line in the Traefik stack first.

## Hermes dashboard

The dashboard is served at `https://hermes.<DOMAIN>` through Traefik and is
protected by HTTP Basic Auth with the credentials in `app.env`
(`HERMES_DASHBOARD_BASIC_AUTH_*`). The container binds it to `0.0.0.0:9119` on
its own `proxy-hermes` network, so only Traefik can reach it directly.

## Publishing sites

`/opt/site` is mounted read-write into `hermes` and read-only into `web`, at the
same path on both sides. That single shared directory is the whole publishing
pipeline: ask the agent for a site, it writes the files, nginx serves them on the
next request. There is no build or deploy step, and nothing to restart.

Each site is a subdirectory, served at the matching URL path:

| On disk                       | URL                            |
|-------------------------------|--------------------------------|
| `/opt/site/index.html`        | `https://<domain>/`            |
| `/opt/site/blog/index.html`   | `https://<domain>/blog/`       |
| `/opt/site/blog/style.css`    | `https://<domain>/blog/style.css` |

nginx' stock configuration already does this, so adding a site needs no config
change anywhere — which is the reason to prefer subdirectories over a subdomain
per site. Subdomains would mean a `server` block, a Traefik router and a
certificate for every new site, all of it under the agent's nose.

Two things to tell the agent, because neither is obvious from inside the
container:

- **Link relatively.** A site under `/blog/` that asks for `/style.css` requests
  the domain root and gets a 404. Use `style.css` or `/blog/style.css`.
- **Every directory needs an `index.html`.** Directory listings are off, so a
  directory without one returns 403, not a file list.

To take a site offline, delete or rename its directory; there is no state
anywhere else.

## Security

- **No direct access to the Docker socket.** Traefik talks to
  `socket-proxy`, which only forwards the endpoints the Docker provider needs
  and rejects every write. Mounting `/var/run/docker.sock` with `:ro` would not
  have helped: the flag only protects the socket *file*, not the API behind it,
  so a compromised Traefik could still have started a privileged container and
  taken over the host. The socket-proxy sits on an `internal` network with no
  route to the internet.
- **Forced HTTPS with HSTS.** Traffic on `:80` is redirected to `:443`, and
  `Strict-Transport-Security` closes the downgrade window that a bare redirect
  leaves open on the first request.
- **TLS 1.2 minimum**, with an explicit cipher and curve list.
- Automatic certificates via Let's Encrypt (HTTP challenge).
- **Network segmentation.** `web` and `hermes` are on separate networks. On a
  single shared network, anything running next to Hermes could reach
  `hermes:9119` directly and skip the reverse proxy entirely.
- **The agent's only writable host path is the document root.** Publishing
  requires giving Hermes write access to something the internet reads, so the
  mount is kept as narrow as the job allows: content only, never the Compose
  files, Traefik's dynamic config or the Docker socket. The worst it can do to
  this stack is serve a bad page, not change who gets routed where or what
  certificate is presented. nginx keeps the same directory read-only, so a
  compromised web server cannot rewrite the site it serves.
- **Container hardening.** `traefik` and `web` run with `no-new-privileges`,
  `cap_drop: ALL`, a read-only root filesystem and PID limits; `socket-proxy`
  drops every capability but `SETUID`/`SETGID` (its entrypoint renders
  `haproxy.cfg` next to the template it ships, so that path must stay
  writable). All containers have CPU, memory and log limits.
- **Access logs** in JSON with request headers dropped, so Authorization and
  Cookie values are never recorded.
- The Traefik dashboard and API are disabled, and `/ping` is bound to a
  container-local entrypoint that is never published.
- Version telemetry to Traefik Labs is turned off.

### Worth knowing

- Hermes' dashboard is exposed to the internet with HTTP Basic Auth in front of
  it, and it holds your API keys and Telegram credentials. If you only reach it
  from a fixed network or a VPN, add an `ipAllowList` middleware to the
  `hermes` router to restrict it further.
- `hermes` is the only container without hardening flags (`read_only`,
  `no-new-privileges`, `cap_drop: ALL`). It holds secrets and writes to the
  public directory, so it is the container to keep an eye on.
- Hermes browses and searches the web, and it publishes to a public directory.
  A page it reads while researching a site can try to talk it into writing
  something else, so validate published content before exposing it publicly.
- `socket-proxy` is the one container without a read-only root filesystem: its
  entrypoint renders `haproxy.cfg` next to the template it ships, so that path
  has to stay writable.
- `web` keeps four capabilities (`CHOWN`, `SETGID`, `SETUID`,
  `NET_BIND_SERVICE`) because the nginx master starts as root before dropping to
  the `nginx` user. Switching to `nginxinc/nginx-unprivileged` would let you drop
  all of them, at the cost of listening on `:8080`.
- The `traefik` and `web` healthchecks use `127.0.0.1`, not `localhost`. With a
  read-only root filesystem the nginx image cannot add its IPv6 listen
  directive, so nginx is IPv4-only while `localhost` resolves to `::1` first —
  using `localhost` leaves the container permanently unhealthy. `hermes` has no
  healthcheck.
- Image digests need updating along with the tags. Consider Renovate or
  Dependabot so security patches do not go unnoticed.

## Volumes

| Volume                | Service   | Purpose                     |
|-----------------------|-----------|-----------------------------|
| `traefik-letsencrypt` | `traefik` | ACME certificates           |
| `hermes-data`         | `hermes`  | Persistent data (read-write)|
| `/opt/site` (host)    | `hermes`  | Static content (read-write) |
| `/opt/site` (host)    | `web`     | Static content (read-only)  |
