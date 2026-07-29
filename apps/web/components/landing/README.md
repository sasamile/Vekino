# Landing de Vekino (`/`)

La landing vive en `app/page.tsx` (server component, dueño de los metadatos SEO).
El login se movió a `/login`.

## Estructura

| Orden | Componente | Ancla |
|---|---|---|
| 1 | `navbar.tsx` | — |
| 2 | `hero-section.tsx` | — |
| 3 | `manifesto-section.tsx` | `#producto` |
| 4 | `connected-experience.tsx` | `#soluciones` |
| 5 | `features-section.tsx` | `#beneficios` |
| 6 | `download-app-section.tsx` | `#aplicacion` |
| 7 | `metrics-section.tsx` | — |
| 8 | `testimonials-section.tsx` | — |
| 9 | `ecosystem-section.tsx` | — |
| 10 | `final-cta.tsx` | `#contacto` |
| 11 | `footer.tsx` | — |

## Cómo reemplazar los mockups por capturas reales

Hoy las pantallas son **réplicas en DOM** con datos ficticios, en
`ui/app-screens.tsx`. No hay ni una imagen de producto todavía.

1. Guarda las capturas en `public/landing/` (WebP o AVIF).
   - Panel admin: 2560×1600
   - App móvil: 1290×2796
   - Vigilancia: 2560×1600
2. En `ui/app-screens.tsx`, reemplaza el cuerpo del componente correspondiente
   por un `<Image>` de `next/image` con `width`/`height` reales (evita layout
   shift) y `priority` solo en el del hero.
3. No toques `ui/mockups.tsx`: los marcos (`PhoneMockup`, `BrowserMockup`)
   siguen sirviendo igual con imágenes dentro.

Los datos ficticios están centralizados en la constante `DEMO` de
`ui/mockups.tsx`. **Nunca pongas datos reales de residentes o conjuntos.**

## Enlaces de App Store y Google Play

Están en `ui/store-buttons.tsx`, en la constante `STORE_LINKS`. Hoy apuntan a
`#app-store-placeholder` y `#play-store-placeholder`. Reemplaza ambos por las
URLs oficiales cuando la app esté publicada.

El QR de descarga de `download-app-section.tsx` es un patrón decorativo, **no
un QR funcional**. Genera uno real que apunte al enlace de la tienda y ponlo
como imagen.

## Formulario de demostración

`lib/demo-request.ts` es el único punto de integración. Hoy lanza
`INTEGRACION_PENDIENTE` a propósito: el formulario muestra el estado de error
porque todavía no hay backend conectado. El archivo trae el ejemplo de cómo
conectarlo.

## Animaciones

Todo con GSAP (`lib/gsap.ts` registra los plugins una sola vez). Duraciones y
curvas compartidas en la constante `MOTION`; breakpoints en `MEDIA`.

Tres cosas a tener en cuenta al editar:

- **`shouldSkipIntro()`**: en una pestaña en segundo plano `requestAnimationFrame`
  no corre y las timelines se congelan en el frame 0, dejando el contenido
  invisible. Cada sección animada consulta este helper y muestra el estado
  final. Si agregas una sección nueva, haz lo mismo.
- **Valores finales en el HTML**: los contadores renderizan su valor real en el
  markup y la animación los lleva de 0 hasta ahí. Nunca renderices `0` y
  dependas de la animación para mostrar el dato.
- **Plugins de pago**: `DrawSVG` y `MotionPath` NO están disponibles.
  `SplitText` y `ScrollTrigger` sí (gratuitos desde GSAP 3.13). Para dibujar
  trazos usamos `strokeDashoffset` a mano.

## Recursos pendientes

- [ ] Capturas reales del panel, la app y la vista de vigilancia
- [ ] Video corto del flujo "registrar visitante" (sección 5), WebM + MP4
- [ ] Imagen Open Graph 1200×630
- [ ] QR real de descarga
- [ ] Enlaces oficiales de las tiendas
- [ ] Testimonios reales con autorización de uso (los actuales son ejemplos)
- [ ] Páginas legales `/legal/privacidad` y `/legal/terminos`
