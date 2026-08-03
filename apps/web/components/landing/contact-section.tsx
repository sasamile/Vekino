"use client";

import { useId, useState } from "react";
import { ArrowRight, Check, CheckCircle2 } from "lucide-react";
import { SectionBadge } from "./ui/badge";
import { LpButton } from "./ui/button";
import { Reveal } from "./ui/reveal";
import { enviarSolicitudDemo, type SolicitudDemo } from "@/lib/demo-request";
import { cn } from "@/lib/utils";

type Estado = "inicial" | "enviando" | "enviado" | "error";

const GARANTIAS = [
  "Acompañamiento en la migración de tu información",
  "Capacitación para el equipo administrativo",
  "Soporte en español en menos de 24 horas hábiles",
];

export function ContactSection() {
  const [estado, setEstado] = useState<Estado>("inicial");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEstado("enviando");

    const fd = new FormData(e.currentTarget);
    const payload: SolicitudDemo = {
      nombre: String(fd.get("nombre") ?? ""),
      organizacion: String(fd.get("organizacion") ?? ""),
      correo: String(fd.get("correo") ?? ""),
      telefono: String(fd.get("telefono") ?? ""),
      unidades: String(fd.get("unidades") ?? ""),
      mensaje: String(fd.get("mensaje") ?? ""),
    };

    try {
      await enviarSolicitudDemo(payload);
      setEstado("enviado");
    } catch {
      setEstado("error");
    }
  }

  return (
    <section id="contacto" className="lp-section">
      <div className="lp-container">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] lg:gap-16">
          <Reveal>
            <SectionBadge>Hablemos</SectionBadge>
            <h2 className="mt-5 max-w-[15ch] text-[clamp(1.95rem,3.6vw,2.85rem)] font-[660] leading-[1.05] tracking-[-0.03em] text-heading">
              Conoce Vekino con la información de tu{" "}
              <span className="text-brand-500">conjunto</span>
            </h2>
            <p className="mt-4 max-w-[46ch] text-[15px] leading-[1.55] text-body">
              Cuéntanos cuántas unidades administras y agendamos una
              demostración de 30 minutos, sin compromiso.
            </p>

            <ul className="mt-8 space-y-3">
              {GARANTIAS.map((g) => (
                <li key={g} className="flex items-start gap-2.5">
                  <span className="mt-[3px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-brand-50">
                    <Check
                      className="h-[11px] w-[11px] text-brand-500"
                      strokeWidth={3}
                      aria-hidden
                    />
                  </span>
                  <span className="text-[14px] leading-[1.45] text-body">
                    {g}
                  </span>
                </li>
              ))}
            </ul>

            <p className="mt-8 border-t border-dashed border-dash pt-6 text-[13px] text-subtle">
              ¿Prefieres escribirnos directamente?{" "}
              <a
                href="mailto:hola@vekino.com"
                className="font-semibold text-brand-600 underline underline-offset-2 hover:text-brand-700"
              >
                hola@vekino.com
              </a>
            </p>
          </Reveal>

          <Reveal delay={110}>
            <div className="rounded-panel border border-line bg-surface p-6 shadow-card sm:p-8">
              {estado === "enviado" ? (
                <div className="flex min-h-[380px] flex-col items-center justify-center text-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ok-soft">
                    <CheckCircle2
                      className="h-7 w-7 text-ok"
                      strokeWidth={1.8}
                      aria-hidden
                    />
                  </span>
                  <p className="mt-5 max-w-[30ch] text-[17px] font-semibold leading-snug text-heading">
                    Gracias. Un asesor se pondrá en contacto contigo para
                    mostrarte Vekino.
                  </p>
                  <p className="mt-2 text-[13px] text-subtle">
                    Normalmente respondemos el mismo día hábil.
                  </p>
                </div>
              ) : (
                <form
                  onSubmit={onSubmit}
                  noValidate={false}
                  className="space-y-4"
                >
                  <Campo
                    name="nombre"
                    label="Nombre"
                    required
                    autoComplete="name"
                  />
                  <Campo
                    name="organizacion"
                    label="Empresa o conjunto"
                    required
                    autoComplete="organization"
                  />
                  <Campo
                    name="correo"
                    label="Correo"
                    type="email"
                    required
                    autoComplete="email"
                  />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Campo
                      name="telefono"
                      label="Teléfono"
                      type="tel"
                      autoComplete="tel"
                    />
                    <Campo
                      name="unidades"
                      label="Unidades"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      ayuda="Aproximado"
                    />
                  </div>

                  <Campo
                    name="mensaje"
                    label="Mensaje"
                    ayuda="Opcional"
                    textarea
                  />

                  {estado === "error" ? (
                    <p
                      role="alert"
                      className="rounded-btn border border-[#f2d4d4] bg-bad-soft px-3.5 py-2.5 text-[13px] leading-snug text-[#a83f3f]"
                    >
                      No pudimos enviar tu solicitud. Inténtalo de nuevo o
                      escríbenos a{" "}
                      <a
                        href="mailto:hola@vekino.com"
                        className="font-semibold underline underline-offset-2"
                      >
                        hola@vekino.com
                      </a>
                      .
                    </p>
                  ) : null}

                  <LpButton
                    type="submit"
                    size="lg"
                    disabled={estado === "enviando"}
                    className="mt-1 w-full"
                  >
                    {estado === "enviando"
                      ? "Enviando…"
                      : "Quiero conocer Vekino"}
                    {estado === "enviando" ? null : (
                      <ArrowRight
                        className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                        strokeWidth={2}
                        aria-hidden
                      />
                    )}
                  </LpButton>

                  <p className="text-center text-[11.5px] leading-relaxed text-placeholder">
                    Al enviar aceptas que te contactemos sobre Vekino. Puedes
                    pedir la eliminación de tus datos cuando quieras.
                  </p>
                </form>
              )}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/**
 * Campo de formulario del sistema: label arriba, control de 46 px, ayuda
 * debajo. El foco no cambia el fondo — solo el borde y un anillo naranja al
 * 12 %, para que el error (que sí tiñe el borde de rojo) siga distinguiéndose.
 */
function Campo({
  name,
  label,
  ayuda,
  textarea,
  className,
  ...rest
}: {
  name: string;
  label: string;
  ayuda?: string;
  textarea?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement> &
  React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  const ayudaId = ayuda ? `${id}-ayuda` : undefined;

  const control = cn(
    "w-full rounded-btn border border-[#deded9] bg-surface px-4 text-[14.5px] text-heading",
    "transition-[border-color,box-shadow] duration-150",
    "placeholder:text-placeholder",
    "focus:border-brand-500 focus:outline-none focus:ring-[3px] focus:ring-brand-500/12",
    className,
  );

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-[7px] flex items-baseline gap-2 text-[13.5px] font-medium text-[#30302e]"
      >
        {label}
        {ayuda ? (
          <span className="text-[12px] font-normal text-subtle">({ayuda})</span>
        ) : null}
      </label>

      {textarea ? (
        <textarea
          id={id}
          name={name}
          rows={3}
          aria-describedby={ayudaId}
          className={cn(control, "resize-none py-3 leading-[1.5]")}
          {...(rest as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
        />
      ) : (
        <input
          id={id}
          name={name}
          aria-describedby={ayudaId}
          className={cn(control, "h-[46px]")}
          {...(rest as React.InputHTMLAttributes<HTMLInputElement>)}
        />
      )}
    </div>
  );
}
