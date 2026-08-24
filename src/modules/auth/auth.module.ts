import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseModule } from '../../database/database.module';
import { AuthController } from './auth.controller';
import { NestAuthService } from './nest-auth.service';
import { NestAuthGuard } from './nest-auth.guard';
import { RefreshTokenStore } from './refresh-token.store';
import { ApiKeyService } from './api-key.service';
import { ApiChannelService } from './api-channel.service';
import { NestTokenRefreshInterceptor } from './nest-token-refresh.interceptor';
import { ScopeCatalogBootstrapService } from './scopes/scope-catalog.bootstrap';
import { NestRequestAuthMiddleware } from './nest-request-auth.middleware';

@Global()
@Module({
  imports: [
    DatabaseModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret:
          config.get<string>('NEST_JWT_SECRET') ||
          'dev-nest-jwt-secret-min-32-characters!!',
        signOptions: {
          expiresIn: Number(config.get<string>('NEST_ACCESS_TTL_SEC', '900')),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    NestAuthService,
    NestAuthGuard,
    ApiKeyService,
    RefreshTokenStore,
    ApiChannelService,
    ScopeCatalogBootstrapService,
    NestRequestAuthMiddleware,
    {
      provide: APP_GUARD,
      useClass: NestAuthGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: NestTokenRefreshInterceptor,
    },
  ],
  exports: [NestAuthService, NestAuthGuard, ApiChannelService, ApiKeyService],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(NestRequestAuthMiddleware).forRoutes('*');
  }
}
