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
      .setTitle('Exelixi Tech - API La Mundial')
      .setDescription(
        'Backend moderno NestJS para la emisión directa de pólizas (RCV y Funerario) en la base de datos Sis2000.',
      )
      .setVersion('1.0.0')
      .addApiKey({ type: 'apiKey', name: 'apikey', in: 'header', description: 'Token de autenticación del canal emisor' }, 'apikey')
      .addBearerAuth()
      .addServer('http://192.168.8.120:3002', 'Servidor de Producción (srv001)')
      .addServer('http://localhost:3002', 'Entorno de Desarrollo Local')
      .addTag('Emisión Automóvil (RCV)', 'Endpoints para cotizar, validar y emitir pólizas de vehículos')
      .addTag('Emisión Personas (Funerario)', 'Endpoints para cotizar, validar y emitir pólizas funerarias')
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
