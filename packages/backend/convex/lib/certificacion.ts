/**
 * Quien prueba la pasarela por API mientras el resto sigue pagando de verdad.
 *
 * Durante la certificacion hacen falta las dos cosas a la vez y son
 * incompatibles: el residente normal tiene que seguir yendo al portal del
 * banco, donde su plata se mueve; y quien certifica tiene que ir por la API
 * contra QA, donde no se mueve nada.
 *
 * El boton de pagar decide por una sola cosa: si el conjunto tiene URL de
 * portal, va al portal. Asi que la forma menos invasiva de abrir la ruta por
 * API a unas pocas cuentas es esconderles esa URL, sin tocar el boton ni la
 * configuracion del conjunto.
 *
 * Es una lista de correos en `AVAL_CERTIFICACION_EMAILS`, separados por coma.
 * Vacia por defecto: si nadie la configura, TODO el mundo va al portal, que
 * es el comportamiento seguro. Se borra la variable y se acabo la excepcion.
 */

/** ¿Este correo esta autorizado a saltarse el portal y usar la API? */
export function certificaPorApi(
  email: string | null | undefined,
  lista: string | undefined,
): boolean {
  const correo = (email ?? "").trim().toLowerCase();
  if (!correo) return false;
  return (lista ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(correo);
}
