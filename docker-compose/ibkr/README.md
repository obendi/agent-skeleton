# Client Portal Gateway en un VPS

Este proyecto ejecuta el **Client Portal Gateway**, distinto de TWS / IB Gateway, con Java 17, Chromium, Xvfb, Openbox y noVNC. No hace falta instalar un escritorio en el VPS. El navegador se ejecuta dentro del mismo contenedor que el Gateway; desde tu ordenador solo ves y controlas su pantalla.

```text
Tu navegador → túnel SSH → 127.0.0.1:6080 → noVNC → Chromium
                                                    ↓ HTTPS localhost:5000
                                              Client Portal Gateway → IBKR
                                                    ↑ HTTPS verificado
API de la app → red interna ibkr-portfolio → puente de lectura :8080
```

El puerto 5000 no se publica. El Gateway admite únicamente peticiones desde 127.0.0.1. El puente convierte las consultas de la API en peticiones locales y solo admite las rutas de cuentas y posiciones. La red de lectura no tiene acceso externo; una segunda red da salida a Internet al Gateway y al navegador. No se añade ninguna ruta a Traefik.

## 1. Preparar y arrancar en el VPS

Desde la raíz del repositorio, generar una contraseña VNC sin escribirla en el historial:

```bash
mkdir -p docker-compose/ibkr/secrets
chmod 700 docker-compose/ibkr/secrets
openssl rand -hex 4 > docker-compose/ibkr/secrets/vnc_password
chmod 644 docker-compose/ibkr/secrets/vnc_password
docker compose -f docker-compose/ibkr/docker-compose.yml up -d --build --wait
```

La carpeta 700 impide leer el archivo desde otros usuarios del host; el archivo es legible por el UID 1000 dentro del contenedor, ya que los secretos locales de Compose se montan como archivos. No regenerar la contraseña cada vez que arranques. El formato VNC clásico usa ocho caracteres; la confidencialidad del acceso depende del túnel SSH. No publicar 6080 en `0.0.0.0` ni abrir 5900/5000 en el firewall.

La imagen descarga el ZIP oficial y verifica el SHA-256 comprobado el 10 de septiembre de 2026. Si IBKR cambia el ZIP, el build falla deliberadamente: revisar la nueva distribución y actualizar el hash antes de reconstruir. Presupuesto del contenedor: hasta 2 GiB y 2 CPU; reservar memoria adicional para los demás servicios. Las imágenes base y paquetes de Debian reciben actualizaciones al reconstruir con `--pull --no-cache`.

## 2. Iniciar sesión desde tu ordenador

Ejecutar **en tu ordenador**, sustituyendo usuario y servidor:

```bash
ssh -N -L 127.0.0.1:6080:127.0.0.1:6080 usuario@TU_VPS
```

Mantener esta terminal abierta y abrir [el escritorio local](http://localhost:6080/vnc.html). Pulsar Connect e introducir la contraseña del archivo `docker-compose/ibkr/secrets/vnc_password` del VPS (puedes consultarla allí con `cat`).

Dentro del escritorio remoto, Chromium abre `https://localhost:5000`. Introducir las credenciales IBKR **en ese navegador remoto** y completar la confirmación móvil/2FA. Esperar al mensaje de login correcto. Cerrar la pestaña de noVNC o el túnel no detiene el Gateway. La app no recibe la contraseña IBKR y Chromium tiene desactivado el guardado de contraseñas.

El contenedor genera su propio certificado localhost en el primer arranque. El navegador lo incorpora a su almacén de confianza y nginx verifica ese certificado. No se usa `--ignore-certificate-errors`, `--no-sandbox` ni se desactiva TLS en Node. El tráfico HTTP API → puente solo cruza la red Docker interna del mismo host.

## 3. Conectar la app

En `docker-compose/api/.env`, añadir los valores reales:

```dotenv
IBKR_ACCOUNT_ID=U1234567
IBKR_OWNER_USER_ID=UUID-DE-TU-USUARIO-DE-LA-APP
```

El UUID se obtiene de `GET /auth/me` con sesión iniciada. Arrancar IBKR antes de recrear la API porque el primer proyecto crea `ibkr-portfolio`:

```bash
docker compose --env-file docker-compose/api/.env \
  -f docker-compose/api/docker-compose.yml \
  -f docker-compose/api/ibkr.override.yml up -d --build --wait
```

El override configura `http://ibkr:8080/v1/api` y añade la API a la red de lectura. **Mantener ambos `-f` al actualizar la API**. Sin el override la API conserva su despliegue independiente, sin dependencia de IBKR. También debe desplegarse el frontend con Finanzas → Growth.

## Sesiones, mantenimiento y diagnóstico

IBKR [requiere navegador y llamadas en la misma máquina](https://ibkrcampus.com/docs/web-api/authentication/cpgw/limitations-of-the-client-portal-gateway) y [reauthenticación diaria](https://www.interactivebrokers.com/docs/web-api/authentication/cpgw/client-portal-gateway-faq). No admite automatizar el login. Esta configuración no guarda credenciales IBKR ni intenta aprobar 2FA o renovar automáticamente la autenticación. Una sesión también puede caducar por inactividad: entrar de nuevo por noVNC cuando la app lo indique.

```bash
docker compose -f docker-compose/ibkr/docker-compose.yml ps
docker compose -f docker-compose/ibkr/docker-compose.yml logs --tail=100 ibkr
docker compose -f docker-compose/ibkr/docker-compose.yml restart ibkr
```

El healthcheck comprueba Gateway, puente, noVNC y los siete procesos supervisados; **healthy no significa autenticado en IBKR**. El escritorio y el navegador también deben verse correctamente tras el arranque. Si Chromium informa de un problema de sandbox, comprobar que el VPS permite espacios de nombres de usuario; no resolverlo con `--privileged` o `--no-sandbox`.

El volumen `webapp-ibkr_ibkr-state` conserva el perfil del navegador y el certificado, pero no garantiza conservar la sesión tras reinicios. Contiene información privada: no compartirlo ni incluirlo en copias públicas. `docker compose down` lo conserva; no usar `down -v` salvo que se quiera borrar. La contraseña VNC está fuera de Git y fuera del contexto de build. Un usuario con control de Docker o root en el VPS puede acceder a la sesión.

## Perfil del navegador

`seccomp.json` procede de [Microsoft Playwright v1.55.0](https://github.com/microsoft/playwright/blob/v1.55.0/utils/docker/seccomp_profile.json) (licencia Apache-2.0, incluida en `LICENSE.playwright`). Se ha adaptado para permitir también `chroot` dentro del espacio de nombres del sandbox, manteniendo todas las capacidades del contenedor desactivadas. Permite los espacios de nombres que necesita el sandbox de Chromium; no se concede `SYS_ADMIN` ni se desactiva seccomp.

## Validación realizada

Comprobado localmente con Docker Desktop/Linux ARM64: build desde el ZIP oficial, arranque saludable, siete procesos activos, acceso noVNC con contraseña, formulario de login IBKR visible en Chromium sin advertencia de certificado, recreación conservando el volumen y validación de ambos Compose. El puente devuelve 401 antes del login y rechaza rutas de órdenes y POST con 403. El acceso directo al Gateway por la red Docker queda bloqueado por su lista de IP.

No se ha realizado login en una cuenta IBKR, consulta de posiciones reales ni despliegue en el VPS. En un VPS x86_64 Docker construirá los paquetes para esa arquitectura; queda pendiente verificar allí el kernel y la disponibilidad de los espacios de nombres del navegador.
