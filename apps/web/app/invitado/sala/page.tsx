"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { SalaInvitado } from "@/components/asamblea/sala-invitado";

const STORAGE_SESION = "vekino_invitado_sesion";

export default function InvitadoSalaPage() {
  const [sesion, setSesion] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    setSesion(window.localStorage.getItem(STORAGE_SESION));
    setListo(true);
  }, []);

  if (!listo) {
    return (
      <div className="flex h-svh items-center justify-center bg-[#0c0e12]">
        <Loader2 className="h-6 w-6 animate-spin text-white/60" />
      </div>
    );
  }

  if (!sesion) {
    return (
      <div className="flex h-svh flex-col items-center justify-center gap-3 bg-[#0c0e12] px-4 text-center text-white/70">
        <p>No hay sesión de invitado.</p>
        <Link href="/invitado" className="text-sm text-emerald-400 hover:underline">
          Ir a acceso de invitado
        </Link>
      </div>
    );
  }

  return <SalaInvitado sesionCodigo={sesion} />;
}
