import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { MenuSis2000Controller } from './menu-sis2000.controller';
import { MenuSis2000Service } from './menu-sis2000.service';

@Module({
  imports: [DatabaseModule],
  controllers: [MenuSis2000Controller],
  providers: [MenuSis2000Service],
})
export class MenuSis2000Module {}
