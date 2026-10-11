import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { IntermediariosController } from './intermediarios.controller';
import { IntermediariosService } from './intermediarios.service';

@Module({
  imports: [DatabaseModule],
  controllers: [IntermediariosController],
  providers: [IntermediariosService],
})
export class IntermediariosModule {}
