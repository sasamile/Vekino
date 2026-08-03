# Servidor de medios de las asambleas

Reparte el video de la sala: quien habla sube **una** copia y el servidor la
entrega a todos. Sin él, la sala cae sola a malla punto a punto —que funciona
bien hasta unas decenas de personas— así que nada se rompe si no está.

## Estado actual (montado el 2 de agosto de 2026)

| | |
|---|---|
| Dominio | `sala.vekino.com` → `45.77.117.222` (Cloudflare, **DNS only**) |
| Proveedor | Vultr, Miami, instancia `sala-vekino` |
| Plan | Shared CPU `vc2-1c-2gb` · 1 vCPU · 2 GB · 2 TB/mes · **$10/mes ($0.014/hora)** |
| Acceso | `ssh -i ~/.ssh/vekino_sala root@45.77.117.222` |
| Instalado en | `/opt/vekino-sala` (LiveKit + Caddy por docker compose) |
| Llaves | ya cargadas en Convex (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`) |

El registro DNS **no debe pasar por el proxy de Cloudflare** (la nube gris,
"Solo DNS"). El proxy no enruta UDP y el video quedaría cargando para siempre
sin ningún mensaje de error que lo explique.

### Lo que está probado

- Publicar y recibir video a través del servidor, con imagen en movimiento.
- Un residente **sin** la palabra no puede transmitir: lo rechaza el servidor,
  no el navegador (`failed to publish track, insufficient permissions`).
- Conceder la palabra habilita la voz en caliente y retirarla la corta, sin
  que la persona tenga que volver a entrar.

### Lo que NO está probado

**250 personas a la vez.** Ver "Antes de la primera asamblea real".

## Costo y tamaño

Se cobra **por hora**: una asamblea de 5 horas cuesta $0.07 (unos 280 pesos).
Pero solo si el servidor se **destruye** al terminar — dejarlo prendido son
$10 al mes (~40.000 pesos), que se come el crédito completo en un mes.

El tamaño actual (1 vCPU) es el correcto para **probar y para asambleas de
unas decenas de personas**. Para 250 conectados el cuello no es la CPU sino la
red: 250 × ~1 Mbps son 500 Mbps sostenidos, que una instancia compartida de
$10 no garantiza. Antes de una asamblea grande, redimensiona en el panel de
Vultr (se puede en caliente) y corre la prueba de carga.

Sobre el tráfico incluido (2 TB/mes): una asamblea de 250 personas × 5 horas
consume ~590 GB **en modo ahorro** y ~1.7 TB en calidad normal. En ahorro caben
tres asambleas al mes; en calidad normal, apenas una. El excedente se cobra
aparte.

## Crear el servidor de cero

1. Vultr → **Deploy** → **Shared CPU** (o CPU Optimized si es una asamblea
   grande) → **Miami** (~40-60 ms desde Colombia; Fráncfort son ~140 ms y en
   una asamblea donde la gente conversa se pisan al hablar).
2. **Ubuntu 24.04 o 26.04 LTS.** Ambas funcionan.
3. Backups **desactivados** (el servidor es efímero) y una llave SSH.
4. **No** adjuntes un Firewall Group del panel: el script configura `ufw`
   dentro del servidor. Si adjuntas uno, tienes que abrir ahí los mismos
   puertos, porque son dos filtros distintos y basta con que uno cierre para
   que el video cargue eternamente:

| Puerto        | Protocolo | Para qué                     |
|---------------|-----------|------------------------------|
| 22            | TCP       | ssh                          |
| 80, 443       | TCP       | certificado y señalización   |
| 7881          | TCP       | respaldo cuando bloquean UDP |
| 3478          | UDP       | TURN                         |
| 5349          | TCP       | TURN sobre TLS               |
| 50000-60000   | UDP       | el video                     |

## DNS

Registro **A** de `sala.vekino.com` a la IP, en **Solo DNS**. El script
verifica que resuelva y se detiene si no: sin DNS correcto, Let's Encrypt no
emite el certificado y todo lo demás falla después, cuando ya es más difícil
ver por qué.

## Montarlo

```bash
scp -i ~/.ssh/vekino_sala infra/livekit/instalar.sh root@LA-IP:/root/
ssh -i ~/.ssh/vekino_sala root@LA-IP 'bash /root/instalar.sh sala.vekino.com'
```

Tarda ~3 minutos e imprime tres variables. Pégalas en `packages/backend`:

```bash
npx convex env set LIVEKIT_URL wss://sala.vekino.com
npx convex env set LIVEKIT_API_KEY APIvekino...
npx convex env set LIVEKIT_API_SECRET ...
```

No hace falta ninguna variable en Vercel: la URL del servidor viaja **dentro**
del token que entrega `salaToken.tokenSala`, así que el navegador nunca
necesita saberla de antemano.

En cuanto Convex tenga las tres, la sala pasa sola al servidor de medios. Sin
ellas `tokenSala` devuelve `null` y la sala sigue en malla P2P.

## Al terminar

**Destruye la instancia** desde el panel de Vultr. Apagarla no basta: se sigue
cobrando el disco. Volver a crearla es correr el script otra vez — genera
llaves nuevas, así que hay que actualizar las tres variables de Convex.

## Antes de la primera asamblea real

Haz una **prueba de carga**. Que aguante 250 es aritmética de ancho de banda;
cuántos aguanta *esta* máquina hay que medirlo:

```bash
docker run --rm livekit/livekit-cli load-test \
  --url wss://sala.vekino.com --api-key KEY --api-secret SECRET \
  --room prueba --subscribers 250 --duration 5m
```

Mira CPU y red en el panel mientras corre. Si la CPU se pega al 100 % o la red
se aplana, sube de tamaño o deja la audiencia en modo ahorro.
