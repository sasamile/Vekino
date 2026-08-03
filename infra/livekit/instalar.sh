#!/usr/bin/env bash
#
# Monta el servidor de medios de las asambleas en un servidor Ubuntu limpio.
#
#   ssh root@IP-DEL-SERVIDOR
#   curl -fsSL <url-de-este-archivo> -o instalar.sh
#   bash instalar.sh sala.vekino.com
#
# Al terminar imprime las tres variables que hay que pegar en Convex y en
# Vercel. Es idempotente: correrlo dos veces no rompe nada, pero REGENERA
# las llaves — si lo repites, vuelve a copiar las variables.
set -euo pipefail

DOMINIO="${1:-}"
if [[ -z "$DOMINIO" ]]; then
  echo "Uso: bash instalar.sh sala.vekino.com" >&2
  exit 1
fi

echo "==> Verificando que $DOMINIO apunte a este servidor"
IP_PUBLICA="$(curl -fsS https://api.ipify.org)"
IP_DOMINIO="$(getent hosts "$DOMINIO" | awk '{print $1}' | head -1 || true)"
if [[ "$IP_DOMINIO" != "$IP_PUBLICA" ]]; then
  # Sin DNS correcto, Let's Encrypt no emite el certificado y todo lo demás
  # falla después, cuando ya es más difícil ver por qué.
  echo "ERROR: $DOMINIO resuelve a '${IP_DOMINIO:-nada}' y este servidor es $IP_PUBLICA." >&2
  echo "Crea el registro A y espera unos minutos antes de reintentar." >&2
  exit 1
fi
echo "    DNS correcto ($IP_PUBLICA)"

echo "==> Instalando Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

echo "==> Abriendo puertos"
# El firewall de Vultr (el del panel) es aparte: hay que abrirlos ahí también.
if command -v ufw >/dev/null 2>&1; then
  ufw allow 22/tcp        >/dev/null   # ssh, para no quedarse fuera
  ufw allow 80/tcp        >/dev/null   # validación del certificado
  ufw allow 443/tcp       >/dev/null   # señalización (wss)
  ufw allow 7881/tcp      >/dev/null   # respaldo TCP de WebRTC
  ufw allow 3478/udp      >/dev/null   # TURN
  ufw allow 5349/tcp      >/dev/null   # TURN sobre TLS
  ufw allow 50000:60000/udp >/dev/null # el video
  ufw --force enable      >/dev/null
fi

DESTINO=/opt/vekino-sala
mkdir -p "$DESTINO"
cd "$DESTINO"

echo "==> Generando llaves"
API_KEY="APIvekino$(head -c 6 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 8)"
API_SECRET="$(head -c 48 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 48)"

cat > livekit.yaml <<YAML
port: 7880
rtc:
  port_range_start: 50000
  port_range_end: 60000
  tcp_port: 7881
  use_external_ip: true
turn:
  enabled: true
  domain: ${DOMINIO}
  tls_port: 5349
  udp_port: 3478
  external_tls: true
keys:
  ${API_KEY}: ${API_SECRET}
logging:
  level: info
room:
  # Una asamblea de 5 h no se puede caer porque la sala quede vacía un rato.
  empty_timeout: 3600
  # Techo duro: al asistente que pasa de aquí el servidor lo RECHAZA, no lo
  # deja lento. Debe ir por encima del aforo real con margen.
  max_participants: 600
YAML

cat > Caddyfile <<CADDY
${DOMINIO} {
	reverse_proxy localhost:7880
}
CADDY

cat > docker-compose.yml <<'COMPOSE'
services:
  livekit:
    image: livekit/livekit-server:latest
    container_name: vekino-livekit
    restart: unless-stopped
    network_mode: host
    command: --config /etc/livekit.yaml
    volumes:
      - ./livekit.yaml:/etc/livekit.yaml:ro
  caddy:
    image: caddy:2-alpine
    container_name: vekino-caddy
    restart: unless-stopped
    network_mode: host
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
volumes:
  caddy_data:
  caddy_config:
COMPOSE

echo "==> Levantando"
docker compose up -d
sleep 8

echo
echo "════════════════════════════════════════════════════════════════"
echo " Servidor listo en wss://${DOMINIO}"
echo
echo " Pega esto en Convex (npx convex env set NOMBRE valor):"
echo "   LIVEKIT_URL         wss://${DOMINIO}"
echo "   LIVEKIT_API_KEY     ${API_KEY}"
echo "   LIVEKIT_API_SECRET  ${API_SECRET}"
echo
echo " Y esto en Vercel (variable pública del front):"
echo "   NEXT_PUBLIC_LIVEKIT_URL   wss://${DOMINIO}"
echo
echo " El SECRET no se vuelve a mostrar. Guárdalo ahora."
echo "════════════════════════════════════════════════════════════════"
echo
echo " Al terminar la asamblea, DESTRUYE el servidor desde el panel de"
echo " Vultr. Apagarlo no basta: se sigue cobrando el almacenamiento."
