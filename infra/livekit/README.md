# Servidor de medios de las asambleas

Para asambleas **grandes** (más de ~45 conectados). Por debajo de eso la sala
funciona P2P sin ningún servidor — ver `apps/web/components/asamblea/README.md`.

Este servidor **no se deja prendido**. Se crea el día de la asamblea y se
destruye al terminar: se cobra por hora, así que 5 horas cuestan centavos.

## Crear el servidor (Vultr)

1. **Deploy → Cloud Compute → Shared CPU** no; elige **Optimized Cloud
   Compute → CPU Optimized**. Las instancias "shared" reparten CPU entre
   clientes y un servidor de medios necesita CPU sostenida.
2. **Región: Miami.** Es lo más cerca de Colombia (~40-60 ms). Fráncfort son
   ~140 ms y en una asamblea donde la gente conversa, eso se nota: se pisan
   al hablar.
3. **Imagen: Ubuntu 24.04 LTS.**
4. **Tamaño: 8 vCPU / 16 GB.** Con 4 en el escenario y 250 viendo, el gasto
   real es red, no CPU; 8 vCPU dan margen. Para probar con 20-30 personas,
   2 vCPU sobran y sale casi gratis.
5. Sin backups (es efímero). SSH key si la tienes; si no, contraseña.

En **Firewall** del panel de Vultr abre, además del 22:

| Puerto        | Protocolo | Para qué                        |
|---------------|-----------|---------------------------------|
| 80, 443       | TCP       | certificado y señalización       |
| 7881          | TCP       | respaldo cuando bloquean UDP     |
| 3478          | UDP       | TURN                             |
| 5349          | TCP       | TURN sobre TLS                   |
| 50000-60000   | UDP       | el video                         |

El firewall del panel es **aparte** del `ufw` del sistema: si solo abres uno,
no conecta y el síntoma es un video que carga eternamente.

## DNS

Un registro **A** de `sala.vekino.com` a la IP del servidor. Espera a que
resuelva antes del paso siguiente — el script lo verifica y se detiene si no,
justo para que no falle más adelante cuando cuesta más entender por qué.

## Montarlo

```bash
ssh root@LA-IP
curl -fsSL https://raw.githubusercontent.com/TU-REPO/main/infra/livekit/instalar.sh -o instalar.sh
bash instalar.sh sala.vekino.com
```

(o pega el contenido de `instalar.sh` a mano; no depende del repo)

Tarda ~3 minutos e imprime tres variables. Pégalas:

```bash
# En packages/backend
npx convex env set LIVEKIT_URL wss://sala.vekino.com
npx convex env set LIVEKIT_API_KEY APIvekino...
npx convex env set LIVEKIT_API_SECRET ...
```

Y en Vercel, `NEXT_PUBLIC_LIVEKIT_URL = wss://sala.vekino.com`.

En cuanto Convex tenga las tres variables, `salaToken.tokenSala` empieza a
entregar tokens. Sin ellas devuelve `null` y la sala sigue en P2P — no se
rompe nada por no tener servidor.

## Al terminar

**Destruye la instancia** desde el panel de Vultr. Apagarla no basta: se
sigue cobrando el disco. Volver a crearla es correr el script otra vez
(genera llaves nuevas, hay que actualizar las tres variables).

## Antes de la primera asamblea real

Haz una **prueba de carga**. Que aguante 250 es aritmética de ancho de banda,
pero cuántos aguanta *esta* máquina hay que medirlo:

```bash
docker run --rm livekit/livekit-cli load-test \
  --url wss://sala.vekino.com --api-key KEY --api-secret SECRET \
  --room prueba --subscribers 250 --duration 5m
```

Mira CPU y red en el panel mientras corre. Si la CPU se pega al 100 %, sube
de tamaño (se puede en caliente) o pon la audiencia en modo ahorro.
