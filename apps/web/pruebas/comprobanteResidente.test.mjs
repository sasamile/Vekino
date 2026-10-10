import { afterEach, beforeEach, describe, expect, mock, setSystemTime, test } from "bun:test";
import { Window } from "happy-dom";
/* El navegador del residente no está en Colombia: con la zona de Tokio, una
 * fecha calculada con la hora LOCAL (y no la de Bogotá) cae en otro día. */
process.env.TZ = "Asia/Tokyo";
const ventana = new Window({ url: "http://localhost" });
for (const clave of ["window", "document", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "HTMLFormElement", "Event", "MouseEvent", "KeyboardEvent", "Node", "navigator", "SVGElement", "File", "Blob"]) Object.defineProperty(globalThis, clave, { configurable: true, value: clave === "window" ? ventana : ventana[clave] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { act, createElement } = await import("react");
const { createRoot } = await import("react-dom/client");
const { getFunctionName } = await import("convex/server");
const { MENSAJE_NO_PAGABLE } = await import("@vekino/backend/cartera");
const { MENSAJE_COMPROBANTE_GRANDE, MENSAJE_COMPROBANTE_TIPO, MENSAJE_COMPROBANTE_VACIO } = await import("@vekino/backend/comprobantes");

/**
 * EL RESIDENTE ENVÍA SU COMPROBANTE DESDE LA WEB — Hallazgo 1
 * (docs/audits/FALTANTES-WEB-FACTURACION.md).
 *
 * Páginas reales ("Mis facturas", el inicio y el layout del portal) y el
 * componente real, con el servidor simulado: Convex (`opcionesDePago`,
 * `listMios` y la acción `enviarMio`). El navegador ya no habla con el
 * bucket: `generateUploadUrl`, `crearMio`, XMLHttpRequest y `fetch` son
 * trampas que se anotan si alguien los usa.
 *
 *   · el botón sale con `debe`, aunque la pasarela no acepte la unidad, y no
 *     sale sin deuda, en revisión, con pago en verificación, con un
 *     comprobante pendiente, en una histórica, ni para quien no tiene un
 *     vínculo vigente con la unidad;
 *   · un envío = UNA llamada a `enviarMio` con el archivo, el monto, la fecha
 *     y la factura correctos, aunque se haga doble clic o se presione Enter
 *     varias veces;
 *   · nada se envía si el archivo está vacío, no es de un tipo permitido o
 *     pesa demasiado;
 *   · los rechazos del backend se muestran tal cual;
 *   · "Mis comprobantes" muestra pendiente, aprobado y rechazado con motivo, y
 *     se actualiza al enviar;
 *   · si una consulta falla, el componente se oculta y la página sigue; si
 *     falla la página, el portal muestra un mensaje contenido.
 *
 * Proceso propio: simula `convex/react` con respuestas que las demás suites
 * no conocen.
 */

const bogota = (local) => Date.parse(`${local}:00-05:00`);
/** El instante que recibe el backend por un día: el mediodía de Colombia, como el móvil. */
const mediodia = (dia) => Date.parse(`${dia}T12:00:00-05:00`);

function finDeMes(periodo) {
  const [a, m] = periodo.split("-").map(Number);
  return Date.UTC(a, m, 0, 5);
}

function factura(periodo, estado, totalAPagar, extra = {}) {
  return {
    _id: `f-${periodo}`,
    unidadId: "u101",
    numeroFactura: `FAC-${periodo}-101`,
    periodo,
    periodoLabel: periodo,
    estado,
    totalAPagar,
    saldoAFavor: 0,
    fechaVencimiento: finDeMes(periodo),
    lineas: [{ codigo: 2, concepto: "Administración", saldoAnterior: 0, actual: totalAPagar, total: totalAPagar }],
    unidadNumero: "101",
    unidadTipo: "casa",
    unidadTorre: null,
    ...extra,
  };
}

/* Mensajes estables del backend, copiados de su fuente. */
const MENSAJE_QA =
  "El pago en línea todavía no está habilitado: la pasarela está en modo de pruebas. Paga por los canales habituales del conjunto y, si quieres, envía el comprobante."; // lib/avalProduccion.ts
const MENSAJE_HISTORICA =
  "Ese comprobante debe ir con la factura vigente de la unidad: el saldo de esa factura ya quedó incluido en la más reciente."; // soportesPago.ts, MENSAJE_COMPROBANTE_HISTORICA
const MENSAJE_PENDIENTE = "Ya tienes un comprobante en revisión para esta factura."; // soportesPago.crearMio
const MENSAJE_FECHA = "La fecha del pago no es válida."; // soportesPago.validarMontoYFecha
const MENSAJE_SIN_VINCULO = "Esta factura no corresponde a una de sus unidades."; // pagos.armarDatosTrn

/**
 * El error tal cual lo entrega el cliente de Convex. La acción recibe los
 * rechazos de las reglas desde un `runQuery`/`runMutation`, así que llegan
 * envueltos dos veces.
 */
const crudo = (fn, mensaje) =>
  `[CONVEX A(${fn})] [Request ID: 9f0e1d2c3b4a5968] Server Error\nUncaught Error: Uncaught Error: ${mensaje}\n    at handler (../convex/soportesPago.ts:190:14)\n\n  Called by client`;

const PROHIBIDOS = ["Request ID", "Server Error", "CONVEX", "Uncaught", "at handler", ".ts:", "Called by client"];

const BUCKET = "https://vekino.s3.us-east-1.amazonaws.com";

/* `rechazos[nombre]`: el mensaje con que rechaza esa función. Si es una lista,
 * se consume uno por llamada (`null` = esa llamada pasa). */
let respuestas, consultas, llamadas, rechazos, puts, enviosEnEspera, retenerEnvio, reflejarEnLista, contenedor, root;

function rechazoPara(nombre) {
  const r = rechazos[nombre];
  return Array.isArray(r) ? r.shift() ?? null : r ?? null;
}

function soporte(id, facturaId, estado, extra = {}) {
  return {
    _id: id,
    facturaId,
    url: `${BUCKET}/condominios/soportes/condo-prueba/${id}.jpg`,
    mimeType: "image/jpeg",
    nota: null,
    monto: 380_000,
    fechaPago: mediodia("2026-09-10"),
    estado,
    notaRevision: null,
    revisadoAt: estado === "pendiente_revision" ? null : bogota("2026-09-12T09:00"),
    createdAt: bogota("2026-09-10T18:00"),
    ...extra,
  };
}

let rutaActual = "/mi/condo-prueba/cuenta";
mock.module("next/navigation", () => ({ useParams: () => ({ id: "condo-prueba" }), usePathname: () => rutaActual }));
mock.module("next/link", () => ({ default: ({ href, children, prefetch: _p, ...props }) => createElement("a", { ...props, href }, children) }));
/* El menú del portal consulta media aplicación: aquí solo importa que quede a la vista. */
mock.module("../components/portal/portal-shell", () => ({
  PortalShell: ({ children }) => createElement("div", { "data-portal-shell": "" }, createElement("nav", null, "Menú del portal"), children),
}));
mock.module("convex/react", () => ({
  useQuery: (fn, args) => {
    const nombre = getFunctionName(fn);
    consultas.push({ nombre, args });
    if (args === "skip") return undefined;
    const r = respuestas[nombre];
    return typeof r === "function" ? r(args) : r;
  },
  usePaginatedQuery: () => ({ results: [], status: "Exhausted", loadMore: () => {} }),
  useAction: (fn) => async (args) => {
    const nombre = getFunctionName(fn);
    llamadas.push({ nombre, args });
    if (nombre !== "soportesPago:enviarMio") {
      if (nombre === "files:generateUploadUrl") throw new Error("La web ya no debe pedir URL firmadas.");
      return { pagoId: "pago-prueba", redirectUrl: "https://pasarela.test" };
    }
    /* `enviarMio`: retenida si se pide, para ver qué pasa mientras sube. */
    if (retenerEnvio) await new Promise((r) => enviosEnEspera.push(r));
    const rechazo = rechazoPara(nombre);
    if (rechazo) throw new Error(rechazo.startsWith("Connection lost") ? rechazo : crudo(nombre, rechazo));
    const nuevo = soporte(`soporte-${llamadas.length}`, args.facturaId, "pendiente_revision", {
      url: `${BUCKET}/condominios/soportes/${args.condominioId}/1791565200000-a1b2c3d4-${args.nombreArchivo}`,
      mimeType: "application/pdf",
      nota: args.nota ?? null,
      monto: args.monto,
      fechaPago: args.fechaPago,
      createdAt: Date.now(),
    });
    /* Lo que hace Convex: la consulta suscrita trae el nuevo. */
    if (reflejarEnLista) respuestas["soportesPago:listMios"] = [nuevo, ...(respuestas["soportesPago:listMios"] ?? [])];
    return nuevo._id;
  },
  useMutation: (fn) => async (args) => {
    llamadas.push({ nombre: getFunctionName(fn), args });
    return null;
  },
}));

/* Trampas: la web no habla con el bucket. */
globalThis.XMLHttpRequest = class {
  open(metodo, url) {
    puts.push({ metodo, url });
  }
  setRequestHeader() {}
  send() {}
};
globalThis.fetch = async (url) => {
  puts.push({ metodo: "fetch", url });
  throw new Error(`Red cerrada en la prueba: fetch(${url})`);
};

const { default: MisFacturas } = await import("../app/mi/[id]/cuenta/page");
const { default: PortalInicio } = await import("../app/mi/[id]/page");
const { default: PortalLayout } = await import("../app/mi/[id]/layout");
const { ComprobantePago } = await import("../components/portal/comprobante-pago");
const comprobante = await import("../lib/comprobante-pago");

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

beforeEach(() => {
  respuestas = {};
  consultas = [];
  llamadas = [];
  rechazos = {};
  puts = [];
  enviosEnEspera = [];
  retenerEnvio = false;
  reflejarEnLista = true;
  contenedor = document.createElement("div");
  document.body.append(contenedor);
  root = createRoot(contenedor);
});
afterEach(async () => {
  await act(() => root.unmount());
  contenedor.remove();
  setSystemTime();
});

const SEPTIEMBRE = factura("2026-09", "pendiente", 380_000);
const DEBE_QA = { debe: true, pasarela: false, motivo: MENSAJE_QA };

/**
 * Monta una página con lo que respondería el servidor. `opciones` es lo que
 * dice `opcionesDePago` (o una función por factura); `soportes`, `listMios`.
 */
async function ver(Pagina, { facturas = [SEPTIEMBRE], ahora = bogota("2026-09-20T10:00"), opciones = DEBE_QA, soportes = [], avalPortalUrl = null, conLayout = false } = {}) {
  setSystemTime(new Date(ahora));
  respuestas = {
    "facturas:listMia": facturas,
    "portal:home": { ...home, condominio: { ...home.condominio, avalPortalUrl } },
    "portal:misActividades": { reservasActivas: [], ticketsAbiertos: 0 },
    "comunicados:listRecent": [],
    "pagos:opcionesDePago": opciones,
    "soportesPago:listMios": soportes,
  };
  const pagina = createElement(Pagina);
  await act(() => root.render(conLayout ? createElement(PortalLayout, null, pagina) : pagina));
}

/** Lo que entrega el cliente de Convex cuando el backend desplegado no tiene la función. */
const consultaQueFalla = (fn) => () => {
  throw new Error(`[CONVEX Q(${fn})] [Request ID: 1a2b3c] Server Error\nCould not find public function for '${fn}'. Did you forget to run \`npx convex dev\`?`);
};

/** El componente solo, para una factura. */
async function verComponente({ f = SEPTIEMBRE, vigente = true, ahora = bogota("2026-09-20T10:00"), opciones = DEBE_QA, soportes = [] } = {}) {
  setSystemTime(new Date(ahora));
  respuestas = { "pagos:opcionesDePago": opciones, "soportesPago:listMios": soportes };
  await act(() => root.render(createElement(ComprobantePago, { condominioId: "condo-prueba", factura: f, vigente })));
}

const texto = () => contenedor.textContent.replace(/[\s ]+/g, " ");
const botones = () => [...contenedor.querySelectorAll("button")];
const botonesComprobante = () => botones().filter((b) => b.textContent.includes("Ya pagué, enviar comprobante"));
const botonEnviar = () => botones().find((b) => /^(Enviar comprobante|Enviando…)$/.test(b.textContent.trim()));
const alerta = () => contenedor.querySelector('[role="alert"]')?.textContent ?? null;
const llamadasA = (nombre) => llamadas.filter((l) => l.nombre === nombre);
const consultasA = (nombre) => consultas.filter((c) => c.nombre === nombre && c.args !== "skip");
const esperar = () => act(async () => await new Promise((r) => setTimeout(r, 0)));
async function asentar(veces = 6) {
  for (let i = 0; i < veces; i++) await esperar();
}

async function abrirFormulario() {
  const [boton] = botonesComprobante();
  expect(boton).toBeTruthy();
  await act(async () => boton.click());
  expect(contenedor.querySelector("form")).not.toBeNull();
}

/** Escribe como el usuario: React solo ve el cambio por el setter nativo + `input`. */
async function escribir(selector, valor) {
  const el = contenedor.querySelector(selector);
  expect(el).not.toBeNull();
  const proto = el.tagName === "TEXTAREA" ? ventana.HTMLTextAreaElement.prototype : ventana.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  await act(() => {
    setter.call(el, valor);
    el.dispatchEvent(new ventana.Event("input", { bubbles: true }));
  });
}

async function elegirArchivo(archivo, { camara = false } = {}) {
  const input = contenedor.querySelector(camara ? 'input[type="file"][capture]' : 'input[type="file"]:not([capture])');
  expect(input).not.toBeNull();
  Object.defineProperty(input, "files", { configurable: true, value: [archivo] });
  await act(async () => input.dispatchEvent(new ventana.Event("change", { bubbles: true })));
}

async function enviarFormulario() {
  const boton = botonEnviar();
  expect(boton).toBeTruthy();
  expect(boton.disabled).toBe(false);
  await act(async () => boton.click());
  await asentar();
}

const bytes = (n) => new Uint8Array(n).fill(7);
const pdf = (nombre = "comprobante.pdf", tamano = 2_048) => new File([bytes(tamano)], nombre, { type: "application/pdf" });
const foto = (nombre = "foto.jpg", tamano = 2_048, tipo = "image/jpeg") => new File([bytes(tamano)], nombre, { type: tipo });

/** Llena el formulario abierto con datos válidos. */
async function llenar({ monto = "150.000", fecha, archivo = pdf(), nota } = {}) {
  if (monto !== undefined) await escribir('input[name="monto"]', monto);
  if (fecha !== undefined) await escribir('input[name="fecha"]', fecha);
  if (archivo) await elegirArchivo(archivo);
  if (nota !== undefined) await escribir('textarea[name="nota"]', nota);
}

/** El navegador nunca habla con el bucket ni registra por su cuenta. */
function sinCaminoViejo() {
  expect(llamadasA("files:generateUploadUrl")).toHaveLength(0);
  expect(puts).toHaveLength(0);
  expect(llamadasA("soportesPago:crearMio")).toHaveLength(0);
}

/** Nada salió: ni la acción ni el camino viejo. */
function nadaSubido() {
  expect(llamadasA("soportesPago:enviarMio")).toHaveLength(0);
  sinCaminoViejo();
}

const enviados = () => llamadasA("soportesPago:enviarMio");

// ─────────────────────────────────────────────────────────────────────────────

describe("Visibilidad del botón · la decide el backend", () => {
  test("aparece con debe:true aunque la pasarela no acepte la unidad, en 'Mis facturas' y en el inicio", async () => {
    await ver(MisFacturas);
    expect(botonesComprobante()).toHaveLength(1);
    /* "Pagar" no se ofrece (pasarela en QA, sin portal del banco): solo el comprobante. */
    expect(botones().filter((b) => /Pagar/.test(b.textContent))).toHaveLength(0);
    expect(texto()).toContain(MENSAJE_QA);
    expect(consultasA("pagos:opcionesDePago").every((c) => c.args.facturaId === "f-2026-09")).toBe(true);

    await act(() => root.unmount());
    root = createRoot(contenedor);
    await ver(PortalInicio);
    expect(botonesComprobante()).toHaveLength(1);
  });

  test("con la pasarela aceptando, también (no depende de 'pasarela')", async () => {
    await ver(MisFacturas, { opciones: { debe: true, pasarela: true, motivo: null } });
    expect(botonesComprobante()).toHaveLength(1);
  });

  test("no aparece con debe:false (sin saldo), ni mientras el servidor no ha respondido", async () => {
    await ver(MisFacturas, { opciones: { debe: false, pasarela: false, motivo: MENSAJE_NO_PAGABLE.sin_saldo } });
    expect(botonesComprobante()).toHaveLength(0);
    /* Cargando: `useQuery` devuelve undefined. */
    await ver(MisFacturas, { opciones: () => undefined });
    expect(botonesComprobante()).toHaveLength(0);
    await ver(MisFacturas, { soportes: () => undefined });
    expect(botonesComprobante()).toHaveLength(0);
  });

  test("no aparece en una factura en revisión", async () => {
    const enRevision = factura("2026-09", "pendiente", 380_000, { lecturaDudosa: { motivos: ["El total no cuadra con las líneas."] } });
    for (const Pagina of [MisFacturas, PortalInicio]) {
      await ver(Pagina, { facturas: [enRevision], opciones: { debe: false, pasarela: false, motivo: MENSAJE_NO_PAGABLE.en_revision } });
      expect(botonesComprobante()).toHaveLength(0);
    }
  });

  test("no aparece con un pago en verificación", async () => {
    const enVerificacion = factura("2026-09", "pendiente", 600_000, { pagoEnVerificacion: { monto: 300_000 } });
    for (const Pagina of [MisFacturas, PortalInicio]) {
      await ver(Pagina, { facturas: [enVerificacion], opciones: { debe: false, pasarela: false, motivo: MENSAJE_NO_PAGABLE.pago_en_verificacion } });
      expect(botonesComprobante()).toHaveLength(0);
    }
  });

  test("no aparece con un comprobante pendiente para esa factura: se ve 'Pendiente de revisión'", async () => {
    for (const Pagina of [MisFacturas, PortalInicio]) {
      await ver(Pagina, { soportes: [soporte("s1", "f-2026-09", "pendiente_revision")] });
      expect(botonesComprobante()).toHaveLength(0);
      expect(texto()).toContain("Pendiente de revisión");
    }
  });

  test("un comprobante pendiente de OTRA factura no lo oculta", async () => {
    await ver(MisFacturas, { soportes: [soporte("s1", "f-2026-08", "pendiente_revision")] });
    expect(botonesComprobante()).toHaveLength(1);
  });

  test("no aparece en una factura histórica: ni se le pregunta al servidor por ella", async () => {
    const agosto = factura("2026-08", "vencida", 300_000);
    const sept = factura("2026-09", "pendiente", 680_000);
    await ver(MisFacturas, {
      facturas: [sept, agosto],
      opciones: ({ facturaId }) =>
        facturaId === "f-2026-09" ? DEBE_QA : { debe: false, pasarela: false, motivo: MENSAJE_NO_PAGABLE.historica },
    });
    expect(botonesComprobante()).toHaveLength(1);
    const filaAgosto = [...contenedor.querySelectorAll("#facturas .rounded-lg")].find((f) => /agosto/i.test(f.textContent));
    expect(filaAgosto.textContent).not.toContain("Ya pagué");
    expect(consultasA("pagos:opcionesDePago").map((c) => c.args.facturaId)).not.toContain("f-2026-08");
  });

  test("y si la pantalla la creyera vigente, el backend dice que no se debe: tampoco aparece", async () => {
    await verComponente({ f: factura("2026-08", "vencida", 300_000), opciones: { debe: false, pasarela: false, motivo: MENSAJE_NO_PAGABLE.historica } });
    expect(botonesComprobante()).toHaveLength(0);
  });

  test("arrendataria con el contrato vencido: no ve la factura, y aun con ella delante no hay botón", async () => {
    /* Lo que le responde el backend: `listMia` y `listMios` vacíos (F-16) y
     * `opcionesDePago` sin deuda, porque su vínculo no está vigente. */
    const sinVinculo = { debe: false, pasarela: false, motivo: MENSAJE_SIN_VINCULO };
    await ver(MisFacturas, { facturas: [], opciones: sinVinculo, soportes: [] });
    expect(botonesComprobante()).toHaveLength(0);
    await ver(PortalInicio, { facturas: [], opciones: sinVinculo, soportes: [] });
    expect(botonesComprobante()).toHaveLength(0);
    await verComponente({ opciones: sinVinculo, soportes: [] });
    expect(botonesComprobante()).toHaveLength(0);
    expect(contenedor.textContent).toBe("");
  });

  test("vecino de otra casa: botón para la suya, ninguno para la factura de la 101", async () => {
    const suya = factura("2026-09", "pendiente", 380_000, { _id: "f-2026-09-202", unidadId: "u202", unidadNumero: "202" });
    await ver(MisFacturas, {
      facturas: [suya],
      opciones: ({ facturaId }) => (facturaId === "f-2026-09-202" ? DEBE_QA : { debe: false, pasarela: false, motivo: MENSAJE_SIN_VINCULO }),
    });
    expect(botonesComprobante()).toHaveLength(1);
    await verComponente({ f: SEPTIEMBRE, opciones: { debe: false, pasarela: false, motivo: MENSAJE_SIN_VINCULO } });
    expect(botonesComprobante()).toHaveLength(0);
  });
});

describe("Envío · una sola llamada a enviarMio, con el archivo", () => {
  test("envío correcto desde 'Mis facturas': enviarMio con archivo, monto, fecha, nota y factura; nunca la URL firmada ni el PUT", async () => {
    await ver(MisFacturas);
    await abrirFormulario();
    /* La sugerencia: lo que se cobra hoy, en formato colombiano; y hoy en Colombia. */
    expect(contenedor.querySelector('input[name="monto"]').value).toBe("380.000");
    /* En el celular, el teclado numérico. */
    expect(contenedor.querySelector('input[name="monto"]').getAttribute("inputmode")).toBe("numeric");
    expect(contenedor.querySelector('input[name="fecha"]').value).toBe("2026-09-20");
    expect(contenedor.querySelector('input[name="fecha"]').getAttribute("max")).toBe("2026-09-20");

    const archivo = pdf("Comprobante PSE.pdf");
    await llenar({ monto: "150.000", fecha: "2026-09-18", archivo, nota: "Pagué por PSE" });
    expect(texto()).toContain("Vas a declarar $ 150.000");
    await enviarFormulario();

    expect(llamadas.map((l) => l.nombre)).toEqual(["soportesPago:enviarMio"]);
    sinCaminoViejo();
    const { archivo: enviado, ...datos } = enviados()[0].args;
    expect(datos).toEqual({
      condominioId: "condo-prueba",
      facturaId: "f-2026-09",
      monto: 150_000,
      fechaPago: mediodia("2026-09-18"),
      nombreArchivo: "Comprobante PSE.pdf",
      nota: "Pagué por PSE",
    });
    /* Los bytes del archivo, tal cual; ni carpeta, ni URL, ni tipo: los decide el backend. */
    expect(enviado).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(enviado)).toEqual(new Uint8Array(await archivo.arrayBuffer()));

    /* Sin recargar: el estado aparece y el botón se va. */
    expect(contenedor.querySelector("form")).toBeNull();
    expect(botonesComprobante()).toHaveLength(0);
    expect(texto()).toContain("Comprobante enviado. La administración lo revisará y te confirmará el pago.");
    expect(texto()).toContain("Pendiente de revisión");
    expect(texto()).toContain("$ 150.000");
    expect(texto()).toContain("Pagado el 18 de septiembre de 2026");
  });

  test("desde el inicio, el mismo componente: una llamada y el estado aparece", async () => {
    await ver(PortalInicio);
    await abrirFormulario();
    await llenar({ archivo: foto("pago.png", 4_096, "image/png") });
    await enviarFormulario();
    expect(enviados()).toHaveLength(1);
    expect(enviados()[0].args).toMatchObject({ facturaId: "f-2026-09", monto: 150_000, nombreArchivo: "pago.png" });
    sinCaminoViejo();
    expect(botonesComprobante()).toHaveLength(0);
    expect(texto()).toContain("Pendiente de revisión");
  });

  test("sin nota no se manda 'nota'; un archivo sin tipo pasa la ayuda por su extensión, y el tipo no viaja: lo detecta el backend", async () => {
    await verComponente();
    await abrirFormulario();
    await llenar({ archivo: new File([bytes(512)], "extracto.PDF", { type: "" }) });
    await enviarFormulario();
    const args = enviados()[0].args;
    expect(args.nombreArchivo).toBe("extracto.PDF");
    expect(args.archivo.byteLength).toBe(512);
    expect("mimeType" in args).toBe(false);
    expect("nota" in args).toBe(false);
  });

  test("'Tomar foto' abre la cámara (capture) y la foto se envía", async () => {
    await verComponente();
    await abrirFormulario();
    const camara = contenedor.querySelector('input[type="file"][capture]');
    expect(camara.getAttribute("capture")).toBe("environment");
    expect(camara.getAttribute("accept")).toBe("image/*");
    const archivo = contenedor.querySelector('input[type="file"]:not([capture])');
    expect(archivo.getAttribute("accept")).toBe("image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf");
    await llenar({ archivo: null });
    await elegirArchivo(foto("image.jpg", 3_000_000), { camara: true });
    await enviarFormulario();
    expect(enviados()).toHaveLength(1);
    expect(enviados()[0].args).toMatchObject({ nombreArchivo: "image.jpg" });
    expect(enviados()[0].args.archivo.byteLength).toBe(3_000_000);
  });

  test("si la lista todavía no trae el nuevo, el botón no reaparece: se ve 'Pendiente de revisión'", async () => {
    reflejarEnLista = false;
    await verComponente();
    await abrirFormulario();
    await llenar();
    await enviarFormulario();
    expect(enviados()).toHaveLength(1);
    expect(botonesComprobante()).toHaveLength(0);
    expect(texto()).toContain("Pendiente de revisión");
  });
});

describe("Monto · formato colombiano", () => {
  test("'150.000' llega como 150000 (y no como 150)", async () => {
    await verComponente();
    await abrirFormulario();
    await llenar({ monto: "150.000" });
    await enviarFormulario();
    expect(enviados()[0].args.monto).toBe(150_000);
  });

  test("lectura del monto: miles con punto, símbolo, centavos en cero; lo ambiguo se rechaza", () => {
    const { leerMontoCOP } = comprobante;
    for (const [escrito, monto] of [["150.000", 150_000], ["150000", 150_000], ["$ 150.000", 150_000], ["$ 150.000", 150_000], ["150.000,00", 150_000], ["150,000", 150_000], ["1.250.000", 1_250_000]]) {
      expect(leerMontoCOP(escrito)).toEqual({ ok: true, monto });
    }
    /* El móvil quita todo lo que no es dígito: "150.000,00" le da 15.000.000. */
    for (const escrito of ["150.000,50", "1.5", "15.00", "150.00.0", "15O.000", "", "0", "-150.000"]) {
      expect(leerMontoCOP(escrito).ok).toBe(false);
    }
  });

  test("con centavos o vacío: mensaje claro y nada se sube", async () => {
    await verComponente();
    await abrirFormulario();
    await llenar({ monto: "150.000,50" });
    await enviarFormulario();
    expect(alerta()).toBe("Escribe el monto en pesos, sin centavos.");
    await escribir('input[name="monto"]', "");
    await enviarFormulario();
    expect(alerta()).toBe("Escribe cuánto pagaste.");
    nadaSubido();
    /* Cancelar cierra el formulario y se lleva el error. */
    await act(async () => botones().find((b) => b.textContent.trim() === "Cancelar").click());
    expect(contenedor.querySelector("form")).toBeNull();
    expect(alerta()).toBeNull();
    expect(botonesComprobante()).toHaveLength(1);
  });
});

describe("Fecha · el día de Colombia", () => {
  test("la prueba corre en otra zona horaria (Tokio)", () => {
    expect(new Date(Date.UTC(2026, 9, 10, 4)).getHours()).toBe(13);
  });

  test("hoy a las 23:00 de Bogotá: el selector ofrece hoy (no mañana) y no se rechaza como futura", async () => {
    const ahora = bogota("2026-10-09T23:00"); // 04:00 del 10 en UTC, 13:00 del 10 en Tokio
    await verComponente({ f: factura("2026-10", "pendiente", 380_000), ahora });
    await abrirFormulario();
    const fecha = contenedor.querySelector('input[name="fecha"]');
    expect(fecha.value).toBe("2026-10-09");
    expect(fecha.getAttribute("max")).toBe("2026-10-09");
    await llenar({ archivo: foto() });
    await enviarFormulario();
    expect(alerta()).toBeNull();
    const { fechaPago } = enviados()[0].args;
    expect(fechaPago).toBe(mediodia("2026-10-09"));
    expect(fechaPago).toBeLessThanOrEqual(Date.now());
  });

  test("una fecha futura escrita a mano no se acepta y nada se sube", async () => {
    await verComponente({ f: factura("2026-10", "pendiente", 380_000), ahora: bogota("2026-10-09T23:00") });
    await abrirFormulario();
    await llenar({ fecha: "2026-10-10" });
    await enviarFormulario();
    expect(alerta()).toBe("La fecha del pago no puede ser posterior a hoy.");
    nadaSubido();
  });

  test("lectura de la fecha: mediodía de Colombia, fechas inexistentes y vacías", () => {
    const { leerFechaPago, hoyEnBogota } = comprobante;
    const ahora = bogota("2026-10-09T23:00");
    expect(hoyEnBogota(ahora)).toBe("2026-10-09");
    expect(hoyEnBogota(bogota("2026-10-10T00:30"))).toBe("2026-10-10");
    expect(leerFechaPago("2026-10-09", ahora)).toEqual({ ok: true, fechaPago: mediodia("2026-10-09") });
    /* `Date.parse` corre el 31 de febrero al 3 de marzo; aquí se rechaza. */
    expect(leerFechaPago("2026-02-31", ahora).ok).toBe(false);
    expect(leerFechaPago("", ahora)).toEqual({ ok: false, error: "Elige el día en que pagaste." });
    expect(leerFechaPago("2026-10-10", ahora)).toEqual({ ok: false, error: "La fecha del pago no puede ser posterior a hoy." });
  });
});

describe("Rechazos del backend · el mensaje tal cual", () => {
  for (const [caso, mensaje] of [
    ["factura histórica", MENSAJE_HISTORICA],
    ["ya hay uno pendiente", MENSAJE_PENDIENTE],
    ["fecha futura", MENSAJE_FECHA],
    ["archivo que no es lo que dice (tipo por contenido)", MENSAJE_COMPROBANTE_TIPO],
    ["archivo vacío según el backend", MENSAJE_COMPROBANTE_VACIO],
    ["archivo de más de 10 MB según el backend", MENSAJE_COMPROBANTE_GRANDE],
  ]) {
    test(`${caso}: se muestra el mensaje estable, sin el envoltorio de Convex, y el botón vuelve`, async () => {
      rechazos["soportesPago:enviarMio"] = mensaje;
      await verComponente();
      await abrirFormulario();
      await llenar();
      await enviarFormulario();
      expect(alerta()).toBe(mensaje);
      for (const p of PROHIBIDOS) expect(contenedor.textContent).not.toContain(p);
      expect(botonEnviar().disabled).toBe(false);
      expect(botonEnviar().textContent.trim()).toBe("Enviar comprobante");
      expect(enviados()).toHaveLength(1);
      sinCaminoViejo();
    });
  }

  test("si se cae la conexión, se dice y se puede reintentar", async () => {
    rechazos["soportesPago:enviarMio"] = ["Connection lost while action was in flight", null];
    await verComponente();
    await abrirFormulario();
    await llenar();
    await enviarFormulario();
    expect(alerta()).toBe(
      "Se perdió la conexión al guardar. Espera un momento e intenta de nuevo; si ya quedó creado, no lo vuelvas a crear.",
    );
    expect(botonEnviar().disabled).toBe(false);
    /* El reintento sí sale: el candado contra el doble envío se soltó. */
    await enviarFormulario();
    expect(enviados()).toHaveLength(2);
    expect(botonesComprobante()).toHaveLength(0);
    expect(texto()).toContain("Pendiente de revisión");
  });
});

describe("Doble clic y Enter repetido · un solo envío", () => {
  test("dos clics seguidos (antes del siguiente render): una sola llamada a enviarMio", async () => {
    await verComponente();
    await abrirFormulario();
    await llenar();
    const boton = botonEnviar();
    await act(async () => {
      boton.click();
      boton.click();
    });
    await asentar();
    expect(enviados()).toHaveLength(1);
    sinCaminoViejo();
  });

  test("Enter varias veces y clics mientras envía: deshabilitado, y al final una sola llamada", async () => {
    retenerEnvio = true;
    await verComponente();
    await abrirFormulario();
    await llenar();
    const form = contenedor.querySelector("form");
    const enter = () => form.dispatchEvent(new ventana.Event("submit", { bubbles: true, cancelable: true }));
    await act(async () => {
      enter();
      enter();
    });
    await asentar();
    expect(enviados()).toHaveLength(1);
    /* Mientras envía: "Enviando…", deshabilitado; más Enter y más clics no hacen nada. */
    expect(botonEnviar().textContent.trim()).toBe("Enviando…");
    expect(botonEnviar().disabled).toBe(true);
    expect(texto()).toContain("Subiendo el comprobante.");
    await act(async () => {
      enter();
      botonEnviar().click();
    });
    await asentar();
    expect(enviados()).toHaveLength(1);

    await act(async () => enviosEnEspera.splice(0).forEach((seguir) => seguir()));
    await asentar();
    expect(enviados()).toHaveLength(1);
    expect(botonesComprobante()).toHaveLength(0);
    expect(texto()).toContain("Pendiente de revisión");
    sinCaminoViejo();
  });
});

describe("Límites de archivo · ayuda antes de enviar nada", () => {
  const LIMITE = 10 * 1024 * 1024;

  for (const [caso, archivo, mensaje] of [
    ["vacío", () => new File([], "vacio.jpg", { type: "image/jpeg" }), "El archivo está vacío. Elige otra foto o el PDF del comprobante."],
    ["HEIC", () => foto("IMG_0001.HEIC", 2_048, "image/heic"), "Las fotos HEIC no se pueden revisar en la web. Usa «Tomar foto» o envía una captura de pantalla (JPG o PNG)."],
    ["Word", () => new File([bytes(2_048)], "pago.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), "Formato no permitido. Envía una foto JPG, PNG o WebP, o un PDF."],
    ["GIF", () => foto("pago.gif", 2_048, "image/gif"), "Formato no permitido. Envía una foto JPG, PNG o WebP, o un PDF."],
    ["demasiado grande", () => foto("enorme.jpg", LIMITE + 1), "El archivo pesa 10,1 MB y el máximo es 10 MB. Envía una foto más liviana o una captura de pantalla."],
  ]) {
    test(`${caso}: mensaje claro y ningún envío`, async () => {
      await verComponente();
      await abrirFormulario();
      await llenar({ archivo: archivo() });
      expect(alerta()).toBe(mensaje);
      await enviarFormulario();
      expect(alerta()).toBe("Elige la foto o el PDF del comprobante.");
      nadaSubido();
    });
  }

  test("justo 10 MB sí se envía", async () => {
    await verComponente();
    await abrirFormulario();
    await llenar({ archivo: foto("limite.jpg", LIMITE) });
    expect(alerta()).toBeNull();
    await enviarFormulario();
    expect(enviados()).toHaveLength(1);
    expect(enviados()[0].args.archivo.byteLength).toBe(LIMITE);
  });
});

describe("Mis comprobantes · desde listMios", () => {
  test("muestra pendiente, aprobado y rechazado con su motivo, monto y fecha", async () => {
    await verComponente({
      soportes: [
        soporte("s3", "f-2026-09", "pendiente_revision", { monto: 80_000, fechaPago: mediodia("2026-09-19") }),
        soporte("s2", "f-2026-09", "aprobado", { monto: 300_000, fechaPago: mediodia("2026-09-15") }),
        soporte("s1", "f-2026-09", "rechazado", { monto: 380_000, notaRevision: "El valor no coincide con el extracto." }),
        soporte("s0", "f-2026-08", "aprobado", { monto: 999_000 }),
      ],
    });
    const t = texto();
    expect(t).toContain("Mis comprobantes");
    expect(t).toContain("Pendiente de revisión");
    expect(t).toContain("$ 80.000");
    expect(t).toContain("Pagado el 19 de septiembre de 2026");
    expect(t).toContain("Aprobado");
    expect(t).toContain("$ 300.000");
    expect(t).toContain("Tu pago quedó registrado.");
    expect(t).toContain("Rechazado");
    expect(t).toContain("Motivo: El valor no coincide con el extracto.");
    /* Solo los de esta factura. */
    expect(t).not.toContain("$ 999.000");
    expect(contenedor.querySelectorAll("li")).toHaveLength(3);
    /* Cada uno con su archivo. */
    expect([...contenedor.querySelectorAll("a")].filter((a) => a.textContent.trim() === "Ver archivo").map((a) => a.getAttribute("href"))).toEqual(
      ["s3", "s2", "s1"].map((id) => `${BUCKET}/condominios/soportes/condo-prueba/${id}.jpg`),
    );
    /* Con uno pendiente, no se ofrece otro. */
    expect(botonesComprobante()).toHaveLength(0);
  });

  test("rechazado: ve el motivo y, si el backend sigue diciendo que debe, puede volver a enviar", async () => {
    await verComponente({ soportes: [soporte("s1", "f-2026-09", "rechazado", { notaRevision: "Ilegible." })] });
    expect(texto()).toContain("Motivo: Ilegible. Puedes enviar uno nuevo.");
    expect(botonesComprobante()).toHaveLength(1);
    await abrirFormulario();
    await llenar();
    await enviarFormulario();
    expect(enviados()).toHaveLength(1);
    expect(botonesComprobante()).toHaveLength(0);
    const t = texto();
    expect(t).toContain("Pendiente de revisión");
    expect(t).toContain("Rechazado");
  });

  test("rechazado sin motivo escrito, y ya sin deuda: no se ofrece reenviar", async () => {
    await verComponente({
      opciones: { debe: false, pasarela: false, motivo: MENSAJE_NO_PAGABLE.pagada },
      soportes: [soporte("s1", "f-2026-09", "rechazado")],
    });
    expect(texto()).toContain("Motivo: la administración no lo indicó.");
    expect(texto()).not.toContain("Puedes enviar uno nuevo.");
    expect(botonesComprobante()).toHaveLength(0);
  });

  test("una histórica con su comprobante aprobado lo sigue mostrando en 'Mis facturas'", async () => {
    const agosto = factura("2026-08", "pagada", 300_000);
    const sept = factura("2026-09", "pendiente", 380_000);
    await ver(MisFacturas, {
      facturas: [sept, agosto],
      soportes: [soporte("s1", "f-2026-08", "aprobado", { monto: 300_000 })],
    });
    const filaAgosto = [...contenedor.querySelectorAll("#facturas .rounded-lg")].find((f) => /agosto/i.test(f.textContent));
    expect(filaAgosto.textContent).toContain("Aprobado");
    expect(filaAgosto.textContent).not.toContain("Ya pagué");
    expect(botonesComprobante()).toHaveLength(1);
  });
});

describe("Fallas de consulta · contenidas, sin tumbar la página", () => {
  /* React avisa por consola cada error que recoge un borde: aquí es lo esperado. */
  let consolaError;
  beforeEach(() => {
    consolaError = console.error;
    console.error = () => {};
  });
  afterEach(() => {
    console.error = consolaError;
  });

  test("si opcionesDePago falla, el comprobante se oculta y la factura y la página siguen, en 'Mis facturas' y en el inicio", async () => {
    await ver(MisFacturas, { opciones: consultaQueFalla("pagos:opcionesDePago") });
    expect(texto()).toContain("Mis facturas");
    expect(texto()).toContain("Septiembre de 2026");
    expect(texto()).toContain("FAC-2026-09-101");
    expect(botonesComprobante()).toHaveLength(0);
    /* Sin portal del banco, los botones de pago consultan lo mismo: queda una nota en su lugar. */
    expect(texto()).toContain("No se pudo consultar el pago en línea. Intenta más tarde.");

    await ver(PortalInicio, { opciones: consultaQueFalla("pagos:opcionesDePago") });
    expect(texto()).toContain("Hola, Residente");
    expect(texto()).toContain("Total pendiente");
    expect(texto()).toContain("Facturas recientes");
    expect(botonesComprobante()).toHaveLength(0);
  });

  test("con el portal del banco, 'Pagar' sigue y solo se oculta el comprobante", async () => {
    await ver(MisFacturas, { opciones: consultaQueFalla("pagos:opcionesDePago"), avalPortalUrl: "https://banco.test/portal" });
    expect(botones().filter((b) => /Pagar/.test(b.textContent)).length).toBeGreaterThan(0);
    expect(botonesComprobante()).toHaveLength(0);
    expect(texto()).not.toContain("No se pudo consultar el pago en línea.");
  });

  test("si listMios falla, el comprobante se oculta y la página sigue", async () => {
    await ver(MisFacturas, { soportes: consultaQueFalla("soportesPago:listMios") });
    expect(texto()).toContain("Septiembre de 2026");
    expect(texto()).toContain(MENSAJE_QA);
    expect(botonesComprobante()).toHaveLength(0);
  });

  test("si la página entera falla, el portal muestra un mensaje contenido con el menú a la vista, y 'Reintentar' vuelve a intentar", async () => {
    await ver(MisFacturas, { facturas: consultaQueFalla("facturas:listMia"), conLayout: true });
    const aviso = contenedor.querySelector('[role="alert"]');
    expect(aviso?.textContent).toContain("No se pudo cargar esta sección");
    expect(texto()).toContain("Menú del portal");
    for (const p of PROHIBIDOS) expect(contenedor.textContent).not.toContain(p);

    respuestas["facturas:listMia"] = [SEPTIEMBRE];
    await act(async () => botones().find((b) => b.textContent.trim() === "Reintentar").click());
    expect(contenedor.querySelector('[role="alert"]')).toBeNull();
    expect(texto()).toContain("Mis facturas");
    expect(botonesComprobante()).toHaveLength(1);
  });

  test("el aviso no se queda pegado: al cambiar de página, el portal vuelve a intentar", async () => {
    await ver(MisFacturas, { facturas: consultaQueFalla("facturas:listMia"), conLayout: true });
    expect(contenedor.querySelector('[role="alert"]')?.textContent).toContain("No se pudo cargar esta sección");
    respuestas["facturas:listMia"] = [SEPTIEMBRE];
    rutaActual = "/mi/condo-prueba";
    try {
      await act(() => root.render(createElement(PortalLayout, null, createElement(PortalInicio))));
      expect(contenedor.querySelector('[role="alert"]')).toBeNull();
      expect(texto()).toContain("Hola, Residente");
    } finally {
      rutaActual = "/mi/condo-prueba/cuenta";
    }
  });
});
