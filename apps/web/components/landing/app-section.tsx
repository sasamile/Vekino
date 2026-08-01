import { Bell, FileText, QrCode, Smartphone } from "lucide-react";
import { SectionBadge } from "./ui/badge";
import { CroppedPhone } from "./ui/cropped-phone";
import { Reveal } from "./ui/reveal";
import { StoreButton } from "./ui/store-buttons";

/**
 * Aplicación móvil. Mantiene el ancla `#aplicacion` de la landing anterior.
 *
 * Aquí sí van capturas reales (`public/landing/`): son pantallas de teléfono
 * y redibujarlas en DOM a este tamaño no aportaría nitidez, solo trabajo.
 * `CroppedPhone` recorta el fondo del generador que viene pegado al PNG.
 */
const VENTAJAS = [
  {
    icon: FileText,
    titulo: "Facturas y estados de cuenta",
    copy: "Consulta el saldo, descarga el recibo y revisa el histórico de pagos.",
  },
  {
    icon: QrCode,
    titulo: "Visitas autorizadas con QR",
    copy: "Autoriza desde el celular y la portería valida el código al ingreso.",
  },
  {
    icon: Bell,
    titulo: "Comunicados y notificaciones",
    copy: "Los avisos del conjunto llegan al teléfono, no al chat de vecinos.",
  },
];

export function AppSection() {
  return (
    <section id="aplicacion" className="lp-section">
      <div className="lp-container">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-16">
          <Reveal>
            <SectionBadge>Aplicación móvil</SectionBadge>
            <h2 className="mt-5 max-w-[16ch] text-[clamp(1.95rem,3.6vw,2.85rem)] font-[660] leading-[1.05] tracking-[-0.03em] text-heading">
              El conjunto en el <span className="text-brand-500">bolsillo</span>{" "}
              del residente
            </h2>
            <p className="mt-4 max-w-[48ch] text-[15px] leading-[1.55] text-body">
              Misma información que la web, pensada para el celular. Disponible
              para iOS y Android, con el tema claro y la navegación adaptada al
              perfil de cada persona.
            </p>

            <ul className="mt-8 space-y-4">
              {VENTAJAS.map((v) => (
                <li key={v.titulo} className="flex gap-3.5">
                  <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-brand-50">
                    <v.icon
                      className="h-[17px] w-[17px] text-brand-500"
                      strokeWidth={1.8}
                      aria-hidden
                    />
                  </span>
                  <span>
                    <span className="block text-[15px] font-semibold leading-snug text-heading">
                      {v.titulo}
                    </span>
                    <span className="mt-1 block max-w-[42ch] text-[13.5px] leading-[1.5] text-body">
                      {v.copy}
                    </span>
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-9 flex flex-wrap gap-3">
              <StoreButton store="appStore" />
              <StoreButton store="playStore" />
            </div>
          </Reveal>

          {/* Composición de teléfonos */}
          <Reveal delay={120}>
            <div className="relative mx-auto max-w-[420px] pt-9">
              {/* Fondo durazno detrás de los teléfonos. Va como hermano en
                  flujo normal (no `-z-10`): dentro de una tarjeta con
                  contexto de apilamiento, un z negativo lo mandaba detrás
                  del fondo de la sección y desaparecía. */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-2 bottom-6 top-14 rounded-panel bg-surface-warm"
              />

              <span className="absolute left-0 top-0 z-10 inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-2.5 py-1 text-[11px] font-semibold text-heading shadow-card">
                <Smartphone
                  className="h-3 w-3 text-brand-500"
                  strokeWidth={2}
                  aria-hidden
                />
                iOS y Android
              </span>

              <div className="relative flex items-end justify-center gap-4 sm:gap-6">
                <CroppedPhone
                  name="mobile-facturas"
                  className="w-[44%] -rotate-[4deg] drop-shadow-[0_20px_40px_rgb(20_20_20/0.14)]"
                  sizes="(min-width: 640px) 190px, 40vw"
                />
                <CroppedPhone
                  name="mobile-dashboard"
                  className="mb-6 w-[46%] rotate-[3deg] drop-shadow-[0_24px_48px_rgb(20_20_20/0.16)]"
                  sizes="(min-width: 640px) 200px, 42vw"
                />
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
