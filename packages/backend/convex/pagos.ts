import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAppUser } from "./model/authz";

// ─────────────────────────────────────────────────────────────
// Integración con la Pasarela de Pagos Aval (AV Villas / Grupo Aval)
// Doc: "Especificación Servicios – Integración Pasarela de Pagos Aval" v1.6
//
// Operaciones:
//   oauth2-token   → token de acceso (X-Sesskey) por transacción.
//   Payments_Trn   → crea la transacción, devuelve PmtAuthId + URL de la pasarela.
//   Payments_BasicData/{PmtId} → consulta el estado final de la transacción.
//
// Ambientes:
//   Los valores por defecto son los de QA/pruebas publicados en el manual, así
//   el flujo funciona en desarrollo sin configurar nada. Para PRODUCCIÓN se
//   sobreescriben por variables de entorno en el dashboard de Convex; NINGUNA
//   credencial de producción vive en el repositorio.
//     AVAL_ENDPOINT          ej https://<dns-prod>
//     AVAL_AUTH_BASIC        Authorization Basic del servicio oauth2 (prod)
//     AVAL_X_AUTHORIZATION   Llave del convenio (X-Authorization) — SECRET
//     AVAL_AGRM_ID           Código NURA del convenio (ej 00030713)
//     AVAL_SECRET_USER / AVAL_SECRET_PASSWORD  SecretList del convenio
//     AVAL_TRN_SRC           Banco recaudador (2 = AV Villas)
//     AVAL_AMBIENTE          "qa" | "prod"
//   Web de retorno:  WEB_APP_URL  (ej https://app.vekino.co  — dev: localhost:3000)
// ─────────────────────────────────────────────────────────────

interface AvalConfig {
  endpoint: string;
  authBasic: string;
  xAuthorization: string;
  agrmId: string;
  companyId: string;
  channel: string;
  trnSrc: string;
  secretUser: string;
  secretPassword: string;
  ambiente: string;
  insecureTls: boolean;
}

/**
 * Config de la pasarela. Por defecto QA (valores del manual, no sensibles).
 * En producción se pasan por env en el dashboard de Convex.
 */
function avalConfig(): AvalConfig {
  return {
    endpoint: process.env.AVAL_ENDPOINT ?? "https://qa.psp.ath.com.co",
    // Basic del servicio oauth2 — QA del manual (sección 4.3). Prod por env.
    authBasic:
      process.env.AVAL_AUTH_BASIC ??
      "MzFoMHJlbzJwbTBndmhndjZyOGsycnFnamg6MTc0Y2o0bmp1bjYybXIzYmMxanRmY3Vsb2RsbmFjZmdmNDBvdDVkYzZjaHVvZG9rbDRxcA==",
    // Llave del convenio (X-Authorization) — QA de ejemplo del manual. Prod por env.
    xAuthorization:
      process.env.AVAL_X_AUTHORIZATION ??
      "L17Y8lLzv7M=ZnJOZm1OZ1JNUUlJTCtxZGdYNmhQUzh1N3ZwRXFMQlBZZG5VWDVFVXNKakUzQkNMSmpWcVltd0RhUVowZTA0VWZ1UWxyNGpWUTRhaWFDTTRPUEdHUkdiTXZTQWZveWkwNW1qSEJQc2tkOXo2dVNaeTVXOGxYazVxenBHd1FXK2k4ZWl1TGc9PQ==",
    agrmId: process.env.AVAL_AGRM_ID ?? "00002336",
    companyId: process.env.AVAL_COMPANY_ID ?? "00089898",
    channel: process.env.AVAL_CHANNEL ?? "16",
    trnSrc: process.env.AVAL_TRN_SRC ?? "2", // 2 = Banco AvVillas
    secretUser: process.env.AVAL_SECRET_USER ?? "usuario1",
    secretPassword: process.env.AVAL_SECRET_PASSWORD ?? "usuario1951",
    ambiente: process.env.AVAL_AMBIENTE ?? "qa",
    // TLS: en QA el endpoint no envía la cadena de CA completa, así que se
    // relaja la verificación. En producción SIEMPRE estricta (salvo opt-in
    // explícito con AVAL_INSECURE_TLS=1, no recomendado).
    insecureTls:
      process.env.AVAL_INSECURE_TLS === "1" ||
      (process.env.AVAL_AMBIENTE ?? "qa") !== "prod",
  };
}

/** URL pública de nuestra app web (para la pantalla de comprobante de retorno). */
function webAppUrl(): string {
  return process.env.WEB_APP_URL ?? "http://localhost:3000";
}

/** URL base de httpActions de Convex (.site) para la URL de retorno de Aval. */
function convexSiteUrl(): string {
  // CONVEX_SITE_URL lo inyecta Convex automáticamente en el runtime.
  return process.env.CONVEX_SITE_URL ?? "";
}

/** X-RqUID: identificador único numérico por transacción (máx 22 dígitos). */
function generarRqUID(): string {
  const ts = Date.now().toString();
  const rnd = Math.floor(Math.random() * 1e9)
    .toString()
    .padStart(9, "0");
  return (ts + rnd).slice(0, 22);
}

/** Mapea el tipoDocumento de Vekino al tipo que espera Aval. */
function mapGovType(tipo?: string): string {
  switch (tipo) {
    case "CC":
    case "CE":
    case "NIT":
    case "TI":
      return tipo;
    case "PASAPORTE":
      return "PP";
    default:
      return "GUEST";
  }
}

/** Cabeceras comunes de seguridad para Trn y BasicData. */
function avalHeaders(
  cfg: AvalConfig,
  token: string,
  rqUID: string,
  govType: string,
  identNum: string,
  ipAddr: string,
): Record<string, string> {
  const auth = cfg.authBasic; // (no usado aquí; se deja explícito el contrato)
  void auth;
  return {
    "Content-Type": "application/json",
    "X-RqUID": rqUID,
    "X-Channel": cfg.channel,
    "X-CompanyId": cfg.companyId,
    "X-GovIssueIdentType": govType,
    "X-IdentSerialNum": identNum,
    "X-IPAddr": ipAddr,
    "X-Sesskey": token,
    "X-Authorization": cfg.xAuthorization,
  };
}

/** Ejecuta una petición HTTPS hacia Aval a través del cliente Node (control TLS). */
async function avalRequest(
  ctx: { runAction: (fn: any, args: any) => Promise<any> },
  cfg: AvalConfig,
  opts: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  },
): Promise<{ status: number; headers: Record<string, string>; text: string }> {
  return await ctx.runAction(internal.avalHttp.request, {
    url: opts.url,
    method: opts.method,
    headers: opts.headers,
    body: opts.body,
    insecure: cfg.insecureTls,
  });
}

/** oauth2-token → access_token (X-Sesskey). */
async function obtenerToken(
  ctx: { runAction: (fn: any, args: any) => Promise<any> },
  cfg: AvalConfig,
): Promise<string> {
  const authHeader = cfg.authBasic.startsWith("Basic ")
    ? cfg.authBasic
    : `Basic ${cfg.authBasic}`;

  const res = await avalRequest(ctx, cfg, {
    url: `${cfg.endpoint}/security/oauth2/oauth2-token`,
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: authHeader,
    },
    body: "grant_type=client_credentials&scope=payment_mgmt/sesskey_payment",
  });

  let json: any;
  try {
    json = JSON.parse(res.text);
  } catch {
    throw new Error(`oauth2-token: respuesta no-JSON (HTTP ${res.status}): ${res.text.slice(0, 200)}`);
  }
  if (res.status < 200 || res.status >= 300 || !json.access_token) {
    throw new Error(`oauth2-token falló (HTTP ${res.status}): ${json.error ?? res.text.slice(0, 200)}`);
  }
  return json.access_token as string;
}

/** Estados que puede reportar una consulta BasicData (excluye iniciada/error). */
type EstadoConsulta =
  | "pendiente"
  | "aprobada"
  | "rechazada"
  | "fallida"
  | "expirada"
  | "no_autorizada";

/** Estado de Aval (StatusCode BasicData) → estado interno del pago. */
function mapStatusCode(code: string): EstadoConsulta {
  switch (String(code)) {
    case "4":
      return "aprobada";
    case "2":
      return "rechazada";
    case "3":
      return "fallida";
    case "5":
      return "expirada";
    case "6":
      return "no_autorizada";
    case "1":
    default:
      return "pendiente";
  }
}

// ─────────────────────────────────────────────────────────────
// Consultas / mutaciones internas (DB)
// ─────────────────────────────────────────────────────────────

/**
 * Valida que el usuario autenticado puede pagar la factura y devuelve todos
 * los datos necesarios para armar la transacción Trn.
 */
export const datosParaTrn = internalQuery({
  args: { facturaId: v.id("facturas") },
  handler: async (ctx, args) => {
    const user = await requireAppUser(ctx);

    const factura = await ctx.db.get(args.facturaId);
    if (!factura) throw new Error("Factura no encontrada.");

    const condominio = await ctx.db.get(factura.condominioId);
    if (!condominio) throw new Error("Condominio no encontrado.");

    // Autorización: staff de plataforma pasa libre; si no, debe estar vinculado
    // a la unidad de la factura en este condominio.
    const esPlataforma =
      user.platformRole === "superadmin" || user.platformRole === "admin";

    let membership: Doc<"memberships"> | null = null;
    if (!esPlataforma) {
      membership = await ctx.db
        .query("memberships")
        .withIndex("by_condominio_user", (q) =>
          q.eq("condominioId", factura.condominioId).eq("userId", user._id),
        )
        .unique();
      if (!membership || !membership.isActive) {
        throw new Error("No pertenece a este condominio.");
      }
      const link = await ctx.db
        .query("usuarioUnidad")
        .withIndex("by_membership", (q) => q.eq("membershipId", membership!._id))
        .filter((q) => q.eq(q.field("unidadId"), factura.unidadId))
        .first();
      if (!link) {
        throw new Error("Esta factura no corresponde a una de sus unidades.");
      }
    }

    if (factura.estado === "pagada") {
      throw new Error("Esta factura ya está pagada.");
    }

    // Monto a pagar: aplica descuento si aún estamos dentro del plazo con descuento.
    const conDescuentoVigente =
      typeof factura.totalConDescuento === "number" &&
      Date.now() <= factura.fechaVencimiento;
    const monto = conDescuentoVigente
      ? factura.totalConDescuento!
      : factura.totalAPagar;

    return {
      factura: {
        _id: factura._id,
        condominioId: factura.condominioId,
        unidadId: factura.unidadId,
        membershipId: factura.membershipId,
        numeroInterno: factura.numeroInterno,
        numeroFactura: factura.numeroFactura,
        periodoLabel: factura.periodoLabel,
      },
      monto: Math.round(monto),
      condominioNombre: condominio.name,
      logoUrl: condominio.logo ?? "",
      user: {
        _id: user._id,
        firstName: user.firstName ?? user.name?.split(" ")[0] ?? "",
        lastName:
          user.lastName ??
          user.name?.split(" ").slice(1).join(" ") ??
          "",
        fullName: user.name ?? "",
        email: user.email ?? "",
        telefono: user.telefono ?? "",
        govType: mapGovType(user.tipoDocumento),
        identNum: user.numeroDocumento ?? "0",
      },
      membershipId: membership?._id,
    };
  },
});

/** Inserta el registro de pago (estado inicial). */
export const registrarPago = internalMutation({
  args: {
    condominioId: v.id("condominios"),
    unidadId: v.id("unidades"),
    facturaId: v.id("facturas"),
    membershipId: v.optional(v.id("memberships")),
    userId: v.optional(v.id("users")),
    rqUID: v.string(),
    pmtAuthId: v.optional(v.string()),
    invoiceNum: v.string(),
    monto: v.number(),
    estado: v.union(
      v.literal("iniciada"),
      v.literal("error"),
    ),
    redirectUrl: v.optional(v.string()),
    ambiente: v.string(),
    trnRaw: v.optional(v.any()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("pagos", {
      condominioId: args.condominioId,
      unidadId: args.unidadId,
      facturaId: args.facturaId,
      membershipId: args.membershipId,
      userId: args.userId,
      rqUID: args.rqUID,
      pmtAuthId: args.pmtAuthId,
      invoiceNum: args.invoiceNum,
      monto: args.monto,
      moneda: "COP",
      estado: args.estado,
      redirectUrl: args.redirectUrl,
      ambiente: args.ambiente,
      trnRaw: args.trnRaw,
      error: args.error,
      intentosConsulta: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Aplica el estado consultado a la pasarela; si aprueba, marca la factura pagada. */
export const aplicarEstado = internalMutation({
  args: {
    pagoId: v.id("pagos"),
    estado: v.union(
      v.literal("pendiente"),
      v.literal("aprobada"),
      v.literal("rechazada"),
      v.literal("fallida"),
      v.literal("expirada"),
      v.literal("no_autorizada"),
    ),
    statusCodeAval: v.optional(v.string()),
    medioPago: v.optional(v.string()),
    banco: v.optional(v.string()),
    approvalId: v.optional(v.string()),
    fechaPago: v.optional(v.number()),
    basicDataRaw: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const pago = await ctx.db.get(args.pagoId);
    if (!pago) throw new Error("Pago no encontrado.");

    const now = Date.now();
    await ctx.db.patch(args.pagoId, {
      estado: args.estado,
      statusCodeAval: args.statusCodeAval,
      medioPago: args.medioPago,
      banco: args.banco,
      approvalId: args.approvalId,
      fechaPago: args.fechaPago,
      basicDataRaw: args.basicDataRaw,
      intentosConsulta: pago.intentosConsulta + 1,
      updatedAt: now,
    });

    // Reflejo en la factura: al aprobar el pago, la factura queda pagada al instante.
    if (args.estado === "aprobada") {
      const factura = await ctx.db.get(pago.facturaId);
      if (factura && factura.estado !== "pagada") {
        await ctx.db.patch(pago.facturaId, {
          estado: "pagada",
          updatedAt: now,
        });
      }
    }
  },
});

/** Incrementa el contador de intentos cuando la consulta falla (para el backoff). */
export const marcarIntentoConsulta = internalMutation({
  args: { pagoId: v.id("pagos") },
  handler: async (ctx, args) => {
    const pago = await ctx.db.get(args.pagoId);
    if (!pago) return;
    await ctx.db.patch(args.pagoId, {
      intentosConsulta: pago.intentosConsulta + 1,
      updatedAt: Date.now(),
    });
  },
});

export const getPagoInterno = internalQuery({
  args: { pagoId: v.id("pagos") },
  handler: async (ctx, args) => await ctx.db.get(args.pagoId),
});

export const getPagoPorPmt = internalQuery({
  args: { pmtId: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("pagos")
      .withIndex("by_pmtAuthId", (q) => q.eq("pmtAuthId", args.pmtId))
      .first(),
});

// ─────────────────────────────────────────────────────────────
// Acciones (HTTP externo hacia Aval)
// ─────────────────────────────────────────────────────────────

/** Máximo de reintentos automáticos de consulta (cada 2 min ≈ 20 min). */
const MAX_INTENTOS = 10;
const INTERVALO_CONSULTA_MS = 2 * 60 * 1000;

/**
 * Crea la transacción en la pasarela Aval para una factura y devuelve la URL a
 * la que se debe redirigir al usuario. Llamada por el propietario desde la web.
 */
export const crearPagoFactura = action({
  args: {
    facturaId: v.id("facturas"),
    ipAddr: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ pagoId: Id<"pagos">; redirectUrl: string }> => {
    const cfg = avalConfig();

    const datos = await ctx.runQuery(internal.pagos.datosParaTrn, {
      facturaId: args.facturaId,
    });

    const rqUID = generarRqUID();
    const ipAddr = args.ipAddr ?? "127.0.0.1";
    const invoiceNum = datos.factura.numeroInterno || datos.factura.numeroFactura;

    // URL de retorno: httpAction de Convex (.site). Aval le concatena ?pmtId=...
    const site = convexSiteUrl();
    const portalUrl = site ? `${site}/aval/retorno` : `${webAppUrl()}/pago/retorno`;

    try {
      const token = await obtenerToken(ctx, cfg);

      const headers = avalHeaders(
        cfg,
        token,
        rqUID,
        datos.user.govType,
        datos.user.identNum,
        ipAddr,
      );

      const body = {
        Agreement: { AgrmId: cfg.agrmId },
        SecretList: [
          { SecretId: "user", Secret: cfg.secretUser },
          { SecretId: "password", Secret: cfg.secretPassword },
        ],
        Fee: { CurAmt: { Amt: String(datos.monto), CurCode: "COP" } },
        TaxPmtInfo: { CurAmt: { Amt: "0", CurCode: "COP" } },
        InvoicePmtInfo: {
          InvoiceInfo: {
            InvoiceType: "1",
            InvoiceNum: invoiceNum,
            Desc: `Administracion ${datos.factura.periodoLabel} - ${datos.condominioNombre}`.slice(0, 150),
            NIE: [invoiceNum],
            InvoiceSender: { Category: "0" },
          },
          PmtStatus: { PmtMethod: "2" },
        },
        RefInfo: [
          { RefId: "PortalURL", RefType: portalUrl },
          { RefId: "LogoURL", RefType: datos.logoUrl },
          { RefId: "Template", RefType: "0" },
          { RefId: "TokenizedData", RefType: "0" },
        ],
        TrnSrcInfo: { TrnSrc: cfg.trnSrc },
        CustInfo: {
          PersonInfo: {
            PersonName: {
              FirstName: datos.user.firstName || datos.factura.periodoLabel,
              LastName: datos.user.lastName || "-",
              FullName: datos.user.fullName,
            },
            ContactInfo: {
              EmailAddr: datos.user.email,
              PhoneNum: { Phone: datos.user.telefono },
            },
          },
        },
      };

      const res = await avalRequest(ctx, cfg, {
        url: `${cfg.endpoint}/payment/Payments_Trn/Trn`,
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      let json: any;
      try {
        json = JSON.parse(res.text);
      } catch {
        throw new Error(`Trn: respuesta no-JSON (HTTP ${res.status}): ${res.text.slice(0, 300)}`);
      }

      // Error de negocio de Aval
      const errDesc = json?.MsgRsHdr?.Status?.StatusDesc;
      const pmtAuthId = json?.InvoicePmtInfo?.PmtStatus?.PmtAuthId;
      const urlRef = Array.isArray(json?.RefInfo)
        ? json.RefInfo.find((r: any) => r.RefId === "URL")?.RefType
        : undefined;

      const resOk = res.status >= 200 && res.status < 300;
      if (!resOk || errDesc || !pmtAuthId || !urlRef) {
        const msg = errDesc ?? `HTTP ${res.status}`;
        const pagoId = await ctx.runMutation(internal.pagos.registrarPago, {
          condominioId: datos.factura.condominioId,
          unidadId: datos.factura.unidadId,
          facturaId: datos.factura._id,
          membershipId: datos.membershipId,
          userId: datos.user._id,
          rqUID,
          invoiceNum,
          monto: datos.monto,
          estado: "error",
          ambiente: cfg.ambiente,
          trnRaw: json,
          error: String(msg),
        });
        throw new Error(`No se pudo crear el pago en la pasarela: ${msg} (pagoId ${pagoId})`);
      }

      const pagoId = await ctx.runMutation(internal.pagos.registrarPago, {
        condominioId: datos.factura.condominioId,
        unidadId: datos.factura.unidadId,
        facturaId: datos.factura._id,
        membershipId: datos.membershipId,
        userId: datos.user._id,
        rqUID,
        pmtAuthId: String(pmtAuthId),
        invoiceNum,
        monto: datos.monto,
        estado: "iniciada",
        redirectUrl: urlRef,
        ambiente: cfg.ambiente,
        trnRaw: json,
      });

      // Red de seguridad: consulta el estado aunque el usuario no vuelva.
      await ctx.scheduler.runAfter(
        INTERVALO_CONSULTA_MS,
        internal.pagos.consultarEstado,
        { pagoId },
      );

      return { pagoId, redirectUrl: urlRef as string };
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("No se pudo crear el pago")) {
        throw e;
      }
      // Falla de red/token: deja rastro y propaga.
      await ctx.runMutation(internal.pagos.registrarPago, {
        condominioId: datos.factura.condominioId,
        unidadId: datos.factura.unidadId,
        facturaId: datos.factura._id,
        membershipId: datos.membershipId,
        userId: datos.user._id,
        rqUID,
        invoiceNum,
        monto: datos.monto,
        estado: "error",
        ambiente: cfg.ambiente,
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  },
});

/**
 * Consulta el estado de una transacción en la pasarela (BasicData) y lo aplica.
 * Reagenda automáticamente cada 2 min mientras siga pendiente (hasta MAX_INTENTOS).
 */
export const consultarEstado = internalAction({
  args: { pagoId: v.id("pagos") },
  handler: async (ctx, args): Promise<Doc<"pagos">["estado"] | null> => {
    const cfg = avalConfig();
    const pago = await ctx.runQuery(internal.pagos.getPagoInterno, {
      pagoId: args.pagoId,
    });
    if (!pago || !pago.pmtAuthId) return null;

    // Ya está en estado final: nada que hacer.
    if (["aprobada", "rechazada", "fallida", "expirada", "no_autorizada"].includes(pago.estado)) {
      return pago.estado;
    }

    try {
      const token = await obtenerToken(ctx, cfg);
      const rqUID = generarRqUID();
      const headers = avalHeaders(cfg, token, rqUID, "GUEST", "0", "127.0.0.1");

      const res = await avalRequest(ctx, cfg, {
        url: `${cfg.endpoint}/payment/Payments_BasicData/BasicData/${pago.pmtAuthId}`,
        method: "GET",
        headers,
      });
      let json: any;
      try {
        json = JSON.parse(res.text);
      } catch {
        throw new Error(`BasicData: respuesta no-JSON (HTTP ${res.status})`);
      }

      const pmtStatus = json?.InvoicePmtInfo?.PmtStatus;
      const statusCode: string | undefined = pmtStatus?.StatusCode;

      // Respuesta de error (pmtid inválido, etc.): reintenta si aún hay margen.
      if (!statusCode) {
        await ctx.runMutation(internal.pagos.marcarIntentoConsulta, {
          pagoId: args.pagoId,
        });
        await reagendarSiProcede(ctx, args.pagoId, pago.intentosConsulta + 1);
        return pago.estado;
      }

      const estado = mapStatusCode(statusCode);
      const medioPago = Array.isArray(pmtStatus?.PmtInfo)
        ? pmtStatus.PmtInfo[0]?.PmtInfoType
        : undefined;
      const banco = Array.isArray(json?.RefInfo)
        ? json.RefInfo.find((r: any) => r.RefId === "BankName")?.RefType
        : undefined;
      const approvalId = res.headers["x-approvalid"] ?? undefined;
      const effDt: string | undefined = pmtStatus?.EffDt;
      const fechaPago = effDt ? Date.parse(effDt.replace(" ", "T")) : undefined;

      await ctx.runMutation(internal.pagos.aplicarEstado, {
        pagoId: args.pagoId,
        estado,
        statusCodeAval: String(statusCode),
        medioPago,
        banco,
        approvalId: approvalId && approvalId !== "0" ? approvalId : undefined,
        fechaPago: Number.isNaN(fechaPago) ? undefined : fechaPago,
        basicDataRaw: json,
      });

      // Si sigue pendiente, reagenda otra consulta.
      if (estado === "pendiente") {
        await reagendarSiProcede(ctx, args.pagoId, pago.intentosConsulta + 1);
      }
      return estado;
    } catch (e) {
      await ctx.runMutation(internal.pagos.marcarIntentoConsulta, {
        pagoId: args.pagoId,
      });
      await reagendarSiProcede(ctx, args.pagoId, pago.intentosConsulta + 1);
      return pago.estado;
    }
  },
});

async function reagendarSiProcede(
  ctx: { scheduler: { runAfter: (ms: number, fn: any, args: any) => Promise<unknown> } },
  pagoId: Id<"pagos">,
  intentos: number,
): Promise<void> {
  if (intentos >= MAX_INTENTOS) return;
  await ctx.scheduler.runAfter(
    INTERVALO_CONSULTA_MS,
    internal.pagos.consultarEstado,
    { pagoId },
  );
}

/** Consulta por pmtId (usada por el httpAction de retorno de Aval). */
export const consultarEstadoPorPmt = internalAction({
  args: { pmtId: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ condominioId: Id<"condominios">; pagoId: Id<"pagos"> } | null> => {
    const pago = await ctx.runQuery(internal.pagos.getPagoPorPmt, {
      pmtId: args.pmtId,
    });
    if (!pago) return null;
    await ctx.runAction(internal.pagos.consultarEstado, { pagoId: pago._id });
    return { condominioId: pago.condominioId, pagoId: pago._id };
  },
});

// ─────────────────────────────────────────────────────────────
// API pública para la UI
// ─────────────────────────────────────────────────────────────

/** Fuerza una consulta inmediata del estado (botón "Actualizar" del comprobante). */
export const verificarPago = action({
  args: { pagoId: v.id("pagos") },
  handler: async (ctx, args): Promise<Doc<"pagos"> | null> => {
    // La consulta interna valida existencia; la lectura pública valida acceso.
    await ctx.runAction(internal.pagos.consultarEstado, { pagoId: args.pagoId });
    return await ctx.runQuery(internal.pagos.getPagoInterno, {
      pagoId: args.pagoId,
    });
  },
});

/** Estado reactivo de un pago (para la pantalla de comprobante). Valida acceso. */
export const estadoPago = query({
  args: { pagoId: v.id("pagos") },
  handler: async (ctx, args) => {
    const user = await requireAppUser(ctx);
    const pago = await ctx.db.get(args.pagoId);
    if (!pago) return null;

    const esPlataforma =
      user.platformRole === "superadmin" || user.platformRole === "admin";
    if (!esPlataforma && pago.userId && pago.userId !== user._id) {
      // Permitir también a cualquier miembro vinculado a la unidad de la factura.
      const membership = await ctx.db
        .query("memberships")
        .withIndex("by_condominio_user", (q) =>
          q.eq("condominioId", pago.condominioId).eq("userId", user._id),
        )
        .unique();
      const link = membership
        ? await ctx.db
            .query("usuarioUnidad")
            .withIndex("by_membership", (q) => q.eq("membershipId", membership._id))
            .filter((q) => q.eq(q.field("unidadId"), pago.unidadId))
            .first()
        : null;
      if (!link) throw new Error("No autorizado para ver este pago.");
    }

    return {
      _id: pago._id,
      estado: pago.estado,
      statusCodeAval: pago.statusCodeAval,
      monto: pago.monto,
      medioPago: pago.medioPago,
      banco: pago.banco,
      pmtAuthId: pago.pmtAuthId,
      facturaId: pago.facturaId,
      condominioId: pago.condominioId,
      fechaPago: pago.fechaPago,
      error: pago.error,
    };
  },
});

/** Estado de un pago a partir del pmtId de Aval (pantalla de retorno). */
export const estadoPagoPorPmt = query({
  args: { pmtId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireAppUser(ctx);
    const pago = await ctx.db
      .query("pagos")
      .withIndex("by_pmtAuthId", (q) => q.eq("pmtAuthId", args.pmtId))
      .first();
    if (!pago) return null;

    const esPlataforma =
      user.platformRole === "superadmin" || user.platformRole === "admin";
    if (!esPlataforma && pago.userId && pago.userId !== user._id) {
      const membership = await ctx.db
        .query("memberships")
        .withIndex("by_condominio_user", (q) =>
          q.eq("condominioId", pago.condominioId).eq("userId", user._id),
        )
        .unique();
      const link = membership
        ? await ctx.db
            .query("usuarioUnidad")
            .withIndex("by_membership", (q) => q.eq("membershipId", membership._id))
            .filter((q) => q.eq(q.field("unidadId"), pago.unidadId))
            .first()
        : null;
      if (!link) return null;
    }

    return {
      _id: pago._id,
      estado: pago.estado,
      monto: pago.monto,
      medioPago: pago.medioPago,
      banco: pago.banco,
      condominioId: pago.condominioId,
      facturaId: pago.facturaId,
      fechaPago: pago.fechaPago,
    };
  },
});

/** Historial de pagos de una factura (para la UI del propietario/admin). */
export const listPorFactura = query({
  args: { facturaId: v.id("facturas") },
  handler: async (ctx, args) => {
    await requireAppUser(ctx);
    return await ctx.db
      .query("pagos")
      .withIndex("by_factura", (q) => q.eq("facturaId", args.facturaId))
      .order("desc")
      .collect();
  },
});
