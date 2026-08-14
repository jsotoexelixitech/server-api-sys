/** @type {import('pm2').ProcessDescription} */
module.exports = {
  apps: [
    {
      name: 'sysip-nest-api',

      // Apunta al JS compilado — no a nest start (que spawna otro proceso)
      script: 'dist/main.js',

      // ── Modo de ejecución ────────────────────────────────────────────────
      // 'fork' = proceso único  |  'cluster' = N workers (usar si no hay pool global de MSSQL)
      exec_mode: 'fork',
      instances:  1,

      // ── Entorno ────────────────────────────────────────────────────────────
      // PUBLIC_* también en `env` base: pm2 restart sin --env production las conserva.
      // PARTNER_PACKAGES: leer solo de .env (no hardcodear aquí — PM2 pisa dotenv)
      // srv001qa (121) = QA Nexus → pm2 --env qa
      // srv001 (120) = desarrollo cierrelmds → pm2 --env development
      env: {
        PUBLIC_API_PREFIX: '/nest-api-docs',
        PUBLIC_API_ORIGIN: 'https://nexusqa.exelixitech.com',
        SWAGGER_SHOW_INTERNAL_SERVERS: 'true',
      },
      env_development: {
        NODE_ENV:           'production',
        SWAGGER_PATH:       'docs',
        PUBLIC_API_PREFIX:  '/nest-api-docs',
        PUBLIC_API_ORIGIN:  'https://cierrelmds.exelixitech.com',
        SWAGGER_SHOW_INTERNAL_SERVERS: 'true',
      },
      /** Alias legacy — usar env_development en srv001 (120) */
      env_production: {
        NODE_ENV:           'production',
        SWAGGER_PATH:       'docs',
        PUBLIC_API_PREFIX:  '/nest-api-docs',
        PUBLIC_API_ORIGIN:  'https://cierrelmds.exelixitech.com',
        SWAGGER_SHOW_INTERNAL_SERVERS: 'true',
      },
      /** QA Nexus — mismo prefijo /nest-api-docs, origen https://nexusqa.exelixitech.com */
      env_qa: {
        NODE_ENV:           'production',
        SWAGGER_PATH:       'docs',
        PUBLIC_API_PREFIX:  '/nest-api-docs',
        PUBLIC_API_ORIGIN:  'https://nexusqa.exelixitech.com',
        SWAGGER_SHOW_INTERNAL_SERVERS: 'true',
      },

      // ── Comportamiento ante caídas ───────────────────────────────────────
      watch:              false,        // nunca watchear en prod
      max_memory_restart: '512M',
      restart_delay:      5000,         // esperar 5 s antes de reintentar
      max_restarts:       10,
      min_uptime:         '10s',        // si cae antes de 10 s se considera crash

      // ── Logs ─────────────────────────────────────────────────────────────
      out_file:    './logs/out.log',
      error_file:  './logs/error.log',
      merge_logs:  true,
      time:        true,               // agrega timestamp a cada línea de log

      // ── Arranque automático con el sistema ───────────────────────────────
      // (se activa corriendo: pm2 startup  →  pm2 save)
      autorestart: true,
    },
  ],
};
