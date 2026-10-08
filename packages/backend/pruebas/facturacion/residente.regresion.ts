import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import {
  AHORA,
  DIA,
  aprobarPagoAval,
  bloquearRed,
  bogota,
  cargar,
  facturaDe,
  facturasDe,
  fijarReloj,
  liberarRed,
  linea,
  montar,
  soltarReloj,
  type Escenario,
  type FacturaCarga,
} from "./escenario";

/**
 * RED DE SEGURIDAD DE FACTURACIÓN — LO QUE VE Y PAGA EL RESIDENTE (Fase 0).
 *
 * La regla de deuda de Vekino está en `lib/cartera.ts` (`carteraDeUnidad`):
 * la deuda es la ÚLTIMA factura de la cadena, porque absorbe a las anteriores,
 * y la mora la decide el último período ya vencido. Estas pruebas comparan
 * contra esa regla lo que el backend le entrega al residente: el contador de
 * vencidas (`portal.navBadges`), la factura que el bot de WhatsApp ofrece pagar
 * (`soportesPago.facturaVigenteDeUnidad`) y su lista (`facturas.listMia`).
 *
 * La vista web (inicio y "Mis facturas") se prueba aparte, montando las
 * páginas reales: apps/web/pruebas/facturacion/resumenResidente.test.mjs.
 */

beforeEach(() => {
  bloquearRed();
  fijarReloj();
});
afterEach(() => {
  soltarReloj();
  liberarRed();
});

/**
 * La cadena real de la casa del PQRS m179ddw0… (Arboleda, "me encuentro al
 * día"), anonimizada: solo montos y períodos. Cargada mes a mes por
 * `bulkUpsert`, reproduce los estados que tiene hoy en producción.
 */
const CADENA_PQRS: FacturaCarga[] = [
  { periodo: "2026-04", lineas: [linea("ADMINISTRACION", 0, 385_000)] },
  { periodo: "2026-05", lineas: [linea("ADMINISTRACION", 385_000, 295_040)] },
  { periodo: "2026-06", lineas: [linea("ADMINISTRACION", 0, 15_760)] },
  { periodo: "2026-07", lineas: [linea("ADMINISTRACION", 289_000, 295_156)] },
  { periodo: "2026-08", lineas: [linea("ADMINISTRACION", 0, 289_000)] },
  { periodo: "2026-09", lineas: [linea("ADMINISTRACION", 0, 289_000)] },
];

async function casaDelPqrs() {
  const esc = await montar();
  for (const f of CADENA_PQRS) await cargar(esc, [f]);
  return esc;
}

async function badges(esc: Escenario) {
  return await esc
    .como("residente")
    .query(api.portal.navBadges, { condominioId: esc.condominioId });
}

async function cartera(esc: Escenario) {
  const [fila] = await esc.como("admin").query(api.facturas.carteraPorUnidad, {
    condominioId: esc.condominioId,
    unidadIds: [esc.u101],
  });
  return fila!;
}

describe("F03 · el estado del residente frente a la cartera (caso real del PQRS)", () => {
  test("F03-control · la carga reproduce los estados de producción: abril y junio 'vencida', mayo/julio/agosto 'pagada', septiembre 'pendiente'", async () => {
    const esc = await casaDelPqrs();
    const cadena = await facturasDe(esc);
    expect(cadena.map((f) => [f.periodo, f.estado])).toEqual([
      ["2026-04", "vencida"],
      ["2026-05", "pagada"],
      ["2026-06", "vencida"],
      ["2026-07", "pagada"],
      ["2026-08", "pagada"],
      ["2026-09", "pendiente"],
    ]);
  });

  test("F03-control · la cartera de la administración la ve 'pendiente', sin mora, debiendo solo septiembre ($289.000)", async () => {
    const esc = await casaDelPqrs();
    const fila = await cartera(esc);
    expect(fila.estado).toBe("pendiente");
    expect(fila.diasMora).toBe(0);
    expect(fila.saldoActual).toBe(289_000);
  });

  test("F03-navBadges-historial · el contador de vencidas no cuenta abril y junio, ya saldadas", async () => {
    const esc = await casaDelPqrs();
    // Hoy la barra lateral web no pinta este número (portal-sidebar.tsx), pero
    // el dato que entrega el backend es el que contradice a la cartera.
    expect((await badges(esc)).facturasVencidas).toBe(0);
  });

  test("F03-navBadges-mora-actual · si la factura vigente ya venció, el contador sí la cuenta", async () => {
    const esc = await montar();
    await cargar(esc, [{ periodo: "2026-08", lineas: [linea("ADMINISTRACION", 0, 289_000)] }]);
    await cargar(esc, [{ periodo: "2026-09", lineas: [linea("ADMINISTRACION", 0, 289_000)] }]);
    // 20 de octubre: septiembre venció el 15 y sigue sin pagar.
    vi.setSystemTime(bogota("2026-10-20T10:00"));
    expect((await cartera(esc)).estado).toBe("en_mora");
    expect((await badges(esc)).facturasVencidas).toBe(1);
  });
});

describe("F01/F12 · la factura que el bot de WhatsApp ofrece pagar", () => {
  async function vigenteSegunBot(esc: Escenario) {
    return await esc.t.query(internal.soportesPago.facturaVigenteDeUnidad, {
      unidadId: esc.u101,
    });
  }

  test("F01-control · con la vigente pendiente, el bot ofrece la vigente", async () => {
    const esc = await montar();
    await cargar(esc, [{ periodo: "2026-08", lineas: [linea("ADMINISTRACION", 0, 300_000)] }]);
    await cargar(esc, [
      { periodo: "2026-09", lineas: [linea("ADMINISTRACION", 300_000, 300_000)] },
    ]);
    const septiembre = await facturaDe(esc, "2026-09");
    expect((await vigenteSegunBot(esc))?._id).toBe(septiembre._id);
  });

  test("F01-bot-ofrece-absorbida · si la vigente ya está pagada, el bot no ofrece pagar la absorbida", async () => {
    const esc = await montar();
    await cargar(esc, [{ periodo: "2026-08", lineas: [linea("ADMINISTRACION", 0, 300_000)] }]);
    await cargar(esc, [
      { periodo: "2026-09", lineas: [linea("ADMINISTRACION", 300_000, 300_000)] },
    ]);
    const septiembre = await facturaDe(esc, "2026-09");
    await aprobarPagoAval(esc, septiembre._id, 600_000);

    const ofrecida = await vigenteSegunBot(esc);
    // Lo correcto es la vigente (que el bot responde "estás al día") o nada;
    // nunca agosto, cuyo saldo ya iba dentro de los $600.000 pagados.
    expect(
      ofrecida === null || ofrecida._id === septiembre._id,
      `el bot ofrece ${ofrecida?.periodo} (${ofrecida?.estado})`,
    ).toBe(true);
  });

  test("F12-bot-elige-por-orden-de-carga · el bot elige la factura por período, no por la última que se subió", async () => {
    const esc = await montar();
    // Agosto y septiembre se suben primero; julio, que faltaba, se sube tarde.
    await cargar(esc, [
      { periodo: "2026-08", lineas: [linea("ADMINISTRACION", 300_000, 300_000)] },
    ]);
    await cargar(esc, [
      { periodo: "2026-09", lineas: [linea("ADMINISTRACION", 600_000, 300_000)] },
    ]);
    await cargar(esc, [{ periodo: "2026-07", lineas: [linea("ADMINISTRACION", 0, 300_000)] }]);

    const septiembre = await facturaDe(esc, "2026-09");
    const ofrecida = await vigenteSegunBot(esc);
    expect(ofrecida?.periodo, "el bot ofrece una factura que no es la vigente").toBe(
      septiembre.periodo,
    );
  });
});

describe("F16 · la lista de facturas del residente (listMia)", () => {
  async function conAgostoYSeptiembre() {
    const esc = await montar();
    await cargar(esc, [{ periodo: "2026-08", lineas: [linea("ADMINISTRACION", 0, 300_000)] }]);
    await cargar(esc, [{ periodo: "2026-09", lineas: [linea("ADMINISTRACION", 0, 300_000)] }]);
    return esc;
  }

  test("F16-control · la propietaria ve sus dos facturas, una vez cada una", async () => {
    const esc = await conAgostoYSeptiembre();
    const lista = await esc
      .como("residente")
      .query(api.facturas.listMia, { condominioId: esc.condominioId });
    expect(lista.map((f) => f.periodo).sort()).toEqual(["2026-08", "2026-09"]);
  });

  test("F16-listMia-duplica · un vínculo repetido a la misma casa no repite las facturas", async () => {
    const esc = await conAgostoYSeptiembre();
    await esc.t.run(async (ctx) => {
      await ctx.db.insert("usuarioUnidad", {
        membershipId: esc.mResidente,
        unidadId: esc.u101,
        condominioId: esc.condominioId,
        vinculo: "propietario",
        esPrincipal: false,
        createdAt: AHORA,
      });
    });
    const lista = await esc
      .como("residente")
      .query(api.facturas.listMia, { condominioId: esc.condominioId });
    expect(lista, "cada factura aparece dos veces").toHaveLength(2);
  });

  test("F16-listMia-vigencia · un arrendatario cuyo contrato venció ya no ve las facturas de la casa", async () => {
    const esc = await conAgostoYSeptiembre();
    await esc.t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Arrendataria anterior",
        email: "inquilina@vekino.test",
        emailVerified: true,
        active: true,
        authId: "inquilina",
        createdAt: AHORA,
        updatedAt: AHORA,
      });
      const membershipId = await ctx.db.insert("memberships", {
        userId,
        condominioId: esc.condominioId,
        roles: ["arrendatario"],
        isActive: true,
        createdAt: AHORA,
        updatedAt: AHORA,
      });
      await ctx.db.insert("usuarioUnidad", {
        membershipId,
        unidadId: esc.u101,
        condominioId: esc.condominioId,
        vinculo: "arrendatario",
        esPrincipal: true,
        vigenciaDesde: AHORA - 200 * DIA,
        vigenciaHasta: AHORA - 30 * DIA,
        createdAt: AHORA - 200 * DIA,
      });
    });
    const lista = await esc.t
      .withIdentity({ subject: "inquilina" })
      .query(api.facturas.listMia, { condominioId: esc.condominioId });
    expect(lista).toHaveLength(0);
  });
});
