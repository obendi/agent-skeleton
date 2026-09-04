# bendiHope

Docker infrastructure for self-hosting services, with Traefik as reverse proxy, automatic HTTPS via Let's Encrypt and basic authentication.

## Services

| Service   | Image                          | Description                                           |
|-----------|--------------------------------|-------------------------------------------------------|
| `traefik` | `traefik:v3.3`                 | Edge proxy: routing, TLS and HTTP → HTTPS redirection |
| `web`     | `nginx:1.27-alpine`            | Static website                                         |
| `hermes`  | `nousresearch/hermes-agent`    | Hermes agent with dashboard                            |

Each service lives in its own folder under `docker-compose/` and is deployed independently, communicating through the external `proxy` network.

## Getting started

1. Create the external network (one-time):

   ```bash
   docker network create proxy
   ```

2. Copy each folder's `.env.example` to `.env` and fill in the values (domain, ACME email, Basic Auth credentials, etc.). The `.env` files are not versioned.

3. Start the stacks:

   ```bash
   docker compose -f docker-compose/traefik/docker-compose.yml up -d
   docker compose -f docker-compose/nginx/docker-compose.yml up -d
   docker compose -f docker-compose/hermes-agent/docker-compose.yml up -d
   ```

## Security

- Forced HTTPS: all traffic on `:80` is redirected to `:443`.
- Automatic certificates via Let's Encrypt (HTTP challenge).
- Basic authentication via Traefik middleware on `web` and `hermes`.
- Container hardening: `read_only`, `no-new-privileges`, `cap_drop` and resource/log limits.

## Volumes

| Volume                | Service   | Purpose                          |
|-----------------------|-----------|----------------------------------|
| `traefik-letsencrypt` | `traefik` | ACME certificates                |
| `hermes-data`         | `hermes`  | Persistent data                  |
| `/opt/site` (host)    | `web`     | Static content (read-only)        |

