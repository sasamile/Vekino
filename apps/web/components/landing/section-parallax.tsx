"use client";

import {
  gsap,
  useGSAP,
  ScrollTrigger,
  MEDIA,
  shouldSkipIntro,
} from "@/lib/gsap";

/* ── Transiciones entre secciones ────────────────────────────────────────
 * Cada sección entra como una lámina con esquinas redondeadas que se monta
 * sobre la anterior (solape de 56 px + z-index creciente + sombra en el
 * filo). Lo que VARÍA es cómo se despide la sección anterior: cuatro salidas
 * distintas que se rotan para que ningún cambio de sección se sienta igual
 * al anterior. Solo transform/opacity — todo compositor, nada de repintado. */
type Salida = (el: HTMLElement) => gsap.TweenVars;

/* Solo `y`, `scale` y `opacity`. Antes había una salida con `rotation` y otra
 * con desplazamiento lateral: las dos dejaban ver los bordes de la página por
 * debajo y se leían como si la maqueta estuviera rota. */
const SALIDAS: Salida[] = [
  // 1 · Se hunde: baja más lento que la página y se apaga un poco.
  () => ({ y: () => window.innerHeight * 0.14, scale: 0.985, opacity: 0.75 }),
  // 2 · Se aleja en profundidad: encoge hacia el centro, quedándose atrás.
  () => ({ scale: 0.94, opacity: 0.65, y: () => window.innerHeight * 0.05 }),
  // 3 · Se queda quieta y solo se atenúa: el respiro entre las otras dos.
  () => ({ scale: 0.97, opacity: 0.7 }),
];

export function SectionParallax() {
  useGSAP(() => {
    if (shouldSkipIntro()) return;
    const mm = gsap.matchMedia();

    mm.add(`${MEDIA.desktop}, ${MEDIA.tablet}`, () => {
      /* Cada sección (salvo el hero) vive dentro de un `.section-slot`.
       * Esa separación es la que permite que el pare y la transición
       * convivan: fijamos el SLOT y transformamos la SECCIÓN de adentro.
       * Sobre el mismo elemento se pisaban — dentro de ScrollSmoother el pin
       * de GSAP también usa `transform`, así que una anulaba a la otra. */
      const bloques = gsap.utils
        .toArray<HTMLElement>(
          ".landing-main > section:first-child, .landing-main .section-slot, main + footer",
        )
        .map((el) => ({
          slot: el,
          // El hero y el footer no tienen slot: se animan ellos mismos.
          seccion: el.querySelector<HTMLElement>(":scope > section") ?? el,
        }));

      bloques.forEach(({ slot, seccion }, i) => {
        /* El aspecto de lámina (radio, sombra) vive en CSS. Aquí solo
         * ordenamos el apilado y animamos la salida. */
        gsap.set(slot, { zIndex: i + 1, position: "relative" });

        const siguiente = bloques[i + 1];
        if (!siguiente) return;

        const salida = SALIDAS[i % SALIDAS.length]!(seccion);
        gsap.to(seccion, {
          ...salida,
          transformOrigin: salida.transformOrigin ?? "center top",
          ease: "none",
          scrollTrigger: {
            trigger: siguiente.slot,
            /* Empieza cuando la sección entrante ya cubre el 65% de la
             * pantalla, no en cuanto asoma: con `top bottom` la sección
             * actual se oscurecía mientras todavía se estaba leyendo. */
            start: "top 35%",
            end: "top top",
            scrub: 0.5,
            invalidateOnRefresh: true,
          },
        });
      });

      /* ── El pare de cada sección ────────────────────────────────────────
       * Al terminar de verse, la sección se queda FIJA mientras el usuario
       * scrollea un poco más. Ese scroll extra no mueve nada: es el tiempo
       * para verla completa antes de que la siguiente empiece a taparla.
       *
       * Tres reglas:
       *  - El hero no retiene: al abrir, el usuario quiere bajar.
       *  - La sección de roles ya trae su propio pin; dos pines sobre lo
       *    mismo se pelean por el espaciado.
       *  - Empieza en `bottom bottom`, o sea cuando la sección YA se terminó
       *    de ver. Así una sección de 1.3 pantallas primero se recorre
       *    entera y solo después para. */
      bloques.forEach(({ slot, seccion }, i) => {
        if (i === 0) return;
        if (seccion.querySelector("[data-pin-wrap]")) return;

        ScrollTrigger.create({
          trigger: slot,
          start: "bottom bottom",
          // 0.6 pantallas de retención: con 0.35 el pare era tan corto que
          // pasaba desapercibido.
          end: () => `+=${window.innerHeight * 0.6}`,
          pin: slot,
          pinSpacing: true,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          /* NADA de `fastScrollEnd` aquí: hace que ScrollTrigger salte al
           * final cuando se scrollea rápido, y justamente se saltaba el
           * pare. Es lo que hacía parecer que el pin no existía. */
        });
      });

      /* ── Parallax interno por elemento ──
       * Cualquier elemento con `data-parallax="0.12"` se desplaza a distinta
       * velocidad que la página mientras su sección cruza el viewport. */
      gsap.utils.toArray<HTMLElement>("[data-parallax]").forEach((el) => {
        const amount = Number(el.dataset.parallax) || 0.12;
        const recorrido = amount * 100;
        const trigger = el.closest("section") ?? el;

        gsap.fromTo(
          el,
          { yPercent: -recorrido / 2 },
          {
            yPercent: recorrido / 2,
            ease: "none",
            scrollTrigger: {
              trigger,
              start: "top bottom",
              end: "bottom top",
              scrub: 0.6,
              invalidateOnRefresh: true,
            },
          },
        );
      });
    });
  }, []);

  return null;
}
