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
      customCss: `
        /* ── Barra superior ─────────────────────────────────── */
        .swagger-ui .topbar {
          background: linear-gradient(135deg, #0f2544 0%, #1a3a6b 60%, #0e6ba8 100%);
          padding: 10px 0;
          box-shadow: 0 2px 8px rgba(0,0,0,0.35);
        }
        .swagger-ui .topbar .topbar-wrapper {
          align-items: center;
          gap: 16px;
        }
        .swagger-ui .topbar .topbar-wrapper img {
          display: none;
        }
        .swagger-ui .topbar .topbar-wrapper::before {
          content: 'Exélixi · RCV → Sis2000';
          color: #ffffff;
          font-size: 1.2rem;
          font-weight: 700;
          letter-spacing: 0.03em;
          padding-left: 24px;
          font-family: 'Inter', 'Segoe UI', sans-serif;
        }
        /* ── Título y descripción ────────────────────────────── */
        .swagger-ui .info .title {
          color: #0f2544;
          font-size: 2rem;
          font-weight: 800;
        }
        .swagger-ui .info .description p {
          font-size: 0.93rem;
          color: #374151;
          line-height: 1.6;
        }
        .swagger-ui .info .description table {
          border-collapse: collapse;
          width: 100%;
          margin: 12px 0;
          font-size: 0.88rem;
        }
        .swagger-ui .info .description th {
          background: #0f2544;
          color: #fff;
          padding: 7px 12px;
          text-align: left;
        }
        .swagger-ui .info .description td {
          padding: 6px 12px;
          border-bottom: 1px solid #e5e7eb;
        }
        .swagger-ui .info .description tr:nth-child(even) td {
          background: #f0f5ff;
        }
        /* ── Versión badge ───────────────────────────────────── */
        .swagger-ui .info .version-stamp .version {
          background: #0e6ba8;
          color: #fff;
          border-radius: 4px;
          padding: 2px 8px;
          font-size: 0.75rem;
          font-weight: 600;
        }
        /* ── Tags / secciones ────────────────────────────────── */
        .swagger-ui .opblock-tag {
          background: #f0f5ff;
          border-left: 4px solid #0e6ba8 !important;
          border-radius: 6px !important;
          margin-bottom: 6px !important;
          font-size: 1rem !important;
          font-weight: 700 !important;
          color: #0f2544 !important;
          padding: 10px 16px !important;
          transition: background 0.2s;
        }
        .swagger-ui .opblock-tag:hover {
          background: #dbeafe !important;
        }
        .swagger-ui .opblock-tag small {
          color: #6b7280;
          font-weight: 400;
          font-size: 0.8rem;
        }
        /* ── Bloques de endpoint POST ────────────────────────── */
        .swagger-ui .opblock.opblock-post {
          border-color: #0e6ba8 !important;
          background: #f0f8ff !important;
          border-radius: 6px !important;
          margin-bottom: 4px !important;
        }
        .swagger-ui .opblock.opblock-post .opblock-summary-method {
          background: #0e6ba8 !important;
          border-radius: 4px;
          font-weight: 700;
          font-size: 0.78rem;
          min-width: 64px;
        }
        /* ── Bloques GET ─────────────────────────────────────── */
        .swagger-ui .opblock.opblock-get {
          border-color: #059669 !important;
          background: #f0fdf4 !important;
          border-radius: 6px !important;
          margin-bottom: 4px !important;
        }
        .swagger-ui .opblock.opblock-get .opblock-summary-method {
          background: #059669 !important;
          border-radius: 4px;
          font-weight: 700;
          font-size: 0.78rem;
          min-width: 64px;
        }
        /* ── Botones ─────────────────────────────────────────── */
        .swagger-ui .btn.execute {
          background: #0f2544 !important;
          color: #fff !important;
          border: none !important;
          border-radius: 5px !important;
          font-weight: 700;
          letter-spacing: 0.03em;
          padding: 7px 22px !important;
        }
        .swagger-ui .btn.execute:hover {
          background: #0e6ba8 !important;
        }
        .swagger-ui .btn.authorize {
          border-color: #0e6ba8 !important;
          color: #0e6ba8 !important;
          border-radius: 5px !important;
          font-weight: 600;
        }
        .swagger-ui .btn.authorize svg { fill: #0e6ba8; }
        /* ── Código de respuesta ─────────────────────────────── */
        .swagger-ui .response-col_status .response-undocumented {
          color: #6b7280;
        }
        .swagger-ui table.responses-table .response-col_status {
          font-weight: 700;
          color: #0f2544;
        }
        /* ── Scrollbar sutil ─────────────────────────────────── */
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #f1f5f9; }
        ::-webkit-scrollbar-thumb { background: #0e6ba8; border-radius: 3px; }
        /* ── Fondo general ───────────────────────────────────── */
        body { background: #f8fafc; }
        .swagger-ui { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; }
        /* ── Schemas al pie ──────────────────────────────────── */
        .swagger-ui section.models {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          background: #fff;
        }
        .swagger-ui section.models h4 {
          color: #0f2544;
          font-weight: 700;
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
