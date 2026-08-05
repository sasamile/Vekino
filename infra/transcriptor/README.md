# Transcriptor de asambleas

Transcribe en vivo lo que se habla en las asambleas **virtuales** y lo deja
en Convex como bitácora, lista para armar el acta.

## Cómo funciona

```
Sala (LiveKit)  ──una pista por persona──▶  Transcriptor  ──texto──▶  Convex
                                                 │
                                            Deepgram
```

Cada pocos segundos le pregunta a Convex a qué salas debe entrar. Entra como
oyente invisible, abre una sesión de reconocimiento por persona que habla y
va escribiendo las frases.

**El audio no se guarda en ningún momento.** Pasa de la pista al motor, se
convierte en texto y se descarta. Lo único que queda es el texto.

## Por qué no hace falta separar voces

El servidor de medios entrega **una pista de audio por participante**, y la
identidad va firmada en el token. Cada segmento llega ya atribuido a quien
habló: no hay diarización ni conjeturas, que es justo la parte cara y frágil
de transcribir una reunión.

## Qué se paga

Se paga por segundo de audio enviado al motor. Dos cosas lo mantienen bajo:

1. **La palabra.** El token de la sala solo permite publicar audio a la mesa
   y a quien tenga la palabra concedida (ver `salaPalabra` y `salaToken.ts`).
   Así haya 300 conectados, hay una o dos pistas publicando.
2. **Apertura perezosa.** La sesión se abre con el primer audio y se cierra
   sola tras `TRANSCRIPTOR_SILENCIO_MS` sin nada. Un micrófono abierto y
   callado deja de costar a los quince segundos.

Orden de magnitud para una asamblea de cuatro horas con una o dos pistas
activas: **unos pocos dólares**. Conviene confirmar la tarifa vigente de
Deepgram antes de comprometerse.

> Lo que no cubre: un micrófono abierto con ruido de fondo constante sí se
> transcribe y sí se cobra. Si eso pasa seguido, la mesa debería retirar la
> palabra — que es lo que corresponde igual.

## Despliegue

En la misma máquina del servidor de medios, junto a `infra/livekit`:

```bash
cp infra/transcriptor/.env.example infra/transcriptor/.env
```

Llenar `.env`:

- `CONVEX_SITE_URL` — el dominio **`.convex.site`**, no el `.convex.cloud`.
- `TRANSCRIPTOR_SECRET` — el mismo que está en Convex:
  ```bash
  bunx convex env get TRANSCRIPTOR_SECRET
  ```
- `LIVEKIT_*` — las mismas del `livekit.yaml` de al lado.
- `DEEPGRAM_API_KEY` — de console.deepgram.com.

Levantar:

```bash
docker compose -f infra/livekit/docker-compose.yml up -d transcriptor
```

Ver qué está haciendo:

```bash
docker logs -f vekino-transcriptor
```

## Producción

El `.env` que se genera en local apunta al deployment **dev** de Convex. Si
se copia tal cual al servidor, el transcriptor escribiría las asambleas de
producción en la base de pruebas — y nadie lo notaría hasta que el acta
saliera vacía.

En el servidor hay que cambiar **dos** valores:

| Variable | En producción |
|---|---|
| `CONVEX_SITE_URL` | El `.convex.site` del deployment **prod** |
| `TRANSCRIPTOR_SECRET` | El que esté puesto en el Convex **prod** |
| `LIVEKIT_*` | Iguales — es el mismo servidor de medios |
| `DEEPGRAM_API_KEY` | La misma llave, o una aparte para separar el gasto |

El secreto de prod hay que crearlo, porque cada deployment tiene sus propias
variables:

```bash
cd packages/backend
npx convex env set --prod TRANSCRIPTOR_SECRET "$(openssl rand -hex 32)"
npx convex env get --prod TRANSCRIPTOR_SECRET   # copiar al .env del servidor
```

Conviene que **no sea el mismo secreto que en dev**: si se filtra el de una
máquina de pruebas, no debería servir para escribir en las actas de verdad.

Comprobación rápida desde el servidor, antes de levantar el contenedor:

```bash
curl -s -H "Authorization: Bearer $TRANSCRIPTOR_SECRET" \
  "$CONVEX_SITE_URL/transcriptor/salas"
```

`{"salas":[]}` es correcto. `401` significa que el secreto no coincide con el
de ese deployment.

## Encenderlo en una asamblea

No arranca solo. La mesa lo enciende desde el panel de la asamblea, y solo
entonces el transcriptor entra a esa sala.

Es a propósito: transcribir es tratamiento de datos personales. Mientras está
encendido, la sala muestra el aviso a todos los asistentes, y esa constancia
queda en la bitácora (`transcripcion_inicio` / `transcripcion_fin`).

### Quién ve qué

| | Mesa | Residentes e invitados |
|---|---|---|
| Aviso de que se está transcribiendo | Sí | **Sí** |
| El texto transcrito | Sí | No |
| Encender / apagar | Sí | No |
| Corregir una frase | Sí | No |

El texto es material de trabajo: sale en bruto, con los errores del motor y
sin revisar. Publicarlo así convertiría cada equivocación del reconocimiento
en algo que alguien "dijo" en la asamblea.

El aviso es lo contrario: saber que se está grabando la propia voz no es un
privilegio del administrador, es la condición para poder grabarla. Esa parte
no se debe restringir.

## Cambiar de proveedor

Todo lo de Deepgram está detrás de `src/stt/tipos.ts`. Para cambiar de motor
se escribe otro archivo en `src/stt/` que implemente `Motor` y se cambia el
import en `src/sala.ts`. Nada más del servicio se entera.

## Desarrollo

```bash
npm install
npm run typecheck
node --test "pruebas/*.prueba.ts"
```

Las pruebas levantan un Deepgram falso: no gastan cuota ni necesitan llave.

## Límites conocidos

- **Solo virtual.** En presencial hay un micrófono de sala y una sola pista,
  así que se perdería quién habla. El backend rechaza encenderlo ahí.
- **La transcripción se equivoca**, sobre todo con nombres propios y cifras.
  Por eso la mesa puede corregir cada frase, y el texto original se conserva.
- **El acta que sale de aquí es un borrador.** La firman el presidente y el
  secretario de la asamblea; nada se publica solo.
