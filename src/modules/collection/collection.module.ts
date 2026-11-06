import { Module } from '@nestjs/common';
import { CollectionController } from './collection.controller';
import { CollectionService } from './collection.service';
import { PaymentVerificationService } from './payment-verification.service';

@Module({
  controllers: [CollectionController],
  providers: [CollectionService, PaymentVerificationService],
  exports: [CollectionService],
})
export class CollectionModule {}
