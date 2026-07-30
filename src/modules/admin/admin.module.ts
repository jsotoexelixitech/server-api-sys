import { Module } from '@nestjs/common';
import { DocsModule } from '../docs/docs.module';
import { AdminKeysController } from './admin-keys.controller';
import { AdminTokenGuard } from './admin-token.guard';

@Module({
  imports: [DocsModule],
  controllers: [AdminKeysController],
  providers: [AdminTokenGuard],
})
export class AdminModule {}
