import { Module } from '@nestjs/common';
import { EndososController } from './endosos.controller';
import { EndososService } from './endosos.service';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [EndososController],
  providers: [EndososService],
  exports: [EndososService],
})
export class EndososModule {}
