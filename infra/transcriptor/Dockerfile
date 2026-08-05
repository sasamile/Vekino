# Node 24: ejecuta TypeScript directamente, sin paso de compilación.
#
# `slim` (Debian) y no `alpine` a propósito: @livekit/rtc-node trae un binario
# nativo compilado contra glibc y en Alpine (musl) no carga.
FROM node:24-slim

WORKDIR /app

# Las dependencias van en su propia capa: cambiar el código no obliga a
# reinstalar el binario nativo, que es lo pesado.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY src ./src

# Sin privilegios: este proceso solo necesita salir a la red.
USER node

CMD ["node", "src/index.ts"]
