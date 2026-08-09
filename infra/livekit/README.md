# Servidor de medios de las asambleas

Reparte el video de la sala: quien habla sube **una** copia y el servidor la
entrega a todos. Sin él, la sala cae sola a malla punto a punto —que funciona
bien hasta unas decenas de personas— así que nada se rompe si no está.

> ## ⚠️ Desmontado el 9 de agosto de 2026
>
> Las tres llaves (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`) **ya
> no están en Convex**, así que la sala no intenta usar este servidor. Estaban
> apuntando a una máquina que no responde —ni ping ni 443— que es exactamente
> el estado roto que avisa la sección "Al terminar una asamblea".
>
> **Falta confirmar en el panel de Vultr que la instancia esté destruida.** No
> pude comprobarlo: entrar al panel pide contraseña. Mientras exista, se cobra
> aunque esté apagada y aunque no responda.
>
> El motor nuevo de las asambleas es el SFU de Cloudflare
> (`packages/backend/convex/salaCloudflare.ts`), que se enciende por condominio
> con el módulo `sala_cloudflare`. Con ese módulo apagado y sin estas llaves,
> la sala usa la malla punto a punto, que sirve para grupos de unas decenas.
>
> Las llaves que aparecen abajo ya no valen para nada: el script las genera
> nuevas cada vez que se monta el servidor.

## Estado histórico (montado el 2 de agosto de 2026)

| | |
|---|---|
| Dominio | `sala.vekino.com` → `45.77.117.222` (Cloudflare, **DNS only**) |
| Proveedor | Vultr, Miami, instancia `Vekino - Sala de asambleas` |
| Plan | Cloud Compute · 6 vCPU · 16 GB · 5 TB/mes · **$80/mes ($0.119/hora)** |
| Acceso | `ssh -i ~/.ssh/vekino_sala root@45.77.117.222` |
| Instalado en | `/opt/vekino-sala` (LiveKit + Caddy por docker compose) |
| Llaves | ya cargadas en Convex (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`) |

### Capacidad medida (no estimada)

Prueba de carga real contra este servidor, con un emisor de pantalla, dos de
audio y N espectadores simulados desde otra máquina en Miami:

| Espectadores | Pistas entregadas | Errores | CPU del servidor | Paquetes descartados |
|---|---|---|---|---|
| 100 | 300/300 | 0 | — | 0 |
| **300** | **900/900** | **0** | **45%** | **0** |

Con 300 conectados el servidor iba a menos de la mitad de su CPU, sin
descartar un solo paquete, sobre un enlace que da 9 Gbps medidos. El 2.2% de
pérdida que reportaron los espectadores venía de la máquina que generaba la
carga (82% de CPU haciendo en un equipo lo que en la vida real hacen 300
teléfonos), no de este servidor.

**500 no está medido.** La aritmética dice que pasaría (~75% de CPU,
~700 Mbps), pero eso es cálculo. Para comprobarlo hacen falta dos máquinas
generadoras, porque una sola no da abasto.

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

## Apagar entre asambleas

**Apagar la instancia NO ahorra un peso.** Vultr cobra el plan completo
mientras exista, encendida o apagada, porque te reserva el disco y la IP. Lo
único que corta el cobro es **destruirla**. A $0.119/hora, ocho días de
inactividad son $23 tirados.

### Al terminar una asamblea

```bash
# 1. Quitar las llaves de Convex ANTES de destruir el servidor.
#    Si se dejan puestas apuntando a una máquina que ya no existe, la sala
#    NO cae a la malla: pide un token válido hacia una dirección muerta y se
#    rompe del todo. Sin ellas, la malla P2P sigue sirviendo a grupos chicos.
cd packages/backend
npx convex env remove LIVEKIT_URL
npx convex env remove LIVEKIT_API_KEY
npx convex env remove LIVEKIT_API_SECRET
```

2. Destruir la instancia desde el panel de Vultr (Server Destroy).

El registro DNS `sala.vekino.com` se puede dejar quieto: apunta a una IP
muerta, pero no molesta a nadie y ahorra un paso al recrear.

### Para la siguiente asamblea (~15 minutos)

Hazlo **el día antes**, no el mismo día.

1. Crear la instancia: Vultr → Deploy → **Cloud Compute**, Miami, **6 vCPU /
   16 GB**, Ubuntu 24.04 o 26.04, backups **desactivados**, llave SSH
   `vekino-sala`, sin Firewall Group.
2. Apuntar el DNS a la IP nueva: Cloudflare → `vekino.com` → registro `sala`
   → cambiar la IP. **Tiene que quedar en "Solo DNS"** (nube gris): el proxy
   de Cloudflare no enruta UDP y el video se quedaría cargando sin dar ningún
   error que lo explique.
3. Montar el servidor:
   ```bash
   scp -i ~/.ssh/vekino_sala infra/livekit/instalar.sh root@LA-IP:/root/
   ssh -i ~/.ssh/vekino_sala root@LA-IP 'bash /root/instalar.sh sala.vekino.com'
   ```
4. Pegar en Convex las tres llaves que imprime el script (`npx convex env set`).
5. Comprobar antes de que llegue la gente:
   ```bash
   curl -sI https://sala.vekino.com | head -1        # debe dar 200
   ```
   Y entrar a la sala: en la consola del navegador tiene que aparecer
   `connected to Livekit Server`. Si no aparece, la sala está en malla P2P y
   no aguanta cientos de personas.

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
