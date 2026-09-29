import { Module } from '@nestjs/common';
import { PortalAuthController } from './portal-auth.controller';
import { PortalAuthService } from './portal-auth.service';

@Module({
  controllers: [PortalAuthController],
  providers: [PortalAuthService],
})
export class PortalAuthModule {}
