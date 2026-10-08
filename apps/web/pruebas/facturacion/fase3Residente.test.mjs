import { afterEach, beforeEach, describe, expect, mock, setSystemTime, test } from "bun:test";
import { Window } from "happy-dom";
const ventana = new Window({ url: "http://localhost" });
for (const clave of ["window", "document", "HTMLElement", "HTMLInputElement", "Event", "MouseEvent", "Node", "navigator"]) Object.defineProperty(globalThis, clave, { configurable: true, value: clave === "window" ? ventana : ventana[clave] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { act, createElement } = await import("react");
const { createRoot } = await import("react-dom/client");
const { getFunctionName } = await import("convex/server");
const { emparejarLote } = await import("../../lib/emparejar-unidad");

/**
 * LO QUE VE EL RESIDENTE EN LA WEB — Fase 3 de la auditoría de facturación
 * (docs/audits/FASE-3-FACTURACION.md).
 *
 *   · Un pago que la contabilidad todavía no refleja se ve "Pago en
 *     verificación", con su monto, y no se ofrece pagar otra vez.
 *   · El descuento por pronto pago se anuncia con SU fecha (el 15 del mes del
 *     período, o la del documento), no con la del vencimiento.
 *
 * Monta las páginas reales del portal con lo que devolvería `facturas.listMia`;
 * solo se simulan las respuestas del servidor y la fecha. Mismas
 * simulaciones que resumenResidente.test.mjs (comparten proceso).
 */

const bogota = (local) => Date.parse(`${local}:00-05:00`);
const AHORA = bogota("2026-10-08T10:00");

function vencimiento(periodo) {
  const [a, m] = periodo.split("-").map(Number);
  const sig = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
  return bogota(`${sig}-15T00:00`);
}

function factura(periodo, estado, totalAPagar, extra = {}) {
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
    lineas: [{ codigo: 2, concepto: "Administración", saldoAnterior: 0, actual: totalAPagar, total: totalAPagar }],
    unidadNumero: "101",
    unidadTipo: "casa",
    unidadTorre: null,
    ...extra,
  };
}

/** Agosto pagado por la pasarela; septiembre arrastra los $300.000 (la contabilidad no los aplicó). */
const CASA_PAGO_EN_VERIFICACION = [
  factura("2026-08", "pagada", 300_000),
  factura("2026-09", "pendiente", 600_000, { pagoEnVerificacion: { monto: 300_000, discrepancias: ["d1"] } }),
];

/** Septiembre de Ciudad del Campo: $380.000, con descuento $340.000. */
const CASA_CON_DESCUENTO = [factura("2026-09", "pendiente", 380_000, { totalConDescuento: 340_000 })];

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

const texto = () => contenedor.textContent.replace(/\s+/g, " ");
const botonesPagar = () => [...contenedor.querySelectorAll("button")].filter((b) => /^Pagar/.test(b.textContent.trim()));

describe("pago en verificación: no se cobra dos veces ni se llama mora", () => {
  test("'Mis facturas': 'Pago en verificación', el mensaje con el monto y ningún botón de pagar", async () => {
    await ver(MisFacturas, CASA_PAGO_EN_VERIFICACION, bogota("2026-10-20T10:00"));
    expect(texto()).toContain("Pago en verificación");
    expect(texto()).toContain("Tu pago de $ 300.000 está registrado; la contabilidad aún no lo refleja.");
    expect(texto()).not.toContain("Vencida");
    expect(botonesPagar()).toHaveLength(0);
  });

  test("inicio: la tarjeta dice 'Pago en verificación', no 'Total pendiente'", async () => {
    await ver(PortalInicio, CASA_PAGO_EN_VERIFICACION);
    expect(texto()).toContain("Pago en verificación");
    expect(texto()).not.toContain("Total pendiente:");
  });
});

describe("el descuento se anuncia con su fecha real (F-06)", () => {
  test("el 10 de septiembre: se cobra con descuento, hasta el 15 de septiembre", async () => {
    await ver(PortalInicio, CASA_CON_DESCUENTO, bogota("2026-09-10T10:00"));
    expect(texto()).toMatch(/Total pendiente: \$\s?340\.000/);
    expect(texto()).toContain("Con descuento hasta el 15 de septiembre de 2026");
    expect(texto()).not.toContain("Con descuento hasta el 15 de octubre");
  });

  test("el 8 de octubre: ya sin descuento (antes se seguía ofreciendo hasta el vencimiento)", async () => {
    await ver(PortalInicio, CASA_CON_DESCUENTO);
    expect(texto()).toMatch(/Total pendiente: \$\s?380\.000/);
    expect(texto()).toContain("Sin descuento (venció el 15 de septiembre de 2026)");
  });

  test("'Mis facturas' el 10 de septiembre: con descuento hasta el 15 de septiembre", async () => {
    await ver(MisFacturas, CASA_CON_DESCUENTO, bogota("2026-09-10T10:00"));
    expect(texto()).toContain("Con descuento hasta el 15 de septiembre de 2026");
  });
});

describe("emparejar: dos documentos con el mismo identificador", () => {
  const UNIDADES = [
    { _id: "u802", numero: "802" },
    { _id: "u803", numero: "803" },
  ];

  test("ninguno se queda con la unidad (antes: el primero sí y el segundo 'sin unidad')", () => {
    const r = emparejarLote(["802", "803", "802"], UNIDADES);
    expect(r.map((x) => x.unidadId)).toEqual([null, "u803", null]);
    expect(r[0]).toMatchObject({ repetido: true, detalle: "documento repetido en el PDF" });
    expect(r[2]).toMatchObject({ repetido: true });
  });

  test("sin repetidos, todo igual que antes", () => {
    expect(emparejarLote(["802", "803"], UNIDADES).map((x) => x.unidadId)).toEqual(["u802", "u803"]);
  });
});
