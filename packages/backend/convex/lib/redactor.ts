/**
 * El modelo que redacta los resúmenes del acta.
 *
 * Está detrás de un adaptador por la misma razón que el motor de voz: no
 * queremos que la elección de proveedor se meta en la lógica del acta. Aquí
 * se decide a quién se le habla y cómo se lee la respuesta; el resto del
 * sistema solo pide "redáctame esto".
 *
 * Hay DOS protocolos, no tres:
 *
 *   · anthropic → /v1/messages, con `x-api-key` y `system` aparte.
 *   · openai    → /chat/completions. Kimi (Moonshot), DeepSeek, Groq,
 *                 Together y casi cualquier otro hablan exactamente este
 *                 mismo formato; cambiar de uno a otro es cambiar la URL
 *                 base y el nombre del modelo, nada más.
 *
 * Sin dependencias y sin `ctx`: es una función pura más un `fetch`, así que
 * se puede probar sin levantar Convex ni gastar cuota.
 */

export type Proveedor = "anthropic" | "openai";

export type ConfigRedactor = {
  proveedor: Proveedor;
  apiKey: string;
  modelo: string;
  /** Sin barra final. */
  baseUrl: string;
};

const PREDETERMINADO: Record<Proveedor, { modelo: string; baseUrl: string }> = {
  anthropic: {
    modelo: "claude-haiku-4-5-20251001",
    baseUrl: "https://api.anthropic.com",
  },
  openai: {
    modelo: "gpt-4o-mini",
    baseUrl: "https://api.openai.com/v1",
  },
};

const limpio = (s: string | undefined) => s?.trim() || "";

/**
 * Arma la configuración desde el entorno.
 *
 * OpenAI gana si hay `OPENAI_API_KEY` (más barato para preguntas/acta).
 * Anthropic solo si no hay OpenAI, o si se fuerza `ACTA_PROVEEDOR=anthropic`
 * sin llave OpenAI.
 *
 * Devuelve `null` cuando no hay llave. No es un error: el acta se genera
 * igual con todos sus datos, solo que sin los resúmenes redactados.
 */
export function configRedactor(
  env: Record<string, string | undefined> = process.env,
): ConfigRedactor | null {
  const declarado = limpio(env.ACTA_PROVEEDOR).toLowerCase();

  const anthropicKey = limpio(env.ANTHROPIC_API_KEY);
  const openaiKey = limpio(env.OPENAI_API_KEY);
  /* Llave neutra: quien use Kimi o DeepSeek no debería tener que guardar su
   * llave en una variable que se llama OPENAI_API_KEY. */
  const generica = limpio(env.ACTA_API_KEY);
  const modeloOverride = limpio(env.ACTA_MODELO);
  const baseOverride = limpio(env.ACTA_BASE_URL);

  let proveedor: Proveedor;
  if (openaiKey) {
    /* Barato y ya configurado: no mandar gpt-* a Anthropic. */
    proveedor = "openai";
  } else if (declarado === "openai" && generica) {
    proveedor = "openai";
  } else if (declarado === "anthropic" && anthropicKey) {
    proveedor = "anthropic";
  } else if (generica) {
    proveedor = "openai";
  } else if (anthropicKey) {
    proveedor = "anthropic";
  } else {
    return null;
  }

  let modelo = modeloOverride || PREDETERMINADO[proveedor].modelo;
  if (proveedor === "openai" && /^claude/i.test(modelo)) {
    modelo = PREDETERMINADO.openai.modelo;
  }
  if (proveedor === "anthropic" && /^gpt-|^o[1-9]|^chatgpt-/i.test(modelo)) {
    modelo = PREDETERMINADO.anthropic.modelo;
  }

  const apiKey =
    proveedor === "openai" ? openaiKey || generica : anthropicKey || generica;
  if (!apiKey) return null;

  let baseUrl = (
    baseOverride || PREDETERMINADO[proveedor].baseUrl
  ).replace(/\/+$/, "");
  if (proveedor === "openai" && /anthropic\.com/i.test(baseUrl)) {
    baseUrl = PREDETERMINADO.openai.baseUrl;
  }
  if (proveedor === "anthropic" && /openai\.com/i.test(baseUrl)) {
    baseUrl = PREDETERMINADO.anthropic.baseUrl;
  }

  return {
    proveedor,
    apiKey,
    modelo,
    baseUrl,
  };
}

/**
 * Solo OpenAI (`OPENAI_API_KEY`). Para features baratas (preguntas, etc.)
 * donde no queremos caer en Anthropic por una ACTA_* mal puesta.
 */
export function configOpenAI(
  env: Record<string, string | undefined> = process.env,
): ConfigRedactor | null {
  const apiKey = limpio(env.OPENAI_API_KEY);
  if (!apiKey) return null;
  const modelo =
    limpio(env.ACTA_MODELO) &&
    !/^claude/i.test(limpio(env.ACTA_MODELO))
      ? limpio(env.ACTA_MODELO)
      : PREDETERMINADO.openai.modelo;
  let baseUrl = (
    limpio(env.ACTA_BASE_URL) || PREDETERMINADO.openai.baseUrl
  ).replace(/\/+$/, "");
  if (/anthropic\.com/i.test(baseUrl)) {
    baseUrl = PREDETERMINADO.openai.baseUrl;
  }
  return {
    proveedor: "openai",
    apiKey,
    modelo: modelo || PREDETERMINADO.openai.modelo,
    baseUrl,
  };
}

export type Peticion = {
  url: string;
  headers: Record<string, string>;
  body: string;
};

/** Traduce la misma petición al dialecto de cada proveedor. */
export function construirPeticion(
  cfg: ConfigRedactor,
  sistema: string,
  usuario: string,
  maxTokens = 800,
): Peticion {
  if (cfg.proveedor === "anthropic") {
    return {
      url: `${cfg.baseUrl}/v1/messages`,
      headers: {
        "content-type": "application/json",
        "x-api-key": cfg.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: cfg.modelo,
        max_tokens: maxTokens,
        // Anthropic lleva la instrucción en su propio campo, no como mensaje.
        system: sistema,
        messages: [{ role: "user", content: usuario }],
      }),
    };
  }

  return {
    url: `${cfg.baseUrl}/chat/completions`,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.modelo,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: sistema },
        { role: "user", content: usuario },
      ],
    }),
  };
}

/**
 * Saca el texto de la respuesta.
 *
 * Devuelve cadena vacía si viene con una forma que no se reconoce, en vez de
 * reventar: un punto sin resumen se ve y se arregla; una excepción a mitad
 * de la generación tumba el acta entera y pierde los puntos ya redactados.
 */
export function extraerTexto(cfg: ConfigRedactor, json: unknown): string {
  if (!json || typeof json !== "object") return "";

  if (cfg.proveedor === "anthropic") {
    const bloques = (json as { content?: { type?: string; text?: string }[] })
      .content;
    if (!Array.isArray(bloques)) return "";
    return bloques
      .filter((b) => b?.type === "text")
      .map((b) => b.text ?? "")
      .join("")
      .trim();
  }

  const opciones = (
    json as { choices?: { message?: { content?: unknown } }[] }
  ).choices;
  if (!Array.isArray(opciones) || !opciones[0]) return "";
  const contenido = opciones[0].message?.content;

  if (typeof contenido === "string") return contenido.trim();
  /* Algunos compatibles devuelven el contenido troceado como Anthropic.
   * Aceptarlo cuesta cuatro líneas y evita un "no salió el resumen" que
   * nadie sabría diagnosticar. */
  if (Array.isArray(contenido)) {
    return contenido
      .map((c) => (typeof c === "string" ? c : ((c as { text?: string })?.text ?? "")))
      .join("")
      .trim();
  }
  return "";
}

/** Nombre legible del proveedor, para imprimirlo en el acta. */
export function etiquetaRedactor(cfg: ConfigRedactor): string {
  return `${cfg.modelo} (${cfg.proveedor})`;
}

export async function redactarConModelo(
  cfg: ConfigRedactor,
  sistema: string,
  usuario: string,
): Promise<string> {
  const p = construirPeticion(cfg, sistema, usuario);
  const res = await fetch(p.url, {
    method: "POST",
    headers: p.headers,
    body: p.body,
  });

  if (!res.ok) {
    const detalle = await res.text();
    throw new Error(
      `${cfg.proveedor} respondió ${res.status}: ${detalle.slice(0, 300)}`,
    );
  }
  return extraerTexto(cfg, await res.json());
}
