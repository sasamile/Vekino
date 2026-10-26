import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { logMinuta } from "../convex/model/minuta";
import { HORA, T17, montar as montarCompania } from "./helpers/trazabilidad";

const modules = import.meta.glob("../convex/**/*.ts");

/**
 * VARIOS CELADORES, CADA UNO CON SU TURNO.
 *
 * La administración del conjunto dice cuántos turnos puede haber abiertos a la
 * vez (`guardia.configurarVigilancia`). Con 1 —lo de siempre, y lo que tiene
 * todo conjunto que no lo configura— la portería trabaja como hasta ahora: un
 * turno, que es de la portería. Con 2 o más, Yeison y Camilo abren cada uno el
 * suyo, hacen sus rondas a la vez y nada de lo que registra uno cae en el
 * turno o la ronda del otro; si los cupos se llenan, María elige cuál cerrar
 * con el cierre asistido.
 *
 * Todo va por la API pública —la que llaman la web y el móvil— y lo que se
 * rechaza se comprueba también por lo que NO escribió.
 *
 * Sobre la concurrencia: `convex-test` ejecuta las mutaciones de una en una
 * (una sola transacción global), así que las pruebas "a la vez" comprueban que
 * el límite se cumple con cualquier intercalado de mutaciones completas, no el
 * reintento de Convex. Ese lo garantiza que cada comprobación y su escritura
 * vayan en la misma mutación, leyendo el rango entero de turnos abiertos.
 */

const AHORA = Date.now();

type T = ReturnType<typeof convexTest>;
const como = (t: T, subject: string) => t.withIdentity({ subject });

const CHECKLIST = [
  { item: "Radio", obligatorio: true, cantidadEsperada: 1, cantidadEncontrada: 1, estadoOk: true },
];

async function escenario(t: T) {
  return await t.run(async (ctx) => {
    const conjunto = (name: string) =>
      ctx.db.insert("condominios", {
        name,
        activeModules: [],
        isActive: true,
        createdAt: AHORA,
        updatedAt: AHORA,
      });
    const norte = await conjunto("Conjunto Norte");
    const sur = await conjunto("Conjunto Sur");

    const usuario = (name: string, authId: string, extra: Partial<Doc<"users">> = {}) =>
      ctx.db.insert("users", {
        name,
        email: `${authId}@vekino.test`,
        emailVerified: true,
        active: true,
        authId,
        createdAt: AHORA,
        updatedAt: AHORA,
        ...extra,
      });
    const persona = async (
      name: string,
      authId: string,
      condominioId: Id<"condominios">,
      roles: string[],
    ) => {
      const userId = await usuario(name, authId);
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

    return {
      norte,
      sur,
      yeison: await persona("Yeison Guarda", "yeison", norte, ["guardia"]),
      camilo: await persona("Camilo Guarda", "camilo", norte, ["guardia"]),
      maria: await persona("María Guarda", "maria", norte, ["guardia"]),
      pedro: await persona("Pedro Guarda", "pedro", norte, ["guardia"]),
      admin: await persona("Adriana Admin", "admin", norte, ["administrador"]),
      junta: await persona("Julio Junta", "junta", norte, ["junta_directiva"]),
      rita: await persona("Rita Residente", "rita", norte, ["residente"]),
      sergio: await persona("Sergio Sur", "sergio", sur, ["guardia"]),
      sara: await persona("Sara Sur", "sara", sur, ["guardia"]),
      adminSur: await persona("Saúl Admin Sur", "adminsur", sur, ["administrador"]),
      plataforma: await usuario("Plataforma", "super", { platformRole: "superadmin" as const }),
    };
  });
}
type Escenario = Awaited<ReturnType<typeof escenario>>;

const abrir = (t: T, authId: string, condominioId: Id<"condominios">, extra: object = {}) =>
  como(t, authId).mutation(api.guardia.iniciarTurno, {
    condominioId,
    checklist: CHECKLIST,
    ...extra,
  });

/** El cierre simplificado de hoy: basta el turno. */
const cerrar = (t: T, authId: string, turnoId: Id<"guardiaTurnos">) =>
  como(t, authId).mutation(api.guardia.cerrarTurno, { turnoId });

const configurar = (t: T, authId: string, condominioId: Id<"condominios">, maxTurnosActivos: number) =>
  como(t, authId).mutation(api.guardia.configurarVigilancia, { condominioId, maxTurnosActivos });

const iniciarRonda = (t: T, authId: string, condominioId: Id<"condominios">, zona = "Perímetro") =>
  como(t, authId).mutation(api.rondas.iniciar, { condominioId, zona });

const anotar = (t: T, authId: string, condominioId: Id<"condominios">, resumen: string) =>
  como(t, authId).mutation(api.guardia.registrarEventoMinuta, { condominioId, tipo: "Anotación", resumen });

const reportar = (t: T, authId: string, condominioId: Id<"condominios">, titulo: string) =>
  como(t, authId).mutation(api.guardia.reportarNovedad, {
    condominioId,
    titulo,
    descripcion: `${titulo}, reportado en la prueba.`,
    prioridad: "baja",
  });

const leer = <D extends "guardiaTurnos" | "guardiaRondas" | "condominios">(t: T, id: Id<D>) =>
  t.run(async (ctx) => (await ctx.db.get(id))!) as Promise<Doc<D>>;

const abiertosEn = (t: T, condominioId: Id<"condominios">) =>
  t.run((ctx) =>
    ctx.db
      .query("guardiaTurnos")
      .withIndex("by_condominio_estado", (q) => q.eq("condominioId", condominioId).eq("estado", "abierto"))
      .collect(),
  );

const minutaDe = (t: T, condominioId: Id<"condominios">) =>
  t.run((ctx) =>
    ctx.db
      .query("minutaEventos")
      .withIndex("by_condominio", (q) => q.eq("condominioId", condominioId))
      .collect(),
  );

const rondasDe = (t: T, condominioId: Id<"condominios">) =>
  t.run((ctx) =>
    ctx.db
      .query("guardiaRondas")
      .withIndex("by_condominio", (q) => q.eq("condominioId", condominioId))
      .collect(),
  );

const novedadesDe = (t: T, condominioId: Id<"condominios">) =>
  t.run((ctx) =>
    ctx.db
      .query("guardiaNovedadReportes")
      .withIndex("by_condominio", (q) => q.eq("condominioId", condominioId))
      .collect(),
  );

/** El mensaje con el que se rechazó la llamada. */
async function rechazo(llamada: Promise<unknown>): Promise<string> {
  try {
    await llamada;
  } catch (err) {
    return (err as Error).message;
  }
  throw new Error("La llamada no se rechazó.");
}

/** Lo que escribió una mutación rechazada: nada. */
async function sinEscribir(
  t: T,
  condominioId: Id<"condominios">,
  llamada: () => Promise<unknown>,
  error: RegExp | string,
) {
  const antes = {
    turnos: await t.run((ctx) => ctx.db.query("guardiaTurnos").collect()),
    rondas: await rondasDe(t, condominioId),
    minuta: await minutaDe(t, condominioId),
    condominio: await leer(t, condominioId),
  };
  await expect(llamada()).rejects.toThrow(error);
  expect(await t.run((ctx) => ctx.db.query("guardiaTurnos").collect())).toEqual(antes.turnos);
  expect(await rondasDe(t, condominioId)).toEqual(antes.rondas);
  expect(await minutaDe(t, condominioId)).toEqual(antes.minuta);
  expect(await leer(t, condominioId)).toEqual(antes.condominio);
}

let t: T;
let e: Escenario;
beforeEach(async () => {
  t = convexTest(schema, modules);
  e = await escenario(t);
});

// ─────────────────────────────────────────────────────────────

describe("1 · capacidad 1 (sin configurar): la portería de siempre", () => {
  test("un segundo celador no abre, y el rechazo no nombra a nadie", async () => {
    await abrir(t, "yeison", e.norte);
    const intento = abrir(t, "camilo", e.norte);
    await expect(intento).rejects.toThrow(
      "No hay cupos disponibles: ya hay un turno abierto en esta portería. Debe cerrarse antes de iniciar otro.",
    );
    expect(await rechazo(abrir(t, "camilo", e.norte))).not.toMatch(/Yeison/);
    expect(await abiertosEn(t, e.norte)).toHaveLength(1);
    // Sin configurar no se escribió nada en el conjunto.
    expect((await leer(t, e.norte)).vigilancia).toBeUndefined();
  });

  test("quien no tiene turno trabaja bajo el de la portería, como siempre", async () => {
    const turnoId = await abrir(t, "yeison", e.norte);
    await anotar(t, "camilo", e.norte, "Anotación de Camilo.");
    await reportar(t, "camilo", e.norte, "Luz dañada");
    // Y lo que haga un residente, también al turno abierto.
    await t.run((ctx) =>
      logMinuta(ctx, {
        condominioId: e.norte,
        modulo: "visitantes",
        tipo: "Autorización",
        unidad: "101",
        resumen: "Rita autorizó una visita.",
        actorUserId: e.rita,
        actorNombre: "Rita Residente",
      }),
    );
    const minuta = await minutaDe(t, e.norte);
    expect(minuta.find((m) => m.actorUserId === e.camilo && m.tipo === "Anotación")!.turnoId).toBe(turnoId);
    expect(minuta.find((m) => m.actorUserId === e.rita)!.turnoId).toBe(turnoId);
    expect((await novedadesDe(t, e.norte))[0]!.turnoId).toBe(turnoId);
  });

  test("una ronda en curso por conjunto, que cualquiera de la portería ve y finaliza", async () => {
    await abrir(t, "yeison", e.norte);
    const { rondaId } = await iniciarRonda(t, "yeison", e.norte);
    await expect(iniciarRonda(t, "camilo", e.norte)).rejects.toThrow(/Ya hay una ronda en curso \(Perímetro\)/);
    expect((await como(t, "camilo").query(api.rondas.activa, { condominioId: e.norte }))!._id).toBe(rondaId);
    // Y lo que reporta Camilo queda en esa ronda, como hasta ahora.
    await reportar(t, "camilo", e.norte, "Puerta abierta");
    expect((await novedadesDe(t, e.norte))[0]!.rondaId).toBe(rondaId);
    await como(t, "camilo").mutation(api.rondas.finalizar, { rondaId });
    expect((await leer(t, rondaId)).estado).toBe("finalizada");
  });

  test("turnoActivo y turnosActivos le muestran a Camilo el turno de la portería", async () => {
    const turnoId = await abrir(t, "yeison", e.norte);
    const activo = await como(t, "camilo").query(api.guardia.turnoActivo, { condominioId: e.norte });
    expect(activo!._id).toBe(turnoId);
    expect(activo!.checklist).toHaveLength(1);
    expect(activo!.cierraComo).toBe("companero");

    const porteria = await como(t, "camilo").query(api.guardia.turnosActivos, { condominioId: e.norte });
    expect(porteria).toMatchObject({ capacidad: 1, independientes: false, ocupados: 1, libres: 0, otros: [] });
    expect(porteria.turno!._id).toBe(turnoId);
    expect(porteria.turno!.cierraComo).toBe("companero");
  });

  test("el cierre asistido de siempre libera el cupo", async () => {
    const turnoId = await abrir(t, "yeison", e.norte);
    await como(t, "camilo").mutation(api.guardia.cerrarTurnoDeCompanero, { turnoId, condominioId: e.norte });
    expect((await leer(t, turnoId)).estado).toBe("cerrado");
    await abrir(t, "camilo", e.norte);
    expect(await abiertosEn(t, e.norte)).toHaveLength(1);
  });

  test("el turno compartido sigue funcionando: el compañero vinculado opera y lo cierra", async () => {
    const turnoId = await abrir(t, "yeison", e.norte, { guardiaSecundarioUserId: e.pedro });
    await anotar(t, "pedro", e.norte, "Anotación de Pedro.");
    const evento = (await minutaDe(t, e.norte)).find((m) => m.actorUserId === e.pedro)!;
    expect(evento.turnoId).toBe(turnoId);
    expect((await como(t, "pedro").query(api.guardia.turnoActivo, { condominioId: e.norte }))!.cierraComo).toBe(
      "propio",
    );
    await cerrar(t, "pedro", turnoId);
    expect((await leer(t, turnoId)).cerradoPorUserId).toBe(e.pedro);
  });
});

// ─────────────────────────────────────────────────────────────

describe("2-4 · capacidad 2: cada celador con su turno", () => {
  beforeEach(async () => {
    await configurar(t, "admin", e.norte, 2);
  });

  test("Yeison y Camilo abren cada uno el suyo; María no, y el rechazo no nombra a nadie", async () => {
    const deYeison = await abrir(t, "yeison", e.norte);
    const deCamilo = await abrir(t, "camilo", e.norte);
    expect(deYeison).not.toBe(deCamilo);
    expect((await leer(t, deYeison)).guardiaUserId).toBe(e.yeison);
    expect((await leer(t, deCamilo)).guardiaUserId).toBe(e.camilo);

    await sinEscribir(
      t,
      e.norte,
      () => abrir(t, "maria", e.norte),
      /^No hay cupos disponibles: los 2 turnos de esta portería están ocupados\. Debe cerrarse uno antes de iniciar otro\.$/,
    );
    expect(await rechazo(abrir(t, "maria", e.norte))).not.toMatch(/Yeison|Camilo/);
    expect(await abiertosEn(t, e.norte)).toHaveLength(2);
  });

  test("al cerrar un turno se libera su cupo y el otro sigue abierto", async () => {
    const deYeison = await abrir(t, "yeison", e.norte);
    const deCamilo = await abrir(t, "camilo", e.norte);
    await cerrar(t, "camilo", deCamilo);
    expect((await leer(t, deCamilo)).estado).toBe("cerrado");
    expect((await leer(t, deYeison)).estado).toBe("abierto");
    expect((await leer(t, deYeison)).cerradoPorUserId).toBeUndefined();
    await abrir(t, "maria", e.norte);
    expect((await abiertosEn(t, e.norte)).map((x) => x.guardiaUserId).sort()).toEqual([e.maria, e.yeison].sort());
  });

  test("nadie está en dos turnos abiertos de la misma portería", async () => {
    await abrir(t, "yeison", e.norte);
    await sinEscribir(t, e.norte, () => abrir(t, "yeison", e.norte), /Ya estás en un turno abierto de esta portería/);
    await sinEscribir(
      t,
      e.norte,
      () => abrir(t, "camilo", e.norte, { guardiaSecundarioUserId: e.yeison }),
      /El guardia secundario ya está en un turno abierto/,
    );
  });

  test("un turno compartido ocupa un cupo, y su compañero vinculado trabaja en él", async () => {
    const compartido = await abrir(t, "yeison", e.norte, { guardiaSecundarioUserId: e.pedro });
    const porteria = await como(t, "admin").query(api.guardia.turnosActivos, { condominioId: e.norte });
    expect(porteria).toMatchObject({ ocupados: 1, libres: 1 });

    await anotar(t, "pedro", e.norte, "Anotación de Pedro.");
    expect((await minutaDe(t, e.norte)).find((m) => m.actorUserId === e.pedro)!.turnoId).toBe(compartido);
    await expect(abrir(t, "pedro", e.norte)).rejects.toThrow(/Ya estás en un turno abierto/);

    await abrir(t, "camilo", e.norte);
    await expect(abrir(t, "maria", e.norte)).rejects.toThrow(/No hay cupos disponibles/);
  });

  test("turnoActivo responde lo que una app sin actualizar puede usar", async () => {
    const deYeison = await abrir(t, "yeison", e.norte, { observacionesInicio: "Recibo con la radio floja." });
    // Con cupo, Camilo no ve un turno ajeno: su app le ofrece iniciar el suyo.
    expect(await como(t, "camilo").query(api.guardia.turnoActivo, { condominioId: e.norte })).toBeNull();
    const deCamilo = await abrir(t, "camilo", e.norte);
    expect((await como(t, "camilo").query(api.guardia.turnoActivo, { condominioId: e.norte }))!._id).toBe(deCamilo);
    const propio = (await como(t, "yeison").query(api.guardia.turnoActivo, { condominioId: e.norte }))!;
    expect(propio._id).toBe(deYeison);
    expect(propio.checklist).toHaveLength(1);
    expect(propio.observacionesInicio).toBe("Recibo con la radio floja.");

    // Sin cupo, María ve el más antiguo para poder cerrarlo, sin sus datos.
    const paraMaria = (await como(t, "maria").query(api.guardia.turnoActivo, { condominioId: e.norte }))!;
    expect(paraMaria._id).toBe(deYeison);
    expect(paraMaria.cierraComo).toBe("companero");
    expect(paraMaria.checklist).toEqual([]);
    expect(paraMaria).not.toHaveProperty("observacionesInicio");
  });

  test("turnosActivos: el turno propio entero y de los demás solo lo necesario", async () => {
    const deYeison = await abrir(t, "yeison", e.norte, { guardiaSecundarioNombre: "Luis (sin usuario)" });
    const deCamilo = await abrir(t, "camilo", e.norte);

    const paraMaria = await como(t, "maria").query(api.guardia.turnosActivos, { condominioId: e.norte });
    expect(paraMaria).toMatchObject({ capacidad: 2, independientes: true, ocupados: 2, libres: 0, turno: null });
    expect(paraMaria.otros).toEqual([
      {
        _id: deYeison,
        guardiaNombre: "Yeison Guarda",
        guardiaSecundarioNombre: "Luis (sin usuario)",
        fechaInicio: (await leer(t, deYeison)).fechaInicio,
        cierraComo: "companero",
      },
      {
        _id: deCamilo,
        guardiaNombre: "Camilo Guarda",
        guardiaSecundarioNombre: null,
        fechaInicio: (await leer(t, deCamilo)).fechaInicio,
        cierraComo: "companero",
      },
    ]);

    const paraCamilo = await como(t, "camilo").query(api.guardia.turnosActivos, { condominioId: e.norte });
    expect(paraCamilo.turno!._id).toBe(deCamilo);
    expect(paraCamilo.turno!.cierraComo).toBe("propio");
    expect(paraCamilo.otros.map((o) => o._id)).toEqual([deYeison]);

    // La administración los cierra por la vía de siempre.
    const paraAdmin = await como(t, "admin").query(api.guardia.turnosActivos, { condominioId: e.norte });
    expect(paraAdmin.turno).toBeNull();
    expect(paraAdmin.otros.map((o) => o.cierraComo)).toEqual(["propio", "propio"]);
  });
});

// ─────────────────────────────────────────────────────────────

describe("rondas simultáneas con turnos independientes", () => {
  let deYeison: Id<"guardiaTurnos">;
  let deCamilo: Id<"guardiaTurnos">;
  beforeEach(async () => {
    await configurar(t, "admin", e.norte, 2);
    deYeison = await abrir(t, "yeison", e.norte);
    deCamilo = await abrir(t, "camilo", e.norte);
  });

  test("Camilo inicia la suya con la de Yeison en curso, cada una en su turno", async () => {
    const r1 = await iniciarRonda(t, "yeison", e.norte, "Perímetro");
    const r2 = await iniciarRonda(t, "camilo", e.norte, "Parqueadero");
    expect([r1.numero, r2.numero]).toEqual([1, 2]);
    expect((await leer(t, r1.rondaId)).turnoId).toBe(deYeison);
    expect((await leer(t, r2.rondaId)).turnoId).toBe(deCamilo);
    expect((await leer(t, r2.rondaId)).guardiaUserId).toBe(e.camilo);

    expect((await como(t, "yeison").query(api.rondas.activa, { condominioId: e.norte }))!._id).toBe(r1.rondaId);
    expect((await como(t, "camilo").query(api.rondas.activa, { condominioId: e.norte }))!._id).toBe(r2.rondaId);
    // A quien no tiene turno no se le muestra la de nadie como suya.
    expect(await como(t, "maria").query(api.rondas.activa, { condominioId: e.norte })).toBeNull();
  });

  test("una ronda en curso por celador", async () => {
    await iniciarRonda(t, "yeison", e.norte);
    await sinEscribir(t, e.norte, () => iniciarRonda(t, "yeison", e.norte), /Ya tienes una ronda en curso \(Perímetro\)/);
  });

  test("sin turno propio no hay ronda, ni anotación, ni ronda rápida", async () => {
    await iniciarRonda(t, "yeison", e.norte);
    await sinEscribir(t, e.norte, () => iniciarRonda(t, "maria", e.norte), /Abre el turno antes de iniciar una ronda/);
    await sinEscribir(t, e.norte, () => anotar(t, "maria", e.norte, "No debería quedar."), /Debes iniciar turno/);
    await sinEscribir(
      t,
      e.norte,
      () =>
        como(t, "maria").mutation(api.guardia.registrarRonda, {
          condominioId: e.norte,
          zonaNombre: "Parqueadero",
          fotos: [],
        }),
      /Debes iniciar turno antes de registrar rondas/,
    );
  });

  test("la ronda de un compañero no se finaliza: solo quien la hace o la administración", async () => {
    const r1 = await iniciarRonda(t, "yeison", e.norte);
    const r2 = await iniciarRonda(t, "camilo", e.norte);
    await expect(como(t, "camilo").mutation(api.rondas.finalizar, { rondaId: r1.rondaId })).rejects.toThrow(
      "Solo quien hace la ronda o la administración puede finalizarla.",
    );
    expect((await leer(t, r1.rondaId)).estado).toBe("en_curso");
    await como(t, "camilo").mutation(api.rondas.finalizar, { rondaId: r2.rondaId });
    await como(t, "admin").mutation(api.rondas.finalizar, { rondaId: r1.rondaId });
    expect((await leer(t, r1.rondaId)).estado).toBe("finalizada");
    // El "Fin de ronda" queda en el turno de la ronda, a nombre de quien la cerró.
    const fin = (await minutaDe(t, e.norte)).filter((m) => m.tipo === "Fin de ronda");
    expect(fin.map((m) => [m.turnoId, m.actorUserId])).toEqual([
      [deCamilo, e.camilo],
      [deYeison, e.admin],
    ]);
  });

  test("la ronda rápida dice quién la hizo y cuelga de su turno", async () => {
    await como(t, "camilo").mutation(api.guardia.registrarRonda, {
      condominioId: e.norte,
      zonaNombre: "Parqueadero",
      fotos: [],
    });
    const [ronda] = await rondasDe(t, e.norte);
    expect(ronda).toMatchObject({ turnoId: deCamilo, guardiaUserId: e.camilo, guardiaNombre: "Camilo Guarda" });
    expect(ronda!.estado).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────

describe("trazabilidad: cada registro en el turno y la ronda de quien lo hace", () => {
  let deYeison: Id<"guardiaTurnos">;
  let deCamilo: Id<"guardiaTurnos">;
  let rondaYeison: Id<"guardiaRondas">;
  let rondaCamilo: Id<"guardiaRondas">;
  beforeEach(async () => {
    await configurar(t, "admin", e.norte, 2);
    deYeison = await abrir(t, "yeison", e.norte);
    deCamilo = await abrir(t, "camilo", e.norte);
    rondaYeison = (await iniciarRonda(t, "yeison", e.norte)).rondaId;
    rondaCamilo = (await iniciarRonda(t, "camilo", e.norte, "Parqueadero")).rondaId;
  });

  test("minuta, paquetes y novedades de cada uno caen en lo suyo", async () => {
    await anotar(t, "yeison", e.norte, "Anotación de Yeison.");
    await anotar(t, "camilo", e.norte, "Anotación de Camilo.");
    await como(t, "camilo").mutation(api.guardia.recibirPaquete, {
      condominioId: e.norte,
      unidadNumero: "101",
      tipo: "paquete",
    });
    await reportar(t, "yeison", e.norte, "Luz dañada");
    await reportar(t, "camilo", e.norte, "Puerta abierta");

    const deQuien = { [e.yeison]: [deYeison, rondaYeison], [e.camilo]: [deCamilo, rondaCamilo] } as Record<
      string,
      [Id<"guardiaTurnos">, Id<"guardiaRondas">]
    >;
    const despuesDeLasRondas = (await minutaDe(t, e.norte)).filter((m) => m.tipo !== "Inicio de Turno" && m.tipo !== "Inicio de ronda");
    expect(despuesDeLasRondas).toHaveLength(5);
    for (const m of despuesDeLasRondas) {
      expect([m.turnoId, m.rondaId], m.tipo).toEqual(deQuien[m.actorUserId!]);
    }
    for (const n of await novedadesDe(t, e.norte)) {
      expect([n.turnoId, n.rondaId], n.titulo).toEqual(deQuien[n.reportadoPorUserId]);
    }
  });

  test("lo que hace quien no tiene turno no cae en el de nadie", async () => {
    await como(t, "maria").mutation(api.guardia.recibirPaquete, {
      condominioId: e.norte,
      unidadNumero: "102",
      tipo: "sobre",
    });
    await reportar(t, "maria", e.norte, "Vidrio roto");
    await t.run((ctx) =>
      logMinuta(ctx, {
        condominioId: e.norte,
        modulo: "visitantes",
        tipo: "Autorización",
        unidad: "101",
        resumen: "Rita autorizó una visita.",
        actorUserId: e.rita,
        actorNombre: "Rita Residente",
      }),
    );
    // El paquete y la novedad de María, y la autorización de Rita.
    const ajenos = (await minutaDe(t, e.norte)).filter((m) => m.actorUserId === e.maria || m.actorUserId === e.rita);
    expect(ajenos.map((m) => m.modulo).sort()).toEqual(["novedades", "paqueteria", "visitantes"]);
    for (const m of ajenos) {
      expect(m.turnoId).toBeUndefined();
      expect(m.rondaId).toBeUndefined();
    }
    const [novedad] = (await novedadesDe(t, e.norte)).filter((n) => n.reportadoPorUserId === e.maria);
    expect(novedad!.turnoId).toBeUndefined();
    expect(novedad!.rondaId).toBeUndefined();
  });

  test("el detalle de cada turno muestra solo lo de su celador", async () => {
    await anotar(t, "yeison", e.norte, "Anotación de Yeison.");
    await anotar(t, "camilo", e.norte, "Anotación de Camilo.");
    const turno = (await como(t, "admin").query(api.guardia.getTurno, { turnoId: deCamilo }))!;
    expect(turno.rondas.map((r) => r._id)).toEqual([rondaCamilo]);
    expect(new Set(turno.eventos.map((ev) => ev.actorUserId))).toEqual(new Set([e.camilo]));
  });
});

// ─────────────────────────────────────────────────────────────

describe("cierre asistido con varios turnos abiertos", () => {
  let deYeison: Id<"guardiaTurnos">;
  let deCamilo: Id<"guardiaTurnos">;
  let rondaYeison: Id<"guardiaRondas">;
  let rondaCamilo: Id<"guardiaRondas">;
  beforeEach(async () => {
    await configurar(t, "admin", e.norte, 2);
    deYeison = await abrir(t, "yeison", e.norte);
    deCamilo = await abrir(t, "camilo", e.norte);
    rondaYeison = (await iniciarRonda(t, "yeison", e.norte)).rondaId;
    rondaCamilo = (await iniciarRonda(t, "camilo", e.norte, "Parqueadero")).rondaId;
  });

  test("María elige el de Camilo: se cierra ese, sus rondas, y abre el suyo; Yeison sigue", async () => {
    const antes = await como(t, "maria").query(api.guardia.turnosActivos, { condominioId: e.norte });
    expect(antes.libres).toBe(0);
    expect(antes.otros.map((o) => [o.guardiaNombre, o.cierraComo])).toEqual([
      ["Yeison Guarda", "companero"],
      ["Camilo Guarda", "companero"],
    ]);
    const yeisonAntes = await leer(t, deYeison);

    await como(t, "maria").mutation(api.guardia.cerrarTurnoDeCompanero, {
      turnoId: deCamilo,
      condominioId: e.norte,
    });

    const cerrado = await leer(t, deCamilo);
    expect(cerrado).toMatchObject({ estado: "cerrado", cerradoPorUserId: e.maria, guardiaUserId: e.camilo });
    expect(cerrado.observacionesCierre).toMatch(/Cierre por compañero \(turno olvidado\): lo cerró María Guarda/);
    expect(await leer(t, rondaCamilo)).toMatchObject({
      estado: "finalizada",
      observacionesCierre: "Finalizada al cerrar el turno.",
    });
    // Lo de Yeison, intacto: su turno y su ronda.
    expect(await leer(t, deYeison)).toEqual(yeisonAntes);
    expect((await leer(t, rondaYeison)).estado).toBe("en_curso");

    // Quién, qué turno y cuándo, en la minuta del turno de Camilo.
    const delCierre = (await minutaDe(t, e.norte)).filter((m) => m.actorUserId === e.maria);
    expect(delCierre.map((m) => [m.tipo, m.turnoId, m.rondaId])).toEqual([
      ["Fin de ronda", deCamilo, undefined],
      ["Cierre de Turno por Compañero", deCamilo, undefined],
    ]);
    expect(delCierre[1]!.createdAt).toBeGreaterThanOrEqual(cerrado.fechaCierre!);

    const despues = await como(t, "maria").query(api.guardia.turnosActivos, { condominioId: e.norte });
    expect(despues).toMatchObject({ ocupados: 1, libres: 1 });
    await abrir(t, "maria", e.norte);
    expect((await leer(t, deYeison)).estado).toBe("abierto");
  });

  test("si el turno elegido ya se cerró, se rechaza sin escribir nada y no toca el nuevo", async () => {
    await cerrar(t, "camilo", deCamilo);
    await sinEscribir(
      t,
      e.norte,
      () => como(t, "maria").mutation(api.guardia.cerrarTurnoDeCompanero, { turnoId: deCamilo, condominioId: e.norte }),
      /El turno ya está cerrado/,
    );
    // Camilo vuelve y abre otro: el id viejo sigue sin servir para cerrarlo.
    const nuevo = await abrir(t, "camilo", e.norte);
    await expect(
      como(t, "maria").mutation(api.guardia.cerrarTurnoDeCompanero, { turnoId: deCamilo, condominioId: e.norte }),
    ).rejects.toThrow(/El turno ya está cerrado/);
    expect((await leer(t, nuevo)).estado).toBe("abierto");
  });

  test("cerrarlo dos veces deja un solo cierre", async () => {
    const cerrarlo = () =>
      como(t, "maria").mutation(api.guardia.cerrarTurnoDeCompanero, { turnoId: deCamilo, condominioId: e.norte });
    await cerrarlo();
    await expect(cerrarlo()).rejects.toThrow(/El turno ya está cerrado/);
    const cierres = (await minutaDe(t, e.norte)).filter((m) => m.tipo === "Cierre de Turno por Compañero");
    expect(cierres).toHaveLength(1);
  });

  test("un turno de otra portería no se cierra desde esta", async () => {
    const deSergio = await abrir(t, "sergio", e.sur);
    await expect(
      como(t, "maria").mutation(api.guardia.cerrarTurnoDeCompanero, { turnoId: deSergio, condominioId: e.norte }),
    ).rejects.toThrow("Turno no encontrado en esta portería.");
    await expect(
      como(t, "maria").mutation(api.guardia.cerrarTurnoDeCompanero, { turnoId: deSergio, condominioId: e.sur }),
    ).rejects.toThrow(/No pertenece a este condominio/);
    expect((await leer(t, deSergio)).estado).toBe("abierto");
  });

  test("quien cierra el suyo no cierra los de sus compañeros", async () => {
    await cerrar(t, "yeison", deYeison);
    expect((await leer(t, deYeison)).estado).toBe("cerrado");
    expect((await leer(t, rondaYeison)).estado).toBe("finalizada");
    expect((await leer(t, deCamilo)).estado).toBe("abierto");
    expect((await leer(t, rondaCamilo)).estado).toBe("en_curso");
  });
});

// ─────────────────────────────────────────────────────────────

describe("5 · solicitudes a la vez", () => {
  test("cuatro inicios a la vez con capacidad 2: abren exactamente dos", async () => {
    await configurar(t, "admin", e.norte, 2);
    const resultados = await Promise.allSettled(
      ["yeison", "camilo", "maria", "pedro"].map((quien) => abrir(t, quien, e.norte)),
    );
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    for (const r of resultados.filter((r) => r.status === "rejected")) {
      expect(String((r as PromiseRejectedResult).reason)).toMatch(/No hay cupos disponibles/);
    }
    expect(await abiertosEn(t, e.norte)).toHaveLength(2);
  });

  test("el mismo celador dos veces a la vez: un turno", async () => {
    await configurar(t, "admin", e.norte, 3);
    const resultados = await Promise.allSettled([abrir(t, "yeison", e.norte), abrir(t, "yeison", e.norte)]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await abiertosEn(t, e.norte)).toHaveLength(1);
  });

  test("bajar la capacidad mientras alguien abre: nunca quedan más turnos que cupos", async () => {
    await configurar(t, "admin", e.norte, 3);
    await abrir(t, "yeison", e.norte);
    await abrir(t, "camilo", e.norte);
    const [config, inicio] = await Promise.allSettled([configurar(t, "admin", e.norte, 2), abrir(t, "maria", e.norte)]);
    // Gana una de las dos; la otra se rechaza con lo que dejó la primera.
    expect([config.status, inicio.status].sort()).toEqual(["fulfilled", "rejected"]);
    const capacidad = (await leer(t, e.norte)).vigilancia!.maxTurnosActivos;
    expect((await abiertosEn(t, e.norte)).length).toBeLessThanOrEqual(capacidad);
  });

  test("dos rondas a la vez de celadores distintos: dos, con números seguidos; del mismo: una", async () => {
    await configurar(t, "admin", e.norte, 2);
    await abrir(t, "yeison", e.norte);
    await abrir(t, "camilo", e.norte);
    const dos = await Promise.all([iniciarRonda(t, "yeison", e.norte), iniciarRonda(t, "camilo", e.norte)]);
    expect(dos.map((r) => r.numero).sort()).toEqual([1, 2]);

    await como(t, "yeison").mutation(api.rondas.finalizar, { rondaId: dos[0]!.rondaId });
    const mismo = await Promise.allSettled([iniciarRonda(t, "yeison", e.norte), iniciarRonda(t, "yeison", e.norte)]);
    expect(mismo.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    // La nueva de Yeison y la de Camilo, que no se tocó.
    expect((await rondasDe(t, e.norte)).filter((r) => r.estado === "en_curso")).toHaveLength(2);
  });

  test("dos compañeros cierran a la vez el mismo turno olvidado: un solo cierre", async () => {
    await configurar(t, "admin", e.norte, 2);
    await abrir(t, "yeison", e.norte);
    const deCamilo = await abrir(t, "camilo", e.norte);
    const resultados = await Promise.allSettled(
      ["maria", "pedro"].map((quien) =>
        como(t, quien).mutation(api.guardia.cerrarTurnoDeCompanero, { turnoId: deCamilo, condominioId: e.norte }),
      ),
    );
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await minutaDe(t, e.norte)).filter((m) => m.tipo === "Cierre de Turno por Compañero")).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────

describe("6-7 · cada conjunto con lo suyo, y nadie con lo ajeno", () => {
  test("capacidades independientes por conjunto", async () => {
    await configurar(t, "admin", e.norte, 2);
    await abrir(t, "yeison", e.norte);
    await abrir(t, "camilo", e.norte);
    // Sur sigue con uno: los turnos de Norte no cuentan aquí.
    await abrir(t, "sergio", e.sur);
    await expect(abrir(t, "sara", e.sur)).rejects.toThrow(/ya hay un turno abierto en esta portería/);
    expect((await leer(t, e.sur)).vigilancia).toBeUndefined();
    const sur = await como(t, "adminsur").query(api.guardia.turnosActivos, { condominioId: e.sur });
    expect(sur).toMatchObject({ capacidad: 1, ocupados: 1, independientes: false });
  });

  test("no se abre turno en una portería ajena ni sin rol de guardia", async () => {
    await configurar(t, "admin", e.norte, 2);
    await sinEscribir(t, e.norte, () => abrir(t, "sergio", e.norte), /No pertenece a este condominio/);
    await sinEscribir(t, e.norte, () => abrir(t, "rita", e.norte), /No tiene el rol requerido/);
    await sinEscribir(
      t,
      e.norte,
      () => t.mutation(api.guardia.iniciarTurno, { condominioId: e.norte, checklist: CHECKLIST }),
      /./,
    );
    await expect(como(t, "sergio").query(api.guardia.turnosActivos, { condominioId: e.norte })).rejects.toThrow(
      /No pertenece/,
    );
  });

  test("solo la administración del conjunto (o la plataforma) configura su capacidad", async () => {
    await sinEscribir(t, e.norte, () => configurar(t, "yeison", e.norte, 2), /No tiene el rol requerido/);
    await sinEscribir(t, e.norte, () => configurar(t, "rita", e.norte, 2), /No tiene el rol requerido/);
    await sinEscribir(t, e.norte, () => configurar(t, "adminsur", e.norte, 2), /No pertenece a este condominio/);
    await sinEscribir(t, e.norte, () => configurar(t, "sergio", e.norte, 2), /No pertenece a este condominio/);
    await sinEscribir(
      t,
      e.norte,
      () => t.mutation(api.guardia.configurarVigilancia, { condominioId: e.norte, maxTurnosActivos: 2 }),
      /./,
    );

    await configurar(t, "admin", e.norte, 2);
    await configurar(t, "junta", e.norte, 3);
    await configurar(t, "super", e.norte, 4);
    expect((await leer(t, e.norte)).vigilancia).toMatchObject({
      maxTurnosActivos: 4,
      actualizadoPorUserId: e.plataforma,
    });
    // Sur, sin tocar.
    expect((await leer(t, e.sur)).vigilancia).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────

describe("10 · la configuración y sus límites", () => {
  test("solo enteros entre 1 y 50", async () => {
    for (const malo of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 51]) {
      await sinEscribir(
        t,
        e.norte,
        () => configurar(t, "admin", e.norte, malo),
        /La cantidad de turnos simultáneos debe ser un número entero entre 1 y 50/,
      );
    }
    await configurar(t, "admin", e.norte, 50);
    expect((await leer(t, e.norte)).vigilancia!.maxTurnosActivos).toBe(50);
  });

  test("persiste, dice quién la cambió y la leen las pantallas", async () => {
    await configurar(t, "admin", e.norte, 3);
    const condominio = await leer(t, e.norte);
    expect(condominio.vigilancia).toMatchObject({ maxTurnosActivos: 3, actualizadoPorUserId: e.admin });
    expect(typeof condominio.vigilancia!.actualizadoEn).toBe("number");
    const porteria = await como(t, "yeison").query(api.guardia.turnosActivos, { condominioId: e.norte });
    expect(porteria).toMatchObject({ capacidad: 3, libres: 3, independientes: true });
  });

  test("el mismo valor no escribe nada", async () => {
    const antes = await leer(t, e.norte);
    expect(await configurar(t, "admin", e.norte, 1)).toEqual({ maxTurnosActivos: 1 });
    expect(await leer(t, e.norte)).toEqual(antes);
  });

  test("no baja de los turnos abiertos y dice qué hay que cerrar", async () => {
    await configurar(t, "admin", e.norte, 3);
    await abrir(t, "yeison", e.norte);
    const deCamilo = await abrir(t, "camilo", e.norte);
    await abrir(t, "maria", e.norte);
    await sinEscribir(
      t,
      e.norte,
      () => configurar(t, "admin", e.norte, 2),
      "Hay 3 turnos abiertos y la capacidad no puede quedar por debajo. Para bajarla a 2 deben cerrarse antes un turno.",
    );
    await cerrar(t, "camilo", deCamilo);
    await configurar(t, "admin", e.norte, 2);
    expect((await leer(t, e.norte)).vigilancia!.maxTurnosActivos).toBe(2);
  });

  test("no cambia de modo con turnos abiertos, en ninguno de los dos sentidos", async () => {
    const deYeison = await abrir(t, "yeison", e.norte, { guardiaSecundarioUserId: e.pedro });
    const compartido = await leer(t, deYeison);
    await sinEscribir(
      t,
      e.norte,
      () => configurar(t, "admin", e.norte, 2),
      /^Pasar a turnos independientes cambia cómo opera la portería y hay un turno abierto\. Deben cerrarse todos antes de hacer el cambio\.$/,
    );
    // El turno compartido no se reinterpreta.
    expect(await leer(t, deYeison)).toEqual(compartido);
    await cerrar(t, "yeison", deYeison);
    await configurar(t, "admin", e.norte, 2);

    const deCamilo = await abrir(t, "camilo", e.norte);
    await sinEscribir(t, e.norte, () => configurar(t, "admin", e.norte, 1), /^Volver a un solo turno compartido cambia cómo opera la portería y hay un turno abierto/);
    await cerrar(t, "camilo", deCamilo);
    await configurar(t, "admin", e.norte, 1);
    expect((await leer(t, e.norte)).vigilancia!.maxTurnosActivos).toBe(1);
  });

  test("dentro de los turnos independientes se sube y se baja con turnos abiertos", async () => {
    await configurar(t, "admin", e.norte, 2);
    await abrir(t, "yeison", e.norte);
    await abrir(t, "camilo", e.norte);
    await configurar(t, "admin", e.norte, 5);
    await abrir(t, "maria", e.norte);
    await configurar(t, "admin", e.norte, 3);
    await expect(abrir(t, "pedro", e.norte)).rejects.toThrow(/los 3 turnos de esta portería están ocupados/);
    expect(await abiertosEn(t, e.norte)).toHaveLength(3);
  });
});

// ─────────────────────────────────────────────────────────────

describe("8-9 · lo que ya existía", () => {
  test("los turnos, rondas y minuta de antes se siguen leyendo", async () => {
    const { turnoId, rondaId } = await t.run(async (ctx) => {
      const turnoId = await ctx.db.insert("guardiaTurnos", {
        condominioId: e.norte,
        guardiaUserId: e.yeison,
        guardiaNombre: "Yeison Guarda",
        checklist: [],
        estado: "cerrado",
        fechaInicio: AHORA - 10 * HORA,
        fechaCierre: AHORA - 2 * HORA,
        createdAt: AHORA - 10 * HORA,
        updatedAt: AHORA - 2 * HORA,
      });
      const rondaId = await ctx.db.insert("guardiaRondas", {
        condominioId: e.norte,
        turnoId,
        zona: "Perímetro",
        fotos: [],
        createdAt: AHORA - 5 * HORA,
      });
      return { turnoId, rondaId };
    });
    await configurar(t, "admin", e.norte, 2);
    const turnos = await como(t, "admin").query(api.guardia.listTurnos, { condominioId: e.norte });
    expect(turnos.map((x) => x._id)).toEqual([turnoId]);
    const detalle = (await como(t, "admin").query(api.guardia.getTurno, { turnoId }))!;
    expect(detalle.rondas.map((r) => r._id)).toEqual([rondaId]);
    const [ronda] = await como(t, "admin").query(api.rondas.listar, { condominioId: e.norte });
    expect(ronda).toMatchObject({ _id: rondaId, estado: "finalizada", guardiaNombre: null });
  });

  test("un turno abierto con el código de antes sigue igual y se cierra como siempre", async () => {
    const viejo = await t.run((ctx) =>
      ctx.db.insert("guardiaTurnos", {
        condominioId: e.norte,
        guardiaUserId: e.yeison,
        guardiaNombre: "Yeison Guarda",
        guardiaSecundarioNombre: "Luis",
        checklist: CHECKLIST,
        estado: "abierto",
        fechaInicio: AHORA - HORA,
        createdAt: AHORA - HORA,
        updatedAt: AHORA - HORA,
      }),
    );
    expect((await como(t, "camilo").query(api.guardia.turnoActivo, { condominioId: e.norte }))!._id).toBe(viejo);
    await expect(abrir(t, "camilo", e.norte)).rejects.toThrow(/No hay cupos disponibles/);
    await anotar(t, "camilo", e.norte, "Bajo el turno de la portería.");
    expect((await minutaDe(t, e.norte)).at(-1)!.turnoId).toBe(viejo);
    await cerrar(t, "yeison", viejo);
    expect((await leer(t, viejo)).estado).toBe("cerrado");
  });

  test("una ronda que quedó en curso en un turno ya cerrado no le capta nada al turno nuevo", async () => {
    const vieja = await t.run(async (ctx) => {
      const turnoId = await ctx.db.insert("guardiaTurnos", {
        condominioId: e.norte,
        guardiaUserId: e.yeison,
        guardiaNombre: "Yeison Guarda",
        checklist: [],
        estado: "cerrado",
        fechaInicio: AHORA - 20 * HORA,
        fechaCierre: AHORA - 12 * HORA,
        createdAt: AHORA - 20 * HORA,
        updatedAt: AHORA - 12 * HORA,
      });
      return await ctx.db.insert("guardiaRondas", {
        condominioId: e.norte,
        turnoId,
        zona: "Olvidada",
        fotos: [],
        numero: 1,
        guardiaUserId: e.yeison,
        guardiaNombre: "Yeison Guarda",
        estado: "en_curso",
        fechaInicio: AHORA - 15 * HORA,
        createdAt: AHORA - 15 * HORA,
      });
    });
    await configurar(t, "admin", e.norte, 2);
    const turno = await abrir(t, "yeison", e.norte);
    expect(await como(t, "yeison").query(api.rondas.activa, { condominioId: e.norte })).toBeNull();
    const { rondaId } = await iniciarRonda(t, "yeison", e.norte);
    await anotar(t, "yeison", e.norte, "Hoy.");
    const evento = (await minutaDe(t, e.norte)).at(-1)!;
    expect([evento.turnoId, evento.rondaId]).toEqual([turno, rondaId]);
    // Y cerrar el turno nuevo no toca la de otro turno.
    await cerrar(t, "yeison", turno);
    expect((await leer(t, vieja)).estado).toBe("en_curso");
  });

  test("con capacidad 1, cerrar el turno también finaliza sus rondas en curso", async () => {
    const turnoId = await abrir(t, "yeison", e.norte);
    const { rondaId } = await iniciarRonda(t, "camilo", e.norte);
    await cerrar(t, "yeison", turnoId);
    expect(await leer(t, rondaId)).toMatchObject({ estado: "finalizada", observacionesCierre: "Finalizada al cerrar el turno." });
    const fin = (await minutaDe(t, e.norte)).find((m) => m.tipo === "Fin de ronda")!;
    expect(fin).toMatchObject({ turnoId, actorUserId: e.yeison });
    expect(fin.resumen).toMatch(/^Ronda #1 finalizada al cerrar el turno/);
  });
});

// ─────────────────────────────────────────────────────────────

describe("coberturas y turnos huérfanos con varios turnos abiertos", () => {
  let c: Awaited<ReturnType<typeof montarCompania>>;
  beforeEach(async () => {
    vi.setSystemTime(T17);
    c = await montarCompania();
    await c.t.run(async (ctx) => {
      for (const id of [c.alamos, c.bosque]) {
        await ctx.db.patch(id, { vigilancia: { maxTurnosActivos: 2 } });
      }
    });
  });
  afterEach(() => vi.useRealTimers());

  const abrirEn = (authId: string, condominioId: Id<"condominios">) =>
    c.como(authId).mutation(api.guardia.iniciarTurno, { condominioId, checklist: CHECKLIST });

  test("el turno huérfano se encuentra aunque haya otro abierto antes", async () => {
    vi.setSystemTime(T17 - 3 * HORA);
    const deBruno = await abrirEn("bruno", c.bosque);
    await c.cubrir(c.bosque, c.kBosque, T17 - 2 * HORA, T17 + HORA);
    vi.setSystemTime(T17 - HORA);
    const deJason = await abrirEn("jason", c.bosque);

    // Termina la cobertura sin que Jason cierre: su turno queda huérfano.
    vi.setSystemTime(T17 + 2 * HORA);
    await expect(abrirEn("jason", c.alamos)).rejects.toThrow(
      "Tienes un turno pendiente de cierre en Conjunto Bosque. Ciérralo antes de iniciar otro.",
    );
    const pendiente = await c.como("jason").query(api.guardia.turnoPendienteDeCierre, {});
    expect(pendiente!.turno._id).toBe(deJason);
    const huerfanos = await c.como("alicia").query(api.guardia.turnosHuerfanosDeCompania, { companiaId: c.andina });
    expect(huerfanos.map((h) => h.turnoId)).toEqual([deJason]);

    await c.como("alicia").mutation(api.guardia.cerrarTurnoHuerfano, { turnoId: deJason, motivo: "La cobertura terminó." });
    const [bruno, jason] = await c.t.run(async (ctx) => [await ctx.db.get(deBruno), await ctx.db.get(deJason)]);
    expect(jason!.estado).toBe("cerrado");
    expect(bruno!.estado).toBe("abierto");
  });

  test("la excepción de la cobertura encuentra su turno detrás del de un compañero", async () => {
    const nora = await c.t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Nora Alamos",
        email: "nora@vekino.test",
        emailVerified: true,
        active: true,
        authId: "nora",
        createdAt: T17,
        updatedAt: T17,
      });
      await ctx.db.insert("memberships", {
        userId,
        condominioId: c.alamos,
        roles: ["guardia"],
        isActive: true,
        createdAt: T17,
        updatedAt: T17,
      });
      return userId;
    });
    vi.setSystemTime(T17 - 4 * HORA);
    const deNora = await abrirEn("nora", c.alamos);
    vi.setSystemTime(T17 - 3 * HORA);
    const deJason = await abrirEn("jason", c.alamos);
    await c.cubrir(c.bosque, c.kBosque, T17 - HORA, T17 + 5 * HORA);

    vi.setSystemTime(T17);
    const pendiente = await c.como("jason").query(api.guardia.turnoPendienteDeCierre, {});
    expect(pendiente!.turno._id).toBe(deJason);
    await c.como("jason").mutation(api.guardia.cerrarTurno, { turnoId: deJason });
    const [n, j] = await c.t.run(async (ctx) => [await ctx.db.get(deNora), await ctx.db.get(deJason)]);
    expect(j!.estado).toBe("cerrado");
    expect(n!.estado).toBe("abierto");
    expect(n!.guardiaUserId).toBe(nora);
  });
});
