import { DynamicModule, Module } from '@nestjs/common';
import { PartnerModuleRegisterOptions } from '@jsotoexelixitech/nest-api-sdk';
import { PartnerStarterController } from './partner-starter.controller';

@Module({})
export class PartnerStarterModule {
  static register(_options?: PartnerModuleRegisterOptions): DynamicModule {
    return {
      module: PartnerStarterModule,
      controllers: [PartnerStarterController],
    };
  }
}
