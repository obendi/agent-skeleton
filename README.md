# WebApp

Proyecto con una aplicación web, una API y servicios de infraestructura que se despliegan por separado. También permite que Hermes publique webs públicas estáticas sin reconstruir la aplicación.

## Qué incluye

| Componente | Función | Dirección en producción |
|---|---|---|
| App | SPA React, TypeScript, Vite, Tailwind y componentes compatibles con shadcn/ui | `https://app.${DOMAIN}` |
| API | Node.js, Fastify y Drizzle; autenticación y permisos | `https://api.${DOMAIN}` |
| PostgreSQL | Servidor privado de base de datos, independiente de la API | Sin puerto público |
| nginx público | Sirve los archivos estáticos que publica Hermes | `https://${DOMAIN}` y `https://www.${DOMAIN}` |
| Hermes | Agente que escribe webs y mantiene su estado privado | Panel en `https://hermes.${DOMAIN}` |
| Traefik + socket-proxy | HTTPS, enrutamiento y acceso restringido a la API Docker | Puertos 80 y 443 |

La aplicación incluye login, logout, pantalla de cuenta y un endpoint de ejemplo para administradores. Incluye Finanzas → Growth para consultar posiciones de Interactive Brokers una vez configurado el Gateway (ver [configuración](docs/interactive-brokers.md)). No incluye registro público, recuperación de contraseña, correo ni MFA.

Hay **dos nginx distintos**: el público sirve archivos compartidos con Hermes; el de la app sirve la SPA compilada. Hermes no monta el código ni los archivos del frontend.

## Organización

```text
apps/
  api/                 Código, migraciones SQL y Dockerfile del backend
  web/                 Código y Dockerfile del frontend

docker-compose/
  api/                 API y tarea de migraciones
  app/                 SPA y configuración de su nginx
  postgres/            PostgreSQL y provisión de consumidores
  traefik/             Proxy, TLS, redes y socket-proxy
  nginx/               Webs estáticas públicas
  hermes-agent/        Agente y sus montajes

data/                  Datos del host, excluidos de Git y de los builds
  site/                Webs públicas: SITE_ROOT
  hermes/              Datos privados: HERMES_DATA_ROOT

docs/                  Guías por tarea
compose.dev.yml        PostgreSQL para desarrollo local
```

`apps/` describe qué hacen las aplicaciones; `docker-compose/` describe cómo ejecutarlas en el servidor. El monorepo y el lockfile son comunes, pero app, API y PostgreSQL tienen ciclos de despliegue independientes.

## Por dónde empezar

| Necesitas… | Guía |
|---|---|
| Programar o arrancar app y API en tu ordenador | [Desarrollo](docs/development.md) |
| Instalar el conjunto en un servidor | [Despliegue](docs/deployment.md) |
| Publicar webs, actualizar, revisar errores o preparar copias | [Operación](docs/operations.md) |
| Entender accesos, permisos y limitaciones | [Seguridad](docs/security.md) |
| Configurar o migrar los datos privados del agente | [Almacenamiento de Hermes](docs/hermes-storage.md) |
| Administrar PostgreSQL o añadir consumidores | [PostgreSQL](docker-compose/postgres/README.md) |

Para desarrollo se necesitan Node.js 24, npm y Docker con Compose. Para el despliegue se necesita Docker Engine con Compose, un dominio y DNS apuntando al servidor. El flujo local usa Compose con soporte de `include` (2.20 o posterior).

## Datos y configuración

- `SITE_ROOT` y `HERMES_DATA_ROOT` seleccionan carpetas del host. Por defecto son `data/site` y `data/hermes` dentro del proyecto; no se crean automáticamente.
- Dentro de Hermes las rutas siguen siendo `/opt/site` y `/opt/data`. nginx público solo ve las webs, en `/usr/share/nginx/html` y con montaje de solo lectura.
- PostgreSQL de producción usa el volumen externo `infrastructure-postgres-data`. Sus datos no están en `data/`.
- Traefik guarda certificados en el volumen `traefik-letsencrypt`.
- Los `.env`, `app.env` y `data/` están excluidos de Git. Los archivos `.env.example` documentan la configuración sin secretos reales.
- Copiar el repositorio no copia las bases de datos, los certificados ni las carpetas ignoradas. Persistencia no sustituye a una copia de seguridad.

La documentación describe la configuración del repositorio, no certifica que esté desplegada. Se han comprobado compilación y tests de API en el trabajo anterior; el arranque completo de contenedores y HTTPS real siguen pendientes de comprobar en el entorno destino. Las versiones efectivas están en los Compose, Dockerfiles y `package-lock.json`; no se duplican aquí para evitar que queden desactualizadas.
