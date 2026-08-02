"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { SalaApoderado } from "@/components/asamblea/sala-apoderado";

const STORAGE_KEY = "vekino_apoderado_codigo";

/**
 * Sala virtual del apoderado.
 * Requiere el código del poder (sesión en localStorage desde /apoderado).
 */
export default function ApoderadoSalaPage() {
  const [codigo, setCodigo] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    const guardado = window.localStorage.getItem(STORAGE_KEY)?.trim().toUpperCase();
    setCodigo(guardado && guardado.length >= 4 ? guardado : null);
    setListo(true);
  }, []);

  if (!listo) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-[#0f1115]">
        <Loader2 className="h-6 w-6 animate-spin text-white/60" />
      </div>
    );
  }

  if (!codigo) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 bg-[#0f1115] px-4 text-center">
        <p className="text-sm text-white/70">
          Primero ingresa con tu código de apoderado.
        </p>
        <Link
          href="/apoderado"
          className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
        >
          Ir a acceso de apoderado
        </Link>
      </div>
    );
  }

  return <SalaApoderado codigo={codigo} />;
}
