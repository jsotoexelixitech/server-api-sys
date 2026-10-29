import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { MailModule } from '../mail/mail.module';
import { IntermediariosController } from './intermediarios.controller';
import { IntermediariosService } from './intermediarios.service';
import { IntermediariosComisionesService } from './intermediarios-comisiones.service';
import { IntermediariosProductosService } from './intermediarios-productos.service';

@Module({
  imports: [DatabaseModule, MailModule],
  controllers: [IntermediariosController],
  providers: [IntermediariosService, IntermediariosComisionesService, IntermediariosProductosService],
})
export class IntermediariosModule {}
