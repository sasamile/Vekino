# Turnos simultáneos: cada celador con su turno

Fecha: 2026-10-26 · Rama: `main` (sin commit) · Sin despliegue.

## El problema

Hasta ahora una portería solo admitía **un** turno abierto a la vez (`guardia.iniciarTurno`), y todo lo que se registraba en ella —minuta, rondas, novedades, visitantes, paquetes— colgaba de "el" turno abierto y de "la" ronda en curso del conjunto (`model/minuta.ts`: `turnoAbierto(...).first()`, `rondaEnCurso(...).first()`). Los conjuntos con 2, 3 o 6 celadores a la vez no podían operar: el segundo trabajaba bajo el turno del primero, no podía iniciar su ronda mientras la del primero siguiera abierta y sus registros quedaban en el turno de otro.

## La solución

La administración del conjunto configura cuántos turnos puede haber abiertos a la vez (`condominios.vigilancia.maxTurnosActivos`). La capacidad decide además **cómo** opera la portería:

| Capacidad | Modo | Reglas |
|---|---|---|
| 1 (por defecto, sin configurar) | La portería de siempre | Exactamente lo de antes: un turno, que es de la portería. Quien no tiene turno propio trabaja bajo ese turno (el compañero escrito a mano). Una ronda en curso por conjunto. |
| 2 a 50 | Turnos independientes | Cada celador abre, opera y cierra **su** turno. Nada de lo que registra cae en el turno o la ronda de otro. Una ronda en curso por celador. |

La regla de asociación es una sola, `operacionDe` (`model/minuta.ts`), y la usan `logMinuta` y todas las mutaciones que cuelgan algo de un turno o una ronda:

1. Si el celador está en un turno abierto —titular o compañero vinculado por usuario—, ese.
2. Si no: en la portería de siempre, el turno abierto; con turnos independientes, **ninguno**.

La ronda: en la portería de siempre, la del conjunto; con turnos independientes, la que ese celador tiene en curso dentro de su turno.

### Reglas por operación

| Operación | Capacidad 1 | Capacidad 2 o más |
|---|---|---|
| Iniciar turno | Sin cupo → rechazo | Si hay cupo; nadie (ni el compañero vinculado) puede estar en dos turnos abiertos del conjunto |
| Iniciar ronda (`rondas.iniciar`) | Exige turno abierto; una por conjunto | Exige turno propio; una por celador |
| Finalizar ronda | Cualquiera de la portería | Quien la hace o la administración |
| Anotación (`registrarEventoMinuta`) y ronda rápida (`registrarRonda`) | Exigen turno abierto | Exigen turno propio |
| Visitantes, paquetes, reservas, novedades | No exigen turno; se ligan al turno abierto | No exigen turno; se ligan al turno/ronda propios o a ninguno |
| Eventos del residente | Al turno abierto | A ningún turno |
| Cerrar el propio turno | Igual | Igual; solo toca ese turno y **sus** rondas |
| Cierre asistido por compañero | Igual que antes | Igual, eligiendo cuál de los turnos abiertos |

El mensaje de "sin cupo" ya no nombra a nadie: *"No hay cupos disponibles: los N turnos de esta portería están ocupados. Debe cerrarse uno antes de iniciar otro."* (con capacidad 1: *"…ya hay un turno abierto en esta portería…"*).

### Cierre asistido (relevo)

Se conserva tal cual (`guardia.cerrarTurnoDeCompanero`), con sus permisos, validaciones y trazabilidad. Con turnos independientes y sin cupo, la pantalla lista cada turno abierto con **su propio** botón de cierre (`TurnosSinCupo` en la web, la tarjeta "No hay cupos disponibles" en el móvil); el guarda elige uno y solo ese se cierra.

- La lista viene de `guardia.turnosActivos.otros`, con lo mínimo para reconocer el turno: de quién es (y su compañero) y desde cuándo. Sin checklist ni observaciones.
- La mutación vuelve a comprobar todo contra la base: rol de guarda en el conjunto seleccionado, que el turno sea de ese conjunto, que siga abierto y que no sea suyo. Si mientras elegía otro lo cerró, responde *"El turno ya está cerrado."* sin escribir nada; si se cerró y se abrió uno nuevo, el id viejo no toca el nuevo. Repetirla no duplica nada.
- Qué turno es olvidado lo decide el guarda que está en la portería, y lo firma. No hay cierre por inactividad ni heurística.
- Queda: `cerradoPorUserId` y `fechaCierre` en el turno, su `observacionesCierre`, y en la minuta del turno cerrado el evento "Cierre de Turno por Compañero" con actor, `turnoId` y hora.

### Rondas al cerrar un turno

Todo cierre (`sellarCierreDeTurno`, en los dos modos) finaliza en la misma mutación las rondas que **ese** turno deja en curso, con `observacionesCierre: "Finalizada al cerrar el turno."` y un "Fin de ronda" en la minuta a nombre de quien cierra. Las de otros turnos no se tocan. Esto también corrige el defecto conocido de rondas que quedaban `en_curso` para siempre.

### Configuración de la capacidad

`guardia.configurarVigilancia({ condominioId, maxTurnosActivos })`, solo `administrador`, `junta_directiva` y la plataforma. Valida en la misma mutación, contra los turnos abiertos de ese momento:

- entero entre 1 y 50;
- nunca por debajo de los turnos abiertos (*"Hay 3 turnos abiertos y la capacidad no puede quedar por debajo. Para bajarla a 2 deben cerrarse antes un turno."*);
- no se pasa de 1 a 2+ ni de 2+ a 1 con turnos abiertos (*"Pasar a turnos independientes cambia cómo opera la portería y hay un turno abierto. Deben cerrarse todos antes de hacer el cambio."*). Un turno compartido abierto no se reinterpreta.

Guarda `actualizadoPorUserId` y `actualizadoEn`. El mismo valor no escribe nada. En la web: pestaña *Vigilancia → Configuración*, panel "Turnos simultáneos" (los tres catálogos siguen ocultos tras `MOSTRAR_CONFIGURACION`).

## Atomicidad y concurrencia

Convex ejecuta cada mutación como una transacción serializable con control optimista, que registra los rangos de índice leídos. Cada comprobación va en la misma mutación que su escritura y lee el rango **entero** de turnos abiertos (`turnosAbiertos`, índice `by_condominio_estado`) y el documento del conjunto:

- dos celadores piden el último cupo: Convex repite la mutación que llega segunda, que encuentra la portería llena y se rechaza;
- un inicio de turno coincide con un cambio de capacidad: se serializan; nunca quedan más turnos que cupos;
- dos rondas a la vez: de celadores distintos, dos con números seguidos; del mismo, una;
- dos compañeros cierran el mismo turno: un solo cierre.

No hay contadores aparte ni índices nuevos: los rangos que se leen son pequeños (como mucho la capacidad).

## Compatibilidad

- **Sin migración.** El campo es opcional; ausente = 1. Turnos, rondas y minuta históricos no se tocan y se leen igual.
- **Apps sin actualizar** (móvil sin OTA): `guardia.turnoActivo` conserva su forma. Con capacidad 1 responde lo mismo que antes. Con turnos independientes devuelve el turno propio; sin turno propio y con cupo, `null` (la app ofrece "Iniciar turno"); sin cupo, el abierto más antiguo, sin checklist ni observaciones, con `cierraComo: "companero"` (la app ofrece su cierre asistido). Lo que la app vieja no puede: elegir entre varios turnos.
- **Instantáneas de regresión:** `trazabilidadRegresion` pasa sin tocarla (la ronda rápida solo dice quién la hizo con turnos independientes). En `coberturasRegresion` se editó a mano **una línea**: el texto del rechazo de "iniciarTurno repetido", porque el mensaje cambió a propósito.

## Archivos

| Archivo | Cambio |
|---|---|
| `packages/backend/convex/schema.ts` | `condominios.vigilancia` (opcional) |
| `packages/backend/convex/model/minuta.ts` | `capacidadDeTurnos`, `turnosAbiertos`, `turnoDelActorEntre`, `rondasEnCurso`, `operacionDe`, `esDelTurno`, `administraLaPorteria`; `logMinuta` usa `operacionDe` |
| `packages/backend/convex/guardia.ts` | `iniciarTurno` con cupos; `turnoActivo` compatible; `turnosActivos` y `configurarVigilancia` nuevas; cierre que finaliza las rondas del turno; huérfanos y cobertura recorren todos los abiertos; anotación, ronda rápida y novedades por celador |
| `packages/backend/convex/rondas.ts` | `iniciar`, `finalizar` y `activa` por celador |
| `apps/web/app/condominio/[id]/vigilancia/page.tsx` | Panel "Turnos simultáneos"; tarjeta "Turnos activos N de M" |
| `apps/web/app/guardia/[id]/page.tsx` | Lee `turnosActivos`; lista sin cupo con cierre por turno |
| `apps/web/components/guardia/cerrar-turno-companero.tsx` | `TurnosSinCupo`; el modal acepta un turno con datos mínimos |
| `apps/web/components/guardia/guardia-shell.tsx` | Chip "Tu turno abierto" |
| `apps/mobile/src/app/(app)/guardia/minuta.tsx`, `apps/mobile/src/components/guardia/guardia-home.tsx` | Lo mismo en el móvil (requiere build) |
| `packages/backend/pruebas/turnosSimultaneos.test.ts` | 45 pruebas nuevas |
| `packages/backend/pruebas/inicioTurno.test.ts`, `cierreTurnoCompanero.test.ts`, `coberturasRegresion.test.ts` (+ `.snap`) | El mensaje nuevo de "sin cupo" |
| `apps/web/pruebas/cierreTurnoCompanero.test.mjs` | Lista por turno y modal con datos mínimos |
| `apps/web/pruebas/erroresCrudos.test.mjs` | La página del guarda se simula con `guardia:turnosActivos` (antes `turnoActivo`) |

## Pruebas ejecutadas (2026-10-26)

| Suite | Resultado |
|---|---|
| Backend `vitest run --maxWorkers=2` | 66 archivos, 1363 pruebas, 0 fallos (incluye las 45 nuevas) |
| Backend `node --test pruebas/*.prueba.ts` | 474/474 |
| Web `bun run test` | 25 ejecuciones, 398 pruebas, 0 fallos |
| Móvil `node --test pruebas/*.prueba.ts` | 32/32 |
| Typecheck | backend y web sin errores; móvil solo el error previo de `convex/auth.ts(34,11)` |
| Prueba de la prueba | con el control de cupo roto (`>` en vez de `>=`) fallan 8 de las 45, entre ellas las de concurrencia |
| Vista previa web (cliente Convex falso, sin backend) | portería sin cupo con cierre por turno, modal con datos mínimos y rechazo visible, panel de capacidad con validación; 375 px sin desplazamiento horizontal |

## Despliegue (pendiente, no hecho)

1. Antes: confirmar con una consulta de solo lectura que ningún conjunto tiene más de un turno abierto.
2. Backend primero (la web nueva llama a `turnosActivos` y `configurarVigilancia`), luego la web, luego la build del móvil.

## Riesgos y límites

- La concurrencia se probó con `convex-test`, que ejecuta las mutaciones de una en una: comprueba el límite con cualquier intercalado de mutaciones completas, no el reintento real de Convex. No se corrió contra un backend local de Convex (requiere descargar su binario; no autorizado).
- Las apps móviles sin actualizar no pueden elegir entre varios turnos para el cierre asistido: solo ven el más antiguo. Con una sola portería llena, cierran ese o esperan.
- Un celador sin turno propio, con turnos independientes, puede registrar visitantes, paquetes, reservas y novedades (como antes, no exigen turno): quedan a su nombre pero sin turno.
- Las rondas que quedaron `en_curso` en turnos ya cerrados antes de este cambio siguen así; ya no bloquean ni captan registros con turnos independientes, y con capacidad 1 siguen como antes (cualquiera las finaliza).
- `logMinuta` lee ahora también el documento del conjunto: un cambio en él (logo, configuración) mientras se registra un evento hace que Convex repita una de las dos mutaciones.
