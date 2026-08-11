import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { ValrepModule } from './modules/valrep/valrep.module';
import { InmaModule } from './modules/inma/inma.module';
import { ClientModule } from './modules/client/client.module';
import { EmissionsModule } from './modules/emissions/emissions.module';
import { ChangesModule } from './modules/changes/changes.module';
import { PersonasModule } from './modules/personas/personas.module';
import { CondominioModule } from './modules/condominio/condominio.module';
import { EndososModule } from './modules/endosos/endosos.module';

import { AppApiModule } from './modules/app/app.module';
import { ExternalModule } from './modules/external/external.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { CollectionModule } from './modules/collection/collection.module';
import { PartnerHostModule } from './partner/partner-host.module';
import { PartnerIntegrationModule } from './partner/partner-integration.module';
import { AuthModule } from './modules/auth/auth.module';
import { AdminModule } from './modules/admin/admin.module';
import { DocsModule } from './modules/docs/docs.module';
import { PrismaModule } from './database/prisma/prisma.module';
import { ProductEmissionModule } from './modules/product-emission/product-emission.module';
import { MailModule } from './modules/mail/mail.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
        allowUnknown: true,
      },
    }),
    DatabaseModule,
    PrismaModule,
    AuthModule,
    ValrepModule,
    InmaModule,
    ClientModule,
    EmissionsModule,
    ChangesModule,
    PersonasModule,
    CondominioModule,
    EndososModule,
    AppApiModule,
    ExternalModule,
    DocumentsModule,
    CollectionModule,
    AdminModule,
    DocsModule,
    PartnerHostModule,
    PartnerIntegrationModule,
    ProductEmissionModule,
    MailModule,
  ],
})
export class AppModule {}
