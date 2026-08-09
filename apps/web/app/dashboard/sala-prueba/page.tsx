"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { AlertTriangle, Mic, MicOff, MonitorUp, Radio } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useSalaCloudflare } from "@/hooks/use-sala-cloudflare";
import { IndicadorMotor } from "@/components/asamblea/indicador-motor";

/**
 * Banco de pruebas de la sala sobre Cloudflare.
 *
 * Existe para poder equivocarse sin que sea en una asamblea. La sala real
 * sigue funcionando con el motor de siempre; aquí se conecta al SFU nuevo, se
 * abre el micrófono y se oye a los demás — que es todo lo que hay que
 * comprobar antes de cambiar nada.
 *
 * Cuando llegue el momento de la prueba de carga con 170 personas, esta es la
 * pantalla que se les manda.
 */
export default function SalaPruebaPage() {
  const me = useQuery(api.users.me);
  const condos = useQuery(api.automatizaciones.condominiosConAsambleas);
  const [asambleaId, setAsambleaId] = useState<Id<"asambleas"> | "">("");
  const [entrar, setEntrar] = useState(false);

  const sala = useSalaCloudflare(
    (asambleaId || "x") as Id<"asambleas">,
    entrar && !!asambleaId,
  );

  const asambleas = (condos ?? []).flatMap((c) =>
    c.asambleas.map((a) => ({
      ...a,
      condominio: c.condominioNombre,
    })),
  );

  if (me === undefined) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-5 w-5" />
      </div>
    );
  }

  const esPlatform =
    me?.platformRole === "superadmin" || me?.platformRole === "admin";
  if (!esPlatform) {
    return (
      <div className="px-4 py-6">
        <p className="text-sm text-muted-foreground">
          No tienes acceso a esta sección.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-7">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Sala de prueba · Cloudflare
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Banco de pruebas del motor nuevo. La sala real no se toca: esto es para
        comprobar que el audio llega antes de cambiar nada.
      </p>

      {!sala.disponible && (
        <div className="mt-5 flex gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden
          />
          <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
            El SFU de Cloudflare no está configurado. Faltan
            <code className="mx-1">CLOUDFLARE_REALTIME_APP_ID</code> y
            <code className="mx-1">CLOUDFLARE_REALTIME_APP_SECRET</code> en
            Convex.
          </p>
        </div>
      )}

      <div className="mt-6 space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="space-y-1.5">
          <label
            htmlFor="asamblea"
            className="block text-xs font-medium text-foreground"
          >
            Asamblea (tiene que estar en curso)
          </label>
          <Select
            id="asamblea"
            value={asambleaId}
            disabled={entrar}
            onChange={(e) =>
              setAsambleaId(e.target.value as Id<"asambleas"> | "")
            }
          >
            <option value="">Selecciona una…</option>
            {asambleas.map((a) => (
              <option key={a.asambleaId} value={a.asambleaId}>
                {a.condominio} · {a.titulo} · {a.fecha} {a.hora}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={!asambleaId || !sala.disponible}
            variant={entrar ? "outline" : "primary"}
            onClick={() => setEntrar((v) => !v)}
          >
            <Radio className="h-4 w-4" aria-hidden />
            {entrar ? "Salir de la sala" : "Entrar a la sala"}
          </Button>

          {entrar && sala.puedeCompartirPantalla && (
            <Button
              variant={sala.compartiendo ? "primary" : "outline"}
              onClick={() =>
                void (sala.compartiendo
                  ? sala.dejarDeCompartir()
                  : sala.compartirPantalla())
              }
              disabled={sala.estado !== "conectada"}
            >
              <MonitorUp className="h-4 w-4" aria-hidden />
              {sala.compartiendo ? "Dejar de compartir" : "Compartir pantalla"}
            </Button>
          )}

          {entrar && (
            <Button
              variant={sala.micOn ? "primary" : "outline"}
              onClick={() =>
                void (sala.micOn ? sala.apagarMic() : sala.encenderMic())
              }
              disabled={sala.estado !== "conectada"}
            >
              {sala.micOn ? (
                <Mic className="h-4 w-4" aria-hidden />
              ) : (
                <MicOff className="h-4 w-4" aria-hidden />
              )}
              {sala.micOn ? "Micrófono abierto" : "Abrir micrófono"}
            </Button>
          )}
        </div>

        {entrar && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Motor:</span>
            <IndicadorMotor
              motor="cloudflare"
              diagnostico={sala.diagnostico}
            />
          </div>
        )}

        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Estado:</span>
          <span
            className={
              sala.estado === "conectada"
                ? "font-medium text-emerald-600 dark:text-emerald-400"
                : sala.estado === "error"
                  ? "font-medium text-red-600 dark:text-red-400"
                  : "font-medium text-foreground"
            }
          >
            {sala.estado}
          </span>
        </div>

        {sala.error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs leading-relaxed text-red-700 dark:text-red-400">
            {sala.error}
          </p>
        )}
      </div>

      {/* Quien habla. El audio va en elementos propios: si dependiera de que
          hubiera algo que pintar, en una asamblea no se oiría a nadie. */}
      <div className="mt-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-foreground">
          Se está oyendo a {sala.remotas.length}
        </h2>
        {sala.remotas.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Nadie está emitiendo todavía. Abre esta misma página en otro
            dispositivo y enciende allí el micrófono.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {sala.remotas.map((r) =>
              r.tipo === "audio" ? (
                <li
                  key={r.stream.id}
                  className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2"
                >
                  <Mic
                    className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
                    aria-hidden
                  />
                  <span className="text-sm text-foreground">
                    {r.nombre || r.trackName}
                  </span>
                  <audio
                    autoPlay
                    playsInline
                    ref={(el) => {
                      if (el && el.srcObject !== r.stream) el.srcObject = r.stream;
                    }}
                  />
                </li>
              ) : (
                <li key={r.stream.id} className="space-y-1.5">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MonitorUp className="h-3.5 w-3.5" aria-hidden />
                    Pantalla de {r.nombre || r.trackName}
                  </p>
                  <video
                    autoPlay
                    playsInline
                    muted
                    className="w-full rounded-lg border border-border bg-black"
                    ref={(el) => {
                      if (el && el.srcObject !== r.stream) el.srcObject = r.stream;
                    }}
                  />
                </li>
              ),
            )}
          </ul>
        )}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
        Para probar de verdad hacen falta dos dispositivos distintos: en uno se
        abre el micrófono y en el otro se escucha. En el mismo equipo el
        navegador puede cancelar su propio audio y parecer que no funciona.
      </p>
    </div>
  );
}
