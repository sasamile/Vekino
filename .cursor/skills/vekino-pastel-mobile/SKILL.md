---
name: vekino-pastel-mobile
description: >-
  Design language for Vekino mobile (Expo/React Native): soft white pastel UI,
  ambient pink/blue bottom glows, Poppins, black primary CTAs, bordered secondary
  buttons (Google-style). Use when building or restyling Vekino mobile screens,
  auth, onboarding, tabs, forms, or when the user mentions estilo login, pastel,
  glow, burbujas, clay, or “como el login”.
---

# Vekino Pastel Mobile UI

Fuente de verdad visual: la pantalla de **Sign In** aprobada por el usuario
(`apps/mobile/src/app/(auth)/login.tsx` + `PastelShell`).

Si hay duda, **copia el login**, no inventes otro look.

## Look & feel (una frase)

Blanco limpio, tipografía Poppins, CTA negro sólido, controles con borde fino,
y **luces pastel difusas grandes abajo** (rosa izq / azul der) — ambient glow,
no círculos sólidos.

## Stack canónico

| Pieza | Path |
|-------|------|
| Tokens | `apps/mobile/src/lib/auth-ui.ts` → `AuthUI` |
| Shell + glow | `apps/mobile/src/components/ui/pastel-shell.tsx` → `PastelShell` |
| Fuentes | `apps/mobile/src/lib/use-auth-fonts.ts` (Poppins) |
| Logo Google | `apps/mobile/src/components/ui/google-logo.tsx` |

En pantallas nuevas: envolver con `PastelShell`, usar `AuthUI.*`, cargar fuentes
con `useAuthFonts()`.

## Tokens (no reinventar)

```
bg / white:     #FFFFFF / #FCFBFD
text:           #0E0E0F
muted:          #747277
border:         #D8D6DC (o #D4D2D8 en botones secundarios)
purple accent:  #7819F1  (checkbox / acentos puntuales)
glow pink:      #F4C4E0
glow blue:      #A8D4F5
glow lavender:  #DDD4FA

padH: 31
fieldH: 54 · btnH: 56–57
radiusField: 12 · radiusBtn primary: ~11 · secondary: ~14
```

Tipografía: siempre `AuthUI.font.*` (Poppins). Nunca Inter/System/Roboto.

## Ambient glow (regla dura)

- **No eliminar, ocultar ni reemplazar** el glow rosa/azul por fondo plano.
- Debe sentirse como iluminación ambiental difusa, grande, saliéndose de las esquinas.
- Implementación aprobada: elipses SVG con `RadialGradient` suave + `shadowRadius` nativo (~55–60) en iOS.
- `pointerEvents: "none"`, detrás del contenido (`zIndex` contenido = 1).
- Contenedor raíz: `overflow: "hidden"`, fondo blanco.
- Evitar `FeGaussianBlur` de SVG (poco fiable en iOS). Evitar círculos con borde duro.

## Componentes

### Primary CTA (Sign In)

- Fondo `#0E0E0F`, texto blanco, full-width, radio ~11–14.
- Preferir `View` + `onTouchEnd` con color explícito (NativeWind/Pressable a veces rompe el fondo).
- **Nunca usar `Pressable` para filas de lista** (NativeWind las vuelve columna: logo/texto/chevron apilados). Usar `View` + `flexDirection: "row"`.
- Haptics light al tocar.
- **Copy en español** (público LATAM). No dejar labels en inglés en pantallas de auth.

### Secondary / Google-style (“flex border”)

- Full-width (`alignSelf: "stretch"`).
- Fondo blanco + **borde fino visible** (`borderWidth` ≥ hairline×2, color `#D4D2D8`).
- `flexDirection: "row"`, icono + label centrados, `marginLeft` en el texto (no confiar solo en `gap`).
- Radio ~14 (no pill extremo).

### Fields

- Label semibold arriba, input en caja blanca con borde `#D8D6DC`, radio 12, alto 54.
- Placeholder `#77767A`.

### Checkbox

- Cuadrado ~20, radio 4; activo = relleno `#7819F1` + check blanco.

### Jerarquía tipográfica

- Título pantalla: bold ~32
- Subtítulo: regular ~17, casi negro
- Labels: semibold ~17
- Muted / legal: regular 13–15, `#747277`
- Links legales: semibold, gris más oscuro (`#3A393E`)

## Layout

- Mucho aire vertical (login: ~28–44 entre bloques).
- Una composición limpia: no cards innecesarias, no glassmorphism pesado en auth.
- SafeArea + KeyboardAvoidingView + ScrollView estándar.
- Contenido siempre por encima del glow.

## Anti-patterns (el usuario ya rechazó esto)

- Circo pastel saturado / “liquid glass” anidado que rompe botones
- Burbujas sólidas con borde duro
- Quitar el glow “porque no se ve”
- CTA primario púrpura o con gradiente
- Botón Google sin borde (texto flotante)
- Logo Google distorsionado / paths rotos
- Fondos navy “serios” o dark mode por defecto
- Inter / system font
- Cards con sombra fuerte en hero/auth

## Cómo aplicar a otras pantallas

1. Envolver con `PastelShell` (o reutilizar el mismo glow layer).
2. Tokens solo desde `AuthUI`.
3. Primary = negro; secondary = borde fino blanco.
4. Misma tipografía y radios.
5. Glow visible en pantallas “de marca” (auth, welcome, empty states). En tabs densas, glow más sutil vía `PastelShell` / `ScreenBackground`.
6. **Navbar:** liquid glass flotante (`BlurView` + borde blanco + sombra suave) en `tab-bar.tsx`. No barra flat con `borderTop`.
7. Cards de producto: `GlassCard` / FrostCard translúcidas — **sin** BlurView anidado dentro de botones CTA.

## Verificación rápida

- [ ] ¿Se ve blanco limpio + glow rosa/azul abajo?
- [ ] ¿CTA negro sólido y visible?
- [ ] ¿Secundarios con borde fino?
- [ ] ¿Poppins en títulos y labels?
- [ ] ¿Texto nítido encima del glow?
- [ ] ¿Parece la misma familia que el login?
