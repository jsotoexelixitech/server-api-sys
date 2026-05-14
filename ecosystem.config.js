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

      // ── Entorno de producción ────────────────────────────────────────────
      // Las credenciales de BD y demás viven en el archivo .env del servidor.
      // Aquí solo sobreescribimos lo que cambia entre dev y prod.
      env_production: {
        NODE_ENV:      'production',
        PORT:          3001,
        SWAGGER_PATH:  'docs',         // vacío ('') para deshabilitar Swagger en prod
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
