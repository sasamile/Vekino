"use client";

import { useId, useState } from "react";
import { CheckCircle2, Mail } from "lucide-react";
import { SectionBadge } from "./ui/badge";
import { LpButton } from "./ui/button";
import { Reveal } from "./ui/reveal";
import { suscribirNovedades } from "@/lib/newsletter";

type Estado = "inicial" | "enviando" | "enviado" | "error";

export function NewsletterSection() {
  const [estado, setEstado] = useState<Estado>("inicial");
  const id = useId();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEstado("enviando");
    const correo = String(new FormData(e.currentTarget).get("correo") ?? "");
    try {
      await suscribirNovedades(correo);
      setEstado("enviado");
    } catch {
      setEstado("error");
    }
  }

  return (
    <section id="novedades" className="lp-section">
      <div className="lp-container">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-16">
          <Reveal>
            <SectionBadge>Novedades</SectionBadge>
            <h2 className="mt-5 max-w-[18ch] text-[clamp(1.6rem,2.8vw,2.15rem)] font-[660] leading-[1.08] tracking-[-0.03em] text-heading">
              Buenas prácticas para administrar{" "}
              <span className="text-brand-500">propiedad horizontal</span>
            </h2>
            <p className="mt-3 max-w-[46ch] text-[14.5px] leading-[1.55] text-body">
              Un correo al mes con guías de cartera, asambleas y convivencia.
              Sin promociones y con baja en un clic.
            </p>
          </Reveal>

          <Reveal delay={110}>
            <div className="rounded-panel border border-line bg-surface p-6 shadow-card sm:p-7">
              {estado === "enviado" ? (
                <p className="flex items-center gap-3 text-[14.5px] font-medium text-heading">
                  <CheckCircle2
                    className="h-5 w-5 shrink-0 text-ok"
                    strokeWidth={1.8}
                    aria-hidden
                  />
                  Listo. Te escribiremos con la próxima edición.
                </p>
              ) : (
                <form onSubmit={onSubmit} className="space-y-3">
                  <label
                    htmlFor={id}
                    className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-subtle"
                  >
                    Correo electrónico
                  </label>

                  <div className="flex flex-col gap-2.5 sm:flex-row">
                    <div className="relative flex-1">
                      <Mail
                        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-placeholder"
                        strokeWidth={1.8}
                        aria-hidden
                      />
                      <input
                        id={id}
                        name="correo"
                        type="email"
                        required
                        autoComplete="email"
                        placeholder="tu@correo.com"
                        aria-describedby={`${id}-nota`}
                        className="h-11 w-full rounded-btn border border-[#deded9] bg-surface pl-10 pr-4 text-[14.5px] text-heading transition-[border-color,box-shadow] duration-150 placeholder:text-placeholder focus:border-brand-500 focus:outline-none focus:ring-[3px] focus:ring-brand-500/12"
                      />
                    </div>

                    <LpButton
                      type="submit"
                      disabled={estado === "enviando"}
                      className="w-full sm:w-auto"
                    >
                      {estado === "enviando" ? "Enviando…" : "Suscribirme"}
                    </LpButton>
                  </div>

                  {estado === "error" ? (
                    <p role="alert" className="text-[12.5px] text-[#a83f3f]">
                      No pudimos registrar tu correo. Inténtalo de nuevo más
                      tarde.
                    </p>
                  ) : (
                    <p id={`${id}-nota`} className="text-[12px] text-subtle">
                      Solo contenido sobre administración de conjuntos. Nunca
                      compartimos tu correo.
                    </p>
                  )}
                </form>
              )}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
