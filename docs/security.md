# Seguridad y límites actuales

[Volver al README](../README.md)

Esta guía describe controles presentes en el código y Compose. No constituye una auditoría del servidor ni una garantía de que un despliegue externo esté configurado igual.

## Red y servicios

Traefik publica 80/443, redirige a HTTPS y aplica los encabezados compartidos de `docker-compose/traefik/dynamic/security.yml`, incluyendo HSTS y TLS mínimo 1.2. HSTS no protege una primera visita HTTP antes de que el navegador conozca la política. El dashboard de Traefik está deshabilitado.

| Red | Servicios conectados |
|---|---|
| `proxy-web` | Traefik y nginx público |
| `proxy-hermes` | Traefik y Hermes |
| `proxy-api` | Traefik y API |
| `proxy-app` | Traefik y frontend |
| `postgres-webapp` (interna) | PostgreSQL, API y migraciones |
| `socket-proxy` (interna) | Traefik y proxy de la API Docker |

La separación evita acceso directo entre los backends por esas redes; no es una prohibición de que se contacten mediante sus URLs públicas. Traefik consulta Docker a través de socket-proxy, que expone un conjunto limitado de endpoints de lectura. Solo socket-proxy monta el socket; un montaje `:ro` del socket por sí solo no limita sus operaciones HTTP.

## API y sesiones

- Las rutas exigen sesión por defecto. Login, salud y el preflight CORS son públicos; el endpoint de administración comprueba el rol actual en PostgreSQL.
- Sesiones aleatorias de 256 bits, almacenadas como hashes SHA-256, con caducidad absoluta de ocho horas. Login rota la sesión presentada y logout la revoca. La limpieza de sesiones vencidas se ejecuta al arrancar y periódicamente.
- Cookie de producción `__Host-session`: `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, sin `Domain`. Los tokens no se guardan en localStorage. En desarrollo se usa `session` sin Secure para HTTP local.
- CORS acepta un origen exacto. Las escrituras requieren ese `Origin` y `X-Requested-With: webapp`, protegiendo también contra CSRF desde subdominios hermanos. CORS no sustituye autenticación ni autorización.
- Contraseñas derivadas con scrypt (N=32768, r=8, p=3), sal individual y comparación en tiempo constante. Login calcula también una derivación para emails inexistentes.
- Entradas de login validadas estrictamente, cuerpo máximo de 16 KiB, consultas parametrizadas y errores de servidor sin detalles internos al cliente.
- Rate limit en Traefik y Fastify; login limitado a 10 intentos por IP cada 15 minutos. Los contadores de Fastify son locales a cada instancia; un despliegue con réplicas necesita un diseño de límites compartido.
- En producción se confía exactamente en un salto de proxy. No publicar directamente el puerto API ni habilitar confianza indiscriminada en cabeceras reenviadas. Si se añade CDN u otro proxy, revisar este supuesto.

Las nuevas entidades necesitarán permisos por registro además del rol. No hay MFA, recuperación de contraseña, SSO, registro público ni autenticación para servicios externos implementados.

## Base de datos

El administrador `postgres` permanece en infraestructura. `webapp` es propietario de su base sin SUPERUSER, CREATEDB ni CREATEROLE. `webapp_app` tiene SELECT en usuarios y SELECT/INSERT/DELETE en sesiones; no administra tablas ni crea usuarios. Las migraciones conceden estos permisos.

Las conexiones Docker internas no tienen TLS PostgreSQL configurado. Este diseño asume un host Docker de confianza y red privada en el mismo servidor; para separar hosts o cruzar redes no confiables hay que configurar transporte protegido. Compartir PostgreSQL implica compartir recursos y disponibilidad, aunque los permisos de cada consumidor estén separados.

## Hermes, archivos y contenedores

Los datos privados y públicos están en montajes diferentes. nginx solo monta `SITE_ROOT` como lectura. Hermes puede modificar tanto su estado como lo que publica: revisar el contenido del agente, que puede procesar información externa no confiable. Las copias deben estar fuera de su alcance.

El panel de Hermes se configura con autenticación propia mediante `HERMES_DASHBOARD_BASIC_AUTH_*`; Traefik no añade un middleware Basic Auth para él. Verificar ese comportamiento en el panel real antes de dar acceso. Para restringirlo a VPN/IPs autorizadas haría falta configurar esa restricción: no viene activada.

API, frontend y otros servicios tienen medidas de endurecimiento según su Compose. No son uniformes: Hermes no tiene `read_only`, `cap_drop` ni `no-new-privileges`; PostgreSQL y socket-proxy requieren escritura en su configuración actual. No todos los servicios tienen los mismos límites de recursos ni healthchecks.

Los logs de Traefik descartan cabeceras y la API configura redacción de cookies/autorización. Esto no garantiza que los logs de todos los servicios estén libres de información sensible: proteger su acceso y revisar antes de compartirlos.

Traefik, socket-proxy, nginx público y Hermes tienen imágenes fijadas por digest en sus Compose. PostgreSQL y las imágenes de build/frontend usan etiquetas. Revisar actualizaciones, dependencias e imágenes periódicamente; las comprobaciones de `npm audit` solo reflejan el momento de su ejecución.

`data/` y archivos de entorno están excluidos de Git y de builds Docker. Los ejemplos sí se versionan. Para carpetas personalizadas dentro del repositorio, ampliar las exclusiones; Git no deja de seguir automáticamente un archivo previamente añadido. Proteger las copias y probar restauraciones: ni un bind mount ni un volumen son un backup.
