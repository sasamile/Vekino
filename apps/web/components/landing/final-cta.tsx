"use client";

import { useRef, useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { gsap, useGSAP, MOTION, shouldSkipIntro } from "@/lib/gsap";
import { SectionLabel } from "./ui/section-label";
import { enviarSolicitudDemo, type SolicitudDemo } from "@/lib/demo-request";

type Estado = "inicial" | "enviando" | "enviado" | "error";

export function FinalCTA() {
  const root = useRef<HTMLElement>(null);
  const [estado, setEstado] = useState<Estado>("inicial");

  useGSAP(
    () => {
      if (shouldSkipIntro()) return;

      gsap.from("[data-cta-block]", {
        opacity: 0,
        y: 40,
        scale: 0.97,
        duration: 1,
        ease: MOTION.ease.large,
        scrollTrigger: { trigger: root.current, start: "top 75%" },
      });

      gsap.from("[data-field]", {
        opacity: 0,
        y: 16,
        duration: 0.5,
        stagger: 0.07,
        ease: MOTION.ease.enter,
        scrollTrigger: { trigger: "[data-form]", start: "top 85%" },
      });

      // Formas de fondo muy lentas: presencia sin robar atención al CTA.
      gsap.to("[data-blob]", {
        xPercent: 8,
        yPercent: -6,
        duration: 14,
        ease: MOTION.ease.loop,
        repeat: -1,
        yoyo: true,
        stagger: 2,
      });
    },
    { scope: root },
  );

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
    <section
      ref={root}
      id="contacto"
      className="relative overflow-hidden bg-mist px-6 py-20 sm:py-24"
    >
      <div
        data-blob
        aria-hidden
        className="pointer-events-none absolute -left-40 top-20 h-[460px] w-[460px] rounded-full bg-flame/12 blur-[64px]"
      />
      <div
        data-blob
        aria-hidden
        className="pointer-events-none absolute -right-40 bottom-0 h-[420px] w-[420px] rounded-full bg-sky/12 blur-[64px]"
      />

      <div
        data-cta-block
        className="relative mx-auto grid max-w-6xl gap-14 lg:grid-cols-2 lg:gap-20"
      >
        <div>
          <SectionLabel>Hablemos</SectionLabel>
          <h2 className="mt-6 max-w-[16ch] text-[clamp(2.1rem,4.6vw,3.5rem)] font-semibold leading-[1.06] tracking-[-0.025em] text-ink">
            La administración de tu conjunto puede ser mucho más simple.
          </h2>
          <p className="mt-6 max-w-[46ch] text-[18px] leading-relaxed text-slate-ink">
            Conoce cómo Vekino puede ayudarte a centralizar la información,
            mejorar la comunicación y digitalizar los procesos de tu comunidad.
          </p>

          <ul className="mt-10 space-y-3">
            {[
              "Acompañamiento en la migración de tu información",
              "Capacitación para el equipo administrativo",
              "Soporte en menos de 24 horas hábiles",
            ].map((t) => (
              <li
                key={t}
                className="flex items-start gap-2.5 text-[15px] leading-snug text-slate-ink"
              >
                <CheckCircle2
                  className="mt-0.5 h-4 w-4 shrink-0 text-sky"
                  aria-hidden
                />
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-[28px] bg-white p-7 ring-1 ring-ink/8 shadow-[0_20px_60px_-30px_rgba(4,32,70,0.4)] sm:p-9">
          {estado === "enviado" ? (
            <div className="flex h-full min-h-[420px] flex-col items-center justify-center text-center">
              <CheckCircle2 className="h-12 w-12 text-sky" aria-hidden />
              <p className="mt-5 max-w-[30ch] text-[19px] font-medium leading-snug text-ink">
                Gracias. Uno de nuestros asesores se pondrá en contacto contigo
                para mostrarte Vekino.
              </p>
            </div>
          ) : (
            <form data-form onSubmit={onSubmit} className="space-y-4">
              <Field data-field name="nombre" label="Nombre" required />
              <Field
                data-field
                name="organizacion"
                label="Empresa o conjunto"
                required
              />
              <Field
                data-field
                name="correo"
                label="Correo"
                type="email"
                required
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-field name="telefono" label="Teléfono" type="tel" />
                <Field
                  data-field
                  name="unidades"
                  label="Unidades (aprox.)"
                  type="number"
                />
              </div>

              <div data-field>
                <label
                  htmlFor="mensaje"
                  className="text-sm font-medium text-ink"
                >
                  Mensaje <span className="text-slate-ink">(opcional)</span>
                </label>
                <textarea
                  id="mensaje"
                  name="mensaje"
                  rows={3}
                  className="mt-2 w-full resize-none rounded-2xl border border-ink/12 bg-white px-4 py-3 text-[15px] text-ink transition placeholder:text-slate-ink/60 focus:border-flame focus:outline-none focus:ring-2 focus:ring-flame/25"
                />
              </div>

              {estado === "error" ? (
                <p role="alert" className="text-sm text-[#b3261e]">
                  No pudimos enviar tu solicitud. Inténtalo de nuevo o escríbenos
                  a hola@vekino.co
                </p>
              ) : null}

              <button
                type="submit"
                disabled={estado === "enviando"}
                className="group inline-flex h-14 w-full items-center justify-center gap-2 rounded-pill bg-flame text-[15px] font-semibold text-white transition-colors hover:bg-[#e04d06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flame disabled:opacity-60"
              >
                {estado === "enviando" ? "Enviando…" : "Quiero conocer Vekino"}
                {estado === "enviando" ? null : (
                  <ArrowRight
                    className="h-4 w-4 transition-transform group-hover:translate-x-1"
                    aria-hidden
                  />
                )}
              </button>

              <p className="text-center text-xs leading-relaxed text-slate-ink">
                También puedes escribirnos a{" "}
                <a
                  href="mailto:hola@vekino.co"
                  className="underline underline-offset-2"
                >
                  hola@vekino.co
                </a>
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

function Field({
  name,
  label,
  type = "text",
  required,
  ...rest
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest}>
      <label htmlFor={name} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        className="mt-2 h-13 w-full rounded-pill border border-ink/12 bg-white px-5 py-3.5 text-[15px] text-ink transition placeholder:text-slate-ink/60 focus:border-flame focus:outline-none focus:ring-2 focus:ring-flame/25"
      />
    </div>
  );
}
