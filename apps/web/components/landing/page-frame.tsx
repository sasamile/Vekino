/**
 * Marco decorativo de la landing: dos líneas verticales punteadas a la
 * altura del contenedor y, fuera de ellas, un rayado diagonal casi
 * imperceptible.
 *
 * Va `fixed` detrás del contenido (ver `.lp-frame` en globals.css). Fijarlo
 * es lo que permite que la línea corra sin interrupciones de arriba abajo:
 * si cada sección pintara su propio borde, se verían los empalmes.
 *
 * Cuando el viewport es más estrecho que el contenedor, el rayado mide 0 px
 * y desaparece solo; los rieles quedan pegados al borde de la pantalla, que
 * es justo la lectura correcta en móvil.
 */
export function PageFrame() {
  return (
    <div className="lp-frame" aria-hidden>
      <span className="lp-frame__hatch lp-frame__hatch--left" />
      <span className="lp-frame__hatch lp-frame__hatch--right" />
      <div className="lp-frame__rails" />
    </div>
  );
}
