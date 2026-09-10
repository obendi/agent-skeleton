# Datos persistentes de Hermes

[Volver al README](../README.md) · [Despliegue completo](deployment.md)

`HERMES_DATA_ROOT` configura una carpeta del host en el `.env` de Hermes. El
contenedor la monta en `/opt/data`, con lectura y escritura. Compose fija
`HERMES_DATA_DIR=/opt/data` para que los datos se escriban en el montaje persistente.
El valor recomendado `../../data/hermes` es relativo a `docker-compose/hermes-agent/`.
Para despliegues con múltiples Compose o `--project-directory`, preferir una ruta
absoluta para evitar ambigüedad. Cambiar la variable no traslada archivos.

## Separación y permisos

- Usar carpetas hermanas, por ejemplo `data/hermes` y `data/site`. Nunca colocar
  datos privados dentro de `SITE_ROOT`, ni usar la misma carpeta para ambos.
  No publicar enlaces simbólicos desde las webs hacia los datos privados.
- Solo Hermes monta la carpeta privada; nginx sigue montando únicamente `SITE_ROOT`.
- Crear la carpeta explícitamente. `create_host_path: false` hace fallar un montaje
  si la carpeta no existe, en lugar de crearla silenciosamente con permisos inadecuados.
- En el host, restringir el directorio a su propietario (`chmod 700`). En Linux,
  asignar la propiedad al UID/GID efectivo de Hermes, comprobándolo en el servicio
  actual con `docker compose -f docker-compose/hermes-agent/docker-compose.yml exec hermes id`.
  Si todavía no existe, comprobar el usuario de la imagen antes del primer arranque.
  Aplicar `chown UID:GID /ruta/privada` sustituyendo por los valores comprobados;
  no asumir que coinciden con el usuario del host y no usar `chmod 777`.
- En Docker Desktop, permitir compartir la carpeta del host y comprobar que Hermes
  puede escribir. No aplicar a macOS cambios de propietario Linux sin necesidad.
- `data/` está excluido de Git y del contexto de build Docker. Si se elige otra
  carpeta dentro del repositorio, excluirla también en `.gitignore` y `.dockerignore`
  antes de guardar datos. Esos archivos no eliminan datos que ya estuvieran versionados.

## Migrar desde el volumen `hermes-data`

Este cambio no elimina ni copia el volumen existente. No iniciar Hermes con una
carpeta vacía esperando encontrar los datos anteriores.

1. Identificar el contenedor y su volumen actuales; comprobar su UID/GID antes
   de detenerlo. Conservar las credenciales y configuración del despliegue.
2. Detener Hermes, manteniendo el contenedor y el volumen. No ejecutar `down -v`.
3. Crear la carpeta privada de destino, vacía y fuera de `SITE_ROOT`.
4. Copiar **todo** `/opt/data` del contenedor detenido, incluidos archivos ocultos,
   a esa carpeta usando `docker cp CONTENEDOR:/opt/data/. /ruta/privada/`.
   Hacer además una copia de respaldo fuera del alcance de Hermes.
5. Ajustar la propiedad al usuario efectivo de Hermes y los permisos privados.
   Comprobar que se han conservado todos los archivos antes de continuar.
6. Configurar `HERMES_DATA_ROOT` con esa ruta y recrear únicamente Hermes mediante
   `docker compose -f docker-compose/hermes-agent/docker-compose.yml up -d hermes`,
   manteniendo el nombre de proyecto y las opciones del despliegue original.
7. Comprobar arranque, configuración, historial y escritura persistente. Conservar
   el volumen anterior y el respaldo hasta validar el funcionamiento.

Para volver atrás, detener Hermes y restaurar el montaje del volumen anterior;
los cambios escritos después de la migración no estarán en ese volumen.

## Copias

Recrear el contenedor conserva la carpeta del host. Esto no protege contra pérdida
del disco ni contra borrados hechos por Hermes. Hacer copias con Hermes detenido
(o un mecanismo de snapshot consistente), cifrarlas y guardarlas fuera de los
montajes del agente. Comprobar restauraciones. No se configura un backup automático
ni se mueve información existente como parte de este cambio de código.
