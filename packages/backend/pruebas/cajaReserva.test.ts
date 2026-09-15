import { test, expect, describe } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";

const modules = import.meta.glob("../convex/**/*.ts");

/**
 * LA CAJA DE LA RESERVA: cobro, depósito y retención.
 *
 * El reporte acusaba a la casa de no pagar cuando nadie tenía dónde anotar
 * que sí se cobró. Portería registraba el depósito al validar el ingreso;
 * la administración, que cobra en oficina, no podía dejar constancia ni
 * retener por un daño. Aquí se comprueba ese ciclo, sin mezclarlo con la
 * cartera de la cuota.
 */

const AHORA = Date.now();

const como = (t: ReturnType<typeof convexTest>, subject: string) =>
  t.withIdentity({ subject });

async function escenario(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const condominioId = await ctx.db.insert("condominios", {
      name: "Conjunto A",
      activeModules: [],
      isActive: true,
      createdAt: AHORA,
      updatedAt: AHORA,
    });

    const persona = async (name: string, authId: string) =>
      await ctx.db.insert("users", {
        name,
        email: `${authId}@vekino.test`,
        emailVerified: true,
        active: true,
        authId,
        createdAt: AHORA,
        updatedAt: AHORA,
      });

    const admin = await persona("Admin", "admin");
    const residente = await persona("Residente", "residente");

    await ctx.db.insert("memberships", {
      userId: admin,
      condominioId,
      roles: ["administrador"] as never,
      isActive: true,
      createdAt: AHORA,
      updatedAt: AHORA,
    });
    const memResidente = await ctx.db.insert("memberships", {
      userId: residente,
      condominioId,
      roles: ["residente", "propietario"] as never,
      isActive: true,
      createdAt: AHORA,
      updatedAt: AHORA,
    });

    const unidadId = await ctx.db.insert("unidades", {
      condominioId,
      tipo: "casa",
      estado: "ocupada",
      numero: "409",
      createdAt: AHORA,
      updatedAt: AHORA,
    });
    await ctx.db.insert("usuarioUnidad", {
      membershipId: memResidente,
      unidadId,
      condominioId,
      vinculo: "propietario" as never,
      esPrincipal: true,
      createdAt: AHORA,
    });

    const salon = await ctx.db.insert("zonasComunes", {
      condominioId,
      nombre: "Salón primer piso",
      unidadTiempo: "dia",
      precioPorDia: 260000,
      depositoRequerido: 60000,
      horariosPorDia: [0, 1, 2, 3, 4, 5, 6].map((dia) => ({
        dia,
        horaInicio: "06:00",
        horaFin: "23:00",
      })),
      activa: true,
      createdAt: AHORA,
      updatedAt: AHORA,
    });

    return { condominioId, unidadId, salon };
  });
}

async function crearAprobada(t: ReturnType<typeof convexTest>, s: Awaited<ReturnType<typeof escenario>>) {
  const id = await como(t, "admin").mutation(api.reservas.create, {
    condominioId: s.condominioId,
    unidadId: s.unidadId,
    zonaId: s.salon,
    fecha: "2026-09-16",
    horaInicio: "10:00",
    horaFin: "12:00",
  });
  await como(t, "admin").mutation(api.reservas.updateEstado, {
    id,
    estado: "aprobada",
  });
  return id;
}

describe("el alquiler se cobra en oficina", () => {
  test("sin registrar, el reporte no dice que no se recibió", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    await crearAprobada(t, s);

    const reporte = await como(t, "admin").query(api.reservas.reporte, {
      condominioId: s.condominioId,
      desde: "2026-09-01",
      hasta: "2026-09-30",
    });

    expect(reporte.filas[0]?.pagoAlquilerMonto).toBeNull();
    expect(reporte.resumen.alquilerEsperado).toBe(260000);
    expect(reporte.resumen.alquilerRecibido).toBe(0);
    expect(reporte.resumen.alquilerSinRegistrar).toBe(1);
    expect(reporte.resumen.depositoSinRegistrar).toBe(1);
  });

  test("el reporte trae las observaciones que se escribieron al reservar", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    await como(t, "admin").mutation(api.reservas.create, {
      condominioId: s.condominioId,
      unidadId: s.unidadId,
      zonaId: s.salon,
      fecha: "2026-09-18",
      horaInicio: "15:00",
      horaFin: "18:00",
      observaciones: "  Cumpleaños, 30 personas  ",
    });
    await crearAprobada(t, s);

    const reporte = await como(t, "admin").query(api.reservas.reporte, {
      condominioId: s.condominioId,
      desde: "2026-09-01",
      hasta: "2026-09-30",
    });

    // Ordenadas por fecha: la del 16 (sin observaciones) y luego la del 18.
    expect(reporte.filas.map((f) => f.fecha)).toEqual(["2026-09-16", "2026-09-18"]);
    expect(reporte.filas.map((f) => f.observaciones)).toEqual([null, "Cumpleaños, 30 personas"]);
    expect(reporte.resumen.total).toBe(2);
  });

  test("la administración registra el cobro y el reporte lo cuenta", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    const id = await crearAprobada(t, s);

    await como(t, "admin").mutation(api.reservas.registrarPagoAlquiler, {
      id,
      monto: 260000,
      notas: "Transferencia",
    });

    const reserva = await t.run(async (ctx) => await ctx.db.get(id));
    expect(reserva?.pagoAlquilerMonto).toBe(260000);
    expect(reserva?.pagoAlquilerPorNombre).toBe("Admin");
    expect(reserva?.pagoAlquilerNotas).toBe("Transferencia");

    const reporte = await como(t, "admin").query(api.reservas.reporte, {
      condominioId: s.condominioId,
      desde: "2026-09-01",
      hasta: "2026-09-30",
    });
    expect(reporte.resumen.alquilerRecibido).toBe(260000);
    expect(reporte.resumen.alquilerSinRegistrar).toBe(0);
    expect(reporte.filas[0]?.pagoAlquilerMonto).toBe(260000);
  });

  test("se puede corregir el monto cobrado", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    const id = await crearAprobada(t, s);

    await como(t, "admin").mutation(api.reservas.registrarPagoAlquiler, {
      id,
      monto: 260000,
    });
    await como(t, "admin").mutation(api.reservas.registrarPagoAlquiler, {
      id,
      monto: 200000,
      notas: "Descuento acordado",
    });

    const reserva = await t.run(async (ctx) => await ctx.db.get(id));
    expect(reserva?.pagoAlquilerMonto).toBe(200000);
    expect(reserva?.pagoAlquilerNotas).toBe("Descuento acordado");
  });

  test("el residente no puede registrar el cobro", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    const id = await crearAprobada(t, s);

    await expect(
      como(t, "residente").mutation(api.reservas.registrarPagoAlquiler, {
        id,
        monto: 260000,
      }),
    ).rejects.toThrow();
  });

  test("un monto de cero no entra a caja", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    const id = await crearAprobada(t, s);

    await expect(
      como(t, "admin").mutation(api.reservas.registrarPagoAlquiler, {
        id,
        monto: 0,
      }),
    ).rejects.toThrow(/mayor a 0/);
  });
});

describe("el depósito lo registra la administración sin pasar por portería", () => {
  test("registrar no valida el ingreso", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    const id = await crearAprobada(t, s);

    await como(t, "admin").mutation(api.reservas.registrarDeposito, {
      id,
      monto: 60000,
    });

    const reserva = await t.run(async (ctx) => await ctx.db.get(id));
    expect(reserva?.ingresoValidadoAt).toBeUndefined();

    const page = await como(t, "admin").query(api.reservas.listPage, {
      condominioId: s.condominioId,
      paginationOpts: { numItems: 30, cursor: null },
    });
    expect(page.page[0]?.depositoCaja?.monto).toBe(60000);
    expect(page.page[0]?.depositoCaja?.estado).toBe("registrado");
  });

  test("no se registra dos veces", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    const id = await crearAprobada(t, s);

    await como(t, "admin").mutation(api.reservas.registrarDeposito, {
      id,
      monto: 60000,
    });
    await expect(
      como(t, "admin").mutation(api.reservas.registrarDeposito, {
        id,
        monto: 60000,
      }),
    ).rejects.toThrow(/ya tiene un depósito/);
  });

  test("devolver no valida la salida", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    const id = await crearAprobada(t, s);

    await como(t, "admin").mutation(api.reservas.registrarDeposito, {
      id,
      monto: 60000,
    });
    const page = await como(t, "admin").query(api.reservas.listPage, {
      condominioId: s.condominioId,
      paginationOpts: { numItems: 30, cursor: null },
    });
    const depositoId = page.page[0]?.depositoCaja?._id;
    expect(depositoId).toBeTruthy();

    await como(t, "admin").mutation(api.reservas.resolverDeposito, {
      depositoId: depositoId!,
      devuelto: true,
    });

    const reserva = await t.run(async (ctx) => await ctx.db.get(id));
    expect(reserva?.salidaValidadaAt).toBeUndefined();

    const otra = await como(t, "admin").query(api.reservas.listPage, {
      condominioId: s.condominioId,
      paginationOpts: { numItems: 30, cursor: null },
    });
    expect(otra.page[0]?.depositoCaja?.estado).toBe("devuelto");
  });

  /* CAMBIO DE COMPORTAMIENTO: antes la oficina podía "retener" el depósito con
   * solo escribir un motivo. Ahora la retención sale de incidentes valorados
   * (ver `incidentesReserva.test.ts`) y la vía directa se rechaza. */
  test("ya no se retiene a criterio: el descuento sale de un incidente", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    const id = await crearAprobada(t, s);

    await como(t, "admin").mutation(api.reservas.registrarDeposito, {
      id,
      monto: 60000,
    });
    const page = await como(t, "admin").query(api.reservas.listPage, {
      condominioId: s.condominioId,
      paginationOpts: { numItems: 30, cursor: null },
    });
    const depositoId = page.page[0]?.depositoCaja?._id;
    expect(depositoId).toBeTruthy();

    await expect(
      como(t, "admin").mutation(api.reservas.resolverDeposito, {
        depositoId: depositoId!,
        devuelto: false,
        observaciones: "Se dañó el mesón del BBQ",
      }),
    ).rejects.toThrow(/retener/);

    await como(t, "admin").mutation(api.reservas.registrarIncidente, {
      reservaId: id,
      descripcion: "Se dañó el mesón del BBQ",
      valor: 60000,
    });
    await como(t, "admin").mutation(api.reservas.resolverDeposito, {
      depositoId: depositoId!,
      saldoEsperado: 0,
      observaciones: "Se dañó el mesón del BBQ",
    });

    const reporte = await como(t, "admin").query(api.reservas.reporte, {
      condominioId: s.condominioId,
      desde: "2026-09-01",
      hasta: "2026-09-30",
    });
    expect(reporte.filas[0]?.depositoEstado).toBe("no_devuelto");
    expect(reporte.filas[0]?.depositoRetencion).toBe("Se dañó el mesón del BBQ");
    expect(reporte.resumen.depositosRetenidos).toBe(1);
  });
});

describe("el reporte se filtra por estado", () => {
  const RANGO = { desde: "2026-09-01", hasta: "2026-09-30" };

  async function reservar(
    t: ReturnType<typeof convexTest>,
    s: Awaited<ReturnType<typeof escenario>>,
    fecha: string,
  ) {
    return await como(t, "admin").mutation(api.reservas.create, {
      condominioId: s.condominioId,
      unidadId: s.unidadId,
      zonaId: s.salon,
      fecha,
      horaInicio: "15:00",
      horaFin: "18:00",
    });
  }

  test("el filtro deja solo ese estado y el resumen conserva la regla de canceladas y rechazadas", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);

    const aprobada = await crearAprobada(t, s); // 2026-09-16
    await como(t, "admin").mutation(api.reservas.registrarDeposito, { id: aprobada, monto: 60000 });

    /* Una cancelada CON cobro y depósito anotados: es la que prueba que la
     * regla sigue en pie aunque el filtro la deje sola en el reporte. */
    const cancelada = await reservar(t, s, "2026-09-18");
    await como(t, "admin").mutation(api.reservas.registrarPagoAlquiler, { id: cancelada, monto: 260000 });
    await como(t, "admin").mutation(api.reservas.registrarDeposito, { id: cancelada, monto: 60000 });
    await como(t, "admin").mutation(api.reservas.updateEstado, { id: cancelada, estado: "cancelada" });

    await reservar(t, s, "2026-09-20"); // pendiente
    await reservar(t, s, "2026-10-02"); // fuera del rango

    const consultar = (estado?: "pendiente" | "aprobada" | "rechazada" | "cancelada") =>
      como(t, "admin").query(api.reservas.reporte, { condominioId: s.condominioId, ...RANGO, estado });

    // Sin filtro: lo de siempre.
    const todas = await consultar();
    expect(todas.filas.map((f) => f.estado)).toEqual(["aprobada", "cancelada", "pendiente"]);
    expect(todas.resumen.total).toBe(3);
    expect(todas.resumen.alquilerEsperado).toBe(520000);
    expect(todas.resumen.alquilerRecibido).toBe(0);
    expect(todas.resumen.depositoRecibido).toBe(60000);

    const canceladas = await consultar("cancelada");
    expect(canceladas.filas.map((f) => f.estado)).toEqual(["cancelada"]);
    expect(canceladas.filas[0]?.pagoAlquilerMonto).toBe(260000);
    expect(canceladas.filas[0]?.depositoRecibido).toBe(60000);
    expect(canceladas.resumen.total).toBe(1);
    expect(canceladas.resumen.alquilerEsperado).toBe(0);
    expect(canceladas.resumen.alquilerRecibido).toBe(0);
    expect(canceladas.resumen.depositoRecibido).toBe(0);

    const aprobadas = await consultar("aprobada");
    expect(aprobadas.filas.map((f) => f.fecha)).toEqual(["2026-09-16"]);
    expect(aprobadas.resumen.total).toBe(1);
    expect(aprobadas.resumen.alquilerEsperado).toBe(260000);
    expect(aprobadas.resumen.depositoRecibido).toBe(60000);

    const pendientes = await consultar("pendiente");
    expect(pendientes.filas.map((f) => f.fecha)).toEqual(["2026-09-20"]);
    expect(pendientes.resumen.alquilerEsperado).toBe(260000);
    expect(pendientes.resumen.depositoRecibido).toBe(0);

    const rechazadas = await consultar("rechazada");
    expect(rechazadas.filas).toEqual([]);
    expect(rechazadas.resumen.total).toBe(0);
  });

  test("el rango de fechas sigue siendo inclusivo en los dos extremos", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    for (const fecha of ["2026-08-31", "2026-09-01", "2026-09-30", "2026-10-01"]) {
      await reservar(t, s, fecha);
    }
    const reporte = await como(t, "admin").query(api.reservas.reporte, {
      condominioId: s.condominioId,
      ...RANGO,
    });
    expect(reporte.filas.map((f) => f.fecha)).toEqual(["2026-09-01", "2026-09-30"]);
  });

  test("un estado que no existe se rechaza", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    await expect(
      como(t, "admin").query(api.reservas.reporte, {
        condominioId: s.condominioId,
        ...RANGO,
        estado: "archivada" as never,
      }),
    ).rejects.toThrow();
  });
});
