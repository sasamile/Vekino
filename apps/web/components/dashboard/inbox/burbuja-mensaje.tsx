"use client";

import { useEffect, useState } from "react";
import { Check, Copy, FileText, Reply } from "lucide-react";
import { cn } from "@/lib/utils";
import { estadoLegible, fmtHora, type MensajeRow } from "./tipos";

/** Botón redondo del menú que aparece al pasar el mouse por la burbuja. */
const BOTON_ACCION = cn(
  "grid h-7 w-7 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-soft",
  "transition-colors hover:bg-accent hover:text-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
);

/**
 * Una burbuja del hilo. Entrantes a la izquierda (neutro), salientes a la
 * derecha (verde suave). Los salientes llevan quién los mandó: el nombre del
 * agente, o el chip «bot» si los mandó el agente automático.
 *
 * Al pasar el mouse aparece un menú discreto para citar el mensaje en el
 * composer o copiar su texto.
 */
export function BurbujaMensaje({
  mensaje: m,
  onResponder,
}: {
  mensaje: MensajeRow;
  /** Ausente cuando no se le puede responder a esta conversación. */
  onResponder?: (texto: string) => void;
}) {
  const esSaliente = m.direccion === "saliente";
  const estado = estadoLegible(m.estado);
  const texto = m.contenido?.trim() ?? "";
  /** Con media, un contenido tipo `[image]` es relleno, no un texto real. */
  const textoVisible =
    texto && !(m.mediaUrl && /^\[[a-z]+\]$/i.test(texto)) ? texto : null;

  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!copiado) return;
    const id = window.setTimeout(() => setCopiado(false), 2000);
    return () => window.clearTimeout(id);
  }, [copiado]);

  async function copiar() {
    if (!textoVisible) return;
    try {
      await navigator.clipboard.writeText(textoVisible);
      setCopiado(true);
    } catch {
      /* sin permiso de portapapeles no hay nada que hacer */
    }
  }

  return (
    <div
      className={cn(
        "group flex items-end gap-1.5",
        esSaliente ? "justify-end" : "justify-start",
      )}
    >
      {/* En táctil no hay hover: ahí los botones se quedan visibles. */}
      {textoVisible && (
        <div
          className={cn(
            "flex shrink-0 items-center gap-1 self-center transition-opacity",
            "sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100",
            esSaliente ? "order-first" : "order-last",
          )}
        >
          {onResponder && (
            <button
              type="button"
              onClick={() => onResponder(textoVisible)}
              title="Responder citando este mensaje"
              aria-label="Responder citando este mensaje"
              className={BOTON_ACCION}
            >
              <Reply className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
          <button
            type="button"
            onClick={() => void copiar()}
            title={copiado ? "Copiado" : "Copiar texto"}
            aria-label={copiado ? "Texto copiado" : "Copiar el texto del mensaje"}
            className={cn(
              BOTON_ACCION,
              copiado &&
                "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
            )}
          >
            {copiado ? (
              <Check className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
        </div>
      )}

      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 sm:max-w-[70%]",
          esSaliente
            ? "rounded-br-md border border-emerald-500/20 bg-emerald-500/12"
            : "rounded-bl-md border border-border bg-muted",
        )}
      >
        {esSaliente && (
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            {m.agenteNombre ? (
              <span>— {m.agenteNombre}</span>
            ) : (
              <span className="rounded-full bg-foreground/8 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                bot
              </span>
            )}
          </p>
        )}

        {m.mediaUrl && (
          <MediaMensaje
            url={m.mediaUrl}
            mime={m.mediaMime}
            nombre={m.mediaNombre}
          />
        )}

        {textoVisible && (
          <p
            className={cn(
              "whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-foreground",
              m.mediaUrl && "mt-2",
            )}
          >
            {textoVisible}
          </p>
        )}

        {!textoVisible && !m.mediaUrl && (
          <p className="text-[13.5px] italic text-muted-foreground">
            Mensaje sin contenido
          </p>
        )}

        <div
          className={cn(
            "mt-1 flex items-center gap-1.5 text-[10.5px] text-muted-foreground",
            esSaliente ? "justify-end" : "justify-start",
          )}
        >
          <span className="tabular-nums">{fmtHora(m.createdAt)}</span>
          {esSaliente && estado && (
            <>
              <span aria-hidden>·</span>
              <span>{estado}</span>
            </>
          )}
        </div>

        {m.error && (
          <p className="mt-1 text-[11px] leading-relaxed text-red-600 dark:text-red-400">
            {m.error}
          </p>
        )}
      </div>
    </div>
  );
}

/** Imagen, audio, video o archivo genérico según el mime. */
function MediaMensaje({
  url,
  mime,
  nombre,
}: {
  url: string;
  mime: string | null;
  nombre: string | null;
}) {
  const tipo = mime ?? "";

  if (tipo.startsWith("image/")) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={nombre ?? "Abrir imagen"}
        className="block overflow-hidden rounded-xl border border-border transition-opacity hover:opacity-90"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={nombre ?? "Imagen"}
          className="max-h-64 w-full max-w-xs object-cover"
        />
      </a>
    );
  }

  if (tipo.startsWith("audio/")) {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <audio controls src={url} className="w-56 max-w-full" />
    );
  }

  if (tipo.startsWith("video/")) {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video
        controls
        src={url}
        className="max-h-64 w-full max-w-xs rounded-xl border border-border"
      />
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex max-w-[15rem] items-center gap-2 rounded-xl border border-border bg-card px-2.5 py-2 transition-colors hover:bg-accent"
    >
      <FileText className="h-4 w-4 shrink-0 text-brand" aria-hidden />
      <span className="min-w-0 truncate text-xs text-foreground">
        {nombre ?? "Archivo adjunto"}
      </span>
    </a>
  );
}
