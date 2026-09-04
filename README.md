# agent-skeleton

Docker infrastructure for self-hosting services, with Traefik as reverse proxy,
automatic HTTPS via Let's Encrypt and basic authentication.

## Services

| Service        | Image                                  | Description                                           |
|----------------|----------------------------------------|-------------------------------------------------------|
| `traefik`      | `traefik:v3.7.12`                      | Edge proxy: routing, TLS and HTTP → HTTPS redirection |
| `socket-proxy` | `tecnativa/docker-socket-proxy:0.3.0`  | Read-only Docker API gateway for Traefik              |
| `web`          | `nginx:1.30.4-alpine`                  | Static website                                        |
| `hermes`       | `nousresearch/hermes-agent`            | Hermes agent with dashboard                           |

Every image is pinned by digest, so a moved tag cannot silently change what runs.

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
   file (domain, Basic Auth hash) and is never injected into a container, while
   `app.env` holds the agent's own secrets (API keys) and is. Neither is
   versioned.

   Generate Basic Auth hashes with bcrypt, not the default MD5 crypt:

   ```bash
   htpasswd -nbB <user> <password> | cut -d: -f2
   ```

   Remember to escape every `$` as `$$` in `.env`, otherwise Compose reads it as
   a variable. Do **not** escape anything in `app.env`, whose values are passed
   verbatim.

3. `/opt/site` must exist and be world-readable; it is mounted read-only into
   `web`.

4. Start the stacks:

   ```bash
   docker compose -f docker-compose/traefik/docker-compose.yml up -d
   docker compose -f docker-compose/nginx/docker-compose.yml up -d
   docker compose -f docker-compose/hermes-agent/docker-compose.yml up -d
   ```

To avoid burning Let's Encrypt rate limits while testing, uncomment the ACME
staging `caserver` line in the Traefik stack first.

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
- **Basic authentication behind a rate limit** on `web` and `hermes`. BasicAuth
  has no brute-force protection of its own, so a `rateLimit` middleware sits in
  front of it. Middleware order is `security-headers → rate limit → auth`, so
  headers apply to 401 responses too and throttling happens before any
  credential check.
- **Network segmentation.** `web` and `hermes` are on separate networks. On a
  single shared network, anything running next to Hermes could reach
  `hermes:9119` directly and skip Traefik's authentication entirely.
- **Container hardening:** `no-new-privileges` and `cap_drop: ALL` on every
  container, `read_only` root filesystems on `traefik`, `web` and `hermes`, plus
  CPU, memory, PID and log limits.
- **Access logs** in JSON with request headers dropped, so failed
  authentication attempts are auditable without recording credentials.
- The Traefik dashboard and API are disabled, and `/ping` is bound to a
  container-local entrypoint that is never published.
- Version telemetry to Traefik Labs is turned off.

### Worth knowing

- Hermes' dashboard is reachable from the internet with only Basic Auth in front
  of it, and it holds your API keys. If you can reach it from a fixed network or
  a VPN, uncomment `trusted-ips` in `docker-compose/traefik/dynamic/security.yml`
  and add it to the front of the router's middleware chain.
- `socket-proxy` is the one container without a read-only root filesystem: its
  entrypoint renders `haproxy.cfg` next to the template it ships, so that path
  has to stay writable.
- `web` keeps four capabilities (`CHOWN`, `SETGID`, `SETUID`,
  `NET_BIND_SERVICE`) because the nginx master starts as root before dropping to
  the `nginx` user. Switching to `nginxinc/nginx-unprivileged` would let you drop
  all of them, at the cost of listening on `:8080`.
- Healthchecks use `127.0.0.1`, not `localhost`. With a read-only root
  filesystem the nginx image cannot add its IPv6 listen directive, so nginx is
  IPv4-only while `localhost` resolves to `::1` first — using `localhost` leaves
  the container permanently unhealthy.
- Image digests need updating along with the tags. Consider Renovate or
  Dependabot so security patches do not go unnoticed.

## Volumes

| Volume                | Service   | Purpose                     |
|-----------------------|-----------|-----------------------------|
| `traefik-letsencrypt` | `traefik` | ACME certificates           |
| `hermes-data`         | `hermes`  | Persistent data             |
| `/opt/site` (host)    | `web`     | Static content (read-only)  |
