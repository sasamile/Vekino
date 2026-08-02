# Sala de asambleas

La sala vive en `/sala/[condominioId]/[asambleaId]` (residente y mesa, mismo
componente `sala-reunion.tsx`; el rol lo decide el servidor en
`asambleaSala.miSala`) y en `/apoderado/sala` (apoderado por código,
`sala-apoderado.tsx`). Va fuera de los shells a propósito: pantalla completa,
sin navegación.

## Cómo se marca la asistencia

**Entrar a la sala ES registrarse.** Al montar la sala se llama
`asambleas.entrarYRegistrar` (residente) o `entrarYRegistrarConPoder`
(apoderado, con el código de su poder). Requisitos del lado del servidor:
asamblea **en curso**, membresía del condominio, modalidad no presencial.
Después el latido (`use-sala-latido*.ts`, cada 30 s) mantiene el tramo de
conexión en `asambleaSesiones`; el cron cierra a los 90 s sin señal.

**El código rotativo sigue existiendo** con un solo propósito: quien sigue la
reunión POR FUERA (Meet/Zoom, app móvil) y no está en la sala. Posee el
código quien ve la pantalla compartida. La semilla se crea sola al pasar la
asamblea a "en_curso" (`setEstado`) y **nunca** sale hacia residentes
(`get`/`listByCondominio` la eliminan del resultado).

**Presencial**: QR personal + corroboración de la mesa. La sala no
auto-registra en presencial (inflaría el quórum desde la casa).

## Video propio (ya funciona, P2P)

Nada de Meet ni Zoom: la mesa enciende cámara / comparte pantalla desde su
navegador (`escenario-video.tsx` + `use-video-sala.ts`) y los asistentes lo
ven en la misma sala. La señalización (SDP/ICE) viaja por Convex
(`convex/salaVideo.ts`, tablas `salaEmisores` y `salaSenales`); el video va
punto a punto entre navegadores y nunca toca la base.

Límites del P2P, dichos claro:

- **Tope ~16 espectadores por emisor** (`TOPE_ESPECTADORES`): el emisor sube
  una copia del stream por cada uno. Pasado el tope, el asistente ve
  "transmisión llena".
- **Sin TURN**: pares tras NAT simétrico (~10 % de redes) no conectan; se
  muestra el fallo. Un TURN propio (coturn en un VPS) lo resuelve.

## Escalar a cientos (siguiente paso, sigue siendo propio)

Para 250 espectadores el reparto lo debe hacer un **servidor de medios
autoalojado** — software libre en un servidor de Vekino, sin proveedor por
minuto. Recomendado: LiveKit OSS (SDK React y React Native).

1. `docker run` de livekit-server en un VPS + dominio + TLS.
2. Token por participante firmado en una action de Convex (gate: registrado
   en la asamblea).
3. Escenario por WebRTC; audiencia por HLS del propio servidor. Votaciones
   con ventana de 2–3 min (la audiencia ve con segundos de retraso).
4. Grabación (egress) para el acta.

`escenario-video.tsx` es el hueco donde el player P2P se cambia por el del
SFU; la asistencia, la permanencia y las votaciones no se tocan.

## Auditoría

`asambleaSala.permanencia` (tramos fusionados por unidad),
`quorumEnInstante`, `integridadVotacion` (votos sin conexión activa) y el
bloque `permanencia` de `asambleas.paqueteAuditoria`. La aritmética pura está
en `convex/lib/permanencia.ts`.
