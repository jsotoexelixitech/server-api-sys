import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import {
  SWAGGER_API_DESCRIPTION,
} from './common/swagger/api-docs.constants';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3001);
  const corsOrigin = config.get<string>('CORS_ORIGIN', '*');
  const swaggerPath = config.get<string>('SWAGGER_PATH', 'docs');

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: corsOrigin === '*' ? true : corsOrigin.split(','),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false, // permite propiedades extra en el body (emision-api las incluye)
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  if (swaggerPath) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Exelixi · RCV → Sis2000')
      .setDescription(SWAGGER_API_DESCRIPTION)
      .setVersion('1.2.0-rcv')
      .addApiKey(
        {
          type: 'apiKey',
          name: 'apikey',
          in: 'header',
          description: 'Token del canal (`maclient_api.xtoken`). Requerido en emisión y cobro.',
        },
        'apikey',
      )
      .addBearerAuth()
      .addServer('http://192.168.8.120:3002', 'srv001 — QA/Producción Exélixi')
      .addServer('http://localhost:3002', 'Desarrollo local')
      .addTag('1. Catálogo vehículo (inma)', 'Paso 1 · `VInma`')
      .addTag('2. Catálogos y cotización (valrep)', 'Pasos 2–4 · estados, planes, prima')
      .addTag('3. Emisión RCV', 'Pasos 5–6 · validar y emitir')
      .addTag('4. Cobranza RCV', 'Paso 7 · `activate` (ingreso de caja)')
      .addTag('5. Documentos (post-emisión)', 'Paso 8 · anexo conductor habitual')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(swaggerPath, app, document, {
      customSiteTitle: 'Exelixi · RCV Sis2000 API',
      customfavIcon: 'https://exelixitech.com/favicon.ico',
      customCssUrl: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
      customJsStr: `
        // Inyectar meta viewport y font preconnect
        if (!document.querySelector('link[rel=preconnect][href*=fonts]')) {
          ['https://fonts.googleapis.com','https://fonts.gstatic.com'].forEach(function(h){
            var l=document.createElement('link');l.rel='preconnect';l.href=h;if(h.includes('gstatic'))l.crossOrigin='';
            document.head.appendChild(l);
          });
        }
        // Badge de paso en cada sección (corre cuando swagger termina de renderizar)
        function addStepBadges() {
          document.querySelectorAll('.opblock-tag[data-tag]').forEach(function(el) {
            var tag = el.getAttribute('data-tag') || '';
            var m = tag.match(/^(\\d+)\\./);
            if (m && !el.querySelector('.exelixi-step')) {
              var badge = document.createElement('span');
              badge.className = 'exelixi-step';
              badge.textContent = 'PASO ' + m[1];
              badge.style.cssText = 'background:#0e6ba8;color:#fff;font-size:0.65rem;font-weight:700;letter-spacing:0.08em;padding:2px 8px;border-radius:20px;margin-right:10px;vertical-align:middle;';
              el.querySelector('a') && el.querySelector('a').prepend(badge);
            }
          });
        }
        var obs = new MutationObserver(addStepBadges);
        obs.observe(document.body, { childList: true, subtree: true });
        setTimeout(addStepBadges, 1200);
      `,
      customCss: `
        /* ═══════════════════════════════════════════════════════
           EXÉLIXI · SWAGGER THEME — RCV Sis2000
           Paleta: navy #0f2544 · blue #0e6ba8 · light #dbeafe
        ═══════════════════════════════════════════════════════ */
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        /* ── Reset base ────────────────────────────────────────── */
        *, *::before, *::after { box-sizing: border-box; }
        body {
          background: #f0f4f8;
          font-family: 'Inter', 'Segoe UI', Arial, sans-serif !important;
        }
        .swagger-ui {
          font-family: 'Inter', 'Segoe UI', Arial, sans-serif !important;
          max-width: 1100px;
          margin: 0 auto;
        }

        /* ── Topbar ────────────────────────────────────────────── */
        .swagger-ui .topbar {
          background: linear-gradient(135deg, #0a1a35 0%, #0f2544 50%, #0e4f8a 100%);
          padding: 0;
          box-shadow: 0 3px 12px rgba(0,0,0,0.4);
          position: sticky;
          top: 0;
          z-index: 100;
        }
        .swagger-ui .topbar .topbar-wrapper {
          padding: 14px 28px;
          align-items: center;
          gap: 0;
        }
        .swagger-ui .topbar .topbar-wrapper img { display: none; }
        .swagger-ui .topbar .topbar-wrapper::before {
          content: '⚡ Exélixi  ·  RCV → Sis2000';
          color: #ffffff;
          font-size: 1.15rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          font-family: 'Inter', sans-serif;
        }
        .swagger-ui .topbar .topbar-wrapper::after {
          content: 'API Documentación Interna';
          color: rgba(255,255,255,0.5);
          font-size: 0.72rem;
          font-weight: 500;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-left: auto;
          font-family: 'Inter', sans-serif;
        }
        .swagger-ui .topbar a { display: none !important; }

        /* ── Hero / Info ───────────────────────────────────────── */
        .swagger-ui .information-container {
          background: linear-gradient(135deg, #0f2544 0%, #1a3a6b 100%);
          border-radius: 0 0 16px 16px;
          padding: 32px 36px 28px !important;
          margin-bottom: 28px;
          box-shadow: 0 6px 24px rgba(15,37,68,0.18);
        }
        .swagger-ui .info .title {
          color: #ffffff !important;
          font-size: 2rem !important;
          font-weight: 800 !important;
          letter-spacing: -0.01em;
          text-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }
        .swagger-ui .info .title small.version-stamp {
          vertical-align: middle;
          margin-left: 12px;
        }
        .swagger-ui .info .version-stamp .version {
          background: rgba(255,255,255,0.15);
          color: #93c5fd;
          border: 1px solid rgba(147,197,253,0.4);
          border-radius: 20px;
          padding: 2px 12px;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .swagger-ui .info a.link { color: #93c5fd !important; }
        .swagger-ui .info p,
        .swagger-ui .info li { color: rgba(255,255,255,0.85) !important; font-size: 0.9rem; line-height: 1.65; }
        .swagger-ui .info .description table {
          border-collapse: collapse; width: 100%; margin: 14px 0; font-size: 0.85rem;
          background: rgba(255,255,255,0.06); border-radius: 8px; overflow: hidden;
        }
        .swagger-ui .info .description th {
          background: rgba(255,255,255,0.12); color: #bfdbfe;
          padding: 8px 14px; text-align: left; font-weight: 700; letter-spacing: 0.04em;
          text-transform: uppercase; font-size: 0.75rem;
        }
        .swagger-ui .info .description td {
          padding: 7px 14px; border-bottom: 1px solid rgba(255,255,255,0.07);
          color: rgba(255,255,255,0.82) !important;
        }
        .swagger-ui .info .description code {
          background: rgba(14,107,168,0.4); color: #bfdbfe;
          border-radius: 4px; padding: 1px 6px; font-size: 0.82em;
        }

        /* ── Authorize button (hero) ───────────────────────────── */
        .swagger-ui .info .authorization__btn,
        .swagger-ui .auth-wrapper .btn.authorize {
          background: rgba(14,107,168,0.9) !important;
          border: 1px solid #60a5fa !important;
          color: #fff !important;
          border-radius: 8px !important;
          font-weight: 700 !important;
          padding: 8px 20px !important;
          transition: all 0.2s ease !important;
          letter-spacing: 0.03em;
        }
        .swagger-ui .auth-wrapper .btn.authorize:hover {
          background: #0e6ba8 !important;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(14,107,168,0.4) !important;
        }
        .swagger-ui .auth-wrapper .btn.authorize svg { fill: #fff; }

        /* ── Servers dropdown ──────────────────────────────────── */
        .swagger-ui .servers > label {
          color: rgba(255,255,255,0.8) !important;
          font-size: 0.82rem;
        }
        .swagger-ui .servers select {
          background: rgba(255,255,255,0.1) !important;
          color: #fff !important;
          border: 1px solid rgba(255,255,255,0.2) !important;
          border-radius: 6px !important;
          padding: 4px 10px;
        }

        /* ── Wrapper principal ─────────────────────────────────── */
        .swagger-ui .wrapper { padding: 0 16px 40px; }

        /* ── Secciones (tags) ──────────────────────────────────── */
        .swagger-ui .opblock-tag-section { margin-bottom: 20px; }
        .swagger-ui .opblock-tag {
          background: #ffffff !important;
          border: none !important;
          border-radius: 12px !important;
          margin-bottom: 2px !important;
          padding: 14px 20px !important;
          box-shadow: 0 2px 8px rgba(15,37,68,0.08) !important;
          cursor: pointer;
          transition: all 0.2s ease !important;
          border-left: 5px solid #0e6ba8 !important;
        }
        .swagger-ui .opblock-tag:hover {
          background: #f0f7ff !important;
          box-shadow: 0 4px 16px rgba(14,107,168,0.15) !important;
          transform: translateX(2px);
        }
        .swagger-ui .opblock-tag span,
        .swagger-ui .opblock-tag a {
          color: #0f2544 !important;
          font-size: 1rem !important;
          font-weight: 700 !important;
          text-decoration: none !important;
        }
        .swagger-ui .opblock-tag small {
          color: #6b7280 !important;
          font-weight: 400 !important;
          font-size: 0.8rem !important;
          margin-left: 8px;
        }
        .swagger-ui .opblock-tag svg { fill: #0e6ba8 !important; }

        /* ── Endpoints: contenedor ─────────────────────────────── */
        .swagger-ui .opblock-tag-section .opblock {
          border-radius: 8px !important;
          margin: 4px 0 !important;
          box-shadow: 0 1px 4px rgba(15,37,68,0.07) !important;
          transition: box-shadow 0.2s, transform 0.15s !important;
        }
        .swagger-ui .opblock:hover {
          box-shadow: 0 3px 12px rgba(15,37,68,0.13) !important;
          transform: translateX(2px);
        }
        .swagger-ui .opblock.is-open {
          box-shadow: 0 4px 20px rgba(14,107,168,0.18) !important;
          transform: none;
        }

        /* ── POST ──────────────────────────────────────────────── */
        .swagger-ui .opblock.opblock-post {
          border-color: #0e6ba8 !important;
          background: #f8fbff !important;
        }
        .swagger-ui .opblock.opblock-post .opblock-summary { border-color: #bfdbfe !important; }
        .swagger-ui .opblock.opblock-post .opblock-summary-method {
          background: linear-gradient(135deg, #0e6ba8, #1d4ed8) !important;
          border-radius: 6px !important;
          font-weight: 800 !important;
          font-size: 0.72rem !important;
          letter-spacing: 0.06em;
          min-width: 68px;
          text-align: center;
          box-shadow: 0 2px 6px rgba(14,107,168,0.3);
        }

        /* ── GET ───────────────────────────────────────────────── */
        .swagger-ui .opblock.opblock-get {
          border-color: #059669 !important;
          background: #f8fffe !important;
        }
        .swagger-ui .opblock.opblock-get .opblock-summary { border-color: #a7f3d0 !important; }
        .swagger-ui .opblock.opblock-get .opblock-summary-method {
          background: linear-gradient(135deg, #059669, #047857) !important;
          border-radius: 6px !important;
          font-weight: 800 !important;
          font-size: 0.72rem !important;
          letter-spacing: 0.06em;
          min-width: 68px;
          text-align: center;
          box-shadow: 0 2px 6px rgba(5,150,105,0.3);
        }

        /* ── Summary path & description ────────────────────────── */
        .swagger-ui .opblock-summary-path {
          font-family: 'Inter', monospace !important;
          font-size: 0.88rem !important;
          font-weight: 600 !important;
          color: #0f2544 !important;
        }
        .swagger-ui .opblock-summary-description {
          color: #6b7280 !important;
          font-size: 0.82rem !important;
        }

        /* ── Interior del endpoint abierto ─────────────────────── */
        .swagger-ui .opblock-body { background: #fff !important; border-radius: 0 0 8px 8px; }
        .swagger-ui .opblock-section-header {
          background: #f8fafc !important;
          border-bottom: 1px solid #e2e8f0 !important;
          padding: 10px 16px !important;
        }
        .swagger-ui .opblock-section-header h4 {
          color: #0f2544 !important;
          font-weight: 700 !important;
          font-size: 0.85rem !important;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        /* ── Parámetros / Body ─────────────────────────────────── */
        .swagger-ui .parameters-col_description p { color: #374151; font-size: 0.86rem; }
        .swagger-ui .parameter__name { color: #0f2544 !important; font-weight: 700 !important; }
        .swagger-ui .parameter__type { color: #0e6ba8 !important; font-size: 0.78rem; }
        .swagger-ui textarea.body-param__text {
          border: 1px solid #bfdbfe !important;
          border-radius: 8px !important;
          font-family: 'Fira Code', monospace;
          font-size: 0.83rem !important;
          background: #f8fbff !important;
          padding: 12px !important;
        }
        .swagger-ui textarea.body-param__text:focus {
          border-color: #0e6ba8 !important;
          outline: none;
          box-shadow: 0 0 0 3px rgba(14,107,168,0.15) !important;
        }

        /* ── Botón Execute ─────────────────────────────────────── */
        .swagger-ui .btn.execute {
          background: linear-gradient(135deg, #0f2544, #0e6ba8) !important;
          color: #fff !important;
          border: none !important;
          border-radius: 8px !important;
          font-weight: 700 !important;
          font-size: 0.85rem !important;
          letter-spacing: 0.05em;
          padding: 9px 28px !important;
          transition: all 0.2s ease !important;
          box-shadow: 0 2px 8px rgba(14,107,168,0.3) !important;
        }
        .swagger-ui .btn.execute:hover {
          transform: translateY(-2px) !important;
          box-shadow: 0 6px 16px rgba(14,107,168,0.4) !important;
        }
        .swagger-ui .btn.execute:active { transform: translateY(0) !important; }

        /* ── Botón Clear / Cancel ──────────────────────────────── */
        .swagger-ui .btn.btn-clear, .swagger-ui .btn.cancel {
          border: 1px solid #e2e8f0 !important;
          color: #6b7280 !important;
          border-radius: 8px !important;
          background: #f8fafc !important;
          font-weight: 600 !important;
        }

        /* ── Respuestas ────────────────────────────────────────── */
        .swagger-ui .responses-wrapper { padding: 0 16px 16px; }
        .swagger-ui .response-col_status { font-weight: 800 !important; font-size: 0.92rem !important; }
        .swagger-ui .response .response-col_status code {
          padding: 2px 10px; border-radius: 20px; font-size: 0.78rem; font-weight: 700;
        }
        .swagger-ui .response:has(.response-col_status code:contains('2')) .response-col_status code {
          background: #d1fae5; color: #065f46;
        }
        /* Highlight de código JSON en respuesta */
        .swagger-ui .highlight-code pre {
          background: #0f2544 !important;
          border-radius: 8px !important;
          font-size: 0.8rem !important;
          padding: 14px !important;
          color: #e2e8f0 !important;
        }
        .swagger-ui .microlight { color: #93c5fd !important; }

        /* ── Curl ──────────────────────────────────────────────── */
        .swagger-ui .curl-command { background: #0f2544 !important; border-radius: 8px !important; }
        .swagger-ui .curl-command .curl { color: #bfdbfe !important; font-size: 0.8rem !important; }
        .swagger-ui .copy-to-clipboard {
          background: #0e6ba8 !important;
          border-radius: 4px !important;
          border: none !important;
        }

        /* ── Input / Select en formularios ─────────────────────── */
        .swagger-ui input[type=text], .swagger-ui input[type=email],
        .swagger-ui input[type=file], .swagger-ui select {
          border: 1px solid #d1d5db !important;
          border-radius: 6px !important;
          padding: 6px 10px !important;
          font-family: 'Inter', sans-serif !important;
          font-size: 0.85rem !important;
          transition: border 0.2s !important;
        }
        .swagger-ui input:focus, .swagger-ui select:focus {
          border-color: #0e6ba8 !important;
          box-shadow: 0 0 0 3px rgba(14,107,168,0.12) !important;
          outline: none !important;
        }

        /* ── Modal de Autorización ─────────────────────────────── */
        .swagger-ui .dialog-ux .modal-ux {
          border-radius: 16px !important;
          box-shadow: 0 20px 60px rgba(15,37,68,0.3) !important;
          border: 1px solid #bfdbfe !important;
        }
        .swagger-ui .dialog-ux .modal-ux-header {
          background: linear-gradient(135deg, #0f2544, #0e6ba8) !important;
          border-radius: 14px 14px 0 0 !important;
          padding: 20px 24px !important;
        }
        .swagger-ui .dialog-ux .modal-ux-header h3 {
          color: #fff !important;
          font-weight: 800 !important;
          font-size: 1.1rem !important;
        }
        .swagger-ui .dialog-ux .modal-ux-header button svg { fill: rgba(255,255,255,0.7); }
        .swagger-ui .auth-container .wrapper { padding: 20px 24px !important; }
        .swagger-ui .dialog-ux .btn.authorize {
          background: #0e6ba8 !important;
          color: #fff !important;
          border-radius: 8px !important;
        }

        /* ── Schemas ───────────────────────────────────────────── */
        .swagger-ui section.models {
          border: 1px solid #e2e8f0 !important;
          border-radius: 12px !important;
          background: #fff !important;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(15,37,68,0.06);
        }
        .swagger-ui section.models h4 {
          color: #0f2544 !important;
          font-weight: 800 !important;
          font-size: 0.95rem !important;
          padding: 14px 20px !important;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          margin: 0 !important;
        }
        .swagger-ui section.models .model-container {
          background: #fafafa;
          border-top: 1px solid #f0f0f0;
        }
        .swagger-ui .model-title { color: #0f2544 !important; font-weight: 700 !important; }
        .swagger-ui .model { color: #374151; font-size: 0.85rem; }
        .swagger-ui .property-row .property-name { color: #0e6ba8 !important; font-weight: 600 !important; }

        /* ── Scrollbar ─────────────────────────────────────────── */
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 3px; }
        ::-webkit-scrollbar-thumb { background: #0e6ba8; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #0f2544; }

        /* ── Filter / Buscar ───────────────────────────────────── */
        .swagger-ui .filter .operation-filter-input {
          border: 1px solid #bfdbfe !important;
          border-radius: 8px !important;
          padding: 8px 14px !important;
          font-size: 0.88rem !important;
          background: #fff !important;
          transition: all 0.2s !important;
        }
        .swagger-ui .filter .operation-filter-input:focus {
          border-color: #0e6ba8 !important;
          box-shadow: 0 0 0 3px rgba(14,107,168,0.12) !important;
          outline: none !important;
        }

        /* ── Try it out button ─────────────────────────────────── */
        .swagger-ui .try-out__btn {
          border: 1px solid #0e6ba8 !important;
          color: #0e6ba8 !important;
          border-radius: 6px !important;
          font-weight: 600 !important;
          background: transparent !important;
          transition: all 0.2s !important;
        }
        .swagger-ui .try-out__btn:hover {
          background: #0e6ba8 !important;
          color: #fff !important;
        }
        .swagger-ui .try-out__btn.cancel {
          border-color: #e5e7eb !important;
          color: #6b7280 !important;
        }
        .swagger-ui .try-out__btn.cancel:hover {
          background: #f3f4f6 !important;
          color: #374151 !important;
        }

        /* ── Animaciones suaves ────────────────────────────────── */
        .swagger-ui .opblock-body,
        .swagger-ui .model-container,
        .swagger-ui .dialog-ux .modal-ux {
          animation: fadeSlide 0.2s ease;
        }
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `,
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'list',
        filter: true,
        displayRequestDuration: true,
        tryItOutEnabled: true,
        tagsSorter: (a: string, b: string) => {
          const order = [
            '1. Catálogo vehículo (inma)',
            '2. Catálogos y cotización (valrep)',
            '3. Emisión RCV',
            '4. Cobranza RCV',
            '5. Documentos (post-emisión)',
          ];
          const ai = order.indexOf(a);
          const bi = order.indexOf(b);
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        },
      },
    });
  }

  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`API listening on http://localhost:${port}/api`);
  if (swaggerPath) {
    logger.log(`Swagger docs:  http://localhost:${port}/${swaggerPath}`);
  } else {
    logger.log('Swagger: deshabilitado (SWAGGER_PATH vacío)');
  }
}

bootstrap();
