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

  test("retener exige el motivo", async () => {
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
      }),
    ).rejects.toThrow(/motivo/);

    await como(t, "admin").mutation(api.reservas.resolverDeposito, {
      depositoId: depositoId!,
      devuelto: false,
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
