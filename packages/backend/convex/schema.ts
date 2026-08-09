import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  platformRoleValidator,
  operationalRoleValidator,
  vinculoUnidadValidator,
  tipoDocumentoValidator,
  subscriptionPlanValidator,
  tipoUnidadValidator,
  estadoUnidadValidator,
} from "./model/roles";

/**
 * SCHEMA VEKINO (unificado, multi-tenant en una sola base Convex).
 *
 * La identidad/credenciales (email, password hash, sesiones) las gestiona el
 * componente Better Auth (`@convex-dev/better-auth`) en sus propias tablas
 * internas. Aquí guardamos el PERFIL de aplicación y toda la lógica de negocio,
 * enlazando con Better Auth mediante `users.authId`.
 *
 * Aislamiento entre condominios: por `condominioId` en cada tabla de negocio
 * (reemplaza el esquema anterior de una base de datos por condominio).
 */
export default defineSchema({
  // ─────────────────────────────────────────────────────────────
  // Condominios (tenants)
  // ─────────────────────────────────────────────────────────────
  condominios: defineTable({
    name: v.string(),
    subdomain: v.optional(v.string()),

    // Institucional
    nit: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    country: v.optional(v.string()),
    timezone: v.optional(v.string()), // IANA, ej "America/Bogota"

    // Marca
    logo: v.optional(v.string()),
    /** Foto destacada del home (app móvil / portal). URL pública S3. */
    coverImage: v.optional(v.string()),
    primaryColor: v.optional(v.string()),

    // Pagos: URL del portal público de AvalPayCenter (deep-link por convenio,
    // ej ...realizar-pago?idConv=00003230). Si está presente, el botón "Pagar"
    // abre este portal en vez de usar la API de la pasarela.
    avalPortalUrl: v.optional(v.string()),

    // Plan / límites
    subscriptionPlan: v.optional(subscriptionPlanValidator),
    unitLimit: v.optional(v.number()),
    planExpiresAt: v.optional(v.number()),
    activeModules: v.array(v.string()),

    isActive: v.boolean(),

    // Trazabilidad de la migración desde el sistema anterior (Prisma/Cockroach)
    legacyDatabaseName: v.optional(v.string()),
    legacyId: v.optional(v.string()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_subdomain", ["subdomain"])
    .index("by_isActive", ["isActive"])
    .index("by_legacyDatabaseName", ["legacyDatabaseName"]),

  // ─────────────────────────────────────────────────────────────
  // Usuarios (perfil de aplicación) — Capa 1 de roles
  // ─────────────────────────────────────────────────────────────
  users: defineTable({
    // Enlace con el usuario de Better Auth (fuente de la credencial)
    authId: v.optional(v.string()),

    name: v.string(),
    email: v.string(),
    emailVerified: v.boolean(),
    image: v.optional(v.string()),
    /** Avatar en Convex Storage; la URL se resuelve al leer (no caduca). */
    imageStorageId: v.optional(v.id("_storage")),
    /** Object key en S3 del avatar actual (para borrar al reemplazar). */
    imageS3Key: v.optional(v.string()),

    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    tipoDocumento: v.optional(tipoDocumentoValidator),
    numeroDocumento: v.optional(v.string()),
    telefono: v.optional(v.string()),
    /**
     * Teléfono canónico E.164 ("+573001234567"), derivado de `telefono` en
     * cada escritura (lib/telefono.ts). Es lo único indexado: WhatsApp/YCloud
     * identifica al remitente por este valor. OJO: no es único (parejas
     * comparten número) — consultar con .collect(), nunca .unique().
     */
    telefonoE164: v.optional(v.string()),

    /**
     * La contraseña actual la generó la administración (envío masivo de
     * credenciales) y el usuario todavía no la ha cambiado. Sirve para
     * recordárselo al entrar; NO bloquea el acceso.
     */
    claveTemporal: v.optional(v.boolean()),
    /**
     * Identidad de WhatsApp de Meta, cuando la persona activó su @usuario y
     * dejó de compartir su número. Es lo único con lo que se le puede
     * reconocer: sin esto, cada vez que escribe hay que volver a preguntarle
     * quién es. Se guarda al vincularla a mano una primera vez.
     */
    waBsuid: v.optional(v.string()),
    waUsername: v.optional(v.string()),
    /**
     * Cuándo entró de verdad por última vez. `authId` NO sirve para esto: se
     * estampa al CREAR al residente (users.createCondoMember), así que hay
     * gente marcada como si tuviera cuenta activa sin haber abierto nunca la
     * plataforma. Esto lo escribe `ensureProfile`, que solo corre con una
     * sesión resuelta.
     */
    ultimoIngresoAt: v.optional(v.number()),

    active: v.boolean(),

    // Capa 1: rol de plataforma. undefined = usuario normal.
    platformRole: v.optional(platformRoleValidator),

    // Trazabilidad de migración
    legacyId: v.optional(v.string()),
    legacyDatabaseName: v.optional(v.string()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_authId", ["authId"])
    .index("by_email", ["email"])
    .index("by_numeroDocumento", ["numeroDocumento"])
    .index("by_platformRole", ["platformRole"])
    .index("by_legacyId", ["legacyId"])
    .index("by_telefono", ["telefonoE164"])
    .index("by_wa_bsuid", ["waBsuid"]),

  // ─────────────────────────────────────────────────────────────
  // Membresías (usuario ↔ condominio) — Capa 2 de roles
  // ─────────────────────────────────────────────────────────────
  memberships: defineTable({
    userId: v.id("users"),
    condominioId: v.id("condominios"),

    // Capa 2: uno o varios roles operativos dentro de este condominio.
    roles: v.array(operationalRoleValidator),

    // Para "apoderado": a qué usuario (propietario) representa dentro del condominio.
    representaAUserId: v.optional(v.id("users")),

    isActive: v.boolean(),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_condominio", ["condominioId"])
    .index("by_condominio_user", ["condominioId", "userId"]),

  // ─────────────────────────────────────────────────────────────
  // Unidades (inmuebles)
  // ─────────────────────────────────────────────────────────────
  unidades: defineTable({
    condominioId: v.id("condominios"),
    tipo: tipoUnidadValidator,
    estado: estadoUnidadValidator,

    torre: v.optional(v.string()),
    bloque: v.optional(v.string()),
    numero: v.string(),
    coeficiente: v.optional(v.number()), // coeficiente de copropiedad (%)

    legacyId: v.optional(v.string()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_condominio", ["condominioId"])
    .index("by_condominio_numero", ["condominioId", "numero"])
    .index("by_legacyId", ["legacyId"]),

  // ─────────────────────────────────────────────────────────────
  // Usuario ↔ Unidad (una persona puede estar en varias unidades y viceversa)
  // ─────────────────────────────────────────────────────────────
  usuarioUnidad: defineTable({
    membershipId: v.id("memberships"),
    unidadId: v.id("unidades"),
    condominioId: v.id("condominios"), // desnormalizado para filtros por tenant
    vinculo: vinculoUnidadValidator,
    esPrincipal: v.boolean(), // unidad principal del usuario
    createdAt: v.number(),
  })
    .index("by_membership", ["membershipId"])
    .index("by_unidad", ["unidadId"])
    .index("by_condominio", ["condominioId"]),

  // ─────────────────────────────────────────────────────────────
  // Facturas / Cuentas de cobro
  // ─────────────────────────────────────────────────────────────
  facturas: defineTable({
    condominioId: v.id("condominios"),
    unidadId: v.id("unidades"),
    membershipId: v.optional(v.id("memberships")), // responsable del pago

    // Identificación
    numeroFactura: v.string(), // ej "FAC-2026-03-0001"
    numeroInterno: v.string(), // consecutivo puntosoftware, ej "8956"
    periodo: v.string(), // ej "2026-03"
    periodoLabel: v.string(), // ej "01-marzo-2026"

    // Residente/unidad
    residenteNombre: v.string(),
    apto: v.optional(v.string()), // ej "4201"
    vrAdmon: v.number(), // cuota base del mes (ej 274000)

    // Desglose de líneas (cada concepto con su saldo anterior + actual + total)
    lineas: v.array(
      v.object({
        codigo: v.number(), // 1-7
        concepto: v.string(), // "Administración de marzo", "Intereses mora", etc
        saldoAnterior: v.number(),
        actual: v.number(),
        total: v.number(),
      })
    ),

    // Totales
    saldoAFavor: v.number(),
    totalAPagar: v.number(), // sin descuento (pago del 16 al 30)
    totalConDescuento: v.optional(v.number()), // pago del 1 al 15

    // Fechas
    fechaEmision: v.number(), // timestamp
    fechaVencimiento: v.number(), // timestamp (día 15 del siguiente mes)
    estado: v.union(
      v.literal("pendiente"),
      v.literal("pagada"),
      v.literal("vencida"),
      v.literal("abonada"),
      v.literal("saldo_a_favor"),
    ),

    // Archivos
    pdfUrl: v.optional(v.string()),

    // Trazabilidad de migración
    legacyId: v.optional(v.string()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_condominio", ["condominioId"])
    .index("by_unidad", ["unidadId"])
    .index("by_membership", ["membershipId"])
    .index("by_periodo", ["periodo"])
    .index("by_condominio_periodo", ["condominioId", "periodo"])
    .index("by_estado", ["estado"])
    .index("by_legacyId", ["legacyId"]),

  // ─────────────────────────────────────────────────────────────
  // Pagos — Pasarela de Pagos Aval (AV Villas / PSE, tarjeta, Pagos Aval)
  //
  // Cada intento de pago de una factura contra la pasarela Aval. El flujo es:
  //   1. crearPagoFactura  → oauth2-token + Payments_Trn/Trn  → estado "iniciada",
  //      guarda pmtAuthId y la URL de la pasarela a la que redirigimos.
  //   2. El usuario paga en la pasarela y vuelve a nuestra URL de retorno.
  //   3. consultarEstado   → Payments_BasicData/BasicData/{pmtAuthId}. Se reintenta
  //      cada 2 min hasta un estado final (aprobada/rechazada/...). Al aprobar,
  //      la factura asociada pasa a "pagada" en tiempo real.
  // ─────────────────────────────────────────────────────────────
  pagos: defineTable({
    condominioId: v.id("condominios"),
    unidadId: v.id("unidades"),
    facturaId: v.id("facturas"),
    membershipId: v.optional(v.id("memberships")),
    userId: v.optional(v.id("users")),

    // Identificadores de la pasarela
    rqUID: v.string(),                 // X-RqUID único que enviamos por transacción
    pmtAuthId: v.optional(v.string()), // PmtAuthId devuelto por Trn (== PmtId en BasicData)
    invoiceNum: v.string(),            // referencia enviada a Aval (numeroInterno)
    approvalId: v.optional(v.string()), // X-ApprovalId final (ACH/banco/Redeban)

    // Montos
    monto: v.number(),                 // en pesos colombianos
    moneda: v.string(),                // "COP"

    // Estado del pago
    estado: v.union(
      v.literal("iniciada"),       // Trn creada, redirigido a la pasarela
      v.literal("pendiente"),      // Aval reporta pendiente (StatusCode 1)
      v.literal("aprobada"),       // StatusCode 4
      v.literal("rechazada"),      // StatusCode 2
      v.literal("fallida"),        // StatusCode 3
      v.literal("expirada"),       // StatusCode 5
      v.literal("no_autorizada"),  // StatusCode 6
      v.literal("error")           // fallo nuestro creando la transacción
    ),
    statusCodeAval: v.optional(v.string()), // StatusCode crudo de Aval
    medioPago: v.optional(v.string()),      // "PSE" | "TC" | "Pagos AVAL"
    banco: v.optional(v.string()),          // BankName (para PSE)

    // URLs y ambiente
    redirectUrl: v.optional(v.string()),    // front de la pasarela (destino del usuario)
    ambiente: v.string(),                    // "qa" | "prod"

    // Trazabilidad (respuestas crudas para auditoría/soporte)
    trnRaw: v.optional(v.any()),
    basicDataRaw: v.optional(v.any()),
    error: v.optional(v.string()),

    intentosConsulta: v.number(),   // cuántas veces se ha consultado BasicData
    fechaPago: v.optional(v.number()), // timestamp del pago aprobado (EffDt)

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_factura", ["facturaId"])
    .index("by_condominio", ["condominioId"])
    .index("by_pmtAuthId", ["pmtAuthId"])
    .index("by_rqUID", ["rqUID"])
    .index("by_estado", ["estado"]),

  // ─────────────────────────────────────────────────────────────
  // Vehículos registrados por unidad
  // ─────────────────────────────────────────────────────────────
  vehiculos: defineTable({
    condominioId: v.id("condominios"),
    unidadId: v.id("unidades"),
    placa: v.string(),
    tipo: v.union(v.literal("carro"), v.literal("moto"), v.literal("bicicleta"), v.literal("otro")),
    marca: v.optional(v.string()),
    color: v.optional(v.string()),
    observaciones: v.optional(v.string()),
    legacyId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_condominio", ["condominioId"])
    .index("by_unidad", ["unidadId"])
    .index("by_legacyId", ["legacyId"]),

  // ─────────────────────────────────────────────────────────────
  // Visitantes (control de acceso)
  //
  // Flujo A: propietario autoriza (estado "pendiente") → QR del día →
  //          guardia escanea → "activo" → salida → "finalizado".
  //          Si no ingresó ese día, el QR expira y se elimina.
  // Flujo B: walk-in en portería → "esperando_aprobacion" → el residente
  //          acepta → "activo" (o rechaza → se elimina).
  // ─────────────────────────────────────────────────────────────
  visitantes: defineTable({
    condominioId: v.id("condominios"),
    unidadId: v.id("unidades"),
    unidadNumero: v.optional(v.string()),
    autorizadoPorUserId: v.optional(v.id("users")), // propietario que autorizó
    membershipId: v.optional(v.id("memberships")),

    nombre: v.string(),
    documento: v.string(),
    tipoDocumento: v.union(
      v.literal("CC"),
      v.literal("CE"),
      v.literal("NIT"),
      v.literal("PASAPORTE"),
      v.literal("OTRO")
    ),
    tipo: v.union(
      v.literal("visitante"),
      v.literal("empresa"),
      v.literal("domicilio")
    ),
    placa: v.optional(v.string()),

    // Ventana autorizada (día civil America/Bogota)
    fechaVisitaInicio: v.optional(v.number()),
    fechaVisitaFin: v.optional(v.number()),

    estado: v.union(
      v.literal("pendiente"),
      v.literal("esperando_aprobacion"),
      v.literal("activo"),
      v.literal("finalizado"),
      v.literal("rechazado")
    ),
    fechaIngreso: v.optional(v.number()),
    fechaSalida: v.optional(v.number()),
    observaciones: v.optional(v.string()),
    qrInvalidado: v.boolean(),

    registradoPorGuardia: v.optional(v.boolean()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_condominio", ["condominioId"])
    .index("by_unidad", ["unidadId"])
    .index("by_autorizado", ["autorizadoPorUserId"])
    .index("by_estado", ["condominioId", "estado"]),

  // ─────────────────────────────────────────────────────────────
  // Zonas comunes (para reservas)
  // ─────────────────────────────────────────────────────────────
  zonasComunes: defineTable({
    condominioId: v.id("condominios"),
    nombre: v.string(),
    /** Catálogo: piscina, salón, etc. */
    tipo: v.optional(
      v.union(
        v.literal("salon_social"),
        v.literal("zona_bbq"),
        v.literal("sauna"),
        v.literal("casa_eventos"),
        v.literal("gimnasio"),
        v.literal("piscina"),
        v.literal("cancha_deportiva"),
        v.literal("parqueadero"),
        v.literal("otro"),
      ),
    ),
    /** Modalidad de reserva. */
    unidadTiempo: v.optional(
      v.union(v.literal("hora"), v.literal("dia"), v.literal("mes")),
    ),
    precioPorHora: v.optional(v.number()),
    precioPorDia: v.optional(v.number()),
    precioPorMes: v.optional(v.number()),
    /** 0=Domingo … 6=Sábado */
    horariosPorDia: v.optional(
      v.array(
        v.object({
          dia: v.number(),
          horaInicio: v.string(),
          horaFin: v.string(),
        }),
      ),
    ),
    requiereAprobacion: v.optional(v.boolean()),
    capacidad: v.optional(v.number()),
    descripcion: v.optional(v.string()),
    activa: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_condominio", ["condominioId"]),

  // ─────────────────────────────────────────────────────────────
  // Reservas de zonas comunes
  // ─────────────────────────────────────────────────────────────
  reservas: defineTable({
    condominioId: v.id("condominios"),
    unidadId: v.id("unidades"),
    zonaId: v.id("zonasComunes"),
    zonaNombre: v.string(),
    unidadNumero: v.string(),
    solicitanteNombre: v.string(),
    fecha: v.string(),       // "2026-07-15"
    horaInicio: v.string(),  // "09:00"
    horaFin: v.string(),     // "12:00"
    estado: v.union(
      v.literal("pendiente"),
      v.literal("aprobada"),
      v.literal("rechazada"),
      v.literal("cancelada")
    ),
    observaciones: v.optional(v.string()),
    // Control operativo en portería (guardia).
    ingresoValidadoAt: v.optional(v.number()),
    salidaValidadaAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_condominio", ["condominioId"])
    .index("by_zona", ["zonaId"])
    .index("by_unidad", ["unidadId"])
    .index("by_condominio_fecha", ["condominioId", "fecha"]),

  // ─────────────────────────────────────────────────────────────
  // Novedades / Minuta de control (guardia y admin)
  // ─────────────────────────────────────────────────────────────
  novedades: defineTable({
    condominioId: v.id("condominios"),
    tipo: v.union(
      v.literal("visita"),
      v.literal("paquete"),
      v.literal("incidente"),
      v.literal("mantenimiento"),
      v.literal("otro")
    ),
    descripcion: v.string(),
    unidadNumero: v.optional(v.string()),
    autorNombre: v.string(),
    turno: v.union(v.literal("mañana"), v.literal("tarde"), v.literal("noche")),
    createdAt: v.number(),
  })
    .index("by_condominio", ["condominioId"]),

  // ─────────────────────────────────────────────────────────────
  // Documentos del condominio (Convex File Storage)
  // ─────────────────────────────────────────────────────────────
  documentos: defineTable({
    condominioId: v.id("condominios"),
    nombre: v.string(),
    categoria: v.union(
      v.literal("reglamento"),
      v.literal("acta"),
      v.literal("contrato"),
      v.literal("comunicado"),
      v.literal("financiero"),
      v.literal("otro")
    ),
    storageId: v.optional(v.id("_storage")), // legacy Convex Storage
    url: v.optional(v.string()), // S3 public URL
    s3Key: v.optional(v.string()),
    mimeType: v.string(),
    tamanio: v.number(),
    autorNombre: v.string(),
    descripcion: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_condominio", ["condominioId"])
    .index("by_categoria", ["condominioId", "categoria"]),

  // ─────────────────────────────────────────────────────────────
  // Comunicados / Avisos a residentes
  // ─────────────────────────────────────────────────────────────
  comunicados: defineTable({
    condominioId: v.id("condominios"),
    autorUserId: v.optional(v.id("users")),
    autorNombre: v.string(),

    titulo: v.string(),
    cuerpo: v.string(),

    // A quién va dirigido
    audiencia: v.union(
      v.literal("todos"),
      v.literal("propietario"),
      v.literal("arrendatario"),
      v.literal("residente"),
      v.literal("junta_directiva"),
      v.literal("guardia") // avisos dirigidos a seguridad/portería
    ),
    prioridad: v.union(
      v.literal("normal"),
      v.literal("importante"),
      v.literal("urgente")
    ),
    fijado: v.boolean(),

    // Archivos adjuntos (imágenes, PDF, documentos) — S3 preferido
    archivos: v.optional(v.array(v.object({
      storageId: v.optional(v.id("_storage")), // legacy
      url: v.optional(v.string()),
      s3Key: v.optional(v.string()),
      mimeType: v.string(),
      nombre: v.string(),
    }))),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_condominio", ["condominioId"]),

  // ─────────────────────────────────────────────────────────────
  // Asambleas (reuniones de propietarios)
  // ─────────────────────────────────────────────────────────────
  asambleas: defineTable({
    /* Totales del censo de unidades, congelados al abrir la sala.
     *
     * `salaEnVivo` los necesitaba para el quórum y los sacaba leyendo TODAS
     * las unidades del conjunto en cada ejecución: 384 documentos, por cada
     * uno de los 140 conectados, cada vez que alguien entraba o salía. Son dos
     * números que no cambian durante la reunión; guardarlos corta el 60% de
     * las lecturas sin que la pantalla note nada. */
    totalCoeficiente: v.optional(v.number()),
    totalUnidades: v.optional(v.number()),
    condominioId: v.id("condominios"),
    titulo: v.string(),
    tipo: v.union(v.literal("ordinaria"), v.literal("extraordinaria")),
    modalidad: v.union(v.literal("presencial"), v.literal("virtual"), v.literal("mixta")),
    fecha: v.string(),      // "2026-08-15"
    hora: v.string(),       // "18:00"
    lugar: v.optional(v.string()),
    estado: v.union(
      v.literal("programada"),
      v.literal("en_curso"),
      v.literal("finalizada"),
      v.literal("cancelada")
    ),
    quorumRequerido: v.optional(v.number()),  // % coeficiente requerido
    quorumAlcanzado: v.optional(v.number()),  // % coeficiente asistente
    agenda: v.array(v.string()),  // legado: orden del día como texto simple
    // Orden del día estructurado: cada punto puede tener su votación ligada.
    ordenDia: v.optional(
      v.array(
        v.object({
          titulo: v.string(),
          descripcion: v.optional(v.string()),
          votacionId: v.optional(v.id("votaciones")),
          /** true cuando la mesa marca el punto como realizado. */
          hecho: v.optional(v.boolean()),
        })
      )
    ),
    descripcion: v.optional(v.string()),
    actaStorageId: v.optional(v.id("_storage")), // legacy
    actaUrl: v.optional(v.string()),
    /**
     * Semilla del código rotativo de asistencia (asambleas virtuales).
     *
     * SECRETA: solo se entrega al administrador, que es quien proyecta el
     * código en la pantalla compartida. De ella se deriva un código distinto
     * cada 60 s sin escribir en la base de datos. Ver
     * `convex/lib/codigoAsistencia.ts`.
     */
    codigoAsistenciaSemilla: v.optional(v.string()),
    /**
     * Enlace externo de la reunión (Meet, Zoom…) mientras el video propio no
     * está integrado. Solo https; lo sanea `saneaEnlaceReunion`.
     */
    enlaceReunion: v.optional(v.string()),
    /**
     * Momentos reales de inicio y cierre, no la hora programada.
     *
     * La permanencia se mide contra esta ventana: si la asamblea estaba
     * citada a las 18:00 pero arrancó 18:40, quien llegó 18:35 estuvo el
     * 100 % del tiempo, no el 90 %. Los pone `setEstado`.
     */
    iniciadaEn: v.optional(v.number()),
    finalizadaEn: v.optional(v.number()),
    /**
     * Si es true, para votar hay que tener una conexión ABIERTA en la sala
     * (ver `asambleaSesiones`), no basta con haber marcado asistencia.
     *
     * Por defecto va apagado a propósito: mientras el frontend de la sala no
     * envíe latidos, todas las conexiones se cerrarían por inactividad y
     * nadie podría votar. Se enciende cuando la sala esté en producción.
     */
    exigirConexionParaVotar: v.optional(v.boolean()),
    /**
     * Presidente de esta asamblea (para acta / bitácora).
     * Lo asigna la mesa; no implica rol de sistema.
     */
    presidenteUserId: v.optional(v.id("users")),
    presidenteNombre: v.optional(v.string()),
    /**
     * Código del enlace de invitados (sin voto ni quórum).
     * Quien entra por `/invitado?codigo=…` puede hablar/compartir pantalla
     * si la mesa le da la palabra; no registra asistencia.
     */
    codigoInvitado: v.optional(v.string()),
    /**
     * Transcripción en vivo encendida (ver `salaIntervenciones`).
     *
     * Va APAGADA por defecto y solo la enciende la mesa, porque transcribir
     * es tratamiento de datos personales: mientras esté encendida la sala
     * muestra el aviso y sin ese aviso previo la grabación no es defendible.
     * El transcriptor consulta este campo y se sale de la sala si se apaga.
     */
    transcripcionActiva: v.optional(v.boolean()),
    /** Instante en que se encendió: es la constancia de cuándo se avisó. */
    transcripcionIniciadaEn: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_condominio", ["condominioId"])
    .index("by_codigo_invitado", ["codigoInvitado"])
    // El transcriptor pregunta cada pocos segundos a qué salas debe entrar.
    // Sin este índice esa consulta barrería todas las asambleas históricas
    // del sistema en cada vuelta.
    .index("by_estado", ["estado"]),

  // ─────────────────────────────────────────────────────────────
  // Asistencia a asambleas (quórum en tiempo real)
  //
  // Una fila por unidad presente. El coeficiente de la unidad suma al quórum.
  // ─────────────────────────────────────────────────────────────
  asambleaAsistentes: defineTable({
    condominioId: v.id("condominios"),
    asambleaId: v.id("asambleas"),
    unidadId: v.id("unidades"),
    unidadNumero: v.string(),
    userId: v.id("users"),
    userNombre: v.string(),
    coeficiente: v.optional(v.number()),
    esPoder: v.optional(v.boolean()), // true si asiste en representación (poder)
    createdAt: v.number(),
  })
    .index("by_asamblea", ["asambleaId"])
    .index("by_asamblea_unidad", ["asambleaId", "unidadId"])
    .index("by_asamblea_user", ["asambleaId", "userId"]),

  // ─────────────────────────────────────────────────────────────
  // Conexiones a la sala de la asamblea (permanencia y quórum instantáneo)
  //
  // `asambleaAsistentes` responde "¿entró?" con una sola marca de tiempo.
  // Esta tabla responde "¿cuánto estuvo?" y "¿estaba conectado a las 19:42,
  // cuando se votó el punto 4?" — que es lo que sostiene un acta cuando
  // alguien la impugna.
  //
  // Una fila = UN TRAMO continuo de conexión. Quien se cae y vuelve genera
  // dos filas; la permanencia es la suma de los tramos, no la resta entre la
  // primera entrada y la última salida.
  // ─────────────────────────────────────────────────────────────
  asambleaSesiones: defineTable({
    condominioId: v.id("condominios"),
    asambleaId: v.id("asambleas"),
    unidadId: v.id("unidades"),
    unidadNumero: v.string(),
    /** Quién estaba conectado por esa unidad: el dueño o su apoderado. */
    userId: v.id("users"),
    userNombre: v.string(),
    coeficiente: v.optional(v.number()),
    esPoder: v.optional(v.boolean()),

    entroEn: v.number(),
    salioEn: v.optional(v.number()),
    /**
     * Duplica `salioEn === undefined`, pero como booleano indexable.
     * Convex necesita un campo concreto para filtrar por índice, y buscar
     * las conexiones abiertas es la consulta más caliente de toda la sala.
     * Se escriben SIEMPRE juntos, en la misma mutación.
     */
    abierta: v.boolean(),
    motivoSalida: v.optional(
      v.union(
        v.literal("salida"),          // cerró la sala a propósito
        v.literal("inactividad"),     // dejó de latir: se le cayó la conexión
        v.literal("retirada_admin"),  // la mesa le quitó la asistencia
        v.literal("cierre_asamblea")  // se acabó la asamblea con él dentro
      )
    ),
    origen: v.union(
      v.literal("codigo"),        // código rotativo de la asamblea virtual
      v.literal("sala"),          // entró (o reconectó) por la sala de Vekino
      v.literal("manual_admin"),  // la mesa lo registró
      v.literal("poder_codigo"),  // apoderado con el código de su poder
      v.literal("presencial")     // asistencia presencial sin sala virtual
    ),
    /** Última señal de vida. El cron cierra lo que lleva rato mudo. */
    ultimoLatido: v.number(),
  })
    .index("by_asamblea", ["asambleaId"])
    .index("by_asamblea_unidad", ["asambleaId", "unidadId"])
    .index("by_asamblea_abierta", ["asambleaId", "abierta"])
    // Para el cron, que barre TODAS las asambleas a la vez.
    .index("by_abierta_latido", ["abierta", "ultimoLatido"]),

  // ─────────────────────────────────────────────────────────────
  // Poderes de asamblea (delegación de voto por unidad)
  //
  // Un propietario (otorgante) delega su unidad a un representante para una
  // asamblea. Debe ser validado por el representante para contar. Una unidad
  // tiene máximo un poder por asamblea.
  // ─────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────
  // Quién tiene la pestaña de la sala abierta AHORA (como Meet).
  // Distinto de asambleaSesiones: eso es permanencia por unidad / quórum.
  // Aquí cuenta PERSONAS en la reunión, aunque la mesa no tenga unidades.
  // ─────────────────────────────────────────────────────────────
  salaPresencias: defineTable({
    condominioId: v.id("condominios"),
    asambleaId: v.id("asambleas"),
    userId: v.optional(v.id("users")),
    /** Apoderado externo sin cuenta: se identifica por el código del poder. */
    codigoPoder: v.optional(v.string()),
    /**
     * Invitado externo (enlace de invitados): sesión única por persona.
     * No suma quórum ni puede votar.
     */
    codigoInvitado: v.optional(v.string()),
    nombre: v.string(),
    /** Foto de perfil (URL) para las cards tipo Meet. */
    imageUrl: v.optional(v.string()),
    esMesa: v.boolean(),
    ultimoLatido: v.number(),
  })
    .index("by_asamblea", ["asambleaId"])
    .index("by_asamblea_user", ["asambleaId", "userId"])
    .index("by_asamblea_codigo", ["asambleaId", "codigoPoder"])
    .index("by_asamblea_invitado", ["asambleaId", "codigoInvitado"])
    .index("by_latido", ["ultimoLatido"]),

  /**
   * Sesiones de invitados a la sala (enlace compartido).
   * Cada persona que entra con nombre obtiene un `sesionCodigo` propio.
   * Nunca crea filas en asambleaAsistentes / asambleaSesiones.
   */
  asambleaInvitadoSesiones: defineTable({
    condominioId: v.id("condominios"),
    asambleaId: v.id("asambleas"),
    /** Código del enlace de la asamblea al momento de unirse. */
    codigoEnlace: v.string(),
    /** Identidad de esta persona en la sala (única). */
    sesionCodigo: v.string(),
    nombre: v.string(),
    ultimoLatido: v.number(),
    createdAt: v.number(),
  })
    .index("by_sesion", ["sesionCodigo"])
    .index("by_asamblea", ["asambleaId"])
    .index("by_asamblea_enlace", ["asambleaId", "codigoEnlace"]),

  // ─────────────────────────────────────────────────────────────
  // Video propio de la sala (WebRTC, señalización por Convex)
  //
  // Sin Meet, sin Zoom, sin proveedor: la mesa publica cámara/pantalla desde
  // su navegador y cada asistente se conecta punto a punto. Convex solo
  // transporta la señalización (ofertas SDP, respuestas, candidatos ICE);
  // el video NUNCA pasa por la base de datos.
  // ─────────────────────────────────────────────────────────────
  salaEmisores: defineTable({
    condominioId: v.id("condominios"),
    asambleaId: v.id("asambleas"),
    /** Identidad de la PESTAÑA emisora (uuid por sesión de navegador). */
    clienteId: v.string(),
    userId: v.optional(v.id("users")),
    /** Invitado externo emitiendo con palabra concedida. */
    codigoInvitado: v.optional(v.string()),
    /** Apoderado por código de poder emitiendo con palabra concedida. */
    codigoPoder: v.optional(v.string()),
    nombre: v.string(),
    medio: v.union(v.literal("camara"), v.literal("pantalla")),
    /** Cámara deshabilitada (frames negros): el espectador pinta avatar. */
    camApagada: v.optional(v.boolean()),
    /** Micrófono en silencio: el espectador pinta el tachado. */
    micApagado: v.optional(v.boolean()),
    /** El emisor late; sin latido ~90 s, el cron lo retira. */
    ultimoLatido: v.number(),
    createdAt: v.number(),
  })
    .index("by_asamblea", ["asambleaId"])
    .index("by_asamblea_cliente", ["asambleaId", "clienteId"]),

  /**
   * La palabra: el residente levanta la mano, la mesa la concede y con eso
   * puede encender micrófono/cámara (equivalente al "unmute" de una reunión
   * grande). Una fila por persona y asamblea.
   */
  salaPalabra: defineTable({
    condominioId: v.id("condominios"),
    asambleaId: v.id("asambleas"),
    userId: v.optional(v.id("users")),
    /** Invitado externo (sesión del enlace de invitados). */
    codigoInvitado: v.optional(v.string()),
    /** Apoderado externo (código de poder, sin cuenta). */
    codigoPoder: v.optional(v.string()),
    nombre: v.string(),
    estado: v.union(v.literal("pedida"), v.literal("concedida")),
    /** Instantes de la concesión (auditoría / cronómetro). */
    concedidaEn: v.optional(v.number()),
    /** Si hay límite: la palabra se retira sola al llegar. */
    cierraEn: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_asamblea", ["asambleaId"])
    .index("by_asamblea_user", ["asambleaId", "userId"])
    .index("by_asamblea_invitado", ["asambleaId", "codigoInvitado"])
    .index("by_asamblea_poder", ["asambleaId", "codigoPoder"]),

  /**
   * El pulso de quien está conectado, separado de todo lo demás.
   *
   * ── Por qué existe esta tabla ─────────────────────────────────────────
   * Convex reejecuta una consulta cuando cambia CUALQUIER documento que
   * leyó, y la granularidad es el documento entero, no el campo. Mientras
   * `ultimoLatido` vivía dentro de `asambleaSesiones` y `salaPresencias`
   * —las dos tablas que lee `salaEnVivo`—, cada latido de cada persona
   * invalidaba la consulta de TODAS las demás.
   *
   * Con N personas en la sala eso son 2N escrituras cada 30 s, y cada una
   * dispara N reejecuciones: **2N² llamadas cada medio minuto**. Medido en
   * la práctica: `salaEnVivo` era la mitad del consumo de todo el proyecto,
   * y una asamblea de 300 personas —el tope del servidor de medios— habría
   * costado del orden de 87 millones de llamadas.
   *
   * Aquí el pulso cae en documentos que `salaEnVivo` no lee jamás, así que
   * latir dejó de despertar a nadie. La consulta solo se recalcula cuando
   * alguien entra o sale de verdad.
   *
   * El precio: a quien se le cae la conexión sin cerrar la pestaña deja de
   * verse en la lista cuando pasa el cron (hasta un minuto más tarde que
   * antes) en vez de al vencer su propio latido. El quórum no cambia —ya
   * dependía del cron, porque se calcula sobre `abierta`.
   */
  salaLatidos: defineTable({
    asambleaId: v.id("asambleas"),
    // Uno de los dos. Qué documento mantiene vivo este pulso.
    sesionId: v.optional(v.id("asambleaSesiones")),
    presenciaId: v.optional(v.id("salaPresencias")),
    ultimoLatido: v.number(),
  })
    .index("by_sesion", ["sesionId"])
    .index("by_presencia", ["presenciaId"])
    // Para el cron, que barre por antigüedad sin importar la asamblea.
    .index("by_latido", ["ultimoLatido"]),

  /** Reacciones efímeras tipo Meet (👍👏❤️…): viven unos segundos en pantalla. */
  salaReacciones: defineTable({
    condominioId: v.id("condominios"),
    asambleaId: v.id("asambleas"),
    emoji: v.string(),
    nombre: v.string(),
    userId: v.optional(v.id("users")),
    codigoPoder: v.optional(v.string()),
    codigoInvitado: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_asamblea_created", ["asambleaId", "createdAt"]),

  /** Chat de la sala: mensajes cortos entre quienes están en la llamada. */
  salaMensajes: defineTable({
    condominioId: v.id("condominios"),
    asambleaId: v.id("asambleas"),
    texto: v.string(),
    nombre: v.string(),
    userId: v.optional(v.id("users")),
    codigoPoder: v.optional(v.string()),
    codigoInvitado: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_asamblea_created", ["asambleaId", "createdAt"]),

  /**
   * Silenciados del chat: la mesa bloquea a quien se pasa de la raya.
   * Pueden seguir viendo el chat; no pueden enviar.
   */
  salaChatSilenciados: defineTable({
    condominioId: v.id("condominios"),
    asambleaId: v.id("asambleas"),
    userId: v.optional(v.id("users")),
    codigoPoder: v.optional(v.string()),
    codigoInvitado: v.optional(v.string()),
    nombre: v.string(),
    silenciadoPorUserId: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_asamblea", ["asambleaId"])
    .index("by_asamblea_user", ["asambleaId", "userId"])
    .index("by_asamblea_poder", ["asambleaId", "codigoPoder"])
    .index("by_asamblea_invitado", ["asambleaId", "codigoInvitado"]),

  /**
   * Bitácora de la sala: entradas, palabra, votos, chat, grabación…
   * Respaldo textual de lo que pasó, alineado con el audio grabado.
   */
  salaBitacora: defineTable({
    condominioId: v.id("condominios"),
    asambleaId: v.id("asambleas"),
    tipo: v.union(
      v.literal("entrada"),
      v.literal("salida"),
      v.literal("palabra_pedida"),
      v.literal("palabra_concedida"),
      v.literal("palabra_retirada"),
      v.literal("votacion_abierta"),
      v.literal("votacion_cerrada"),
      v.literal("voto"),
      v.literal("chat"),
      v.literal("reaccion"),
      v.literal("grabacion_inicio"),
      v.literal("grabacion_fin"),
      v.literal("transcripcion_inicio"),
      v.literal("transcripcion_fin"),
      v.literal("presidente_asignado"),
    ),
    nombre: v.string(),
    detalle: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    createdAt: v.number(),
  }).index("by_asamblea_created", ["asambleaId", "createdAt"]),

  /**
   * Lo que se habló, transcrito en vivo.
   *
   * Vive aparte de `salaBitacora` por volumen: una asamblea de cuatro horas
   * deja decenas de eventos y varios miles de intervenciones. Mezclarlas
   * volvería lenta la consulta de la bitácora, que es la que se pinta en
   * pantalla durante toda la reunión.
   *
   * Quién habla NO se deduce del audio. El servidor de medios entrega una
   * pista por participante y el token trae la identidad firmada, así que
   * cada segmento llega ya atribuido: no hay diarización ni conjeturas.
   *
   * El audio no se guarda en ningún momento. Pasa por el transcriptor, se
   * convierte en texto y se descarta; esto es lo único que queda.
   */
  salaIntervenciones: defineTable({
    condominioId: v.id("condominios"),
    asambleaId: v.id("asambleas"),

    // Misma identidad que el resto de la sala: usuario con cuenta o invitado
    // externo por código de sesión.
    userId: v.optional(v.id("users")),
    codigoInvitado: v.optional(v.string()),
    /**
     * Nombre y unidad tal como estaban AL HABLAR. Copiados a propósito: un
     * acta ya emitida no puede cambiar porque después se renombre a alguien
     * o se le reasigne la unidad.
     */
    nombre: v.string(),
    unidadNumero: v.optional(v.string()),

    /** Ventana real del segmento hablado. */
    inicioEn: v.number(),
    finEn: v.number(),

    texto: v.string(),
    /** 0–1 del motor. Por debajo de 0.6 la interfaz lo marca como dudoso. */
    confianza: v.optional(v.number()),

    /**
     * Contexto del momento, resuelto AL INSERTAR y no al leer.
     *
     * El orden del día se reordena y se edita durante la asamblea. Si esto
     * se calculara al generar el acta, una intervención terminaría colgada
     * del punto equivocado. Congelarlo aquí es lo que hace que la frase
     * quede pegada al punto que de verdad se estaba discutiendo.
     */
    puntoIndice: v.optional(v.number()),
    /**
     * Votación abierta en ese instante, si la había. Es lo que permite
     * responder «qué se dijo justo antes de decidir este punto», que es
     * exactamente lo que se pide cuando impugnan un acta.
     */
    votacionId: v.optional(v.id("votaciones")),

    fuente: v.union(
      v.literal("stt"),    // motor de transcripción
      v.literal("manual"), // la secretaría la escribió a mano
    ),

    /**
     * Corrección de la secretaría.
     *
     * El texto original NO se pisa. Una transcripción automática se
     * equivoca con nombres y cifras, y hay que poder corregirla; pero si la
     * corrección borrara el original, el acta dejaría de ser auditable y
     * cualquiera podría reescribir lo que se dijo sin dejar rastro.
     */
    textoOriginal: v.optional(v.string()),
    editadoPorUserId: v.optional(v.id("users")),
    editadoEn: v.optional(v.number()),

    createdAt: v.number(),
  })
    .index("by_asamblea_inicio", ["asambleaId", "inicioEn"])
    .index("by_asamblea_votacion", ["asambleaId", "votacionId"]),

  /**
   * Resumen redactado de cada punto del orden del día.
   *
   * Es la ÚNICA parte del acta que escribe un modelo, y por eso vive en su
   * propia tabla y no mezclada con los datos duros: el quórum, los votos y
   * los coeficientes se calculan de la base y se pueden reproducir; esto no.
   * Tenerlo separado deja claro qué hay que revisar antes de firmar.
   */
  asambleaResumenes: defineTable({
    condominioId: v.id("condominios"),
    asambleaId: v.id("asambleas"),
    puntos: v.array(
      v.object({
        puntoIndice: v.number(),
        titulo: v.string(),
        resumen: v.string(),
        /** Cuántas intervenciones se resumieron. Cero = no se habló del punto. */
        intervenciones: v.number(),
        /** La secretaría reescribió este punto a mano. */
        editado: v.optional(v.boolean()),
      }),
    ),
    /** Qué modelo lo redactó. Va impreso en el acta. */
    modelo: v.string(),
    generadoEn: v.number(),
    generadoPorUserId: v.id("users"),
  }).index("by_asamblea", ["asambleaId"]),

  /** Sesión de grabación activa (la mesa graba en el navegador). */
  salaGrabacion: defineTable({
    condominioId: v.id("condominios"),
    asambleaId: v.id("asambleas"),
    iniciadaPorUserId: v.id("users"),
    iniciadaPorNombre: v.string(),
    estado: v.union(v.literal("activa"), v.literal("terminada")),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
  }).index("by_asamblea", ["asambleaId"]),

  salaSenales: defineTable({
    asambleaId: v.id("asambleas"),
    deClienteId: v.string(),
    paraClienteId: v.string(),
    tipo: v.union(
      v.literal("oferta"),
      v.literal("respuesta"),
      v.literal("ice"),
      v.literal("lleno") // el emisor alcanzó su tope de conexiones P2P
    ),
    /** SDP o candidato ICE, en JSON. Se borra al ser consumida. */
    datos: v.string(),
    createdAt: v.number(),
  }).index("by_asamblea_para", ["asambleaId", "paraClienteId"]),

  poderesAsamblea: defineTable({
    condominioId: v.id("condominios"),
    asambleaId: v.id("asambleas"),
    unidadId: v.id("unidades"),
    unidadNumero: v.string(),
    coeficiente: v.optional(v.number()),
    otorganteUserId: v.id("users"),
    otorganteNombre: v.string(),
    // Apoderado: usuario existente (opcional) o persona externa con código.
    representanteUserId: v.optional(v.id("users")),
    representanteNombre: v.string(),
    apoderadoDocumento: v.optional(v.string()),
    codigoAcceso: v.string(), // código que usa el apoderado para ingresar y votar
    documentoStorageId: v.optional(v.id("_storage")), // legacy
    documentoUrl: v.optional(v.string()),
    validado: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_asamblea", ["asambleaId"])
    .index("by_asamblea_unidad", ["asambleaId", "unidadId"])
    .index("by_representante", ["asambleaId", "representanteUserId"])
    .index("by_otorgante", ["asambleaId", "otorganteUserId"])
    .index("by_codigo", ["codigoAcceso"]),

  // ─────────────────────────────────────────────────────────────
  // Votos individuales (un voto por unidad por votación)
  // ─────────────────────────────────────────────────────────────
  votosAsamblea: defineTable({
    condominioId: v.id("condominios"),
    asambleaId: v.id("asambleas"),
    votacionId: v.id("votaciones"),
    unidadId: v.id("unidades"),
    unidadNumero: v.string(),
    userId: v.optional(v.id("users")),      // quién emitió (si es usuario)
    codigoApoderado: v.optional(v.string()), // o el código del apoderado
    opcionIndex: v.number(),
    coeficiente: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_votacion", ["votacionId"])
    .index("by_votacion_unidad", ["votacionId", "unidadId"])
    .index("by_asamblea", ["asambleaId"]),

  // ─────────────────────────────────────────────────────────────
  // Votaciones (dentro de una asamblea)
  // ─────────────────────────────────────────────────────────────
  votaciones: defineTable({
    condominioId: v.id("condominios"),
    asambleaId: v.id("asambleas"),
    asambleaTitulo: v.string(),
    pregunta: v.string(),
    opciones: v.array(v.object({ texto: v.string(), votos: v.number() })),
    estado: v.union(v.literal("abierta"), v.literal("cerrada")),
    /** true si alguna vez se abrió (para resultados: ocultar puntos nunca abiertos). */
    abiertaAlgunaVez: v.optional(v.boolean()),
    /**
     * Ventana real de la votación. Sin estas dos fechas no se puede
     * reconstruir el quórum del instante en que se decidió el punto, que es
     * exactamente lo que se discute cuando se impugna un acta.
     */
    abiertaEn: v.optional(v.number()),
    cerradaEn: v.optional(v.number()),
    /**
     * Si está abierta con temporizador: instante en que debe cerrarse sola.
     * La mesa puede extenderlo o cerrar antes. Sin este campo = sin límite.
     */
    cierraEn: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_condominio", ["condominioId"])
    .index("by_asamblea", ["asambleaId"]),

  // ─────────────────────────────────────────────────────────────
  // PQRS (Peticiones, Quejas, Reclamos, Sugerencias)
  // ─────────────────────────────────────────────────────────────
  pqrs: defineTable({
    condominioId: v.id("condominios"),
    radicado: v.string(),   // consecutivo, ej "PQRS-2026-0001"
    tipo: v.union(
      v.literal("peticion"),
      v.literal("queja"),
      v.literal("reclamo"),
      v.literal("sugerencia"),
      v.literal("felicitacion")
    ),
    asunto: v.string(),
    descripcion: v.string(),
    solicitanteNombre: v.string(),
    solicitanteUserId: v.optional(v.id("users")),
    unidadNumero: v.optional(v.string()),
    estado: v.union(
      v.literal("abierto"),
      v.literal("en_gestion"),
      v.literal("resuelto"),
      v.literal("cerrado")
    ),
    prioridad: v.union(v.literal("baja"), v.literal("media"), v.literal("alta")),
    // Hilo de conversación (historial admin ↔ residente).
    mensajes: v.optional(
      v.array(
        v.object({
          autorNombre: v.string(),
          autorUserId: v.optional(v.id("users")),
          esAdmin: v.boolean(),
          texto: v.string(),
          createdAt: v.number(),
        })
      )
    ),
    // Legado: primera respuesta única (antes del hilo).
    respuesta: v.optional(v.string()),
    respondidoPor: v.optional(v.string()),
    resueltoAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_condominio", ["condominioId"])
    .index("by_estado", ["condominioId", "estado"]),

  // ─────────────────────────────────────────────────────────────
  // Consejo administrativo — documentos por categoría (versión + comentarios)
  // ─────────────────────────────────────────────────────────────
  consejoCategorias: defineTable({
    condominioId: v.id("condominios"),
    nombre: v.string(),
    slug: v.string(),
    /** Legado: clave lucide. Preferir iconType + iconValue. */
    iconKey: v.optional(v.string()),
    colorKey: v.optional(v.string()),
    /** Notion-like: lucide | emoji | svg | image */
    iconType: v.optional(
      v.union(
        v.literal("lucide"),
        v.literal("emoji"),
        v.literal("svg"),
        v.literal("image"),
      ),
    ),
    /** lucide key, emoji, markup SVG sanitizado, o URL de imagen */
    iconValue: v.optional(v.string()),
    orden: v.number(),
    activo: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_condominio", ["condominioId"])
    .index("by_condominio_slug", ["condominioId", "slug"]),

  consejoDocumentos: defineTable({
    condominioId: v.id("condominios"),
    categoriaId: v.id("consejoCategorias"),
    titulo: v.string(),
    descripcion: v.optional(v.string()),
    periodoMes: v.optional(v.string()), // "2026-04"
    fileUrl: v.string(),
    fileName: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
    s3Key: v.optional(v.string()),
    version: v.number(),
    estado: v.union(
      v.literal("pendiente"),
      v.literal("en_revision"),
      v.literal("aprobado"),
      v.literal("reemplazado"),
    ),
    createdByUserId: v.optional(v.id("users")),
    createdByNombre: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_condominio", ["condominioId"])
    .index("by_categoria", ["categoriaId"]),

  consejoDocumentoVersiones: defineTable({
    condominioId: v.id("condominios"),
    documentoId: v.id("consejoDocumentos"),
    version: v.number(),
    fileUrl: v.string(),
    fileName: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
    s3Key: v.optional(v.string()),
    subidoPorUserId: v.optional(v.id("users")),
    subidoPorNombre: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_documento", ["documentoId"]),

  consejoDocumentoComentarios: defineTable({
    condominioId: v.id("condominios"),
    documentoId: v.id("consejoDocumentos"),
    userId: v.id("users"),
    autorNombre: v.string(),
    contenido: v.string(),
    /** Respuesta a otro comentario */
    parentId: v.optional(v.id("consejoDocumentoComentarios")),
    activo: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_documento", ["documentoId"])
    .index("by_parent", ["parentId"]),

  consejoComentarioReacciones: defineTable({
    condominioId: v.id("condominios"),
    comentarioId: v.id("consejoDocumentoComentarios"),
    userId: v.id("users"),
    emoji: v.string(),
    createdAt: v.number(),
  })
    .index("by_comentario", ["comentarioId"])
    .index("by_comentario_user_emoji", ["comentarioId", "userId", "emoji"]),

  // ─────────────────────────────────────────────────────────────
  // Consejo administrativo — miembros (catálogo de cargos)
  // ─────────────────────────────────────────────────────────────
  consejoMiembros: defineTable({
    condominioId: v.id("condominios"),
    nombre: v.string(),
    cargo: v.union(
      v.literal("presidente"),
      v.literal("vicepresidente"),
      v.literal("secretario"),
      v.literal("tesorero"),
      v.literal("vocal"),
      v.literal("fiscal"),
      v.literal("suplente")
    ),
    unidadNumero: v.optional(v.string()),
    telefono: v.optional(v.string()),
    email: v.optional(v.string()),
    periodoInicio: v.optional(v.string()),
    periodoFin: v.optional(v.string()),
    activo: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_condominio", ["condominioId"]),

  // ─────────────────────────────────────────────────────────────
  // Consejo administrativo — sesiones / reuniones
  // ─────────────────────────────────────────────────────────────
  consejoSesiones: defineTable({
    condominioId: v.id("condominios"),
    titulo: v.string(),
    tipo: v.union(v.literal("ordinaria"), v.literal("extraordinaria")),
    fecha: v.string(),
    asistentes: v.optional(v.number()),
    temas: v.optional(v.string()),
    acuerdos: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_condominio", ["condominioId"]),

  // ─────────────────────────────────────────────────────────────
  // Paquetería (portería / guardia)
  //
  // El guardia recibe un paquete para una unidad ("recibido") y luego lo
  // marca "entregado" cuando el residente lo recoge.
  // ─────────────────────────────────────────────────────────────
  paquetes: defineTable({
    condominioId: v.id("condominios"),
    unidadNumero: v.string(),
    destinatario: v.optional(v.string()),      // nombre de quien recibe
    remitente: v.optional(v.string()),          // empresa / transportadora
    tipo: v.union(
      v.literal("paquete"),
      v.literal("sobre"),
      v.literal("comida"),
      v.literal("mercado"),
      v.literal("otro")
    ),
    descripcion: v.optional(v.string()),
    estado: v.union(v.literal("recibido"), v.literal("entregado")),
    // Evidencia fotográfica (llegada y entrega). Preferir URL S3.
    fotoStorageId: v.optional(v.id("_storage")), // legacy
    fotoUrl: v.optional(v.string()),
    fotoEntregaStorageId: v.optional(v.id("_storage")), // legacy
    fotoEntregaUrl: v.optional(v.string()),
    observacionesEntrega: v.optional(v.string()),
    recibidoPorNombre: v.string(),              // guardia que recibió
    entregadoPorNombre: v.optional(v.string()), // guardia que entregó
    entregadoANombre: v.optional(v.string()),   // quién recogió
    fechaRecibido: v.number(),
    fechaEntregado: v.optional(v.number()),
  })
    .index("by_condominio", ["condominioId"])
    .index("by_estado", ["condominioId", "estado"]),

  // ─────────────────────────────────────────────────────────────
  // Guardia — turnos, checklist, rondas, minuta digital
  //
  // Réplica de la lógica de VekinoApi: el turno gobierna la operación
  // (sin turno abierto no hay minuta ni rondas); solo puede existir UN
  // turno abierto por condominio; el cierre es la "entrega" del turno
  // (consignas + quién recibe). La minuta es append-only: cada acción
  // del guardia genera un evento automáticamente.
  // ─────────────────────────────────────────────────────────────

  /** Plantilla de ítems que el guardia verifica al iniciar turno (dotación). */
  guardiaChecklistTemplates: defineTable({
    condominioId: v.id("condominios"),
    nombre: v.string(),
    obligatorio: v.boolean(),
    cantidadEsperada: v.number(),
    activo: v.boolean(),
    orden: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_condominio", ["condominioId"]),

  /** Catálogo de zonas de inspección para las rondas. */
  guardiaRondaZonas: defineTable({
    condominioId: v.id("condominios"),
    nombre: v.string(),
    activa: v.boolean(),
    orden: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_condominio", ["condominioId"]),

  guardiaTurnos: defineTable({
    condominioId: v.id("condominios"),
    guardiaUserId: v.id("users"),
    guardiaNombre: v.string(),
    // Turno compartido (segundo guardia): si uno cierra, se cierra para ambos.
    guardiaSecundarioUserId: v.optional(v.id("users")),
    guardiaSecundarioNombre: v.optional(v.string()),
    observacionesInicio: v.optional(v.string()),
    // Snapshot del checklist de dotación al abrir el turno.
    checklist: v.array(
      v.object({
        item: v.string(),
        obligatorio: v.boolean(),
        cantidadEsperada: v.number(),
        cantidadEncontrada: v.number(),
        estadoOk: v.boolean(),
        observacion: v.optional(v.string()),
      })
    ),
    // Cierre formal / entrega del turno.
    consignas: v.optional(v.string()),          // pendientes para el relevo
    recibe: v.optional(v.string()),             // quién recibe el turno
    observacionesCierre: v.optional(v.string()),
    estado: v.union(v.literal("abierto"), v.literal("cerrado")),
    fechaInicio: v.number(),
    fechaCierre: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_condominio", ["condominioId"])
    .index("by_condominio_estado", ["condominioId", "estado"]),

  /** Ronda de control dentro de un turno (zona + novedad + hasta 5 fotos). */
  guardiaRondas: defineTable({
    condominioId: v.id("condominios"),
    turnoId: v.id("guardiaTurnos"),
    zonaId: v.optional(v.id("guardiaRondaZonas")),
    zona: v.string(), // nombre denormalizado
    novedad: v.optional(v.string()),
    fotos: v.array(v.string()), // URLs S3 (o storageId legacy como string)
    createdAt: v.number(),
  })
    .index("by_turno", ["turnoId"])
    .index("by_condominio", ["condominioId"]),

  /**
   * Minuta digital (bitácora append-only). Los eventos se generan
   * automáticamente desde cada acción del guardia y también manualmente.
   * Sin update/delete: es el registro de auditoría de portería.
   */
  minutaEventos: defineTable({
    condominioId: v.id("condominios"),
    turnoId: v.optional(v.id("guardiaTurnos")), // turno activo al momento (si había)
    modulo: v.union(
      v.literal("visitantes"),
      v.literal("paqueteria"),
      v.literal("reservas"),
      v.literal("novedades"),
      v.literal("minuta") // turnos, rondas y eventos manuales
    ),
    tipo: v.string(),     // "Ingreso", "Salida", "Registro", "Ronda de Control"…
    unidad: v.string(),   // unidad relacionada o "Portería"
    resumen: v.string(),
    estado: v.union(v.literal("abierto"), v.literal("cerrado")),
    actorUserId: v.optional(v.id("users")),
    actorNombre: v.string(),
    createdAt: v.number(),
  })
    .index("by_condominio", ["condominioId"])
    .index("by_turno", ["turnoId"]),

  /** Reporte de novedad / incidente de seguridad (con adjunto opcional). */
  guardiaNovedadReportes: defineTable({
    condominioId: v.id("condominios"),
    turnoId: v.optional(v.id("guardiaTurnos")),
    titulo: v.string(),
    descripcion: v.string(),
    prioridad: v.union(v.literal("baja"), v.literal("media"), v.literal("alta")),
    archivoStorageId: v.optional(v.id("_storage")), // legacy
    archivoUrl: v.optional(v.string()),
    archivoNombre: v.optional(v.string()),
    reportadoPorUserId: v.id("users"),
    reportadoPorNombre: v.string(),
    createdAt: v.number(),
  }).index("by_condominio", ["condominioId"]),

  /**
   * Depósito / garantía de una reserva de zona común, controlado en portería.
   * La salida de la reserva NO se puede validar mientras el depósito siga
   * "registrado" (hay que resolverlo: devuelto o no devuelto con evidencia).
   */
  guardiaReservaDepositos: defineTable({
    condominioId: v.id("condominios"),
    reservaId: v.id("reservas"),
    monto: v.number(),
    observacionesIngreso: v.optional(v.string()),
    fotoIngresoStorageId: v.optional(v.id("_storage")), // legacy
    fotoIngresoUrl: v.optional(v.string()),
    estado: v.union(
      v.literal("registrado"),
      v.literal("devuelto"),
      v.literal("no_devuelto")
    ),
    observacionesSalida: v.optional(v.string()),
    fotoSalidaStorageId: v.optional(v.id("_storage")), // legacy
    fotoSalidaUrl: v.optional(v.string()),
    recibidoPorNombre: v.string(),
    resueltoPorNombre: v.optional(v.string()),
    fechaRegistro: v.number(),
    fechaResolucion: v.optional(v.number()),
  })
    .index("by_reserva", ["reservaId"])
    .index("by_condominio", ["condominioId"]),

  // ─────────────────────────────────────────────────────────────
  // Push notifications (tokens de dispositivo)
  // ─────────────────────────────────────────────────────────────
  pushTokens: defineTable({
    userId: v.id("users"),
    token: v.string(),
    platform: v.union(v.literal("ios"), v.literal("android"), v.literal("web")),
    enabled: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_token", ["token"]),

  // ─────────────────────────────────────────────────────────────
  // Soporte (ayuda al residente → admin del condo + superadmin)
  // ─────────────────────────────────────────────────────────────
  soporteTickets: defineTable({
    condominioId: v.optional(v.id("condominios")),
    condominioNombre: v.optional(v.string()),
    userId: v.id("users"),
    userNombre: v.string(),
    userEmail: v.string(),
    categoria: v.union(
      v.literal("factura"),
      v.literal("acceso"),
      v.literal("app"),
      v.literal("otro"),
    ),
    asunto: v.string(),
    mensaje: v.string(),
    /** Capturas de pantalla y archivos que adjunta quien reporta (S3). */
    archivos: v.optional(
      v.array(
        v.object({
          url: v.string(),
          s3Key: v.optional(v.string()),
          mimeType: v.string(),
          nombre: v.string(),
        }),
      ),
    ),
    estado: v.union(
      v.literal("abierto"),
      v.literal("en_gestion"),
      v.literal("resuelto"),
      v.literal("cerrado"),
    ),
    respuesta: v.optional(v.string()),
    /** Adjuntos de la respuesta de soporte. */
    archivosRespuesta: v.optional(
      v.array(
        v.object({
          url: v.string(),
          s3Key: v.optional(v.string()),
          mimeType: v.string(),
          nombre: v.string(),
        }),
      ),
    ),
    respondidoPorUserId: v.optional(v.id("users")),
    respondidoPorNombre: v.optional(v.string()),
    respondidoAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_condominio", ["condominioId"])
    .index("by_estado", ["estado"]),

  /**
   * Enlace de un solo uso para entrar sin teclear la clave.
   *
   * Guarda la contraseña temporal en claro a propósito: es la MISMA que ya va
   * viajando por WhatsApp, dura 30 minutos, se usa una vez y se borra al
   * usarse. A cambio, el residente entra tocando un botón en vez de copiar
   * "Vekino-RPMKGT-3687" a mano en el teléfono.
   */
  accesosRapidos: defineTable({
    token: v.string(),
    userId: v.id("users"),
    email: v.string(),
    password: v.string(),
    expiraAt: v.number(),
    usadoAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_token", ["token"]),

  // ─────────────────────────────────────────────────────────────
  // Automatizaciones: envíos programados (fecha y hora)
  // ─────────────────────────────────────────────────────────────

  /**
   * Un envío agendado. La ejecución la dispara el scheduler de Convex con
   * `runAt`, no un cron que barre: así el envío sale a la hora exacta y no
   * hay que revisar la tabla cada minuto.
   */
  enviosProgramados: defineTable({
    condominioId: v.id("condominios"),
    tipo: v.union(
      /** Enlace de la asamblea al propietario, para que se lo pase a su apoderado. */
      v.literal("apoderados_asamblea"),
      /** Mensaje libre a los residentes del condominio. */
      v.literal("mensaje_residentes"),
      /** Una plantilla aprobada de WhatsApp, elegida y con sus variables. */
      v.literal("plantilla_whatsapp"),
      /**
       * Los datos de acceso, por correo, a quienes nunca han entrado. No envía
       * de a un mensaje como los demás tipos: arranca el motor de lotes de
       * `credenciales.ts` (que rota contraseñas y sabe hacer rollback) y esta
       * fila queda como el espejo programable de ese trabajo.
       */
      v.literal("credenciales_acceso"),
      /**
       * Difunde un comunicado ya publicado: la plantilla por WhatsApp y el
       * cuerpo completo por correo. Nace del propio comunicado, no de un
       * formulario, para que nadie tenga que volver a escribir el título.
       */
      v.literal("comunicado_difusion"),
    ),
    asambleaId: v.optional(v.id("asambleas")),
    /** Solo en `comunicado_difusion`. */
    comunicadoId: v.optional(v.id("comunicados")),
    /** Solo en `credenciales_acceso`. Por defecto no toca a quien ya entró. */
    modoCredenciales: v.optional(
      v.union(
        v.literal("solo_sin_clave"),
        v.literal("nunca_ingreso"),
        v.literal("todos"),
      ),
    ),
    /** Solo en `credenciales_acceso`: el job real que hace el trabajo. */
    credencialesJobId: v.optional(v.id("envioCredencialesJobs")),
    /** Solo en `mensaje_residentes`. */
    asunto: v.optional(v.string()),
    mensaje: v.optional(v.string()),
    /** A quién va: rol operativo, o "todos". */
    audiencia: v.optional(v.string()),
    /** Solo en `plantilla_whatsapp`: nombre de la plantilla y sus variables. */
    plantilla: v.optional(v.string()),
    parametros: v.optional(v.array(v.string())),
    canal: v.union(
      v.literal("correo"),
      v.literal("whatsapp"),
      v.literal("ambos"),
    ),
    programadoPara: v.number(),
    /**
     * Reenvío: solo va a quienes NO recibieron el envío original (fallidos y
     * sin contacto). Sirve tras corregir teléfonos o correos en la plataforma.
     */
    reintentoDe: v.optional(v.id("enviosProgramados")),
    estado: v.union(
      v.literal("programado"),
      v.literal("enviando"),
      v.literal("completado"),
      v.literal("cancelado"),
      v.literal("fallido"),
    ),
    /** Id del job del scheduler, para poder cancelarlo. */
    scheduledFunctionId: v.optional(v.id("_scheduled_functions")),
    total: v.number(),
    enviados: v.number(),
    fallidos: v.number(),
    sinContacto: v.number(),
    error: v.optional(v.string()),
    creadoPorUserId: v.id("users"),
    creadoPorNombre: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_condominio", ["condominioId"])
    .index("by_estado", ["estado"]),

  /** Resultado por destinatario de un envío programado. */
  enviosProgramadosDetalle: defineTable({
    envioId: v.id("enviosProgramados"),
    condominioId: v.id("condominios"),
    /** Identidad estable del destinatario, para cruzar reenvíos. */
    clave: v.optional(v.string()),
    nombre: v.string(),
    destino: v.optional(v.string()),
    canal: v.string(),
    estado: v.union(
      v.literal("enviado"),
      v.literal("fallido"),
      v.literal("sin_contacto"),
    ),
    motivo: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_envio", ["envioId"]),

  // ─────────────────────────────────────────────────────────────
  // Envío masivo de credenciales de acceso (onboarding por correo)
  // ─────────────────────────────────────────────────────────────

  /**
   * Un envío masivo en curso o terminado. La cola (`pendientes`) vive en el
   * documento para que el proceso pueda reanudarse por lotes sin perder el
   * hilo si una tanda falla.
   */
  envioCredencialesJobs: defineTable({
    condominioId: v.id("condominios"),
    /**
     * - solo_sin_clave: no toca a quien ya tiene contraseña propia en Better Auth.
     * - nunca_ingreso:  a quien no hay evidencia de que haya entrado.
     * - todos:          a todos, rotando la clave incluso a quien ya usa la suya.
     */
    modo: v.union(
      v.literal("solo_sin_clave"),
      v.literal("nunca_ingreso"),
      v.literal("todos"),
    ),
    estado: v.union(
      v.literal("en_curso"),
      v.literal("completado"),
      v.literal("cancelado"),
    ),
    pendientes: v.array(v.id("users")),
    total: v.number(),
    procesados: v.number(),
    enviados: v.number(),
    fallidos: v.number(),
    omitidos: v.number(),
    iniciadoPorUserId: v.id("users"),
    iniciadoPorNombre: v.string(),
    /**
     * Si el job nació de un envío programado, aquí queda el vínculo de vuelta:
     * al terminar le copia los totales para que Automatizaciones muestre a
     * quién le llegó y a quién no, sin tener que mirar en dos sitios.
     */
    envioProgramadoId: v.optional(v.id("enviosProgramados")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_condominio", ["condominioId"])
    .index("by_condominio_estado", ["condominioId", "estado"]),

  /**
   * Resultado por destinatario. NUNCA guarda la contraseña en claro: solo
   * queda constancia de a quién se le envió, cuándo y con qué resultado.
   */
  envioCredenciales: defineTable({
    jobId: v.optional(v.id("envioCredencialesJobs")),
    condominioId: v.id("condominios"),
    userId: v.id("users"),
    nombre: v.string(),
    email: v.string(),
    estado: v.union(
      v.literal("enviado"),
      v.literal("fallido"),
      v.literal("omitido"),
    ),
    motivo: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_condominio", ["condominioId"])
    .index("by_job", ["jobId"]),

  // ─────────────────────────────────────────────────────────────
  // WhatsApp (YCloud) — bot conversacional + fan-out de plantillas
  // ─────────────────────────────────────────────────────────────

  /**
   * Una conversación por teléfono (número WABA compartido entre condominios:
   * el tenant activo se resuelve por el usuario y se fija aquí).
   */
  waConversations: defineTable({
    /**
     * E.164 con "+". OPCIONAL desde los usernames de WhatsApp: si el usuario
     * activó su @usuario, Meta deja de mandar el teléfono y solo llega el
     * BSUID (salvo interacción en los últimos 30 días).
     */
    telefono: v.optional(v.string()),
    /**
     * Business-Scoped User ID de Meta (`fromUserId`, formato "US.1349...").
     * Es estable por negocio y SIEMPRE viene, con o sin username: es la
     * identidad primaria de la conversación.
     */
    bsuid: v.optional(v.string()),
    /** @usuario de WhatsApp, si lo tiene. Solo para mostrar. */
    username: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    nombrePerfil: v.optional(v.string()), // customerProfile.name de WhatsApp
    condominioId: v.optional(v.id("condominios")),
    membershipId: v.optional(v.id("memberships")),

    /** Mensajes entrantes sin leer en el inbox del equipo. */
    noLeidos: v.optional(v.number()),
    /**
     * Mientras esté en el futuro, el agente NO responde: hay una persona del
     * equipo atendiendo. Se fija sola cuando alguien escribe desde el panel.
     */
    agentePausadoHasta: v.optional(v.number()),
    /** Quién del equipo respondió por última vez (para mostrarlo en el hilo). */
    ultimoAgenteNombre: v.optional(v.string()),
    /** El agente pidió ayuda humana: queda marcada en el inbox. */
    escaladaAt: v.optional(v.number()),
    escaladaMotivo: v.optional(v.string()),

    /** Paso de la máquina de estados del bot ("menu", "reserva:fecha", ...). */
    paso: v.string(),
    /** Datos del paso en curso (borrador de reserva, factura elegida, etc.). */
    contexto: v.optional(v.any()),

    /** Fin de la ventana de 24 h (último entrante + 24 h). Fuera de ella solo plantillas. */
    ventanaExpiraAt: v.optional(v.number()),
    /**
     * Marca del último mensaje ENTRANTE. Sirve para agrupar ráfagas: si al
     * ejecutarse el agente resulta que llegó algo más nuevo, se calla y deja
     * responder al último, que ya ve toda la conversación.
     */
    ultimoEntranteAt: v.optional(v.number()),
    /** Última vez que se le mandaron accesos por pedir ayuda para entrar. */
    ultimoRescateAccesoAt: v.optional(v.number()),
    ultimoMensajeAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_telefono", ["telefono"])
    .index("by_bsuid", ["bsuid"])
    .index("by_user", ["userId"]),

  waMessages: defineTable({
    conversacionId: v.id("waConversations"),
    telefono: v.optional(v.string()),
    direccion: v.union(v.literal("entrante"), v.literal("saliente")),
    tipo: v.string(), // text | image | document | interactive | template | ...
    contenido: v.string(),
    /** Media re-alojada en nuestro S3 (los links de YCloud caducan). */
    mediaUrl: v.optional(v.string()),
    mediaMime: v.optional(v.string()),
    mediaNombre: v.optional(v.string()),
    /** Nombre de quien respondió desde el panel (null = lo mandó el bot). */
    agenteNombre: v.optional(v.string()),
    /** Id del mensaje en YCloud: idempotencia de entrantes y correlación de estados. */
    ycloudMessageId: v.optional(v.string()),
    estado: v.optional(v.string()), // sent | delivered | read | failed
    error: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_conversacion", ["conversacionId"])
    .index("by_ycloudMessageId", ["ycloudMessageId"]),

  /** Registro de cada plantilla enviada en un fan-out (auditoría + no re-enviar). */
  waEnvios: defineTable({
    tipo: v.union(
      v.literal("comunicado"),
      v.literal("pago_aprobado"),
      v.literal("soporte_revisado"),
      v.literal("manual"),
    ),
    comunicadoId: v.optional(v.id("comunicados")),
    condominioId: v.id("condominios"),
    userId: v.optional(v.id("users")),
    telefono: v.optional(v.string()),
    template: v.string(),
    ycloudMessageId: v.optional(v.string()),
    estado: v.union(
      v.literal("enviado"),
      v.literal("fallido"),
      v.literal("sin_telefono"),
    ),
    error: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_comunicado", ["comunicadoId"])
    .index("by_condominio", ["condominioId"]),

  /**
   * Comprobante de pago subido por el propietario (foto/PDF por WhatsApp o web).
   * La administración lo revisa: aprobar marca la factura vinculada como pagada.
   */
  /**
   * Uso real de la plataforma, para saber qué módulos le importan a la gente.
   *
   * Hasta ahora lo único que sabíamos de un usuario era `authId`: si había
   * entrado ALGUNA VEZ. Ni cuándo, ni cada cuánto, ni a qué. Con eso no se
   * puede decidir qué construir después.
   *
   * Va agregada por (usuario, día, módulo) en vez de un evento por acción:
   * lo que interesa es "cuánta gente distinta usó reservas en agosto", no la
   * hora exacta de cada clic. Así la tabla crece con los usuarios activos y
   * no con su actividad, y el panel se puede consultar por índice.
   */
  actividadUso: defineTable({
    userId: v.id("users"),
    condominioId: v.optional(v.id("condominios")),
    /** "2026-08-07" en la zona del condominio, no UTC: si no, la actividad
     *  de la noche colombiana cae en el día siguiente y el mapa miente. */
    dia: v.string(),
    /** "app", "pagos", "asamblea", "reservas", "soporte"… */
    modulo: v.string(),
    veces: v.number(),
    ultimoAt: v.number(),
  })
    .index("by_dia", ["dia"])
    .index("by_user_dia_modulo", ["userId", "dia", "modulo"])
    .index("by_condominio_dia", ["condominioId", "dia"]),

  soportesPago: defineTable({
    condominioId: v.id("condominios"),
    unidadId: v.optional(v.id("unidades")),
    facturaId: v.optional(v.id("facturas")),
    userId: v.optional(v.id("users")),
    telefono: v.optional(v.string()),
    origen: v.union(v.literal("whatsapp"), v.literal("web")),

    url: v.string(), // comprobante en S3
    mimeType: v.optional(v.string()),
    nota: v.optional(v.string()), // caption que acompañó la imagen

    estado: v.union(
      v.literal("pendiente_revision"),
      v.literal("aprobado"),
      v.literal("rechazado"),
    ),
    revisadoPorUserId: v.optional(v.id("users")),
    revisadoPorNombre: v.optional(v.string()),
    revisadoAt: v.optional(v.number()),
    notaRevision: v.optional(v.string()),

    createdAt: v.number(),
  })
    .index("by_condominio", ["condominioId"])
    .index("by_condominio_estado", ["condominioId", "estado"])
    .index("by_factura", ["facturaId"]),
});
