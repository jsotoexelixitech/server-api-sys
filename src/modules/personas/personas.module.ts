import { Module } from '@nestjs/common';
import { PersonasController } from './personas.controller';
import { PersonasService } from './personas.service';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [PersonasController],
  providers: [PersonasService],
})
export class PersonasModule {}
