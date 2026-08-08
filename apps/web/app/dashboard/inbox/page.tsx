"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { MessagesSquare } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { HiloPanel } from "@/components/dashboard/inbox/hilo-panel";
import { ListaConversaciones } from "@/components/dashboard/inbox/lista-conversaciones";
import type { FiltroInbox } from "@/components/dashboard/inbox/tipos";
import { cn } from "@/lib/utils";

/** Espera a que la persona deje de escribir antes de pegarle a la query. */
function useDebounced<T>(valor: T, ms = 250) {
  const [lento, setLento] = useState(valor);
  useEffect(() => {
    const id = setTimeout(() => setLento(valor), ms);
    return () => clearTimeout(id);
  }, [valor, ms]);
  return lento;
}

/**
 * Bandeja estilo WhatsApp para atender a los residentes que le escriben al
 * bot. Dos paneles en escritorio; en móvil la lista da paso al hilo.
 */
export default function InboxPage() {
  const me = useQuery(api.users.me);
  const isPlatform =
    me?.platformRole === "superadmin" || me?.platformRole === "admin";

  const [filtro, setFiltro] = useState<FiltroInbox>("todos");
  const [busqueda, setBusqueda] = useState("");
  const busquedaLenta = useDebounced(busqueda);
  const [abiertaId, setAbiertaId] = useState<Id<"waConversations"> | null>(null);

  const conversaciones = useQuery(
    api.whatsappInbox.conversaciones,
    isPlatform
      ? {
          soloNoLeidos: filtro === "no_leidos" || undefined,
          soloEscaladas: filtro === "escaladas" || undefined,
          busqueda: busquedaLenta.trim() || undefined,
        }
      : "skip",
  );

  if (me === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-5 w-5" />
      </div>
    );
  }

  if (!isPlatform) {
    return (
      <div className="px-4 py-6 sm:px-7">
        <p className="text-sm text-muted-foreground">
          No tienes acceso a esta sección.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <aside
        className={cn(
          "min-h-0 w-full flex-col border-border lg:flex lg:w-90 lg:shrink-0 lg:border-r",
          abiertaId ? "hidden lg:flex" : "flex",
        )}
      >
        <ListaConversaciones
          conversaciones={conversaciones}
          seleccionadaId={abiertaId}
          onSeleccionar={setAbiertaId}
          busqueda={busqueda}
          onBusqueda={setBusqueda}
          filtro={filtro}
          onFiltro={setFiltro}
        />
      </aside>

      <section
        className={cn(
          "min-h-0 min-w-0 flex-1 flex-col",
          abiertaId ? "flex" : "hidden lg:flex",
        )}
      >
        {abiertaId ? (
          <HiloPanel
            key={abiertaId}
            conversacionId={abiertaId}
            onVolver={() => setAbiertaId(null)}
          />
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center p-6">
            <EmptyState
              icon={MessagesSquare}
              title="Elige una conversación"
              description="Abre un chat de la izquierda para leerlo y responderle al residente."
              className="border-0"
            />
          </div>
        )}
      </section>
    </div>
  );
}
