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
      env: {
        PUBLIC_API_PREFIX: '/api-docs-nest-api',
        PUBLIC_API_ORIGIN: 'https://cierrelmds.exelixitech.com',
        PARTNER_PACKAGES: '@exelixi/partner-api-starter',
      },
      env_production: {
        NODE_ENV:           'production',
        SWAGGER_PATH:       'docs',   // vacío ('') para deshabilitar Swagger en prod
        PUBLIC_API_PREFIX:  '/api-docs-nest-api',
        PUBLIC_API_ORIGIN:  'https://cierrelmds.exelixitech.com',
        PARTNER_PACKAGES:   '@exelixi/partner-api-starter',
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
