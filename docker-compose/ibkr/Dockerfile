FROM debian:bookworm-slim
ARG GATEWAY_SHA256=2f2d380b2f9424520ff5f9c11fe45e82ef39459329ac056258a3274bea6f76f9
RUN apt-get update && apt-get install -y --no-install-recommends \
    openjdk-17-jre-headless ca-certificates curl unzip chromium libnss3-tools \
    xvfb x11vnc openbox novnc websockify supervisor nginx-light tini fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://download2.interactivebrokers.com/portal/clientportal.gw.zip -o /tmp/gateway.zip \
    && echo "${GATEWAY_SHA256}  /tmp/gateway.zip" | sha256sum -c - \
    && mkdir /opt/gateway && unzip -q /tmp/gateway.zip -d /opt/gateway && rm /tmp/gateway.zip \
    && useradd --create-home --uid 1000 gateway \
    && mkdir -p /state /opt/gateway/logs && chown -R gateway:gateway /state /opt/gateway
COPY chromium-policy.json /etc/chromium/policies/managed/ibkr.json
COPY conf.yaml /opt/gateway/root/conf.yaml
COPY nginx.conf supervisord.conf /etc/ibkr/
COPY entrypoint.sh browser.sh healthcheck.sh /usr/local/bin/
RUN chmod 755 /usr/local/bin/entrypoint.sh /usr/local/bin/browser.sh /usr/local/bin/healthcheck.sh
USER gateway
ENV DISPLAY=:99 HOME=/home/gateway
WORKDIR /opt/gateway
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
