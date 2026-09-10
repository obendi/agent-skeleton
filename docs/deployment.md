# Despliegue en servidor

[Volver al README](../README.md)

Guía para una instalación nueva, desde la raíz del repositorio. Si ya hay servicios o datos de una configuración anterior, revisar primero [transición y operación](operations.md). Los ejemplos no ejecutan migraciones de almacenamiento automáticamente.

## 1. Requisitos y configuración

Docker Engine con Compose, acceso al repositorio y DNS para `DOMAIN`, `www.DOMAIN`, `app.DOMAIN`, `api.DOMAIN` y `hermes.DOMAIN`. Los registros deben apuntar al servidor. Abrir 80 y 443 para Traefik y la validación ACME; crear AAAA solo si IPv6 funciona. El host debe poder descargar imágenes y dependencias para los builds.

Crear los archivos una vez, sin sobreescribir configuración existente:

```bash
cp docker-compose/traefik/.env.example docker-compose/traefik/.env
cp docker-compose/postgres/.env.example docker-compose/postgres/.env
cp docker-compose/api/.env.example docker-compose/api/.env
cp docker-compose/app/.env.example docker-compose/app/.env
cp docker-compose/nginx/.env.example docker-compose/nginx/.env
cp docker-compose/hermes-agent/.env.example docker-compose/hermes-agent/.env
cp docker-compose/hermes-agent/app.env.example docker-compose/hermes-agent/app.env
```

| Archivo | Valores que hay que configurar |
|---|---|
| `traefik/.env` | `ACME_EMAIL` |
| `postgres/.env` | `POSTGRES_ADMIN_PASSWORD`, `WEBAPP_OWNER_PASSWORD`, `WEBAPP_APP_PASSWORD`; opcional `POSTGRES_VOLUME_NAME` |
| `api/.env` | `DOMAIN`, `DATABASE_MIGRATION_PASSWORD`, `DATABASE_APP_PASSWORD` |
| `app/.env` | `DOMAIN` |
| `nginx/.env` | `DOMAIN`, `SITE_ROOT` |
| `hermes-agent/.env` | `DOMAIN`, `SITE_ROOT`, `HERMES_DATA_ROOT` |
| `hermes-agent/app.env` | Proveedor de modelo, Telegram y autenticación del panel, según su ejemplo |

Las rutas de la tabla son relativas a `docker-compose/`. Usar el mismo `DOMAIN` en todos los consumidores. Una variable ya exportada en la shell tiene prioridad sobre `--env-file`: comprobar que no hay valores ajenos al despliegue, especialmente `DOMAIN` y `COMPOSE_PROJECT_NAME`. Los posibles `.env.local` o `.env.production` antiguos de la raíz no son entradas del flujo actual; los comandos seleccionan explícitamente cada archivo y cada Compose.

Generar tres contraseñas distintas con `openssl rand -hex 32`. Copiar `WEBAPP_OWNER_PASSWORD` a `api/.env` como `DATABASE_MIGRATION_PASSWORD`, y `WEBAPP_APP_PASSWORD` como `DATABASE_APP_PASSWORD`. Usar hex evita caracteres que necesitarían codificación dentro de la URL PostgreSQL. El frontend no recibe ninguna credencial de base de datos.

El archivo `app.env` de Hermes se entrega al contenedor mediante `env_file`. Los demás `.env` se usan para interpolar Compose; algunos valores sí llegan al contenedor cuando se referencian desde `environment`. En archivos de entorno, usar comillas simples cuando un valor deba contener `$` literal; no asumir que los valores sin comillas se transmiten sin interpolación.

Para Hermes, completar `HERMES_DASHBOARD_BASIC_AUTH_*` antes de exponer el panel. `HERMES_DATA_DIR` se fija a `/opt/data` desde Compose. Los secretos de Telegram y del proveedor se configuran en `app.env`, no en el frontend.

## 2. Carpetas persistentes

Con los valores predeterminados, desde la raíz:

```bash
mkdir -p data/site data/hermes
chmod 700 data/hermes
```

`../../data/site` y `../../data/hermes` se resuelven desde las carpetas de los Compose correspondientes. También se admiten rutas absolutas. `SITE_ROOT` debe resolver a la misma carpeta en nginx y Hermes, y ser distinta y ajena a la carpeta privada de Hermes.

Configurar la propiedad de `data/hermes` para el usuario efectivo del agente y darle escritura sobre `data/site`. No fijar un UID por suposición: seguir [permisos de Hermes](hermes-storage.md). nginx necesita poder leer archivos y atravesar directorios públicos. En Linux pueden usarse ACLs para conceder escritura al UID de Hermes; los ficheros publicados deben seguir siendo legibles para nginx. No aplicar `chmod 777`.

Antes del primer arranque de nginx público debe existir un `data/site/index.html` legible. Su healthcheck consulta `/`; sin un índice, nginx puede marcarse como no saludable aunque esté funcionando. Puede ser la primera página real creada por Hermes. No publicar secretos ni datos privados en esa carpeta.

## 3. Redes y volumen

Crear estos recursos una vez; si ya existen, comprobarlos en lugar de eliminarlos:

```bash
docker network create proxy-web
docker network create proxy-hermes
docker network create proxy-api
docker network create proxy-app
docker volume create infrastructure-postgres-data
```

Si se cambia `POSTGRES_VOLUME_NAME`, crear el volumen con ese nombre. PostgreSQL crea su red interna `postgres-webapp`; la API la consume como externa. Los certificados usan un volumen gestionado por el proyecto Traefik.

## 4. Arrancar infraestructura

```bash
docker compose --env-file docker-compose/postgres/.env -f docker-compose/postgres/docker-compose.yml up -d --wait
docker compose -p traefik --env-file docker-compose/traefik/.env -f docker-compose/traefik/docker-compose.yml -f docker-compose/traefik/application.override.yml up -d --wait
```

El override añade las redes de app y API a Traefik. Mantenerlo al actualizar Traefik. Si ya existe un despliegue, usar su nombre de proyecto en lugar de crear otro con `-p traefik`.

Los roles y la base se inicializan solo en un volumen PostgreSQL vacío. Modificar las variables después no cambia las contraseñas guardadas. Véase [administración de PostgreSQL](../docker-compose/postgres/README.md).

## 5. Arrancar API y frontend

```bash
docker compose --env-file docker-compose/api/.env -f docker-compose/api/docker-compose.yml up -d --build --wait
docker compose --env-file docker-compose/app/.env -f docker-compose/app/docker-compose.yml up -d --build --wait
```

Los proyectos se llaman `webapp-api` y `webapp-frontend`. El migrador pertenece a la API y debe terminar correctamente antes de que arranque el backend. No existe `depends_on` entre proyectos: PostgreSQL debe estar saludable primero.

Crear el administrador leyendo la contraseña sin ponerla en el historial. En Bash:

```bash
read -r -s -p 'Contraseña: ' APP_PASSWORD
printf '%s' "$APP_PASSWORD" | docker compose --env-file docker-compose/api/.env -f docker-compose/api/docker-compose.yml run --rm -T migrate node apps/api/dist/create-user.js admin@example.com admin
unset APP_PASSWORD
```

En zsh, usar `read -r -s 'APP_PASSWORD?Contraseña: '` en la primera línea. Se usa `migrate` porque la cuenta de ejecución de la API no puede insertar usuarios. La contraseña debe tener 12–128 caracteres.

## 6. Arrancar publicación estática y Hermes

```bash
docker compose -p nginx --env-file docker-compose/nginx/.env -f docker-compose/nginx/docker-compose.yml up -d --wait
docker compose -p hermes-agent --env-file docker-compose/hermes-agent/.env -f docker-compose/hermes-agent/docker-compose.yml up -d
```

Hermes no tiene un healthcheck definido: revisar sus logs y el acceso autenticado al panel. En instalaciones existentes, mantener los nombres de proyecto que ya se usan.

## 7. Comprobaciones

- El dominio público y `www` sirven el índice esperado; un subdirectorio publicado se abre correctamente.
- `app.DOMAIN` muestra el login y permite entrar y salir con el usuario creado.
- `api.DOMAIN/health` responde; `api.DOMAIN/auth/me` devuelve 401 sin sesión.
- `hermes.DOMAIN` exige autenticación y el agente conserva configuración tras reiniciarse.
- Los certificados son válidos y HTTP redirige a HTTPS.
- PostgreSQL, nginx y API no tienen puertos directos publicados en producción.

`--wait` comprueba salud/estado de contenedores, no DNS, certificados ni el flujo completo de login. Cambiar `DOMAIN` requiere reconstruir el frontend, que incorpora el origen de API durante el build, y actualizar el origen permitido del backend.

## Opcional: Interactive Brokers

Para Finanzas → Growth, seguir la [guía del Gateway en Docker](../docker-compose/ibkr/README.md). Incluye el navegador remoto para autenticar en un VPS sin escritorio. Después de activarlo, usar también `docker-compose/api/ibkr.override.yml` en los comandos de despliegue de API.
