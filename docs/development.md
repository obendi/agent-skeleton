# Desarrollo local

[Volver al README](../README.md)

Este flujo ejecuta frontend y API con Node.js en tu ordenador, y solo PostgreSQL en Docker. No necesita Traefik, DNS, HTTPS, nginx público ni Hermes.

## Preparación

Desde la raíz del repositorio, con Node.js 24, npm y Docker arrancado:

```bash
npm ci
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
docker compose -f compose.dev.yml up -d --wait
npm run db:migrate
```

Copiar los ejemplos solo en una primera instalación; no sobreescribir archivos locales que ya estén configurados.

`compose.dev.yml` incluye la definición de `docker-compose/postgres/compose.dev.yml`. Publica PostgreSQL únicamente en `127.0.0.1:5432`, con base y usuario `webapp`, contraseña de ejemplo y volumen `app-dev-db` asociado al proyecto Compose. Este perfil es exclusivo para desarrollo; no tiene los roles separados de producción.

## Primer usuario

No hay registro público ni usuario predeterminado. Crear uno con la CLI, que recibe la contraseña por entrada estándar, no como argumento. Longitud admitida: 12–128 caracteres.

En Bash:

```bash
read -r -s -p 'Contraseña: ' APP_PASSWORD
printf '%s' "$APP_PASSWORD" | npm run user:create -- admin@example.com admin
unset APP_PASSWORD
```

En zsh, sustituir la primera línea por:

```zsh
read -r -s 'APP_PASSWORD?Contraseña: '
```

El último argumento puede ser `admin` o `user`; si se omite, el rol es `user`. Un email existente produce un error; el comando no actualiza usuarios.

## Arranque y comandos

```bash
npm run dev
```

Abrir `http://localhost:5173`. La API escucha en `http://localhost:3000`. Usar `localhost` para ambos: mezclarlo con `127.0.0.1` afecta a origen, cookies y autenticación.

| Comando desde la raíz | Función |
|---|---|
| `npm run dev` | Inicia ambos procesos con recarga |
| `npm run dev -w @webapp/api` | Solo backend |
| `npm run dev -w @webapp/web` | Solo frontend |
| `npm run db:migrate` | Aplica migraciones pendientes |
| `npm run user:create -- EMAIL ROL` | Crea usuario leyendo contraseña de stdin |
| `npm run typecheck` | Comprueba tipos de ambos workspaces |
| `npm test` | Tests de API con almacenamiento de prueba en memoria |
| `npm run build` | Compila API y SPA en sus directorios `dist/` |

Los tests comprueban sesiones, permisos, CSRF, expiración y límites de peticiones. No sustituyen una prueba con PostgreSQL real ni una prueba del navegador.

## Variables locales

| Archivo | Variable | Uso |
|---|---|---|
| `apps/api/.env` | `DATABASE_URL` | Conexión PostgreSQL; también usada por CLI y migraciones |
| `apps/api/.env` | `NODE_ENV` | `development` en local |
| `apps/api/.env` | `PORT` | API, por defecto `3000` |
| `apps/api/.env` | `APP_ORIGIN` | Origen exacto del frontend, sin barra final |
| `apps/api/.env` | `TRUST_PROXY_HOPS` | Opcional, `0` por defecto; no hay proxy local |
| `apps/web/.env` | `VITE_API_ORIGIN` | URL pública de API; no guardar secretos en variables `VITE_*` |

## Migraciones y modelo de datos

`npm run db:migrate` es un script definido en `package.json`. Ejecuta `apps/api/src/migrate.ts`:

1. Lee los archivos SQL de `apps/api/migrations/` en orden.
2. Usa una transacción y un bloqueo para evitar ejecuciones simultáneas.
3. Registra nombre y checksum en `app_migrations`, y aplica únicamente lo pendiente.
4. Comprueba que no se haya modificado una migración ya aplicada.
5. Si existe el rol de producción `webapp_app`, concede los permisos de ejecución actuales.

La primera migración crea `users` y `sessions`. El modelo Drizzle está en `apps/api/src/schema.ts`. Para evolucionar la base, añadir otra migración numerada y actualizar el modelo; no editar una migración ya aplicada. No hay generación automática ni comando de rollback configurados. El SQL actual se ejecuta dentro de una transacción: las operaciones que exijan ejecutarse fuera de ella necesitan adaptar el procedimiento.

## Contrato actual de la API

| Método y ruta | Acceso | Resultado |
|---|---|---|
| `GET /health` | Público | Estado del proceso; no consulta PostgreSQL |
| `POST /auth/login` | Público, limitado | Recibe email/contraseña y establece cookie |
| `GET /auth/me` | Sesión válida | Usuario actual: id, email y rol |
| `POST /auth/logout` | Sesión válida | Revoca sesión, borra cookie, devuelve 204 |
| `GET /admin/status` | Administrador | Endpoint de ejemplo protegido por rol |

Las escrituras requieren `Origin` igual a `APP_ORIGIN` y `X-Requested-With: webapp`, también desde clientes CLI. El frontend ya envía esas cabeceras y usa `credentials: include`. No existe un contrato OpenAPI generado ni autenticación específica para integraciones externas.

Para detener la base local: `docker compose -f compose.dev.yml stop`. No añadir `-v` a un `down` si se quieren conservar los datos.
