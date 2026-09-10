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
import { CanalModule } from './modules/canal/canal.module';
import { ArysModule } from './modules/arys/arys.module';
import { ViajeroNacionalModule } from './modules/viajero-nacional/viajero-nacional.module';
import { DynamicSchemasModule } from './modules/dynamic-schemas/dynamic-schemas.module';
import { ReportesSyncModule } from './modules/reportes-sync/reportes-sync.module';
import { ReportesModule } from './modules/reportes/reportes.module';
import { AseguradorasModule } from './modules/aseguradoras/aseguradoras.module';
import { SiniestrosModule } from './modules/siniestros/siniestros.module';
import { RecibosModule } from './modules/recibos/recibos.module';
import { PolizasModule } from './modules/polizas/polizas.module';
import { ComponentsModule } from './modules/components/components.module';

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
    CanalModule,
    ArysModule,
    ViajeroNacionalModule,
    DynamicSchemasModule,
    ReportesSyncModule,
    ReportesModule,
    AseguradorasModule,
    SiniestrosModule,
    RecibosModule,
    PolizasModule,
    ComponentsModule,
  ],
})
export class AppModule {}
