import { Module } from '@nestjs/common';
import { CondominioController } from './condominio.controller';
import { CondominioService } from './condominio.service';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [CondominioController],
  providers: [CondominioService],
  exports: [CondominioService],
})
export class CondominioModule {}
