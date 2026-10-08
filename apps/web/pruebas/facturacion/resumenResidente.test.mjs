import { afterEach, beforeEach, describe, expect, mock, setSystemTime, test } from "bun:test";
import { Window } from "happy-dom";
const ventana = new Window({ url: "http://localhost" });
for (const clave of ["window", "document", "HTMLElement", "HTMLInputElement", "Event", "MouseEvent", "Node", "navigator"]) Object.defineProperty(globalThis, clave, { configurable: true, value: clave === "window" ? ventana : ventana[clave] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { act, createElement } = await import("react");
const { createRoot } = await import("react-dom/client");
const { getFunctionName } = await import("convex/server");
const { carteraDeUnidad } = await import("../../../../packages/backend/convex/lib/cartera.ts");

/**
 * RED DE SEGURIDAD DE FACTURACIÓN — LO QUE VE EL RESIDENTE EN LA WEB (Fase 0).
 *
 * Monta las páginas REALES del portal del residente —inicio (`/mi/[id]`) y
 * "Mis facturas" (`/mi/[id]/cuenta`)— con lo que devolvería `facturas.listMia`.
 * Lo único simulado son las respuestas del servidor y la fecha.
 *
 * La regla contra la que se mide es la de la cartera (`lib/cartera.ts`): la
 * deuda es la última factura de la cadena y la mora la decide el último
 * período ya vencido. Una factura histórica "vencida" que ya quedó absorbida
 * y saldada por las siguientes NO es deuda vigente (F-03), y no se puede
 * volver a ofrecer para pagar (F-01).
 *
 * Las cadenas son reales (Arboleda, octubre de 2026), anonimizadas: solo
 * períodos, estados y montos. Las pruebas de defecto FALLAN hoy a propósito.
 * Ver docs/audits/FASE-0-FACTURACION.md.
 */

const bogota = (local) => Date.parse(`${local}:00-05:00`);
/** El día de la auditoría: agosto ya venció (15-sep), septiembre no (15-oct). */
const AHORA = bogota("2026-10-08T10:00");

function vencimiento(periodo) {
  const [a, m] = periodo.split("-").map(Number);
  const sig = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
  return bogota(`${sig}-15T00:00`);
}

/** Una fila como la devuelve `facturas.listMia`. */
function factura(periodo, estado, totalAPagar, saldoAnterior = 0) {
  return {
    _id: `f-${periodo}`,
    unidadId: "u101",
    numeroFactura: `FAC-${periodo}-0001`,
    periodo,
    periodoLabel: periodo,
    estado,
    totalAPagar,
    saldoAFavor: 0,
    fechaVencimiento: vencimiento(periodo),
    lineas: [
      { codigo: 2, concepto: "Administración", saldoAnterior, actual: totalAPagar - saldoAnterior, total: totalAPagar },
    ],
    unidadNumero: "101",
    unidadTipo: "casa",
    unidadTorre: null,
  };
}

/** La casa del PQRS m179ddw0… ("me encuentro al día"): así está hoy en producción. */
const CASA_PQRS = [
  factura("2026-04", "vencida", 385_000),
  factura("2026-05", "pagada", 680_040, 385_000),
  factura("2026-06", "vencida", 15_760),
  factura("2026-07", "pagada", 584_156, 289_000),
  factura("2026-08", "pagada", 289_000),
  factura("2026-09", "pendiente", 289_000),
];

/**
 * Otra casa real: agosto quedó vencida y septiembre ($656.804) la absorbió.
 * Aquí septiembre aparece PAGADA, como quedaría al aprobarse su pago por la
 * pasarela o un comprobante (`pagos.aplicarEstado`, `soportesPago.aprobar`).
 */
const CASA_PAGO_VIGENTE = [
  factura("2026-07", "abonada", 345_549, 56_159),
  factura("2026-08", "vencida", 366_113, 45_549),
  factura("2026-09", "pagada", 656_804, 366_113),
];

/** Una casa que paga cada mes: todo pagado, septiembre incluido. */
const CASA_AL_DIA = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09"].map((p) =>
  factura(p, "pagada", 284_000),
);

/** La misma casa con septiembre todavía sin pagar. */
const CASA_SEPTIEMBRE_PENDIENTE = [
  ...CASA_AL_DIA.slice(0, 4),
  factura("2026-09", "pendiente", 284_000),
];

let facturas, contenedor, root;
const home = {
  allowed: true,
  isPlatform: false,
  userId: "residente",
  userName: "Residente de prueba",
  userImage: null,
  userEmail: "residente@vekino.test",
  myRoles: ["propietario"],
  membershipId: "m-residente",
  unidades: [{ _id: "u101", numero: "101", torre: null, bloque: null, tipo: "casa", estado: "ocupada", coeficiente: null, vinculo: "propietario", esPrincipal: true }],
  condominio: { _id: "condo-prueba", name: "Conjunto de Prueba", city: null, address: null, nit: null, logo: null, coverImage: null, primaryColor: null, avalPortalUrl: null },
};
mock.module("next/navigation", () => ({ useParams: () => ({ id: "condo-prueba" }) }));
mock.module("next/link", () => ({ default: ({ href, children, prefetch: _p, ...props }) => createElement("a", { ...props, href }, children) }));
mock.module("convex/react", () => ({
  useQuery: (fn) => {
    const nombre = getFunctionName(fn);
    if (nombre === "facturas:listMia") return facturas;
    if (nombre === "portal:home") return home;
    if (nombre === "portal:misActividades") return { reservasActivas: [], ticketsAbiertos: 0 };
    if (nombre === "comunicados:listRecent") return [];
    return undefined;
  },
  useAction: () => async () => ({ pagoId: "pago-prueba", redirectUrl: "https://pasarela.test" }),
  useMutation: () => async () => {},
}));
const { default: MisFacturas } = await import("../../app/mi/[id]/cuenta/page");
const { default: PortalInicio } = await import("../../app/mi/[id]/page");

beforeEach(() => {
  setSystemTime(new Date(AHORA));
  contenedor = document.createElement("div");
  document.body.append(contenedor);
  root = createRoot(contenedor);
});
afterEach(async () => {
  await act(() => root.unmount());
  contenedor.remove();
  setSystemTime();
});

async function ver(Pagina, cadena, ahora = AHORA) {
  setSystemTime(new Date(ahora));
  facturas = cadena;
  await act(() => root.render(createElement(Pagina)));
}

/** El badge de la tarjeta "Estado actual" de Mis facturas: "Al día", "Pendiente" o "Vencida". */
function estadoActual() {
  const titulo = [...contenedor.querySelectorAll("span")].find((s) => s.textContent === "Estado actual");
  return titulo?.parentElement?.textContent.replace("Estado actual", "").trim();
}

/** Botones "Pagar" visibles y la factura (por número) de la fila o tarjeta en que están. */
function botonesPagar() {
  return [...contenedor.querySelectorAll("button")]
    .filter((b) => b.textContent.trim() === "Pagar")
    .map((b) => {
      const caja = b.closest("div.rounded-lg") ?? b.closest("div.rounded-2xl");
      const numero = caja?.textContent.match(/FAC-\d{4}-\d{2}-\d{4}/)?.[0] ?? null;
      return { numero };
    });
}

/** La tarjeta de deuda del inicio: si está en modo "vencida" (roja, con triángulo de alerta). */
function alertaDeudaEnRojo() {
  const titulo = [...contenedor.querySelectorAll("p")].find((p) => p.textContent.startsWith("Total pendiente:"));
  const tarjeta = titulo?.closest("div.rounded-2xl");
  if (!tarjeta) return null;
  return /bg-red-50/.test(tarjeta.className) || Boolean(tarjeta.querySelector('svg[class*="triangle-alert"]'));
}

const ETIQUETA_DE_CARTERA = { al_dia: "Al día", pendiente: "Pendiente", en_mora: "Vencida" };

describe("F03 · el estado de 'Mis facturas' coincide con la cartera de la casa", () => {
  test("F03-historial-como-mora · la casa del PQRS (abril y junio vencidas pero ya saldadas, septiembre aún no vence) se ve 'Pendiente', no 'Vencida'", async () => {
    const cartera = carteraDeUnidad(CASA_PQRS, AHORA);
    expect(cartera.estado).toBe("pendiente");
    await ver(MisFacturas, CASA_PQRS);
    expect(estadoActual()).toBe(ETIQUETA_DE_CARTERA[cartera.estado]);
  });

  test("F03-control · septiembre sin pagar y sin vencer, sin historial vencido: 'Pendiente'", async () => {
    const cartera = carteraDeUnidad(CASA_SEPTIEMBRE_PENDIENTE, AHORA);
    await ver(MisFacturas, CASA_SEPTIEMBRE_PENDIENTE);
    expect(estadoActual()).toBe(ETIQUETA_DE_CARTERA[cartera.estado]);
    expect(estadoActual()).toBe("Pendiente");
  });

  test("F03-control · todo pagado: 'Al día' y ningún botón de pagar", async () => {
    await ver(MisFacturas, CASA_AL_DIA);
    expect(estadoActual()).toBe("Al día");
    expect(botonesPagar()).toHaveLength(0);
  });

  test("F03-mora-actual-oculta · el 20 de octubre septiembre ya venció sin pagarse: la casa está en mora y debe verse 'Vencida'", async () => {
    const el20 = bogota("2026-10-20T10:00");
    const cartera = carteraDeUnidad(CASA_SEPTIEMBRE_PENDIENTE, el20);
    expect(cartera.estado).toBe("en_mora");
    await ver(MisFacturas, CASA_SEPTIEMBRE_PENDIENTE, el20);
    expect(estadoActual()).toBe(ETIQUETA_DE_CARTERA[cartera.estado]);
  });

  /*
   * Aquí la cartera de la administración TAMBIÉN se equivoca (dice "en_mora",
   * hallazgo nuevo de la Fase 0: pagos.regresion.ts, F03-cartera-mora-tras-pago),
   * así que el esperado se fija a mano: septiembre pagada absorbe agosto, la
   * casa está al día.
   */
  test("F03-historial-como-mora (Caso B) · con septiembre pagada, la casa se ve 'Al día' aunque agosto haya quedado vencida", async () => {
    await ver(MisFacturas, CASA_PAGO_VIGENTE);
    expect(estadoActual()).toBe("Al día");
  });
});

describe("F01 · el residente no recibe otra vez la opción de pagar lo que ya pagó", () => {
  test("F01-web-ofrece-absorbida (Casos B y C) · con septiembre pagada, 'Mis facturas' no ofrece pagar agosto ($366.113 que ya iban en septiembre)", async () => {
    await ver(MisFacturas, CASA_PAGO_VIGENTE);
    const botones = botonesPagar();
    expect(botones, `botones "Pagar" en: ${botones.map((b) => b.numero).join(", ")}`).toHaveLength(0);
  });

  test("F01-control · con septiembre sin pagar, los únicos botones 'Pagar' son de septiembre (la vigente)", async () => {
    await ver(MisFacturas, CASA_PQRS);
    const botones = botonesPagar();
    expect(botones.length).toBeGreaterThan(0);
    expect(new Set(botones.map((b) => b.numero))).toEqual(new Set(["FAC-2026-09-0001"]));
  });
});

describe("F03/F01 · la tarjeta de deuda del inicio", () => {
  test("F03-historial-como-mora (inicio) · la casa del PQRS no se pinta en rojo de 'vencida': solo debe septiembre, que aún no vence", async () => {
    await ver(PortalInicio, CASA_PQRS);
    expect(contenedor.textContent).toContain("Total pendiente:");
    expect(alertaDeudaEnRojo()).toBe(false);
  });

  test("F03-control (inicio) · septiembre sin pagar y sin vencer, sin historial vencido: tarjeta de pendiente, no roja", async () => {
    await ver(PortalInicio, CASA_SEPTIEMBRE_PENDIENTE);
    expect(alertaDeudaEnRojo()).toBe(false);
  });

  test("F03-mora-actual-oculta (inicio) · el 20 de octubre, con septiembre vencida sin pagar, la tarjeta sí debe estar en rojo", async () => {
    await ver(PortalInicio, CASA_SEPTIEMBRE_PENDIENTE, bogota("2026-10-20T10:00"));
    expect(alertaDeudaEnRojo()).toBe(true);
  });

  test("F01-inicio-ofrece-absorbida (Caso B) · con septiembre pagada, el inicio dice 'Estás al día', no 'Total pendiente: $366.113'", async () => {
    await ver(PortalInicio, CASA_PAGO_VIGENTE);
    expect(contenedor.textContent).toContain("Estás al día");
  });

  test("F03-control (inicio) · todo pagado: 'Estás al día'", async () => {
    await ver(PortalInicio, CASA_AL_DIA);
    expect(contenedor.textContent).toContain("Estás al día");
  });
});
