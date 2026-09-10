# Operación y mantenimiento

[Volver al README](../README.md)

La [guía de despliegue](deployment.md) es la referencia para configurar y arrancar. Este documento cubre tareas posteriores y transiciones desde configuraciones anteriores.

## Publicar webs con Hermes

Pedir al agente que escriba en `/opt/site`. nginx público monta la misma carpeta del host como solo lectura; los archivos se sirven sin reconstruir contenedores.

| Archivo visto por Hermes | URL |
|---|---|
| `/opt/site/index.html` | `https://${DOMAIN}/` |
| `/opt/site/blog/index.html` | `https://${DOMAIN}/blog/` |
| `/opt/site/blog/style.css` | `https://${DOMAIN}/blog/style.css` |

Cada directorio debe tener un índice y los enlaces deben ser relativos o incluir el prefijo correcto. No hay listado de directorios habilitado. Este nginx no tiene el fallback de rutas de la SPA: un archivo inexistente devuelve error. Si se genera contenido con un framework, publicar su salida estática compilada, no sus fuentes.

Para retirar una web, quitarla del directorio servido después de guardar la copia que se quiera conservar. Cambios de archivos son visibles inmediatamente, aunque las cachés de navegador puedan retrasar su percepción. Evitar publicar archivos parcialmente escritos: preparar el contenido y sustituirlo cuando esté completo.

## Inspeccionar y actualizar

Desde la raíz, por ejemplo para la API:

```bash
docker compose --env-file docker-compose/api/.env -f docker-compose/api/docker-compose.yml ps -a
docker compose --env-file docker-compose/api/.env -f docker-compose/api/docker-compose.yml logs --tail=100 api migrate
docker compose --env-file docker-compose/api/.env -f docker-compose/api/docker-compose.yml up -d --build --wait
```

Para frontend, usar el archivo/entorno de `app`; para servicios basados en imágenes, usar su `pull` y `up -d`. Una imagen fijada por digest no se actualiza a otra versión solo con `pull`: hay que cambiar el identificador deliberadamente. Mantener el override de redes al actualizar Traefik y el mismo nombre de proyecto con que se instaló cada servicio.

Frontend y API se actualizan por separado. La API anterior y la SPA publicada pueden coexistir con cambios nuevos: mantener contratos y migraciones compatibles o planificar una ventana de mantenimiento. No hay rollback automático. Volver a una imagen anterior no revierte una migración de base de datos.

Usar `stop` para detener sin borrar contenedores. `down` elimina contenedores y redes gestionadas por ese proyecto; PostgreSQL no podrá quitar su red mientras la API siga conectada. Evitar `down -v`: puede eliminar certificados o la base local, aunque el volumen externo de PostgreSQL de producción esté protegido de ese comando.

## Copias y persistencia

| Datos | Almacenamiento | Qué conservar |
|---|---|---|
| PostgreSQL producción | Volumen externo `infrastructure-postgres-data` (configurable) | Dump por base y procedimiento de provisión de roles |
| PostgreSQL local | Volumen Compose `app-dev-db` | Dump si se necesita conservar el entorno |
| Estado de Hermes | `HERMES_DATA_ROOT` | Copia consistente de toda la carpeta privada |
| Webs públicas | `SITE_ROOT` | Archivos publicados |
| Certificados | Volumen `traefik-letsencrypt` | Estado ACME, con acceso restringido |
| Configuración | Archivos `.env` y `app.env` | Copia cifrada de secretos, fuera de Git |

No hay tareas automáticas de backup configuradas. Guardar copias fuera del host y fuera de los montajes de Hermes; comprobar restauraciones. Seguir la [guía de Hermes](hermes-storage.md) para sus archivos y la [de PostgreSQL](../docker-compose/postgres/README.md) para datos y consumidores.

## Cambios desde versiones anteriores

- **App y API antes compartían Compose:** identificar el proyecto anterior con `docker compose ls`. Detener sus contenedores app/API antes de arrancar los proyectos nuevos, para evitar routers duplicados en Traefik. Mantener datos y configuración hasta verificar el cambio; no usar `--remove-orphans` a ciegas.
- **PostgreSQL antes estaba dentro del despliegue de la API o tenía otros nombres:** los cambios de código no renombrarán bases, roles o volúmenes. Seguir el procedimiento de restauración de su guía antes de usar las nuevas credenciales.
- **Hermes usaba un volumen `hermes-data`:** copiar los datos con el agente detenido antes de sustituirlo por `HERMES_DATA_ROOT`. Véase la guía de almacenamiento.
- **Las webs estaban en `/opt/site` del host:** mantener `SITE_ROOT=/opt/site` en ambos consumidores hasta copiar el contenido a la carpeta elegida. El cambio de variable no mueve archivos.
- **Variables globales de un Compose anterior:** usar los archivos específicos de cada componente. No mezclar un antiguo `COMPOSE_FILE` o `COMPOSE_PROJECT_NAME` exportado con estos comandos.

## Problemas habituales

| Síntoma | Qué revisar |
|---|---|
| Docker no responde | Engine/Desktop arrancado, contexto y acceso al socket |
| Red externa inexistente | Redes creadas según despliegue; PostgreSQL arrancado antes de API |
| Volumen externo inexistente | Crear el nombre indicado por `POSTGRES_VOLUME_NAME` |
| Error de bind mount | Carpeta existente, ruta resuelta desde el Compose y permisos |
| nginx público no saludable | Existe un `index.html` legible en `SITE_ROOT` |
| Migración falla / API no arranca | Logs de `migrate`, salud PostgreSQL, credenciales y roles del volumen actual |
| Login devuelve 403 | `DOMAIN`, `APP_ORIGIN`, origen real del navegador y cabecera requerida |
| Login devuelve 401 | Usuario creado, contraseña correcta y cookie; en local no mezclar nombres de host |
| Login devuelve 429 | Límite de intentos; revisar IP observada y esperar la ventana |
| Frontend apunta a API antigua | Reconstruir con el `DOMAIN` actual |
| Certificado inválido | DNS, puertos 80/443, email ACME y logs de Traefik |
| Hermes pierde configuración | `HERMES_DATA_ROOT` correcto y migración del volumen anterior completada |

`GET /health` verifica que la API responde, no que la base siga disponible. No interpretar únicamente ese resultado como una prueba completa del sistema.
