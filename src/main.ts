import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import {
  SWAGGER_API_DESCRIPTION,
  SWAGGER_TAG_ORDER,
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
      .setTitle('Exelixi Tech — nest-api · La Mundial')
      .setDescription(SWAGGER_API_DESCRIPTION)
      .setVersion('1.1.0')
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
      .addTag('1. Catálogo vehículo (inma)', 'Paso 1 del flujo RCV: año, marca, modelo, versión (`VInma`)')
      .addTag('2. Catálogos y cotización (valrep)', 'Pasos 2–4: estados, ciudades, planes (`spBuscaPlan`), prima (`spCalculoAuto`)')
      .addTag('3. Emisión Automóvil (RCV)', 'Pasos 5–6: validar vehículo y emitir (`sp_pre_emision_Automovil_RCV2`)')
      .addTag('4. Cobranza (Collection)', 'Paso 7: cobro e ingreso de caja (`spCobroSis_Ad` + `cbreporte_pago`)')
      .addTag('personas', 'Planes y emisión funeraria (ramo 9)')
      .addTag('Emisión Personas (Funerario)', 'Endpoints legacy funerario vía external')
      .addTag('Documentos', 'PDF anexos (conductor habitual, etc.)')
      .addTag('app', 'Utilidades de aplicación')
      .addTag('client', 'Consultas de cliente')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(swaggerPath, app, document, {
      customSiteTitle: 'Exelixi · nest-api Docs',
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'list',
        filter: true,
        displayRequestDuration: true,
        tryItOutEnabled: true,
        tagsSorter: (a: string, b: string) => {
          const order = SWAGGER_TAG_ORDER as readonly string[];
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
