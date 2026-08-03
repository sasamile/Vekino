"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import {
  ArrowRight,
  KeyRound,
  Loader2,
  Radio,
  UserRound,
} from "lucide-react";

const STORAGE_CODIGO = "vekino_invitado_codigo";
const STORAGE_SESION = "vekino_invitado_sesion";

export default function InvitadoPage() {
  const [input, setInput] = useState("");
  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState<string | null>(null);
  const [sesionCodigo, setSesionCodigo] = useState<string | null>(null);
  const [restaurado, setRestaurado] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enlace = useQuery(
    api.asambleaInvitados.accederEnlaceInvitado,
    codigo && !sesionCodigo ? { codigo } : "skip",
  );
  const sesion = useQuery(
    api.asambleaInvitados.accederConSesionInvitado,
    sesionCodigo ? { sesionCodigo } : "skip",
  );
  const unirse = useMutation(api.asambleaInvitados.unirseComoInvitado);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("codigo")?.trim().toUpperCase();
    if (fromUrl && fromUrl.length >= 4) {
      window.localStorage.setItem(STORAGE_CODIGO, fromUrl);
      setCodigo(fromUrl);
      setInput(fromUrl);
    } else {
      const guardado = window.localStorage.getItem(STORAGE_CODIGO);
      if (guardado) {
        setCodigo(guardado);
        setInput(guardado);
      }
    }
    const ses = window.localStorage.getItem(STORAGE_SESION);
    if (ses) setSesionCodigo(ses);
    setRestaurado(true);
  }, []);

  useEffect(() => {
    if (codigo && enlace === null) {
      window.localStorage.removeItem(STORAGE_CODIGO);
      setCodigo(null);
    }
  }, [codigo, enlace]);

  useEffect(() => {
    if (sesionCodigo && sesion === null) {
      window.localStorage.removeItem(STORAGE_SESION);
      setSesionCodigo(null);
    }
  }, [sesionCodigo, sesion]);

  function ingresarCodigo(cod: string) {
    const c = cod.trim().toUpperCase();
    window.localStorage.setItem(STORAGE_CODIGO, c);
    setCodigo(c);
    setError(null);
  }

  async function unirme() {
    if (!codigo || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await unirse({ codigo, nombre });
      window.localStorage.setItem(STORAGE_SESION, r.sesionCodigo);
      setSesionCodigo(r.sesionCodigo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo entrar.");
    } finally {
      setBusy(false);
    }
  }

  function salir() {
    window.localStorage.removeItem(STORAGE_CODIGO);
    window.localStorage.removeItem(STORAGE_SESION);
    setCodigo(null);
    setSesionCodigo(null);
    setInput("");
    setNombre("");
  }

  if (!restaurado) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linear-to-b from-white to-primary/10 dark:from-background dark:to-primary/5">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-b from-white to-primary/10 px-4 py-10 dark:from-background dark:to-primary/5">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <UserRound className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Acceso de invitado
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Entra a la sala para hablar o compartir pantalla. No votas ni
            cuentas para el quórum.
          </p>
        </div>

        {sesionCodigo && sesion ? (
          <div className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Invitado
                </p>
                <p className="text-lg font-bold text-foreground">
                  {sesion.nombre}
                </p>
              </div>
              <button
                type="button"
                onClick={salir}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Salir
              </button>
            </div>
            <div className="rounded-xl bg-muted/40 p-3">
              <p className="text-sm font-medium text-foreground">
                {sesion.asamblea.titulo}
              </p>
              <p className="text-xs capitalize text-muted-foreground">
                {sesion.asamblea.fecha} · {sesion.asamblea.hora} ·{" "}
                {sesion.asamblea.estado.replace("_", " ")}
              </p>
            </div>
            {sesion.asamblea.estado === "en_curso" &&
            sesion.asamblea.modalidad !== "presencial" ? (
              <Link
                href="/invitado/sala"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Radio className="h-4 w-4" /> Entrar a la sala
              </Link>
            ) : (
              <p className="rounded-xl bg-amber-500/10 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-200">
                La sala aún no está abierta. Deja esta página lista: cuando
                inicie la asamblea podrás entrar.
              </p>
            )}
          </div>
        ) : !codigo || enlace === null ? (
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            {enlace === null && codigo ? (
              <p className="mb-3 rounded-lg bg-red-500/10 p-3 text-sm text-red-600">
                Código inválido o enlace desactivado. Pide uno nuevo a la mesa.
              </p>
            ) : null}
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">
                Código de invitado
              </span>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value.toUpperCase())}
                  placeholder="XXXXXX"
                  maxLength={8}
                  className="h-14 w-full rounded-xl border border-input bg-card pl-11 text-center font-mono text-2xl font-bold tracking-[0.3em] text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
              </div>
            </label>
            <button
              type="button"
              onClick={() => ingresarCodigo(input)}
              disabled={input.trim().length < 4}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              Continuar <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        ) : enlace === undefined ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Asamblea
              </p>
              <p className="text-lg font-bold text-foreground">
                {enlace.titulo}
              </p>
              <p className="text-xs capitalize text-muted-foreground">
                {enlace.fecha} · {enlace.hora}
              </p>
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">
                Tu nombre
              </span>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Cómo te verán en la sala"
                maxLength={80}
                className="h-12 w-full rounded-xl border border-input bg-card px-3 text-base text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </label>
            {error ? (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => void unirme()}
              disabled={busy || nombre.trim().length < 2}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Entrar como invitado <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
            <button
              type="button"
              onClick={salir}
              className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
            >
              Usar otro código
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
