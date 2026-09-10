# PostgreSQL de infraestructura

[Volver al README](../../README.md) · [Despliegue completo](../../docs/deployment.md)

Despliegue independiente de la aplicación. El administrador del clúster es `postgres`;
WebApp dispone de su base `webapp`, propietario de migraciones `webapp`
(sin privilegios de administrador) y cuenta de ejecución `webapp_app`.
Las migraciones de la aplicación siguen perteneciendo a la aplicación.

## Primera instalación (volumen nuevo)

Desde la raíz del repositorio:

```bash
cp docker-compose/postgres/.env.example docker-compose/postgres/.env
```

Generar tres contraseñas independientes con `openssl rand -hex 32` y guardarlas
como indica el ejemplo. El administrador no se entrega a ninguna aplicación.

```bash
docker volume create infrastructure-postgres-data
docker compose --env-file docker-compose/postgres/.env -f docker-compose/postgres/docker-compose.yml up -d --wait
```

El stack crea la red **interna** `postgres-webapp`. El backend y su migrador
se conectan como consumidores externos a esa red y resuelven `postgres:5432`.
Ni Traefik ni el frontend tienen acceso a ella. No se publica el puerto 5432.

Copiar únicamente `WEBAPP_OWNER_PASSWORD` a `DATABASE_MIGRATION_PASSWORD`
y `WEBAPP_APP_PASSWORD` a `DATABASE_APP_PASSWORD` en `docker-compose/api/.env`. El frontend tiene un despliegue separado y no recibe estas credenciales.
Arrancar PostgreSQL antes de ejecutar el despliegue de la aplicación. Compose
no admite dependencias de salud entre proyectos: si no está disponible, la
migración falla y la API no arranca. Repetir el despliegue cuando esté saludable.

El volumen es externo y tiene un nombre estable: detener/eliminar cualquiera de
los proyectos Compose no borra los datos. Eliminar un volumen manualmente sí.
Las contraseñas de `.env` solo inicializan roles en un volumen vacío; para rotarlas
hay que modificarlas también en PostgreSQL y reiniciar los consumidores afectados.

## Añadir otro consumidor

1. Crear una base propia y dos roles sin SUPERUSER/CREATEDB/CREATEROLE: propietario
   para migraciones y usuario de ejecución con los permisos mínimos necesarios.
2. Revocar los permisos por defecto de PUBLIC sobre esa base y su esquema;
   conceder CONNECT/USAGE solo a los roles correspondientes. PostgreSQL concede
   CONNECT a PUBLIC por defecto: hacerlo explícitamente para cada nueva base.
3. Añadir a este Compose otra red interna, por ejemplo `postgres-reporting`,
   conectar PostgreSQL a ella y declarar esa red externa en el nuevo consumidor.
   No conectar los consumidores nuevos a `postgres-webapp`.
4. Dar acceso a tablas concretas mediante las migraciones de cada aplicación.
   Para compartir operaciones de negocio de WebApp, consumir su API. Para
   informes, conceder SELECT sobre vistas/tablas concretas a un rol específico.

Los consumidores comparten recursos y disponibilidad del servidor PostgreSQL,
pero no credenciales ni acceso automático a otras bases. El administrador del
clúster puede acceder a todas las bases; conservar su credencial solo en infraestructura.

## Si ya se arrancó el Compose anterior de la aplicación

No arrancar dos servidores contra el mismo volumen ni ejecutar `down -v`.
La nueva inicialización **no** actualiza automáticamente un volumen existente.
Identificar y conservar el volumen anterior mediante `docker volume ls` y las
etiquetas del contenedor; su nombre depende del proyecto usado en aquel despliegue.
Realizar una migración controlada:

1. Detener escrituras/API y guardar un `pg_dump -Fc` de la base original desde el
   contenedor anterior. Comprobar la copia y conservar el volumen original.
2. Inicializar este stack con un volumen nuevo y las tres credenciales nuevas.
3. Restaurar en la base nueva con `pg_restore --no-owner --no-privileges`, conectado
   como `webapp`. Esto evita importar el antiguo propietario superusuario.
4. Ejecutar las migraciones de la aplicación para aplicar los GRANT de ejecución,
   validar los datos y el login, y cambiar el backend a la red/credenciales nuevas.
5. Retirar el contenedor anterior únicamente después de verificar el cambio;
   mantener la copia y el volumen original hasta completar la validación.

El Compose nuevo no contiene el servicio antiguo; no usar `--remove-orphans`
antes de completar la copia. Este cambio de código no mueve ni modifica volúmenes.

## Copias y desarrollo

Programar copias por base con `pg_dump`, conservarlas fuera del host y comprobar
restauraciones. Mantener también el procedimiento de provisión de roles. Las
copias no se programan automáticamente con este scaffold.

`compose.dev.yml` en esta carpeta contiene la instancia local de desarrollo,
con contraseña de ejemplo y puerto limitado a `127.0.0.1`. El `compose.dev.yml`
de la raíz la incluye como compatibilidad; nunca utilizarla en producción.

## Cambio del nombre del proyecto

Los nombres genéricos actuales no renombrarán bases, roles, redes ni proyectos
Compose existentes. Si ya se inicializó PostgreSQL con otros nombres, respaldar
la base original y restaurarla en una base `webapp` provisionada con los roles
actuales. El script de inicialización no se ejecuta sobre un volumen con datos;
provisionar esos roles/base administrativamente o usar un volumen nuevo para la
restauración. Conservar el volumen anterior hasta validar el cambio. Actualizar
también los nombres de variables del entorno siguiendo los nuevos ejemplos y
retirar los contenedores antiguos antes de publicar routers equivalentes.
