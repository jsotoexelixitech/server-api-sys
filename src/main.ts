import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

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
      .setTitle('Exelixi Tech - API La Mundial (nest-api)')
      .setDescription(
        'API NestJS sobre Sis2000 para el flujo RCV Exélixi: catálogos, cotización, emisión, cobro e ingreso de caja.\n\n' +
        '**Flujo recomendado RCV:** validateEmissionAuto → createEmissionAuto → **POST /collection/activate**.\n\n' +
        'El cobro replica SysIP `collectReceip`: `spCobroSis_Ad` + soporte en `cbreporte_pago`.',
      )
      .setVersion('1.0.0')
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
      .addTag('Emisión Automóvil (RCV)', 'Validar vehículo, emitir póliza RCV (`sp_pre_emision_Automovil_RCV2`)')
      .addTag('Cobranza (Collection)', 'Cobro de recibos e ingreso de caja (`spCobroSis_Ad` + `cbreporte_pago`)')
      .addTag('valrep', 'Planes, estados, ciudades, cotización auto (`spBuscaPlan`, `spCalculoAuto`)')
      .addTag('inma', 'Catálogo vehículos: marcas, modelos, versiones, años')
      .addTag('personas', 'Emisión y planes funerarios (ramo 9)')
      .addTag('Emisión Personas (Funerario)', 'Endpoints legacy funerario vía external')
      .addTag('Documentos', 'PDF anexos (conductor habitual, etc.)')
      .addTag('app', 'Utilidades de aplicación')
      .addTag('client', 'Consultas de cliente')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(swaggerPath, app, document, {
      swaggerOptions: { persistAuthorization: true, docExpansion: 'list', filter: true },
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
