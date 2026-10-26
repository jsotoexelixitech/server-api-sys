import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { AutopagoController } from './autopago.controller';
import { AutopagoService } from './autopago.service';
import { AutopagoStoreService } from './autopago-store.service';

/** Autopago retail (Farmatodo): venta en caja → enlaces de emisión por unidad. */
@Module({
  imports: [PrismaModule, AuthModule, MailModule],
  controllers: [AutopagoController],
  providers: [AutopagoService, AutopagoStoreService],
  exports: [AutopagoService],
})
export class AutopagoModule {}
