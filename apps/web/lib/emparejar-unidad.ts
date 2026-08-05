/**
 * Empareja los identificadores de unidad de un PDF de facturas con las
 * unidades del condominio.
 *
 * ── El problema ──────────────────────────────────────────────────────────
 * Algunos conjuntos escriben en el PDF la torre pegada al apartamento. En
 * Arboleda la referencia de pago es literalmente «Torre-Apto», pero la Torre 1
 * va SIN prefijo:
 *
 *   Torre 1 →  101 … 904 ,  1001 … 1104     (sin prefijo)
 *   Torre 2 → 2101 … 2904 , 21001 … 21104
 *   Torre 3 → 3101 … 3904 , 31001 … 31104
 *   Torre 4 → 4101 … 4804 , 41001 … 41104
 *
 * Eso deja identificadores genuinamente ambiguos leídos de a uno:
 *
 *   "1101" → ¿Torre 1 apto 101?  ¿o el apto 1101 sin prefijo?
 *   "601"  → el apto 601 existe en las cuatro torres.
 *
 * ── Por qué no basta con reglas ───────────────────────────────────────────
 * Cualquier regla local ("el primer dígito es la torre") acierta en unos casos
 * y falla en otros, y fallar aquí significa cobrarle a la casa equivocada.
 *
 * ── La solución ───────────────────────────────────────────────────────────
 * Resolver el lote completo aprovechando una restricción real del negocio:
 * **cada unidad se factura una sola vez por período**. Entonces:
 *
 *   1. A cada identificador se le calculan TODAS sus lecturas posibles.
 *   2. El que tenga una sola lectura queda fijado, y esa unidad se descarta
 *      de las demás.
 *   3. Se repite hasta que nada cambie (propagación de restricciones).
 *
 * Con eso "2101", "3101" y "4101" se fijan solos, liberan las torres 2-4 y
 * "101" se queda con la única lectura que queda: Torre 1. Lo mismo destraba
 * "1101" y "601". Sin reglas por conjunto y sin adivinar: lo que queda
 * ambiguo se marca sin unidad para que lo resuelva una persona.
 */

export type UnidadMin = {
  _id: string;
  numero: string;
  torre?: string | null;
};

/** Cómo se resolvió — se muestra en la tabla de revisión. */
export type ModoEmparejado = "exacto" | "torre" | "deducido";

export type Emparejamiento = {
  unidadId: string | null;
  modo: ModoEmparejado | null;
  /** "T II · 604" — cuando la unidad no se leyó tal cual del identificador. */
  detalle?: string;
};

const ROMANOS: Record<string, number> = {
  I: 1, II: 2, III: 3, IV: 4, V: 5,
  VI: 6, VII: 7, VIII: 8, IX: 9, X: 10,
};

/**
 * Número de torre a partir de como esté escrita: "T I", "TII", "Torre 2",
 * "T-4", "IV", "2". Devuelve `null` si no se puede deducir.
 */
export function numeroDeTorre(torre: string | null | undefined): number | null {
  const t = (torre ?? "").trim().toUpperCase();
  if (!t) return null;

  const arabigo = t.match(/(\d+)/);
  if (arabigo) return Number(arabigo[1]);

  /* Quitamos "TORRE" ANTES que la "T" suelta: al revés, "TORRE II" quedaría
   * como "ORRE II" y no se reconocería. */
  const limpio = t
    .replace(/^TORRE\s*/i, "")
    .replace(/^BLOQUE\s*/i, "")
    .replace(/^[TB][\s.-]*/i, "")
    .replace(/[\s.-]/g, "");
  return ROMANOS[limpio] ?? null;
}

function etiqueta(u: UnidadMin): string {
  const t = (u.torre ?? "").trim();
  return t ? `${t} · ${u.numero}` : u.numero;
}

type Candidato = { unidad: UnidadMin; modo: ModoEmparejado };

/**
 * Lecturas posibles de un identificador.
 *
 * Dos formas, y se consideran las dos SIEMPRE — quedarse con la primera que
 * cuadre es justo lo que hacía fallar a "1101":
 *   · tal cual  → el identificador es el número del apartamento
 *   · con torre → el primer dígito es la torre y el resto el apartamento
 */
function lecturas(
  id: string,
  porNumero: Map<string, UnidadMin[]>,
  porTorreNumero: Map<string, UnidadMin[]>,
): Candidato[] {
  const out: Candidato[] = [];
  const vistos = new Set<string>();

  for (const u of porNumero.get(id) ?? []) {
    if (vistos.has(u._id)) continue;
    vistos.add(u._id);
    out.push({ unidad: u, modo: "exacto" });
  }

  if (/^\d{4,}$/.test(id)) {
    const torre = Number(id[0]);
    const resto = id.slice(1);
    for (const u of porTorreNumero.get(`${torre}|${resto}`) ?? []) {
      if (vistos.has(u._id)) continue;
      vistos.add(u._id);
      out.push({ unidad: u, modo: "torre" });
    }
  }

  return out;
}

/**
 * Empareja un lote completo de identificadores.
 *
 * Devuelve un arreglo alineado con la entrada. Resolver el lote junto —y no
 * cada factura por separado— es lo que permite desambiguar: la respuesta de
 * un identificador depende de lo que hayan tomado los demás.
 */
export function emparejarLote(
  identificadores: string[],
  unidades: UnidadMin[],
): Emparejamiento[] {
  const porNumero = new Map<string, UnidadMin[]>();
  const porTorreNumero = new Map<string, UnidadMin[]>();

  for (const u of unidades) {
    const numero = u.numero.trim();
    if (!numero) continue;
    (porNumero.get(numero) ?? porNumero.set(numero, []).get(numero)!).push(u);

    const torre = numeroDeTorre(u.torre);
    if (torre !== null) {
      const clave = `${torre}|${numero}`;
      (
        porTorreNumero.get(clave) ??
        porTorreNumero.set(clave, []).get(clave)!
      ).push(u);
    }
  }

  const ids = identificadores.map((s) => (s ?? "").trim());
  const candidatos = ids.map((id) =>
    id ? lecturas(id, porNumero, porTorreNumero) : [],
  );

  const resultado: Emparejamiento[] = ids.map(() => ({
    unidadId: null,
    modo: null,
  }));
  const tomadas = new Set<string>();

  /* Propagación: fijamos los que tienen una sola lectura, liberamos esa
   * unidad del resto y repetimos. Cada vuelta puede destrabar la siguiente.
   * El tope de vueltas es la cantidad de facturas: más que eso significaría
   * que nada nuevo se está resolviendo. */
  for (let vuelta = 0; vuelta <= ids.length; vuelta++) {
    let cambio = false;

    for (let i = 0; i < ids.length; i++) {
      if (resultado[i]!.unidadId) continue;

      const libres = candidatos[i]!.filter((c) => !tomadas.has(c.unidad._id));
      if (libres.length !== 1) continue;

      const elegido = libres[0]!;
      tomadas.add(elegido.unidad._id);
      /* Si hubo que descartar otras lecturas, la deducción vino del lote y no
       * del identificador: se marca aparte para que se revise. */
      const modo: ModoEmparejado =
        candidatos[i]!.length > 1 ? "deducido" : elegido.modo;
      resultado[i] = {
        unidadId: elegido.unidad._id,
        modo,
        detalle:
          modo === "exacto" && elegido.unidad.numero === ids[i]
            ? undefined
            : etiqueta(elegido.unidad),
      };
      cambio = true;
    }

    if (!cambio) break;
  }

  return resultado;
}
