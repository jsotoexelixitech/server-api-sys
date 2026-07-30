import { Module } from '@nestjs/common';
import { AdminKeysController } from './admin-keys.controller';
import { AdminTokenGuard } from './admin-token.guard';

@Module({
  controllers: [AdminKeysController],
  providers: [AdminTokenGuard],
})
export class AdminModule {}
