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

import { AppApiModule } from './modules/app/app.module';
import { ExternalModule } from './modules/external/external.module';
import { DocumentsModule } from './modules/documents/documents.module';

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
    ValrepModule,
    InmaModule,
    ClientModule,
    EmissionsModule,
    ChangesModule,
    PersonasModule,
    AppApiModule,
    ExternalModule,
    DocumentsModule,
  ],
})
export class AppModule {}
