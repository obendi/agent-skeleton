# Finanzas → Growth

La ruta privada `/finanzas/growth` muestra las posiciones abiertas de una cuenta de Interactive Brokers. Permite buscar activos y consultar cantidad, precio, coste medio, valoración, P/G no realizada y divisa. No envía órdenes.

## Activar la conexión

Para el VPS, usar la [infraestructura Docker de IBKR](../docker-compose/ibkr/README.md): incluye Java, navegador remoto por noVNC, túnel SSH y conexión privada con la API. La guía contiene los comandos de instalación, login y despliegue.

Para un Gateway instalado fuera de Docker, configurar en `apps/api/.env` las variables `IBKR_GATEWAY_URL` (incluyendo `/v1/api`), `IBKR_ACCOUNT_ID` y `IBKR_OWNER_USER_ID`. El Gateway debe ser accesible desde la API y tener un certificado confiable para Node.js. El propietario corresponde al UUID devuelto por `GET /auth/me`; solo ese usuario puede consultar la cartera. Esta primera integración admite una cuenta y un propietario por despliegue.

## Datos y permisos

`GET /finance/growth` requiere sesión de la app. El backend comprueba el propietario antes de contactar con IBKR, consulta `/portfolio/accounts` y todas las páginas de `/portfolio/{accountId}/positions/{pageId}` hasta la primera vacía. Una respuesta incompleta o inválida produce un error y no se presenta como una cartera vacía. Cada consulta tiene un límite global de 20 segundos.

Los datos se consultan bajo demanda y no se guardan en la base de datos. Los campos ausentes aparecen como «—». Los importes mantienen la moneda de cada posición, sin sumar divisas distintas. La hora mostrada corresponde a la consulta, no al instante de cotización; IBKR puede devolver valoraciones con retraso o desde su caché.

Referencia: [posiciones paginadas, documentación oficial de IBKR](https://ibkrcampus.com/docs/web-api/api-reference/trading/trading-portfolio/get-paginated-positions).
