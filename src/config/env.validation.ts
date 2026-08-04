import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3001),
  SWAGGER_PATH: Joi.string().default('docs'),
  /** Prefijo HTTPS cierrelmds (ej. /nest-api-docs). Vacío = rutas en raíz (/docs, /api). */
  PUBLIC_API_PREFIX: Joi.string().allow('').default(''),
  /** Origen público para Swagger servers (sin barra final). */
  PUBLIC_API_ORIGIN: Joi.string().uri().default('https://cierrelmds.exelixitech.com'),
  CORS_ORIGIN: Joi.string().default('*'),

  SERVER_BD: Joi.string().required(),
  NAME_BD: Joi.string().required(),
  USER_BD: Joi.string().required(),
  PASSWORD_BD: Joi.string().required(),

  MSSQL_REQUEST_TIMEOUT: Joi.number().default(300000),
  MSSQL_ENCRYPT: Joi.boolean().default(false),
  MSSQL_TRUST_SERVER_CERTIFICATE: Joi.boolean().default(true),
  MSSQL_ENABLE_ARITH_ABORT: Joi.boolean().default(true),

  /** local = INSERT directo Sis2000 (default). external = HTTP La Mundial QA. */
  EMISSION_SOURCE: Joi.string().valid('local', 'external').default('local'),
  LAMUNDIAL_PRODUCTOR: Joi.string().optional(),
  LAMUNDIAL_CUSUARIO: Joi.string().optional(),
  /** Plan por defecto en validateEmissionAuto cuando el cliente aún no eligió plan (Formulario Exélixi). */
  LAMUNDIAL_PLAN_DEFAULT: Joi.string().default('RCVBAS'),
  POLICY_PDF_URL: Joi.string().optional(),
  /** Alias legacy Express (misma URL base PDF). */
  URLPoliza: Joi.string().optional(),
  EXTERNAL_API_URL_AUTO: Joi.string().optional(),
  EXTERNAL_API_KEY: Joi.string().optional(),
  EXTERNAL_BASIC_AUTH: Joi.string().optional(),

  /** Paquetes npm partner (coma-separados). Ej: @exelixi/partner-api-starter */
  PARTNER_PACKAGES: Joi.string().allow('').optional(),

  /** Auth nest-api: true exige Bearer o apikey en todas las rutas (excepto @Public). */
  NEST_AUTH_ENABLED: Joi.boolean().default(true),
  /** En producción externa: canje/refresh solo por HTTPS (localhost exento). */
  NEST_AUTH_REQUIRE_HTTPS: Joi.boolean().default(false),
  /** Rechazar apikey no registrada en maclient_api al canjear token. */
  NEST_AUTH_STRICT_APIKEY: Joi.boolean().default(false),
  NEST_JWT_SECRET: Joi.string().min(32).optional(),
  NEST_ACCESS_TTL_SEC: Joi.number().integer().min(60).default(900),
  NEST_REFRESH_TTL_SEC: Joi.number().integer().min(3600).default(604800),
  /** Renovar access en respuesta si expira en menos de N segundos. */
  NEST_TOKEN_SLIDE_SEC: Joi.number().integer().min(30).default(300),

  /** PostgreSQL auth: keys, sesiones, refresh (esquema nest_auth). */
  NEST_PG_DATABASE_URL: Joi.string().optional(),
  /** Token para panel /api/v1/admin y UI /admin/ */
  NEST_ADMIN_TOKEN: Joi.string().min(16).optional(),

  /**
   * Flujo NUEVO y AISLADO: emisión genérica multi-ramo (product-emission).
   * Ambiente separado: BD propia, cliente Prisma propio (prisma-product-emission/),
   * catálogo (ramo/planes/coberturas) vía API de proyecto-product-builder.
   * No afecta módulos activos de La Mundial (emissions/personas/collection/external)
   * ni comparte BD/schema con NEST_PG_DATABASE_URL (auth nest_auth).
   */
  PRODUCT_BUILDER_API_URL: Joi.string().uri().default('http://localhost:3001'),
  PRODUCT_BUILDER_API_PREFIX: Joi.string().default('producto-builder-api'),
  /** Cuenta de servicio para autenticarse contra proyecto-product-builder (requiere Bearer). */
  PRODUCT_BUILDER_API_EMAIL: Joi.string().optional(),
  PRODUCT_BUILDER_API_PASSWORD: Joi.string().optional(),
  /** BD propia y separada de la póliza genérica (schema prisma-product-emission/). */
  PRODUCT_EMISSION_DATABASE_URL: Joi.string().optional(),
  /** Ruta absoluta o relativa donde se guardan los documentos generados (.docx/.pdf). */
  PRODUCT_EMISSION_DOCS_DIR: Joi.string().default('temp-product-emission-docs'),
});
