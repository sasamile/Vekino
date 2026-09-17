import { test, expect, describe } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

const modules = import.meta.glob("../convex/**/*.ts");

/**
 * LA CONSULTA DE LA AUDITORÍA DE DEPÓSITOS.
 *
 * Aquí se prueba lo que solo se puede probar con las mutaciones de verdad:
 * que el rol y la ventanilla se SELLEN al recibir y al devolver —no al
 * leer—, que el rango de fechas signifique lo que dice, y que un conjunto no
 * pueda ver los depósitos de otro. El filtrado y el Excel son de
 * `auditoriaDepositos.prueba.ts`.
 */

const AHORA = Date.now();
const DEPOSITO = 60000;
const DIA = 86_400_000;

type T = ReturnType<typeof convexTest>;
const como = (t: T, subject: string) => t.withIdentity({ subject });

/** El día civil de Bogotá de un instante: el mismo corte que usa la consulta. */
const dia = (ms: number) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));

const HOY = dia(AHORA);

async function conjunto(t: T, nombre: string, sufijo: string) {
  return await t.run(async (ctx) => {
    const condominioId = await ctx.db.insert("condominios", {
      name: nombre,
      activeModules: [],
      isActive: true,
      createdAt: AHORA,
      updatedAt: AHORA,
    });

    const persona = async (name: string, authId: string, roles: string[]) => {
      const userId = await ctx.db.insert("users", {
        name,
        email: `${authId}@vekino.test`,
        emailVerified: true,
        active: true,
        authId,
        createdAt: AHORA,
        updatedAt: AHORA,
      });
      await ctx.db.insert("memberships", {
        userId,
        condominioId,
        roles: roles as never,
        isActive: true,
        createdAt: AHORA,
        updatedAt: AHORA,
      });
      return userId;
    };

    await persona(`Marta Admin ${sufijo}`, `admin${sufijo}`, ["administrador"]);
    await persona(`Pedro Guarda ${sufijo}`, `guarda${sufijo}`, ["guardia"]);
    await persona(`Rita Residente ${sufijo}`, `residente${sufijo}`, ["residente", "propietario"]);

    const unidadId = await ctx.db.insert("unidades", {
      condominioId,
      tipo: "casa",
      estado: "ocupada",
      numero: "409",
      createdAt: AHORA,
      updatedAt: AHORA,
    });
    const zonaId = await ctx.db.insert("zonasComunes", {
      condominioId,
      nombre: "Salón primer piso",
      unidadTiempo: "dia",
      precioPorDia: 260000,
      depositoRequerido: DEPOSITO,
      activa: true,
      createdAt: AHORA,
      updatedAt: AHORA,
    });
    return { condominioId, unidadId, zonaId, sufijo };
  });
}

type Conjunto = Awaited<ReturnType<typeof conjunto>>;

/** Reserva aprobada con el depósito ya recibido en portería. */
async function conDeposito(t: T, c: Conjunto, fecha = "2026-09-16", solicitante?: string) {
  const reservaId = await como(t, `admin${c.sufijo}`).mutation(api.reservas.create, {
    condominioId: c.condominioId,
    unidadId: c.unidadId,
    zonaId: c.zonaId,
    fecha,
    horaInicio: "10:00",
    horaFin: "12:00",
  });
  await como(t, `admin${c.sufijo}`).mutation(api.reservas.updateEstado, {
    id: reservaId,
    estado: "aprobada",
  });
  if (solicitante) {
    await t.run(async (ctx) => await ctx.db.patch(reservaId, { solicitanteNombre: solicitante }));
  }
  await como(t, `guarda${c.sufijo}`).mutation(api.guardia.registrarDepositoReserva, {
    reservaId,
    monto: DEPOSITO,
    observaciones: "En efectivo",
  });
  const depositoId = await t.run(async (ctx) => {
    const dep = await ctx.db
      .query("guardiaReservaDepositos")
      .withIndex("by_reserva", (q) => q.eq("reservaId", reservaId))
      .first();
    return dep!._id;
  });
  return { reservaId, depositoId };
}

const auditar = (
  t: T,
  c: Conjunto,
  args: { desde?: string; hasta?: string; criterio?: "recepcion" | "devolucion" | "cualquiera" } = {},
  quien = `admin${c.sufijo}`,
) =>
  como(t, quien).query(api.reservas.auditoriaDepositos, {
    condominioId: c.condominioId,
    desde: args.desde ?? HOY,
    hasta: args.hasta ?? HOY,
    criterio: args.criterio,
  });

describe("auditoría de depósitos", () => {
  test("el depósito en custodia sale con quién lo recibió, su rol y su ventanilla", async () => {
    const t = convexTest(schema, modules);
    const c = await conjunto(t, "Conjunto A", "A");
    const { reservaId } = await conDeposito(t, c);

    const { filas, resumen } = await auditar(t, c);
    expect(filas).toHaveLength(1);
    const f = filas[0]!;
    expect(f.reservaId).toBe(reservaId);
    expect(f.monto).toBe(DEPOSITO);
    expect(f.estado).toBe("registrado");
    expect(f.recibidoPorNombre).toBe("Pedro Guarda A");
    /* Lo que se sella al recibir: el rol de esa persona y por dónde entró. */
    expect(f.recibidoPorRol).toBe("guardia");
    expect(f.recibidoOrigen).toBe("porteria");
    expect(f.observacionesIngreso).toBe("En efectivo");
    /* Todavía no hay devolución: nada que contar, ni cero ni "sin registrar". */
    expect(f.fechaResolucion).toBeNull();
    expect(f.resueltoPorNombre).toBeNull();
    expect(f.resueltoPorRol).toBeNull();
    expect(f.devuelto).toBeNull();
    expect(f.descontado).toBeNull();
    expect(f.enCustodia).toBe(DEPOSITO);
    /* Sin incidentes se devolvería entero. Es previsión, no historia. */
    expect(f.saldoPrevisto).toBe(DEPOSITO);

    expect(resumen.recibido).toBe(DEPOSITO);
    expect(resumen.enCustodia).toBe(DEPOSITO);
    expect(resumen.devuelto).toBe(0);
    expect(resumen.sinRolRegistrado).toBe(0);
  });

  test("la devolución sella su propio responsable, que no tiene por qué ser el mismo", async () => {
    const t = convexTest(schema, modules);
    const c = await conjunto(t, "Conjunto A", "A");
    const { reservaId, depositoId } = await conDeposito(t, c);
    /* Lo recibió el guarda en portería; lo devuelve la administración. */
    await como(t, "adminA").mutation(api.reservas.resolverDeposito, {
      depositoId,
      saldoEsperado: DEPOSITO,
    });

    const f = (await auditar(t, c)).filas[0]!;
    expect(f.reservaId).toBe(reservaId);
    expect(f.estado).toBe("devuelto");
    expect(f.recibidoPorRol).toBe("guardia");
    expect(f.recibidoOrigen).toBe("porteria");
    expect(f.resueltoPorNombre).toBe("Marta Admin A");
    expect(f.resueltoPorRol).toBe("administrador");
    expect(f.resueltoOrigen).toBe("administracion");
    expect(f.devuelto).toBe(DEPOSITO);
    expect(f.descontado).toBe(0);
    expect(f.enCustodia).toBe(0);
    expect(f.saldoPrevisto).toBeNull();
    /* Las cifras quedaron congeladas al entregar, no se deducen del estado. */
    expect(f.cifrasCongeladas).toBe(true);
  });

  test("la devolución parcial trae su motivo, lo descontado y los incidentes", async () => {
    const t = convexTest(schema, modules);
    const c = await conjunto(t, "Conjunto A", "A");
    const { reservaId, depositoId } = await conDeposito(t, c);
    await como(t, "adminA").mutation(api.reservas.registrarIncidente, {
      reservaId,
      descripcion: "Se dañó el mesón",
      valor: 20000,
    });
    await como(t, "guardaA").mutation(api.guardia.reportarIncidenteReserva, {
      reservaId,
      descripcion: "Vidrio rayado",
    });
    await como(t, "adminA").mutation(api.reservas.descartarIncidente, {
      incidenteId: (await t.run(async (ctx) =>
        (await ctx.db
          .query("reservaIncidentes")
          .withIndex("by_reserva", (q) => q.eq("reservaId", reservaId))
          .collect()
        ).find((i) => i.estado === "pendiente")!._id,
      )) as Id<"reservaIncidentes">,
    });
    await como(t, "guardaA").mutation(api.guardia.resolverDepositoReserva, {
      depositoId,
      saldoEsperado: DEPOSITO - 20000,
      observaciones: "Se descontó el mesón",
    });

    const f = (await auditar(t, c)).filas[0]!;
    expect(f.estado).toBe("devuelto_parcial");
    expect(f.motivoDevolucion).toBe("Se descontó el mesón");
    expect(f.devuelto).toBe(DEPOSITO - 20000);
    expect(f.descontado).toBe(20000);
    expect(f.resueltoPorRol).toBe("guardia");
    expect(f.resueltoOrigen).toBe("porteria");
    /* El valor cuenta solo lo valorado; la descripción, todo lo que pasó. */
    expect(f.valorIncidentes).toBe(20000);
    expect(f.descripcionIncidentes).toBe("Se dañó el mesón · Vidrio rayado");
    expect(f.incidentes).toBe(2);

    const { resumen } = await auditar(t, c);
    expect(resumen.descontado).toBe(20000);
    expect(resumen.devuelto).toBe(DEPOSITO - 20000);
    expect(resumen.conIncidentes).toBe(1);
  });

  test("un depósito anterior al sello dice que no sabe, no inventa el rol de hoy", async () => {
    const t = convexTest(schema, modules);
    const c = await conjunto(t, "Conjunto A", "A");
    const { reservaId } = await conDeposito(t, c);
    /* Una fila como las que ya existían: sin rol, sin ventanilla y sin las
       cifras de la liquidación, que se deducen del estado. */
    await t.run(async (ctx) => {
      const dep = await ctx.db
        .query("guardiaReservaDepositos")
        .withIndex("by_reserva", (q) => q.eq("reservaId", reservaId))
        .first();
      await ctx.db.patch(dep!._id, {
        estado: "devuelto",
        recibidoPorRol: undefined,
        recibidoOrigen: undefined,
        resueltoPorNombre: "Quien fuera",
        resueltoPorRol: undefined,
        resueltoOrigen: undefined,
        fechaResolucion: AHORA,
        montoDevuelto: undefined,
        montoDescontado: undefined,
      });
    });

    const { filas, resumen } = await auditar(t, c);
    const f = filas[0]!;
    expect(f.recibidoPorNombre).toBe("Pedro Guarda A");
    expect(f.recibidoPorRol).toBeNull();
    expect(f.recibidoOrigen).toBeNull();
    expect(f.resueltoPorRol).toBeNull();
    /* "devuelto" sin cifras se lee como siempre se leyó: se devolvió todo. */
    expect(f.devuelto).toBe(DEPOSITO);
    expect(f.descontado).toBe(0);
    expect(f.cifrasCongeladas).toBe(false);
    expect(resumen.sinRolRegistrado).toBe(1);
  });

  test("el criterio dice qué fecha tiene que caer en el rango", async () => {
    const t = convexTest(schema, modules);
    const c = await conjunto(t, "Conjunto A", "A");
    /* Recibido hace dos meses y devuelto hoy: el caso que distingue los
       criterios. El de agosto se queda fuera de los tres cuando se pregunta
       por hoy y sigue sin devolverse. */
    const viejo = await conDeposito(t, c, "2026-07-10");
    const haceDosMeses = AHORA - 60 * DIA;
    await t.run(async (ctx) => {
      await ctx.db.patch(viejo.depositoId, { fechaRegistro: haceDosMeses });
    });
    await como(t, "adminA").mutation(api.reservas.resolverDeposito, {
      depositoId: viejo.depositoId,
      saldoEsperado: DEPOSITO,
    });
    const reciente = await conDeposito(t, c, "2026-09-16");

    const ids = async (criterio: "recepcion" | "devolucion" | "cualquiera") =>
      (await auditar(t, c, { criterio })).filas.map((f) => f._id);

    /* Hoy solo se recibió el reciente. */
    expect(await ids("recepcion")).toEqual([reciente.depositoId]);
    /* Hoy solo se devolvió el viejo, recibido dos meses antes del rango. */
    expect(await ids("devolucion")).toEqual([viejo.depositoId]);
    /* Y "cualquiera" trae los dos, el más reciente primero. */
    expect(await ids("cualquiera")).toEqual([reciente.depositoId, viejo.depositoId]);
    /* Sin criterio, "cualquiera". */
    expect((await auditar(t, c)).filas).toHaveLength(2);

    /* Un rango que no toca ninguna de las dos fechas no trae nada. */
    const ayer = dia(AHORA - DIA);
    expect((await auditar(t, c, { desde: ayer, hasta: ayer })).filas).toEqual([]);
  });

  test("el rango se rechaza al revés en vez de devolver vacío", async () => {
    const t = convexTest(schema, modules);
    const c = await conjunto(t, "Conjunto A", "A");
    await expect(
      auditar(t, c, { desde: "2026-09-30", hasta: "2026-09-01" }),
    ).rejects.toThrow(/no puede ser posterior/i);
  });

  test("cada conjunto ve solo sus depósitos, y nadie los del vecino", async () => {
    const t = convexTest(schema, modules);
    const a = await conjunto(t, "Conjunto A", "A");
    const b = await conjunto(t, "Conjunto B", "B");
    await conDeposito(t, a, "2026-09-16", "Solicitante de A");
    await conDeposito(t, b, "2026-09-16", "Solicitante de B");

    const deA = await auditar(t, a);
    expect(deA.filas.map((f) => f.solicitanteNombre)).toEqual(["Solicitante de A"]);
    const deB = await auditar(t, b);
    expect(deB.filas.map((f) => f.solicitanteNombre)).toEqual(["Solicitante de B"]);

    /* Y el administrador de A no puede preguntar por B cambiando el
       parámetro: no ve menos, ve un error. */
    await expect(auditar(t, b, {}, "adminA")).rejects.toThrow(/no pertenece/i);
  });

  test("solo la administración audita: ni el residente ni el guarda", async () => {
    const t = convexTest(schema, modules);
    const c = await conjunto(t, "Conjunto A", "A");
    await conDeposito(t, c);

    await expect(auditar(t, c, {}, "residenteA")).rejects.toThrow(/rol requerido/i);
    /* El guarda opera el depósito pero no audita la caja del conjunto: es el
       mismo corte que el reporte de reservas. */
    await expect(auditar(t, c, {}, "guardaA")).rejects.toThrow(/rol requerido/i);
    await expect(
      t.query(api.reservas.auditoriaDepositos, {
        condominioId: c.condominioId,
        desde: HOY,
        hasta: HOY,
      }),
    ).rejects.toThrow();
  });

  test("una reserva sin depósito no aparece: no hay nada que auditar", async () => {
    const t = convexTest(schema, modules);
    const c = await conjunto(t, "Conjunto A", "A");
    await como(t, "adminA").mutation(api.reservas.create, {
      condominioId: c.condominioId,
      unidadId: c.unidadId,
      zonaId: c.zonaId,
      fecha: "2026-09-16",
      horaInicio: "14:00",
      horaFin: "16:00",
    });
    expect((await auditar(t, c)).filas).toEqual([]);
    expect((await auditar(t, c)).resumen.total).toBe(0);
  });
});
