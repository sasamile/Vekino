import {
  TOLERANCIA_CUADRE,
  etiquetaDePeriodo,
  leerMontoArboleda,
  leerMontoCdc,
  motivosValidos,
  normalizarPeriodo,
  validarLectura,
  type MotivoLectura,
} from "@vekino/backend/lecturaFactura";

/**
 * Lectura de las cuentas de cobro: del texto de cada página a facturas.
 *
 * Es código puro —sin PDF, sin S3, sin sesión— para poder probarlo con los
 * documentos reales del corpus y usarlo igual en la vista previa
 * (`upload/route.ts`) y en la confirmación (`confirmar/route.ts`).
 *
 * ── Qué cambió (Fase 2 de la auditoría de facturación) ──────────────────
 * Antes los montos se leían sin signo, las filas de crédito se ignoraban y un
 * total que no se encontraba quedaba en $0: un saldo a favor de $262.000 se
 * guardaba como "debe $0" y la conciliación lo declaraba vencida. Ahora:
 *
 *   · los montos se leen con signo (`-760.000.00` en Ciudad del Campo,
 *     `(376,000)` en Arboleda);
 *   · entran las filas de crédito (`CI`, `NCC`);
 *   · el saldo anterior real es el de la fila "Totales";
 *   · cada factura se valida: Σ líneas = total, Totales = "Pague sin
 *     descuento", saldo anterior de las líneas = el de Totales, período
 *     legible. Lo que no cuadra sale con `motivos` (lectura dudosa), nunca
 *     como factura válida sin aviso.
 */

export type Formato = "arboleda" | "cdc" | "desconocido";

export interface LineaLeida {
  codigo: number;
  /** Código no numérico del documento (`CI`, `NCC`). Entonces `codigo` es 0. */
  codigoTexto?: string;
  concepto: string;
  saldoAnterior: number;
  actual: number;
  total: number;
}

export interface FacturaLeida {
  format: Formato;
  /** Para emparejar con las unidades del conjunto. */
  unitIdentifier: string;
  residenteNombre: string;
  numeroInterno: string;
  /** La etiqueta del período tal como la trae el documento. */
  periodoLabel: string;
  /** El período que declara el documento (`AAAA-MM`), o null si no se pudo leer. */
  periodoDocumento: string | null;
  apto?: string;
  vrAdmon: number;
  lineas: LineaLeida[];
  saldoAFavor: number;
  totalAPagar: number;
  totalConDescuento?: number;
  /** Saldo anterior de la fila "Totales" (Ciudad del Campo). */
  saldoAnteriorDocumento?: number;
  /** Lectura dudosa: por qué esta factura no se puede tomar como cierta. */
  motivos: MotivoLectura[];
  /** Páginas del PDF (desde 1) que forman la factura. */
  paginas: number[];
}

// ─── Formato y agrupación de páginas ─────────────────────────────────────────

export function detectarFormato(texto: string): Formato {
  if (/DESARROLLO URBANO CIUDAD DEL CAMPO/i.test(texto)) return "cdc";
  if (/Arboleda Campestre/i.test(texto) && /TOTAL A PAGAR/i.test(texto)) return "arboleda";
  return "desconocido";
}

/** Bloque que identifica la unidad en Ciudad del Campo. */
const CASA_CDC = /Casa\s+(\S+)\s+MANZANA\s+(\S+)/i;

/**
 * ¿Esta página ABRE una factura nueva?
 *
 * No basta con que diga "CUENTA DE COBRO". En Ciudad del Campo el membrete
 * —logo, NIT, dirección y ese título— se repite en TODAS las hojas, y las
 * cuentas de las casas con mora acumulada ocupan hasta cinco. Lo que abre una
 * factura es que la hoja identifique una unidad (`Casa N MANZANA M`). En
 * Arboleda cada factura ocupa una página que abre con "CUENTA DE COBRO".
 */
export function abreFactura(texto: string): boolean {
  if (!/CUENTA DE COBRO/i.test(texto)) return false;
  if (detectarFormato(texto) === "cdc") return CASA_CDC.test(texto);
  return true;
}

/**
 * Las facturas de un PDF consolidado: cada una empieza en una página que
 * abre factura y se lleva las de continuación que la siguen. Si el PDF
 * empieza con una hoja de continuación, ese grupo no tiene primera hoja: se
 * marca, no se adivina a quién pertenece.
 */
export function agruparPaginas(textos: readonly string[]): {
  paginas: number[];
  sinPrimeraHoja: boolean;
}[] {
  const grupos: { paginas: number[]; sinPrimeraHoja: boolean }[] = [];
  textos.forEach((texto, i) => {
    if (i === 0 || abreFactura(texto)) {
      grupos.push({ paginas: [i], sinPrimeraHoja: !abreFactura(texto) });
    } else {
      grupos[grupos.length - 1]!.paginas.push(i);
    }
  });
  return grupos;
}

// ─── Ciudad del Campo ────────────────────────────────────────────────────────

/** Un monto de Ciudad del Campo dentro de un renglón, con su posición. */
const MONTO_CDC = /\$?-?\$?\d{1,3}(?:\.\d{3})*\.\d{2}(?!\d)/g;
const MES_ANIO = /([A-Za-záéíóúñÁÉÍÓÚÑ]+)\s*\/\s*(\d{4})/;
/**
 * Una fila de la tabla de conceptos: prefijo opcional (`*` marca la cuota del
 * mes, `SF` los créditos), código de 3 dígitos o de letras (`CI` anticipo de
 * cliente, `NCC` nota crédito cliente), concepto, y el mes de la fila.
 */
const FILA_CDC = /^\s*(?:(\*|SF)\s+)?(\d{3}|[A-Z]{2,4})\s{2,}(\S.*)$/;

function montosDe(texto: string): { valor: number; posicion: number }[] {
  return [...texto.matchAll(MONTO_CDC)].flatMap((m) => {
    const valor = leerMontoCdc(m[0]);
    return valor === null ? [] : [{ valor, posicion: m.index ?? 0 }];
  });
}

export function parseCdc(texto: string): Omit<FacturaLeida, "paginas"> {
  const motivos: MotivoLectura[] = [];
  const numeroInterno = texto.match(/CUENTA DE COBRO Nro\.\s+(\d+)/i)?.[1] ?? "";
  const residenteNombre = texto.match(/Nombre\s+(.+?)\s{3,}/)?.[1]?.trim() ?? "";
  const casaMatch = texto.match(CASA_CDC);
  const casa = casaMatch ? `${casaMatch[1] ?? ""} M${casaMatch[2] ?? ""}` : undefined;
  const unitIdentifier = casaMatch?.[1] ?? "";

  // ── Filas de conceptos
  type Acumulado = LineaLeida & { orden: number };
  const porCodigo = new Map<string, Acumulado>();
  let mesDeLaCuota: string | null = null;
  let orden = 0;
  for (const renglon of texto.split("\n")) {
    const fila = renglon.match(FILA_CDC);
    if (!fila) continue;
    const mes = MES_ANIO.exec(renglon);
    if (!mes) continue; // sin "Mes / AAAA" no es una fila de la tabla
    const [, prefijo, codigoDoc = "", resto = ""] = fila;
    if (prefijo === "*") mesDeLaCuota ??= `${mes[1]} / ${mes[2]}`;
    const numerico = /^\d{3}$/.test(codigoDoc);
    const clave = numerico ? `n${codigoDoc}` : `t${codigoDoc}`;
    const concepto = (resto.match(/^(.+?)\s{2,}/)?.[1] ?? resto.slice(0, 40))
      .trim()
      .replace(/\s+/g, " ");

    const corte = mes.index ?? 0;
    const montos = montosDe(renglon);
    const antes = montos.filter((m) => m.posicion < corte).map((m) => m.valor);
    const despues = montos.filter((m) => m.posicion > corte).map((m) => m.valor);

    const linea =
      porCodigo.get(clave) ??
      ({
        codigo: numerico ? Number(codigoDoc) : 0,
        ...(numerico ? {} : { codigoTexto: codigoDoc }),
        concepto,
        saldoAnterior: 0,
        actual: 0,
        total: 0,
        orden: orden++,
      } as Acumulado);
    if (antes.length > 0) {
      /* Fila con "Saldo Anterior": lo que arrastra. En las filas de meses
       * anteriores la columna "Saldo" solo lo repite. En el formato de enero
       * de 2026 la fila de la cuota trae además los cargos del mes ("Este mes",
       * "Descto", "Saldo"): el primero es el cargo y el último el total. */
      const arrastre = antes[antes.length - 1]!;
      linea.saldoAnterior += arrastre;
      if (despues.length >= 2) linea.actual += despues[0]!;
      linea.total += despues.length > 0 ? despues[despues.length - 1]! : arrastre;
    } else if (despues.length > 0) {
      /* Fila del mes: "Este mes" es el cargo y "Saldo" el total de la fila
       * (el descuento por pronto pago va aparte, en "Pague con descuento"). */
      linea.actual += despues[0]!;
      linea.total += despues[despues.length - 1]!;
    }
    porCodigo.set(clave, linea);
  }
  const lineas: LineaLeida[] = [...porCodigo.values()]
    .sort((a, b) =>
      a.codigo !== b.codigo
        ? a.codigo === 0
          ? 1
          : b.codigo === 0
            ? -1
            : a.codigo - b.codigo
        : a.orden - b.orden,
    )
    .map(({ orden: _orden, ...l }) => l);

  // ── Totales del documento
  const filaTotales = texto.match(/^.*\bTotales\b.*$/m)?.[0];
  const totales = filaTotales ? montosDe(filaTotales).map((m) => m.valor) : [];
  const saldoAnteriorDocumento = totales.length === 3 ? totales[0] : undefined;
  if (filaTotales && totales.length !== 3) motivos.push("totales_no_cuadran");

  const sinDescuento = texto.match(/Pague sin descuento[^\n]*?(-?\$\s*-?[\d.]+\.\d{2})/i)?.[1];
  const conDescuento = texto.match(/Pague con descuento[^\n]*?(-?\$\s*-?[\d.]+\.\d{2})/i)?.[1];
  let totalAPagar: number;
  const leidoSinDescuento = sinDescuento ? leerMontoCdc(sinDescuento) : null;
  if (leidoSinDescuento !== null) totalAPagar = leidoSinDescuento;
  else if (totales.length === 3) totalAPagar = totales[2]!;
  else {
    /* Ni "Pague sin descuento" ni fila Totales: el total no está en el
     * documento (p. ej. solo llegó la primera hoja). No se inventa un 0: se
     * informa la suma de lo que sí se leyó y la factura queda en revisión. */
    motivos.push("total_no_leido");
    totalAPagar = lineas.reduce((s, l) => s + l.total, 0);
  }
  if (totales.length === 3) {
    const [ant, mes, tot] = totales as [number, number, number];
    if (
      Math.abs(ant + mes - tot) > TOLERANCIA_CUADRE ||
      Math.abs(tot - totalAPagar) > TOLERANCIA_CUADRE
    ) {
      motivos.push("totales_no_cuadran");
    }
  }
  const leidoConDescuento = conDescuento ? leerMontoCdc(conDescuento) : null;

  // ── Período: la fila de la cuota del mes; si no la hay, la "Fecha"
  const fecha = texto.match(/Fecha\s+([A-Za-zÁÉÍÓÚáéíóú]+\.?\s*\d{1,2}\s*\/\s*\d{4})/)?.[1];
  const periodoFecha = fecha ? normalizarPeriodo(fecha) : null;
  const periodoCuota = mesDeLaCuota ? normalizarPeriodo(mesDeLaCuota) : null;
  let periodoLabel = mesDeLaCuota ?? (periodoFecha ? etiquetaDePeriodo(periodoFecha) : "");
  if (periodoCuota && periodoFecha && periodoCuota !== periodoFecha) {
    /* El documento se contradice: no se elige. */
    periodoLabel = "";
  }

  const admon = lineas.find((l) => l.codigo === 1);
  const base = {
    totalAPagar,
    lineas,
    saldoAnteriorDocumento,
    periodoLabel,
  };
  return {
    format: "cdc",
    unitIdentifier,
    residenteNombre,
    numeroInterno,
    periodoLabel,
    periodoDocumento: normalizarPeriodo(periodoLabel),
    apto: casa,
    vrAdmon: admon ? admon.actual : 0,
    lineas,
    saldoAFavor: totalAPagar < 0 ? -totalAPagar : 0,
    totalAPagar,
    ...(leidoConDescuento !== null ? { totalConDescuento: leidoConDescuento } : {}),
    ...(saldoAnteriorDocumento !== undefined ? { saldoAnteriorDocumento } : {}),
    motivos: motivosValidos([...motivos, ...validarLectura(base)]),
  };
}

// ─── Arboleda ────────────────────────────────────────────────────────────────

/** Los conceptos fijos de Arboleda, por código (el 2 es la administración del mes). */
const CONCEPTOS_ARBOLEDA: Record<number, string> = {
  1: "Saldo a favor",
  3: "Intereses mora",
  4: "Retroactivo admón",
  5: "Parqueadero visitante",
  6: "Honorarios abogado",
  7: "Multas y sanciones",
};

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Monto de Arboleda dentro de un renglón: `0`, `15,760`, `(376,000)`, `$(376,000)`. */
const MONTO_ARBOLEDA = /\$?\(?-?\$?\d[\d,]*\)?/g;

function parseNumPlano(str: string): number {
  return parseInt(String(str).replace(/[,.\s]/g, ""), 10) || 0;
}

export function parseArboleda(texto: string): Omit<FacturaLeida, "paginas"> {
  const motivos: MotivoLectura[] = [];
  const numeroInterno = (texto.match(/N\.\s+([\d,]+)/)?.[1] ?? "").replace(/,/g, "");

  /* Período: la fecha del campo "Periodo:". En septiembre de 2026 el formato
   * la bajó dos renglones; antes se capturaba el texto del renglón siguiente
   * (`Arboleda Campestre Aptos"`) como si fuera el período. Solo se acepta un
   * texto con forma de período. */
  const renglones = texto.split("\n");
  const iPeriodo = renglones.findIndex((r) => /Periodo:/.test(r));
  const FECHA = /\b\d{1,2}-[A-Za-záéíóú]+-\d{4}\b/;
  const periodoLabel =
    iPeriodo < 0
      ? ""
      : (renglones
          .slice(iPeriodo, iPeriodo + 4)
          .map((r) => r.match(FECHA)?.[0])
          .find((f) => f !== undefined && normalizarPeriodo(f) !== null) ?? "");

  const apto = texto.match(/APTO:\s*(\d+)/)?.[1];
  const vrAdmon = parseNumPlano(texto.match(/Vr\.\s*Admon\s+([\d.,]+)/)?.[1] ?? "");
  const totalTexto = texto.match(/TOTAL A PAGAR\s+(\$?\s*\(?-?\$?[\d,]+\)?)/)?.[1];
  const totalLeido = totalTexto ? leerMontoArboleda(totalTexto) : null;
  const residenteNombre =
    texto.match(/Se[ñn]or(?:es)?[:\s]+([A-ZÁÉÍÓÚÑ ]+?)(?:\n|\s{3,})/i)?.[1]?.trim() ?? "Residente";

  const inicioTabla = texto.indexOf("Codigo");
  const finTabla = texto.indexOf("TOTAL A PAGAR");
  const tabla =
    inicioTabla >= 0 && finTabla > inicioTabla ? texto.slice(inicioTabla, finTabla) : texto;
  const lineas: LineaLeida[] = [];
  for (const renglon of tabla.split("\n")) {
    const m = renglon.match(/^\s{0,5}([1-9])\s{2,}(.+)$/);
    if (!m) continue;
    const codigo = Number(m[1]);
    const resto = m[2] ?? "";
    const montos = (resto.match(MONTO_ARBOLEDA) ?? [])
      .map((t) => leerMontoArboleda(t))
      .filter((n): n is number => n !== null);
    const textoConcepto = resto.replace(MONTO_ARBOLEDA, " ").replace(/\s+/g, " ").trim();
    let concepto: string;
    if (codigo === 2) {
      const mes = resto.match(/ADMINISTRACION DE\s+(\S+)/i)?.[1];
      concepto = mes ? `Administración de ${mes}` : "Administración";
    } else {
      const fijo = CONCEPTOS_ARBOLEDA[codigo];
      /* El concepto fijo, salvo que el documento diga otra cosa (en septiembre
       * de 2026 el 6 pasó a ser "CUOTA EXTRA CAMARAS"). */
      concepto =
        fijo && sinTildes(fijo).toLowerCase() === sinTildes(textoConcepto).toLowerCase()
          ? fijo
          : textoConcepto
            ? textoConcepto.charAt(0).toUpperCase() + textoConcepto.slice(1).toLowerCase()
            : (fijo ?? `Concepto ${codigo}`);
    }
    let saldoAnterior = 0;
    let actual = 0;
    let total = 0;
    if (codigo === 1) total = montos[0] ?? 0;
    else if (montos.length >= 3) [saldoAnterior, actual, total] = montos as [number, number, number];
    else if (montos.length === 2) [actual, total] = montos as [number, number];
    else if (montos.length === 1) total = montos[0]!;
    lineas.push({ codigo, concepto, saldoAnterior, actual, total });
  }
  const presentes = new Set(lineas.map((l) => l.codigo));
  for (let c = 1; c <= 7; c++) {
    if (!presentes.has(c)) {
      lineas.push({
        codigo: c,
        concepto: CONCEPTOS_ARBOLEDA[c] ?? `Concepto ${c}`,
        saldoAnterior: 0,
        actual: 0,
        total: 0,
      });
    }
  }
  lineas.sort((a, b) => a.codigo - b.codigo);

  let totalAPagar: number;
  if (totalLeido !== null) totalAPagar = totalLeido;
  else {
    motivos.push("total_no_leido");
    totalAPagar = lineas.reduce((s, l) => s + l.total, 0);
  }
  /* El saldo a favor es la línea 1, que el documento imprime en negativo
   * (entre paréntesis). Se guarda en positivo, como siempre. */
  const linea1 = lineas.find((l) => l.codigo === 1);
  const saldoAFavor = Math.max(0, -(linea1?.total ?? 0), -totalAPagar);

  return {
    format: "arboleda",
    unitIdentifier: apto ?? "",
    residenteNombre,
    numeroInterno,
    periodoLabel,
    periodoDocumento: normalizarPeriodo(periodoLabel),
    apto,
    vrAdmon,
    lineas,
    saldoAFavor,
    totalAPagar,
    motivos: motivosValidos([
      ...motivos,
      ...validarLectura({ totalAPagar, lineas, periodoLabel }),
    ]),
  };
}

// ─── Documento completo ──────────────────────────────────────────────────────

export type ErrorDeLectura = { paginas: number[]; error: string };

/**
 * Todas las facturas de un PDF, a partir del texto de cada página.
 *
 * Un grupo que no se puede leer en absoluto (excepción del parser) sale en
 * `errores`. Uno que se lee pero no cuadra sale como factura, con `motivos`:
 * así la administración lo ve y decide, y si se carga, entra en revisión.
 */
export function leerFacturas(textos: readonly string[]): {
  facturas: FacturaLeida[];
  errores: ErrorDeLectura[];
} {
  const facturas: FacturaLeida[] = [];
  const errores: ErrorDeLectura[] = [];
  for (const grupo of agruparPaginas(textos)) {
    const paginas = grupo.paginas.map((i) => i + 1);
    try {
      const texto = grupo.paginas.map((i) => textos[i] ?? "").join("\n");
      const formato = detectarFormato(texto);
      if (formato === "desconocido") {
        errores.push({ paginas, error: "El documento no tiene el formato de una cuenta de cobro conocida." });
        continue;
      }
      const leida = formato === "cdc" ? parseCdc(texto) : parseArboleda(texto);
      facturas.push({
        ...leida,
        motivos: motivosValidos([
          ...leida.motivos,
          ...(grupo.sinPrimeraHoja ? (["pagina_de_continuacion"] as const) : []),
        ]),
        paginas,
      });
    } catch (e) {
      errores.push({ paginas, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { facturas, errores };
}
