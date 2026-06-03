import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PersonasModule } from '../personas/personas.module';

@Module({
  imports: [PersonasModule],
  controllers: [AppController],
})
export class AppApiModule {}
