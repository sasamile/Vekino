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
    .index("by_legacyId", ["legacyId"]),

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
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_condominio", ["condominioId"]),

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
  // Poderes de asamblea (delegación de voto por unidad)
  //
  // Un propietario (otorgante) delega su unidad a un representante para una
  // asamblea. Debe ser validado por el representante para contar. Una unidad
  // tiene máximo un poder por asamblea.
  // ─────────────────────────────────────────────────────────────
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
    iconKey: v.optional(v.string()),
    colorKey: v.optional(v.string()),
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
    activo: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_documento", ["documentoId"]),

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
    estado: v.union(
      v.literal("abierto"),
      v.literal("en_gestion"),
      v.literal("resuelto"),
      v.literal("cerrado"),
    ),
    respuesta: v.optional(v.string()),
    respondidoPorUserId: v.optional(v.id("users")),
    respondidoPorNombre: v.optional(v.string()),
    respondidoAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_condominio", ["condominioId"])
    .index("by_estado", ["estado"]),
});
