import { Module } from '@nestjs/common';
import { ExternalController } from './external.controller';
import { PersonasModule } from '../personas/personas.module';

@Module({
  imports: [PersonasModule],
  controllers: [ExternalController],
})
export class ExternalModule {}
