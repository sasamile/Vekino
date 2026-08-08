import { v } from "convex/values";
import {
  query,
  mutation,
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requirePlatformStaff } from "./model/authz";
import { createAuth } from "./auth";
import { sendBrevoEmail } from "./lib/brevo";
import { normalizarTelefonoE164 } from "./lib/telefono";
import { textoAccesoWhatsApp } from "./lib/mensajesAcceso";
import { enviarMensaje, msgTexto } from "./lib/ycloud";
import {
  asuntoCredenciales,
  generarPasswordTemporal,
  htmlCredenciales,
  textoCredenciales,
} from "./lib/emailCredenciales";

/**
 * Envío masivo de credenciales de acceso a los residentes de un condominio.
 *
 * Cada persona recibe una contraseña ÚNICA que se le fija en Better Auth en el
 * mismo paso en que se le envía el correo: el mensaje nunca promete una clave
 * que no funcione. Nada de contraseñas compartidas — una sola clave para todo
 * el conjunto permitiría a cualquiera entrar a la cuenta de su vecino con solo
 * saber su correo.
 *
 * El trabajo corre por lotes encadenados con el scheduler: una action de
 * Convex tiene tope de tiempo y un conjunto grande no cabe en una sola pasada.
 */

/** Destinatarios por tanda. Brevo aguanta más, pero así el progreso se ve fluido. */
const TAMANO_LOTE = 15;

/** Fallos de correo seguidos que se toman como caída del proveedor. */
const MAX_FALLOS_CORREO_SEGUIDOS = 3;

// ─────────────────────────────────────────────────────────────
// Lecturas para la UI
// ─────────────────────────────────────────────────────────────

/**
 * Conteo de destinatarios. Deliberadamente NO lee la tabla de jobs: el motor
 * de lotes patchea el job cada pocos segundos y, si esta query lo leyera,
 * cada patch reejecutaría el recorrido completo del condominio.
 */
export const resumen = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requirePlatformStaff(ctx);

    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .collect();

    let totalMiembros = 0;
    let conEmail = 0;
    const vistos = new Set<string>();
    for (const m of memberships) {
      if (!m.isActive || vistos.has(m.userId)) continue;
      const user = await ctx.db.get(m.userId);
      if (!user || !user.active) continue;
      vistos.add(m.userId);
      totalMiembros++;
      if (esEmailReal(user.email)) conEmail++;
    }

    return {
      totalMiembros,
      conEmail,
      sinEmail: totalMiembros - conEmail,
    };
  },
});

/** Envío activo y fecha del último completado (consulta barata y reactiva). */
export const estadoEnvios = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requirePlatformStaff(ctx);

    const activo = await ctx.db
      .query("envioCredencialesJobs")
      .withIndex("by_condominio_estado", (q) =>
        q.eq("condominioId", args.condominioId).eq("estado", "en_curso"),
      )
      .first();

    const ultimo = await ctx.db
      .query("envioCredencialesJobs")
      .withIndex("by_condominio_estado", (q) =>
        q.eq("condominioId", args.condominioId).eq("estado", "completado"),
      )
      .order("desc")
      .first();

    return {
      jobActivoId: activo?._id ?? null,
      ultimoEnvioAt: ultimo?.updatedAt ?? null,
    };
  },
});

export const estadoJob = query({
  args: { jobId: v.id("envioCredencialesJobs") },
  handler: async (ctx, args) => {
    await requirePlatformStaff(ctx);
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;
    const { pendientes, ...resto } = job;
    return resto;
  },
});

export const historial = query({
  args: {
    condominioId: v.id("condominios"),
    /** Acota el detalle a un envío concreto; sin él se mezclarían tandas. */
    jobId: v.optional(v.id("envioCredencialesJobs")),
  },
  handler: async (ctx, args) => {
    await requirePlatformStaff(ctx);

    if (args.jobId) {
      const job = await ctx.db.get(args.jobId);
      if (!job || job.condominioId !== args.condominioId) return [];
      return await ctx.db
        .query("envioCredenciales")
        .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
        .order("desc")
        .take(500);
    }

    return await ctx.db
      .query("envioCredenciales")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .order("desc")
      .take(200);
  },
});

// ─────────────────────────────────────────────────────────────
// Arranque y control
// ─────────────────────────────────────────────────────────────

/**
 * Arranca un envío masivo de credenciales.
 *
 * Vive suelto (no como mutation) porque hay dos formas de llegar aquí y solo
 * una tiene sesión: el botón de superadmin, que autentica antes; y un envío
 * programado, que se dispara solo a la hora fijada y corre sin nadie delante.
 * Lo que sigue —el guard de concurrencia, la cola, el rollback— tiene que ser
 * idéntico en ambos casos, así que está escrito una sola vez.
 */
export async function crearJobCredenciales(
  ctx: MutationCtx,
  args: {
    condominioId: Id<"condominios">;
    modo: "solo_sin_clave" | "nunca_ingreso" | "todos";
    iniciadoPorUserId: Id<"users">;
    iniciadoPorNombre: string;
    envioProgramadoId?: Id<"enviosProgramados">;
  },
): Promise<Id<"envioCredencialesJobs">> {
  const condominio = await ctx.db.get(args.condominioId);
  if (!condominio) throw new Error("Condominio no encontrado.");

  // Sin correo configurado no se toca ni una contraseña: rotarlas y no poder
  // avisar a nadie deja al conjunto entero sin acceso.
  if (!process.env.BREVO_API_KEY?.trim()) {
    throw new Error(
      "El envío de correos no está configurado (BREVO_API_KEY). No se generó ninguna credencial.",
    );
  }

  const enCurso = await ctx.db
    .query("envioCredencialesJobs")
    .withIndex("by_condominio_estado", (q) =>
      q.eq("condominioId", args.condominioId).eq("estado", "en_curso"),
    )
    .first();
  if (enCurso) {
    // `updatedAt` avanza en cada lote y un lote sano tarda segundos. Si lleva
    // quince minutos quieto, la cadena murió (deploy a mitad, action caída):
    // se da por muerto en vez de dejar el condominio bloqueado para siempre.
    const SIN_AVANCE_MS = 15 * 60 * 1000;
    if (Date.now() - enCurso.updatedAt < SIN_AVANCE_MS) {
      throw new Error("Ya hay un envío en curso para este condominio.");
    }
    await ctx.db.patch(enCurso._id, {
      estado: "cancelado",
      pendientes: [],
      updatedAt: Date.now(),
    });
  }

  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
    .collect();

  /* Quiénes ya recibieron credenciales alguna vez. Se usa para el modo
   * `nunca_ingreso`: si nunca se le mandó nada, obviamente no ha entrado. */
  const yaRecibieron = new Set<string>();
  if (args.modo === "nunca_ingreso") {
    const previos = await ctx.db
      .query("envioCredenciales")
      .withIndex("by_condominio", (q) =>
        q.eq("condominioId", args.condominioId),
      )
      .collect();
    for (const p of previos) {
      if (p.estado === "enviado") yaRecibieron.add(p.userId);
    }
  }

  const pendientes: Id<"users">[] = [];
  const vistos = new Set<string>();
  for (const m of memberships) {
    if (!m.isActive) continue;
    if (vistos.has(m.userId)) continue;
    const user = await ctx.db.get(m.userId);
    if (!user || !user.active) continue;
    vistos.add(m.userId);

    /* "No ha entrado" no se puede leer de `authId`: se estampa al crear al
     * residente, sin login de por medio. Lo que sí es evidencia:
     *  - `ultimoIngresoAt`, que solo escribe una sesión resuelta. Es el dato
     *    bueno, pero empezó a registrarse tarde, así que aún no basta solo.
     *  - `claveTemporal`, que ponemos al entregar una clave y se borra cuando
     *    la persona la cambia — y cambiarla exige haber entrado.
     * Así que se descarta solo a quien recibió su clave y ya no la tiene
     * marcada como temporal: esa persona entró y se puso la suya. */
    if (args.modo === "nunca_ingreso") {
      if (user.ultimoIngresoAt) continue;
      if (yaRecibieron.has(m.userId) && user.claveTemporal !== true) continue;
    }

    pendientes.push(m.userId);
  }

  if (pendientes.length === 0) {
    throw new Error("Este condominio no tiene miembros activos.");
  }

  const now = Date.now();
  const jobId = await ctx.db.insert("envioCredencialesJobs", {
    condominioId: args.condominioId,
    modo: args.modo,
    estado: "en_curso",
    pendientes,
    total: pendientes.length,
    procesados: 0,
    enviados: 0,
    fallidos: 0,
    omitidos: 0,
    iniciadoPorUserId: args.iniciadoPorUserId,
    iniciadoPorNombre: args.iniciadoPorNombre,
    envioProgramadoId: args.envioProgramadoId,
    createdAt: now,
    updatedAt: now,
  });

  await ctx.scheduler.runAfter(0, internal.credenciales.procesarLote, { jobId });
  return jobId;
}

export const iniciarEnvio = mutation({
  args: {
    condominioId: v.id("condominios"),
    modo: v.union(
      v.literal("solo_sin_clave"),
      v.literal("nunca_ingreso"),
      v.literal("todos"),
    ),
  },
  handler: async (ctx, args) => {
    const staff = await requirePlatformStaff(ctx);
    return await crearJobCredenciales(ctx, {
      condominioId: args.condominioId,
      modo: args.modo,
      iniciadoPorUserId: staff._id,
      iniciadoPorNombre: staff.name,
    });
  },
});


export const cancelarJob = mutation({
  args: { jobId: v.id("envioCredencialesJobs") },
  handler: async (ctx, args) => {
    await requirePlatformStaff(ctx);
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Envío no encontrado.");
    if (job.estado !== "en_curso") return args.jobId;

    // El lote en vuelo termina; el encadenamiento se corta al ver el estado.
    await ctx.db.patch(args.jobId, {
      estado: "cancelado",
      pendientes: [],
      updatedAt: Date.now(),
    });
    return args.jobId;
  },
});

// ─────────────────────────────────────────────────────────────
// Motor por lotes
// ─────────────────────────────────────────────────────────────

export const tomarLote = internalMutation({
  args: { jobId: v.id("envioCredencialesJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.estado !== "en_curso") return null;

    const lote = job.pendientes.slice(0, TAMANO_LOTE);
    const resto = job.pendientes.slice(TAMANO_LOTE);
    await ctx.db.patch(args.jobId, { pendientes: resto, updatedAt: Date.now() });

    const condominio = await ctx.db.get(job.condominioId);
    if (!condominio) return null;

    const destinatarios = [];
    for (const userId of lote) {
      const user = await ctx.db.get(userId);
      if (!user) continue;
      destinatarios.push({
        userId,
        nombre: user.name,
        email: user.email,
        emailValido: esEmailReal(user.email),
        /* Viaja hasta el envío para el freno de `nunca_ingreso`: si la
         * persona tiene contraseña y NO es la temporal que le dimos, se la
         * puso ella, o sea que entró. Rotársela la dejaría por fuera. */
        claveTemporal: user.claveTemporal === true,
      });
    }

    return {
      modo: job.modo,
      condominioId: job.condominioId,
      condominioNombre: condominio.name,
      condominioLogoUrl: condominio.logo ?? undefined,
      destinatarios,
      quedanMas: resto.length > 0,
    };
  },
});

export const registrarResultados = internalMutation({
  args: {
    jobId: v.id("envioCredencialesJobs"),
    resultados: v.array(
      v.object({
        userId: v.id("users"),
        nombre: v.string(),
        email: v.string(),
        estado: v.union(
          v.literal("enviado"),
          v.literal("fallido"),
          v.literal("omitido"),
        ),
        motivo: v.optional(v.string()),
      }),
    ),
    terminar: v.boolean(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;

    const now = Date.now();
    let enviados = 0;
    let fallidos = 0;
    let omitidos = 0;

    for (const r of args.resultados) {
      await ctx.db.insert("envioCredenciales", {
        jobId: args.jobId,
        condominioId: job.condominioId,
        userId: r.userId,
        nombre: r.nombre,
        email: r.email,
        estado: r.estado,
        motivo: r.motivo,
        createdAt: now,
      });
      if (r.estado === "enviado") enviados++;
      else if (r.estado === "fallido") fallidos++;
      else omitidos++;
    }

    const estadoFinal =
      // Un job cancelado a mitad no se marca como completado.
      args.terminar && job.estado === "en_curso" ? "completado" : job.estado;

    await ctx.db.patch(args.jobId, {
      procesados: job.procesados + args.resultados.length,
      enviados: job.enviados + enviados,
      fallidos: job.fallidos + fallidos,
      omitidos: job.omitidos + omitidos,
      estado: estadoFinal,
      updatedAt: now,
    });

    /* Si nació de un envío programado, se le copian los totales en cada tanda
     * para que la barra de Automatizaciones avance en vivo y no salte de 0 al
     * final. `omitidos` (los que ya tenían clave propia) van a "sin contacto":
     * no son un fallo, pero tampoco recibieron nada. */
    if (job.envioProgramadoId) {
      const espejo = await ctx.db.get(job.envioProgramadoId);
      if (espejo && espejo.estado !== "cancelado") {
        await ctx.db.patch(job.envioProgramadoId, {
          total: job.total,
          enviados: job.enviados + enviados,
          fallidos: job.fallidos + fallidos,
          sinContacto: job.omitidos + omitidos,
          estado: estadoFinal === "completado" ? "completado" : espejo.estado,
          updatedAt: now,
        });
      }
    }
    return null;
  },
});

export const procesarLote = internalAction({
  args: { jobId: v.id("envioCredencialesJobs") },
  handler: async (ctx, args) => {
    const lote = await ctx.runQuery(internal.credenciales.jobVigente, {
      jobId: args.jobId,
    });
    if (!lote) return null;

    const datos = await ctx.runMutation(internal.credenciales.tomarLote, {
      jobId: args.jobId,
    });
    if (!datos || datos.destinatarios.length === 0) {
      if (datos?.quedanMas) {
        await ctx.scheduler.runAfter(0, internal.credenciales.procesarLote, {
          jobId: args.jobId,
        });
      } else {
        await ctx.runMutation(internal.credenciales.registrarResultados, {
          jobId: args.jobId,
          resultados: [],
          terminar: true,
        });
      }
      return null;
    }

    const loginUrl = `${(process.env.WEB_APP_URL ?? "https://app.vekino.com").replace(/\/+$/, "")}/login`;
    const vekinoLogoUrl = process.env.VEKINO_LOGO_URL || undefined;

    const resultados: Array<{
      userId: Id<"users">;
      nombre: string;
      email: string;
      estado: "enviado" | "fallido" | "omitido";
      motivo?: string;
    }> = [];

    let fallosCorreoSeguidos = 0;
    let abortoCorreo: string | null = null;
    let sinProcesar: Id<"users">[] = [];

    // `tomarLote` ya sacó a esta gente de la cola: si el arranque de Better
    // Auth falla, hay que dejarlos registrados como fallidos y seguir con el
    // resto. De lo contrario desaparecen y el job nunca llega a `total`.
    let authCtx: Awaited<ReturnType<typeof createAuth>["$context"]>;
    let ia: any;
    try {
      authCtx = await createAuth(ctx).$context;
      ia = authCtx.internalAdapter;
    } catch (e) {
      const motivo = (e instanceof Error ? e.message : String(e)).slice(0, 300);
      await ctx.runMutation(internal.credenciales.registrarResultados, {
        jobId: args.jobId,
        resultados: datos.destinatarios.map((d) => ({
          userId: d.userId,
          nombre: d.nombre,
          email: d.email,
          estado: "fallido" as const,
          motivo: `No se pudo iniciar el sistema de credenciales: ${motivo}`,
        })),
        terminar: !datos.quedanMas,
      });
      if (datos.quedanMas) {
        await ctx.scheduler.runAfter(0, internal.credenciales.procesarLote, {
          jobId: args.jobId,
        });
      }
      return null;
    }

    for (const d of datos.destinatarios) {
      if (!d.emailValido) {
        resultados.push({
          userId: d.userId,
          nombre: d.nombre,
          email: d.email,
          estado: "omitido",
          motivo: "Sin correo válido registrado",
        });
        continue;
      }

      // Deshacer lo escrito en Better Auth si el correo no sale: una clave
      // rotada que nadie recibió es un residente sin acceso.
      let deshacer: (() => Promise<void>) | null = null;
      let faseCorreo = false;

      try {
        const encontrado = await ia.findUserByEmail(d.email);
        const cuentas = encontrado
          ? await ia.findAccounts(encontrado.user.id)
          : [];
        const credencial = cuentas.find((a: any) => a.providerId === "credential");

        if (datos.modo === "solo_sin_clave" && credencial) {
          resultados.push({
            userId: d.userId,
            nombre: d.nombre,
            email: d.email,
            estado: "omitido",
            motivo: "Ya tiene contraseña propia",
          });
          continue;
        }

        /* Último freno de `nunca_ingreso`. El filtro de la cola se arma con lo
         * que hay en `users`, y ahí la evidencia es floja: `ultimoIngresoAt`
         * empezó a registrarse hace poco. Aquí sí sabemos si tiene credencial
         * de verdad, así que si la tiene y ya no está marcada como temporal,
         * es suya y entró. Rotársela cinco horas antes de una asamblea la
         * dejaría sin poder votar. */
        if (datos.modo === "nunca_ingreso" && credencial && !d.claveTemporal) {
          resultados.push({
            userId: d.userId,
            nombre: d.nombre,
            email: d.email,
            estado: "omitido",
            motivo: "Ya se puso su propia contraseña",
          });
          continue;
        }

        // La clave se fija ANTES de enviar para no prometer en el correo una
        // contraseña que luego no funcione; el rollback cubre el otro extremo.
        const password = generarPasswordTemporal();
        const hashed = await authCtx.password.hash(password);

        if (!encontrado) {
          const creado = await ia.createUser({
            email: d.email,
            name: d.nombre,
            emailVerified: false,
          });
          const cuenta = await ia.createAccount({
            userId: creado.id,
            providerId: "credential",
            accountId: creado.id,
            password: hashed,
          });
          const cuentaId = (cuenta as any)?.id;
          if (cuentaId) deshacer = () => ia.deleteAccount(cuentaId);
        } else if (!credencial) {
          const cuenta = await ia.createAccount({
            userId: encontrado.user.id,
            providerId: "credential",
            accountId: encontrado.user.id,
            password: hashed,
          });
          const cuentaId = (cuenta as any)?.id;
          if (cuentaId) deshacer = () => ia.deleteAccount(cuentaId);
        } else {
          const hashAnterior: string | undefined = (credencial as any).password;
          const authUserId = encontrado.user.id;
          await ia.updatePassword(authUserId, hashed);
          if (hashAnterior) {
            deshacer = () => ia.updatePassword(authUserId, hashAnterior);
          }
        }

        const datosCorreo = {
          nombre: d.nombre,
          email: d.email,
          password,
          loginUrl,
          condominioNombre: datos.condominioNombre,
          condominioLogoUrl: datos.condominioLogoUrl,
          vekinoLogoUrl,
        };

        faseCorreo = true;
        await sendBrevoEmail({
          to: [{ email: d.email, name: d.nombre }],
          subject: asuntoCredenciales(),
          htmlContent: htmlCredenciales(datosCorreo),
          textContent: textoCredenciales(datosCorreo),
        });

        fallosCorreoSeguidos = 0;
        // Al entrar se le recuerda que la clave es temporal (no lo bloquea).
        await ctx.runMutation(internal.users.setClaveTemporal, {
          userId: d.userId,
          valor: true,
        });
        resultados.push({
          userId: d.userId,
          nombre: d.nombre,
          email: d.email,
          estado: "enviado",
        });
      } catch (e) {
        let motivo = (e instanceof Error ? e.message : String(e)).slice(0, 300);

        if (faseCorreo && deshacer) {
          try {
            await deshacer();
            motivo += " · Se restauró su contraseña anterior.";
          } catch {
            motivo += " · ATENCIÓN: no se pudo restaurar su contraseña anterior.";
          }
        }

        resultados.push({
          userId: d.userId,
          nombre: d.nombre,
          email: d.email,
          estado: "fallido",
          motivo,
        });

        // Un fallo de Better Auth es puntual; uno de correo suele ser
        // sistémico (sin cuota, credencial revocada). Tras varios seguidos se
        // aborta y el resto vuelve a la cola en vez de quemar más claves.
        if (!faseCorreo) {
          fallosCorreoSeguidos = 0;
        } else if (++fallosCorreoSeguidos >= MAX_FALLOS_CORREO_SEGUIDOS) {
          abortoCorreo = motivo;
          sinProcesar = datos.destinatarios
            .slice(datos.destinatarios.indexOf(d) + 1)
            .map((x) => x.userId);
          break;
        }
      }
    }

    if (abortoCorreo) {
      await ctx.runMutation(internal.credenciales.abortarPorCorreo, {
        jobId: args.jobId,
        resultados,
        devolver: sinProcesar,
      });
      return null;
    }

    await ctx.runMutation(internal.credenciales.registrarResultados, {
      jobId: args.jobId,
      resultados,
      terminar: !datos.quedanMas,
    });

    if (datos.quedanMas) {
      await ctx.scheduler.runAfter(0, internal.credenciales.procesarLote, {
        jobId: args.jobId,
      });
    }
    return null;
  },
});

/**
 * Cierra el job cuando el correo falla de forma sistémica: registra lo que
 * alcanzó a pasar y devuelve a la cola a quienes no se tocaron, para poder
 * reanudar una vez arreglado el proveedor.
 */
export const abortarPorCorreo = internalMutation({
  args: {
    jobId: v.id("envioCredencialesJobs"),
    resultados: v.array(
      v.object({
        userId: v.id("users"),
        nombre: v.string(),
        email: v.string(),
        estado: v.union(
          v.literal("enviado"),
          v.literal("fallido"),
          v.literal("omitido"),
        ),
        motivo: v.optional(v.string()),
      }),
    ),
    devolver: v.array(v.id("users")),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;

    const now = Date.now();
    let enviados = 0;
    let fallidos = 0;
    let omitidos = 0;
    for (const r of args.resultados) {
      await ctx.db.insert("envioCredenciales", {
        jobId: args.jobId,
        condominioId: job.condominioId,
        userId: r.userId,
        nombre: r.nombre,
        email: r.email,
        estado: r.estado,
        motivo: r.motivo,
        createdAt: now,
      });
      if (r.estado === "enviado") enviados++;
      else if (r.estado === "fallido") fallidos++;
      else omitidos++;
    }

    await ctx.db.patch(args.jobId, {
      procesados: job.procesados + args.resultados.length,
      enviados: job.enviados + enviados,
      fallidos: job.fallidos + fallidos,
      omitidos: job.omitidos + omitidos,
      pendientes: [...args.devolver, ...job.pendientes],
      estado: "cancelado",
      updatedAt: now,
    });
    return null;
  },
});

// ─────────────────────────────────────────────────────────────
// Envío individual (pruebas y reenvío puntual a un residente)
// ─────────────────────────────────────────────────────────────

/** Quién es este correo y en qué condominio está. Diagnóstico previo al envío. */
export const buscarPorEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (!user) return null;

    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const condominios = [];
    for (const m of memberships) {
      if (!m.isActive) continue;
      const c = await ctx.db.get(m.condominioId);
      if (c) {
        condominios.push({
          condominioId: c._id,
          nombre: c.name,
          logo: c.logo ?? undefined,
          roles: m.roles,
        });
      }
    }

    return {
      userId: user._id,
      nombre: user.name,
      email: user.email,
      activo: user.active,
      platformRole: user.platformRole ?? null,
      condominios,
    };
  },
});

/**
 * Envía credenciales a UNA persona. Misma lógica que el lote (clave única,
 * rollback si el correo falla), sin cola ni job.
 *
 *   bunx convex run credenciales:enviarAUnUsuario '{"email":"..."}'
 */
export const enviarAUnUsuario = internalAction({
  args: {
    email: v.string(),
    /**
     * true = manda el correo tal cual pero con una clave de muestra y SIN
     * tocar Better Auth. Sirve para ver cómo llega el mensaje sin dejar a
     * nadie fuera de su cuenta.
     */
    soloPrevisualizar: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { ok: false; motivo: string }
    | {
        ok: true;
        nombre: string;
        email: string;
        condominio: string | null;
        teniaClave: boolean;
        loginUrl: string;
      }
  > => {
    const info: {
      userId: Id<"users">;
      nombre: string;
      email: string;
      activo: boolean;
      platformRole: string | null;
      condominios: Array<{
        condominioId: Id<"condominios">;
        nombre: string;
        logo?: string;
        roles: string[];
      }>;
    } | null = await ctx.runQuery(internal.credenciales.buscarPorEmail, {
      email: args.email,
    });
    if (!info) return { ok: false as const, motivo: "No existe un usuario con ese correo." };
    if (!info.activo) return { ok: false as const, motivo: "El usuario está inactivo." };
    if (!esEmailReal(info.email)) {
      return { ok: false as const, motivo: "El correo no es válido para envío." };
    }

    const condo = info.condominios[0];
    const loginUrl = `${(process.env.WEB_APP_URL ?? "https://www.vekino.com").replace(/\/+$/, "")}/login`;

    const password = generarPasswordTemporal();

    // Previsualización: mismo correo, sin escribir una sola credencial.
    if (args.soloPrevisualizar) {
      const datosPreview = {
        nombre: info.nombre,
        email: info.email,
        password,
        loginUrl,
        condominioNombre: condo?.nombre ?? "tu conjunto",
        condominioLogoUrl: condo?.logo,
        vekinoLogoUrl: process.env.VEKINO_LOGO_URL || undefined,
      };
      await sendBrevoEmail({
        to: [{ email: info.email, name: info.nombre }],
        subject: asuntoCredenciales(),
        htmlContent: htmlCredenciales(datosPreview),
        textContent: textoCredenciales(datosPreview),
      });
      return {
        ok: true as const,
        nombre: info.nombre,
        email: info.email,
        condominio: condo?.nombre ?? null,
        teniaClave: false,
        loginUrl,
      };
    }

    const authCtx = await createAuth(ctx).$context;
    const ia: any = authCtx.internalAdapter;

    const encontrado = await ia.findUserByEmail(info.email);
    const cuentas = encontrado ? await ia.findAccounts(encontrado.user.id) : [];
    const credencial = cuentas.find((a: any) => a.providerId === "credential");

    const hashed = await authCtx.password.hash(password);

    let deshacer: (() => Promise<void>) | null = null;
    if (!encontrado) {
      const creado = await ia.createUser({
        email: info.email,
        name: info.nombre,
        emailVerified: false,
      });
      const cuenta = await ia.createAccount({
        userId: creado.id,
        providerId: "credential",
        accountId: creado.id,
        password: hashed,
      });
      if (cuenta?.id) deshacer = () => ia.deleteAccount(cuenta.id);
    } else if (!credencial) {
      const cuenta = await ia.createAccount({
        userId: encontrado.user.id,
        providerId: "credential",
        accountId: encontrado.user.id,
        password: hashed,
      });
      if (cuenta?.id) deshacer = () => ia.deleteAccount(cuenta.id);
    } else {
      const hashAnterior: string | undefined = credencial.password;
      const authUserId = encontrado.user.id;
      await ia.updatePassword(authUserId, hashed);
      if (hashAnterior) deshacer = () => ia.updatePassword(authUserId, hashAnterior);
    }

    const datosCorreo = {
      nombre: info.nombre,
      email: info.email,
      password,
      loginUrl,
      condominioNombre: condo?.nombre ?? "tu conjunto",
      condominioLogoUrl: condo?.logo,
      vekinoLogoUrl: process.env.VEKINO_LOGO_URL || undefined,
    };

    try {
      await sendBrevoEmail({
        to: [{ email: info.email, name: info.nombre }],
        subject: asuntoCredenciales(),
        htmlContent: htmlCredenciales(datosCorreo),
        textContent: textoCredenciales(datosCorreo),
      });
    } catch (e) {
      if (deshacer) await deshacer().catch(() => {});
      return {
        ok: false as const,
        motivo: `No se pudo enviar: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    await ctx.runMutation(internal.users.setClaveTemporal, {
      userId: info.userId,
      valor: true,
    });

    return {
      ok: true as const,
      nombre: info.nombre,
      email: info.email,
      condominio: condo?.nombre ?? null,
      teniaClave: !!credencial,
      loginUrl,
    };
  },
});

/**
 * Genera y fija una clave temporal, y la DEVUELVE para que la entregue quien
 * llama (hoy: el bot de WhatsApp, dentro de la ventana de 24 h).
 *
 * Meta no aprueba plantillas con contraseñas, pero cuando el residente escribe
 * primero se abre la ventana de sesión y ahí sí se puede responder texto libre.
 * Es la vía que no depende del correo ni de la verificación de la WABA.
 */
export const generarClaveParaEntrega = internalAction({
  args: {
    userId: v.id("users"),
    /**
     * Rotar la contraseña de quien YA tiene la suya lo deja fuera sin
     * necesidad. Sin `forzar`, a esa gente no se le toca nada: se le avisa y
     * se le ofrece el restablecimiento por correo.
     */
    forzar: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { ok: false; motivo: string }
    | { ok: false; yaTieneClavePropia: true; email: string }
    | { ok: true; email: string; password: string; enlace: string }
  > => {
    const perfil: {
      email: string;
      nombre: string;
      activo: boolean;
      yaIngreso: boolean;
      claveTemporal: boolean;
    } | null = await ctx.runQuery(internal.credenciales.perfilParaClave, {
      userId: args.userId,
    });
    if (!perfil) return { ok: false as const, motivo: "Usuario no encontrado." };
    if (!perfil.activo) return { ok: false as const, motivo: "Usuario inactivo." };

    /* Si YA logró entrar alguna vez, no se le toca la contraseña: la que
     * tiene le funciona. Rotársela "por si acaso" es justo lo que lo dejaría
     * fuera. Solo se rota a quien nunca ha podido entrar, o a quien lo pide
     * expresamente (forzar). Esto es lo que hace que el aviso de "si ya
     * entraste, ignora este mensaje" sea cierto y no una trampa. */
    if (perfil.yaIngreso && !args.forzar) {
      return {
        ok: false as const,
        yaTieneClavePropia: true as const,
        email: perfil.email,
      };
    }

    const authCtx = await createAuth(ctx).$context;
    const ia: any = authCtx.internalAdapter;

    const password = generarPasswordTemporal();
    const hashed = await authCtx.password.hash(password);

    const encontrado = await ia.findUserByEmail(perfil.email);
    if (!encontrado) {
      const creado = await ia.createUser({
        email: perfil.email,
        name: perfil.nombre,
        emailVerified: false,
      });
      await ia.createAccount({
        userId: creado.id,
        providerId: "credential",
        accountId: creado.id,
        password: hashed,
      });
    } else {
      const cuentas = await ia.findAccounts(encontrado.user.id);
      const credencial = cuentas.find((a: any) => a.providerId === "credential");
      if (!credencial) {
        await ia.createAccount({
          userId: encontrado.user.id,
          providerId: "credential",
          accountId: encontrado.user.id,
          password: hashed,
        });
      } else {
        await ia.updatePassword(encontrado.user.id, hashed);
      }
    }

    await ctx.runMutation(internal.users.setClaveTemporal, {
      userId: args.userId,
      valor: true,
    });

    const token: string = await ctx.runMutation(
      internal.credenciales.crearAccesoRapido,
      { userId: args.userId, email: perfil.email, password },
    );
    const base = (process.env.WEB_APP_URL ?? "https://www.vekino.com").replace(
      /\/+$/,
      "",
    );

    return {
      ok: true as const,
      email: perfil.email,
      password,
      enlace: `${base}/entrar?t=${token}`,
    };
  },
});

/** Crea el enlace de un solo uso y devuelve su token. */
export const crearAccesoRapido = internalMutation({
  args: {
    userId: v.id("users"),
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const token = [...bytes]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const now = Date.now();
    await ctx.db.insert("accesosRapidos", {
      token,
      userId: args.userId,
      email: args.email,
      password: args.password,
      // 24 h: la gente no revisa WhatsApp al instante, y un enlace vencido
      // obliga a repetir todo el trámite. Sigue siendo de un solo uso.
      expiraAt: now + 24 * 60 * 60 * 1000,
      createdAt: now,
    });
    return token;
  },
});

/**
 * Canjea el enlace: devuelve las credenciales UNA vez y borra el registro.
 * Lo llama la pantalla /entrar para dejar los campos ya llenos.
 */
export const canjearAcceso = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const fila = await ctx.db
      .query("accesosRapidos")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!fila) return { ok: false as const, motivo: "Este enlace no es válido." };
    if (fila.usadoAt || Date.now() > fila.expiraAt) {
      await ctx.db.delete(fila._id);
      return {
        ok: false as const,
        motivo: "Este enlace ya se usó o venció. Pide uno nuevo por WhatsApp.",
      };
    }

    // Un solo uso: se entrega y se borra.
    await ctx.db.delete(fila._id);
    return { ok: true as const, email: fila.email, password: fila.password };
  },
});

export const perfilParaClave = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    if (!esEmailReal(user.email)) return null;
    return {
      email: user.email,
      nombre: user.name,
      activo: user.active,
      /** Ya inició sesión alguna vez (Better Auth le enlazó el authId). */
      yaIngreso: !!user.authId,
      /** Sigue usando la clave que le generó la administración. */
      claveTemporal: user.claveTemporal === true,
    };
  },
});

/** ¿El job sigue vivo? Cortocircuita el encadenamiento tras una cancelación. */
export const jobVigente = internalQuery({
  args: { jobId: v.id("envioCredencialesJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    return job && job.estado === "en_curso" ? { ok: true as const } : null;
  },
});

/**
 * Los usuarios migrados sin correo real llevan un placeholder; enviarles
 * correo solo genera rebotes que ensucian la reputación del remitente.
 */
function esEmailReal(email: string): boolean {
  const e = email.trim().toLowerCase();
  if (!e || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return false;
  if (e.endsWith(".invalid") || e.endsWith(".local")) return false;
  if (e.includes("@cuenta-eliminada")) return false;
  if (e.includes("sincorreo") || e.includes("noemail")) return false;
  return true;
}

/**
 * Manda por WhatsApp los datos de acceso a UNA persona, buscándola por su
 * teléfono.
 *
 * Existe porque el caso más común de soporte es "no puedo entrar" escrito por
 * WhatsApp, y hasta ahora la única salida manual era el correo — que es justo
 * el canal que esa persona no está mirando.
 *
 * Va como texto libre, no como plantilla: Meta rechaza toda plantilla que
 * mencione contraseñas, pero dentro de las 24 h posteriores al último mensaje
 * de la persona sí se puede escribir libremente. Si esa ventana está cerrada,
 * WhatsApp lo rechaza y aquí se devuelve el motivo en vez de fingir que salió.
 */
export const enviarAccesoPorWhatsapp = internalAction({
  args: {
    /** Uno de los dos. `conversacionId` cubre a quien usa @usuario de Meta y
     *  no comparte número: ahí no hay teléfono al que apuntar. */
    telefono: v.optional(v.string()),
    conversacionId: v.optional(v.id("waConversations")),
    /** true rota la contraseña aunque la persona ya tuviera una propia. */
    forzar: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { ok: false; motivo: string }
    | { ok: true; nombre: string; email: string; telefono: string }
  > => {
    const telefono = args.telefono
      ? normalizarTelefonoE164(args.telefono)
      : null;
    if (args.telefono && !telefono) {
      return { ok: false as const, motivo: "Teléfono no válido." };
    }
    if (!telefono && !args.conversacionId) {
      return { ok: false as const, motivo: "Falta el teléfono o la conversación." };
    }

    const destino: {
      userId: Id<"users">;
      nombre: string;
      conversacionId: Id<"waConversations"> | null;
      /** A dónde escribirle: teléfono E.164 o BSUID de Meta. */
      para: string;
    } | null = await ctx.runQuery(internal.credenciales.destinoDeAcceso, {
      telefono: telefono ?? undefined,
      conversacionId: args.conversacionId,
    });
    if (!destino) {
      return {
        ok: false as const,
        motivo: "No encontré a esa persona, o su cuenta no está activa.",
      };
    }

    const r = await ctx.runAction(internal.credenciales.generarClaveParaEntrega, {
      userId: destino.userId,
      forzar: args.forzar === true,
    });
    if (!r.ok) {
      return {
        ok: false as const,
        motivo: r.yaTieneClavePropia
          ? "Ya tiene contraseña propia; usa forzar si de verdad quieres cambiársela."
          : (r.motivo ?? "No se pudo generar la clave."),
      };
    }
    if (!r.email || !r.password || !r.enlace) {
      return { ok: false as const, motivo: "Faltaron datos para armar el mensaje." };
    }

    const texto = textoAccesoWhatsApp({
      email: r.email,
      password: r.password,
      enlace: r.enlace,
    });

    try {
      const res = await enviarMensaje(msgTexto(destino.para, texto));
      // Queda en la bandeja: si no, el equipo no sabe qué se le mandó.
      if (destino.conversacionId) {
        await ctx.runMutation(internal.whatsappInbox.registrarSalienteDeAgente, {
          conversacionId: destino.conversacionId,
          tipo: "text",
          contenido: texto,
          ycloudMessageId: res.id,
          agenteNombre: "Soporte",
        });
      }
      return {
        ok: true as const,
        nombre: destino.nombre,
        email: r.email,
        telefono: destino.para,
      };
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      if (destino.conversacionId) {
        await ctx.runMutation(internal.whatsappInbox.registrarSalienteDeAgente, {
          conversacionId: destino.conversacionId,
          tipo: "text",
          contenido: texto,
          error: motivo,
          agenteNombre: "Soporte",
        });
      }
      return { ok: false as const, motivo };
    }
  },
});

export const destinoDeAcceso = internalQuery({
  args: {
    telefono: v.optional(v.string()),
    conversacionId: v.optional(v.id("waConversations")),
  },
  handler: async (ctx, args) => {
    const conv = args.conversacionId
      ? await ctx.db.get(args.conversacionId)
      : args.telefono
        ? await ctx.db
            .query("waConversations")
            .withIndex("by_telefono", (q) => q.eq("telefono", args.telefono!))
            .first()
        : null;

    const user = conv?.userId
      ? await ctx.db.get(conv.userId)
      : args.telefono
        ? await ctx.db
            .query("users")
            .withIndex("by_telefono", (q) => q.eq("telefonoE164", args.telefono!))
            .first()
        : null;
    if (!user || !user.active) return null;

    /* A quién apuntarle. Si la persona adoptó su @usuario de Meta, el BSUID es
     * su identidad canónica y el teléfono puede haber dejado de entregar; al
     * revés, para el resto el teléfono es lo fiable. */
    const para = conv?.username
      ? (conv.bsuid ?? conv.telefono ?? args.telefono)
      : (conv?.telefono ?? args.telefono ?? conv?.bsuid);
    if (!para) return null;

    return {
      userId: user._id,
      nombre: user.name,
      conversacionId: conv?._id ?? null,
      para,
    };
  },
});
