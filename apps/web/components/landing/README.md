# Landing de Vekino (`/`)

La landing vive en `app/page.tsx` (server component, dueño de los metadatos
SEO y del JSON-LD). El login está en `/login`.

## Sistema visual

SaaS claro y editorial: blanco cálido, naranja de acento y tinta casi negra.
Los tokens están en `app/globals.css`, dentro de `@theme inline`, bajo el
comentario «Landing (marketing)». **No** siguen el tema claro/oscuro de la
app: la landing es una pieza de marca con contraste fijo.

| Token | Uso |
|---|---|
| `brand-50…700` | Naranja. Solo acentos: botones primarios, métricas, estados activos, palabras clave de titulares y gráficas. Nunca superficies grandes, salvo el plan destacado. |
| `heading` / `body` / `subtle` / `placeholder` | Escala de texto |
| `canvas` / `surface` / `surface-soft` / `surface-warm` | Fondos |
| `line` / `line-soft` / `line-strong` / `dash` | Bordes y punteados |
| `ok` / `warn` / `bad` (+ `-soft`) | Estados |
| `violet` / `magenta` / `lime` / `indigo` | Solo etiquetas flotantes decorativas |
| `night` / `night-muted` | Barra CTA oscura del FAQ |

Clases estructurales (`.lp-*`, también en `globals.css`):

- `.lp-frame` — rieles verticales punteados + rayado diagonal de los
  márgenes. Va `fixed` detrás del contenido y **pinta la columna central**.
  Por eso las secciones van transparentes: si cada una pintara su fondo a
  todo el ancho, taparía los rieles.
- `.lp-container` — 1200 px máx., padding 18/24/32 px.
- `.lp-section` — separador punteado superior + ritmo vertical + `scroll-margin`.
- `.lp-reveal` — entrada al viewport (`ui/reveal.tsx`).
- `.lp-collapse` — acordeón con alto animado vía `grid-template-rows`.
- `.lp-card-hover` — elevación de 3 px al pasar el cursor.
- `.lp-rail` — carrusel horizontal con imán.
- `.lp-navlink` — subrayado animado del menú.

## Estructura

| Orden | Componente | Ancla |
|---|---|---|
| 1 | `header.tsx` | — |
| 2 | `hero-section.tsx` | — |
| 3 | `logo-cloud.tsx` | — |
| 4 | `stats-section.tsx` | — |
| 5 | `features-grid.tsx` | `#funcionalidades` |
| 6 | `feature-accordion.tsx` | `#modulos` |
| 7 | `app-section.tsx` | `#aplicacion` |
| 8 | `pricing-section.tsx` | `#planes` |
| 9 | `testimonials-carousel.tsx` | — |
| 10 | `faq-section.tsx` | `#preguntas` |
| 11 | `cta-section.tsx` | — |
| 12 | `contact-section.tsx` | `#contacto` |
| 13 | `newsletter-section.tsx` | `#novedades` |
| 14 | `footer.tsx` | — |

`page-frame.tsx` monta el marco una sola vez para toda la página.

Piezas compartidas en `ui/`: `button`, `badge`, `charts`, `count-up`,
`crosshair`, `dashboard-preview`, `cropped-phone`, `reveal`, `store-buttons`,
`use-in-view`.

## Imágenes vs. DOM

- **Hero y CTA**: el panel del hero es DOM (`ui/dashboard-preview.tsx`), no
  una captura. Se lee nítido en cualquier pantalla y no envejece cuando
  cambia el producto. El CTA sí usa `propietario-dashboard.png`.
- **App móvil**: capturas reales de `public/landing/`. `ui/cropped-phone.tsx`
  recorta el fondo del generador que viene pegado al PNG; si reemplazas una
  captura hay que volver a medir los porcentajes de recorte.

## Animación

Sin librería. Un `IntersectionObserver` por pieza (`ui/use-in-view.ts`) y
transiciones CSS.

Tres reglas que hay que respetar al agregar algo:

1. **El contenido nunca puede quedarse invisible o en cero.** Si no hay
   `IntersectionObserver`, si la pestaña está en segundo plano o si la
   persona pidió menos movimiento, el estado final debe estar ya en el HTML.
   Los contadores (`ui/count-up.tsx`) renderizan su valor real y la animación
   los lleva de 0 hasta ahí, nunca al revés.
2. **Lo que está sobre la línea de flotación usa `immediate`.** Un `Reveal`
   que espera scroll deja un hueco en blanco al recargar la página.
3. **Solo `transform`, `opacity`, `stroke-dasharray` y `grid-template-rows`.**
   Son las propiedades baratas; animar `filter` o `box-shadow` en scroll
   traba el hilo principal.

Las líneas de las gráficas se dibujan con `pathLength="1"`, que normaliza el
largo del trazo y evita medir el path en JavaScript.

## Pendientes antes de publicar

- [ ] **`logo-cloud.tsx`** — nombres y cifra de clientes son marcadores de
      posición. Reemplazar por conjuntos que hayan autorizado el uso de su
      nombre, o eliminar la sección. Publicar clientes inventados es una
      afirmación falsa.
- [ ] **`pricing-section.tsx`** — precios y topes de unidades son de ejemplo.
      Un precio publicado es una oferta comercial: confirmarlos o quitar la
      sección.
- [ ] **`testimonials-carousel.tsx`** — testimonios de ejemplo. Reemplazar
      cuando existan con autorización de uso.
- [ ] `lib/demo-request.ts` y `lib/newsletter.ts` — hoy lanzan
      `INTEGRACION_PENDIENTE` a propósito. Cada uno es el único punto de
      integración: conectarlos es cambiar el cuerpo de una función.
- [ ] `ui/store-buttons.tsx` — enlaces oficiales de App Store y Google Play.
- [ ] Imagen Open Graph 1200×630.
- [ ] **`app/legal/datos.ts`** — razón social, NIT, domicilio y teléfono. Hoy
      salen como `«…»` a propósito: un NIT inventado en una política de datos
      es un problema legal, no una errata.
- [ ] **`app/legal/privacidad` y `app/legal/terminos`** — borradores sobre la
      Ley 1581 de 2012 y la Ley 675 de 2001. No son asesoría legal: falta
      revisión jurídica y cuadrar los plazos con el contrato real.
