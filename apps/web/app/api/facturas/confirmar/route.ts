import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { fetchAuthMutation } from "@/lib/auth-server";
import { hashDe, leerPdf, pdfDeFactura } from "../lectura";
import { rechazoDePermiso, rechazoSinSesion } from "../permiso";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * CONFIRMACIÓN de un PDF de cuentas de cobro: lo único que publica en S3 y
 * escribe en la base.
 *
 *   1. Misma sesión y permiso que la vista previa (Fase 1).
 *   2. Vuelve a leer el PDF EN EL SERVIDOR y comprueba por hash que es el
 *      mismo de la vista previa: lo que se guarda son los números que lee
 *      el servidor, no los que mande el navegador.
 *   3. `iniciarImportacion` registra la carga y dice qué pasará con cada
 *      factura. Si el mismo archivo ya se confirmó para el período, devuelve
 *      el resultado anterior sin publicar ni escribir nada (doble clic,
 *      reintento).
 *   4. Publica en S3 SOLO las facturas que se insertan o actualizan, con una
 *      llave de esta importación y la huella del contenido, y con
 *      `If-None-Match: *`: un PDF publicado nunca se sobrescribe, y el
 *      `pdfUrl` anterior de una factura actualizada sigue sirviendo.
 *   5. `bulkUpsert` guarda (y vuelve a validar) y `finalizarImportacion`
 *      cierra la carga con sus conteos.
 */

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});
const BUCKET = process.env.AWS_S3_BUCKET_NAME ?? "vekino";
const REGION = process.env.AWS_REGION ?? "us-east-1";
/** Facturas por llamada a `bulkUpsert`, como hacía la pantalla. */
const LOTE = 20;
/** Publicaciones simultáneas en S3. */
const PARALELO = 6;

/**
 * El vencimiento que la carga le pone a una factura: el día 15 del mes
 * siguiente al período, a medianoche de Colombia. Es la regla que aplicaba la
 * pantalla (con la hora del navegador); aquí se fija la zona porque el
 * servidor no corre en Colombia. Qué fecha es la correcta lo decide la Fase 3
 * de la auditoría (F-06).
 */
function vencimientoDe(periodo: string): number {
  const [a, m] = periodo.split("-").map(Number) as [number, number];
  const siguiente = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
  return Date.parse(`${siguiente}-15T00:00:00-05:00`);
}

function llaveDe(
  legacyId: string,
  periodo: string,
  importacionId: string,
  unidad: string,
  bytes: Uint8Array,
): string {
  const casa = (unidad || "sin-unidad").replace(/[^A-Za-z0-9-]/g, "_");
  return `condominios/facturas/${legacyId}/${periodo}/${importacionId}/unidad-${casa}-${hashDe(bytes).slice(0, 12)}.pdf`;
}

/**
 * Publica sin sobrescribir. Si la llave ya existe es un reintento de esta
 * misma importación con el mismo contenido (la llave lleva la huella): se da
 * por publicado.
 */
async function publicar(key: string, bytes: Uint8Array): Promise<void> {
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: bytes,
        ContentType: "application/pdf",
        IfNoneMatch: "*",
      }),
    );
  } catch (e) {
    const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (err.$metadata?.httpStatusCode === 412 || err.name === "PreconditionFailed") return;
    throw e;
  }
}

async function enParalelo<T>(items: readonly T[], n: number, fn: (item: T) => Promise<void>) {
  const cola = [...items];
  await Promise.all(
    Array.from({ length: Math.min(n, cola.length) }, async () => {
      for (let item = cola.shift(); item !== undefined; item = cola.shift()) await fn(item);
    }),
  );
}

function leerAsignaciones(crudo: string | null, total: number): Map<number, string> | null {
  try {
    const lista = JSON.parse(crudo ?? "") as unknown;
    if (!Array.isArray(lista)) return null;
    const mapa = new Map<number, string>();
    for (const a of lista) {
      const { indice, unidadId } = (a ?? {}) as { indice?: unknown; unidadId?: unknown };
      if (!Number.isInteger(indice) || (indice as number) < 0 || (indice as number) >= total) return null;
      if (typeof unidadId !== "string" || !unidadId || mapa.has(indice as number)) return null;
      mapa.set(indice as number, unidadId);
    }
    return mapa;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  let importacionId: Id<"importaciones"> | null = null;
  try {
    const sinSesion = await rechazoSinSesion();
    if (sinSesion) return sinSesion;

    const form = await req.formData();
    const file = form.get("pdf") as File | null;
    const condominioLegacyId = form.get("condominioLegacyId") as string | null;
    const condominioId = form.get("condominioId") as Id<"condominios"> | null;
    const periodo = form.get("periodo") as string | null;
    const hash = form.get("hash") as string | null;
    const soloNuevas = form.get("soloNuevas") !== "false";
    if (!file || !condominioLegacyId || !condominioId || !periodo || !hash) {
      return NextResponse.json(
        { error: "Faltan campos: pdf, condominioLegacyId, condominioId, periodo, hash" },
        { status: 400 },
      );
    }

    const rechazo = await rechazoDePermiso(condominioLegacyId);
    if (rechazo) return rechazo;

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (hashDe(bytes) !== hash) {
      return NextResponse.json(
        { error: "El archivo no es el mismo de la vista previa. Vuelve a seleccionarlo." },
        { status: 409 },
      );
    }

    const leido = await leerPdf(bytes);
    const asignaciones = leerAsignaciones(form.get("asignaciones") as string | null, leido.facturas.length);
    if (!asignaciones) {
      return NextResponse.json({ error: "Las unidades asignadas no son válidas." }, { status: 400 });
    }
    const candidatas = leido.facturas.flatMap((f, indice) => {
      const unidadId = asignaciones.get(indice);
      return unidadId
        ? [{ indice, unidadId: unidadId as Id<"unidades">, periodoLabel: f.periodoLabel }]
        : [];
    });
    const sinUnidad = leido.facturas.map((_, i) => i).filter((i) => !asignaciones.has(i));

    const inicio = await fetchAuthMutation(api.facturas.iniciarImportacion, {
      condominioId,
      periodo,
      archivo: file.name,
      hash,
      soloNuevas,
      documentos: leido.facturas.length,
      candidatas,
    });
    if (inicio.tipo === "repetida") {
      return NextResponse.json({ tipo: "repetida", ...inicio.resultado, publicadas: 0 });
    }
    if (inicio.tipo === "en_curso") {
      return NextResponse.json(
        { error: "Esta carga ya se está confirmando. Espera un momento y revisa Finanzas." },
        { status: 409 },
      );
    }
    importacionId = inicio.importacionId;

    /* S3: solo lo que de verdad se va a escribir. Lo omitido ("solo
     * nuevas") y lo rechazado no se publica. */
    const aPublicar = inicio.plan.filter((p) => p.accion === "insertar" || p.accion === "actualizar");
    const urls = new Map<number, string>();
    await enParalelo(aPublicar, PARALELO, async (p) => {
      const f = leido.facturas[p.indice]!;
      const pdf = await pdfDeFactura(leido.doc, f.paginas);
      const key = llaveDe(condominioLegacyId, periodo, importacionId!, f.unitIdentifier, pdf);
      await publicar(key, pdf);
      urls.set(p.indice, `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`);
    });

    const fechaEmision = Date.now();
    const fechaVencimiento = vencimientoDe(periodo);
    const facturas = candidatas.map((c, i) => {
      const f = leido.facturas[c.indice]!;
      const pdfUrl = urls.get(c.indice);
      return {
        condominioId,
        unidadId: c.unidadId,
        numeroFactura: `FAC-${periodo}-${String(i + 1).padStart(4, "0")}`,
        numeroInterno: f.numeroInterno,
        periodo,
        periodoLabel: f.periodoLabel,
        residenteNombre: f.residenteNombre,
        ...(f.apto ? { apto: f.apto } : {}),
        vrAdmon: f.vrAdmon,
        lineas: f.lineas,
        saldoAFavor: f.saldoAFavor,
        totalAPagar: f.totalAPagar,
        ...(f.totalConDescuento !== undefined ? { totalConDescuento: f.totalConDescuento } : {}),
        ...(f.saldoAnteriorDocumento !== undefined
          ? { saldoAnteriorDocumento: f.saldoAnteriorDocumento }
          : {}),
        fechaEmision,
        fechaVencimiento,
        estado: "pendiente" as const,
        ...(pdfUrl ? { pdfUrl } : {}),
        motivosLectura: f.motivos,
      };
    });

    const conciliacion = { pagadas: 0, abonadas: 0, vencidas: 0 };
    for (let i = 0; i < facturas.length; i += LOTE) {
      const r = await fetchAuthMutation(api.facturas.bulkUpsert, {
        facturas: facturas.slice(i, i + LOTE),
        skipExisting: soloNuevas,
        importacionId,
      });
      conciliacion.pagadas += r.conciliacion.pagadas;
      conciliacion.abonadas += r.conciliacion.abonadas;
      conciliacion.vencidas += r.conciliacion.vencidas;
    }

    const final = await fetchAuthMutation(api.facturas.finalizarImportacion, {
      importacionId,
      estado: "completada",
      sinUnidad,
    });
    return NextResponse.json({ tipo: "nueva", ...final, conciliacion, publicadas: aPublicar.length });
  } catch (e) {
    console.error("[facturas/confirmar]", e);
    const mensaje = e instanceof Error ? e.message : String(e);
    if (importacionId) {
      try {
        await fetchAuthMutation(api.facturas.finalizarImportacion, {
          importacionId,
          estado: "fallida",
          error: mensaje,
        });
      } catch {
        /* Si tampoco se puede cerrar, queda "en curso" y se retoma al reintentar. */
      }
    }
    return NextResponse.json(
      { error: "No se pudo confirmar la carga. Intenta de nuevo; lo ya guardado no se duplica." },
      { status: 500 },
    );
  }
}
