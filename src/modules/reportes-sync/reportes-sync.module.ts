import { Module } from '@nestjs/common';
import { SyncContextService } from './sync-context.service';
import { SyncService } from './sync.service';
import { SyncOrchestratorService } from './sync-orchestrator.service';
import { AseguradoraResolverService } from './aseguradora-resolver.service';
import { SyncUpsertRepository } from './repositories/sync-upsert.repository';
import { SyncWatermarkRepository } from './repositories/sync-watermark.repository';
import { SyncLocalRepository } from './repositories/sync-local.repository';
import { SyncLockService } from './utils/sync-lock.service';
import { InsurerConnectionService } from './insurers/insurer-connection.service';
import { InsurerPoolManager } from './insurers/insurer-pool.manager';
import { InsurerApiClient } from './insurers/extraction/insurer-api.client';
import { InsurerAdapterFactory } from './insurers/adapters/insurer-adapter.factory';
import { OriginAdapterFactory } from './origin-db/origin-adapter.factory';

@Module({
  providers: [
    OriginAdapterFactory,
    InsurerAdapterFactory,
    InsurerApiClient,
    InsurerPoolManager,
    InsurerConnectionService,
    SyncLockService,
    SyncUpsertRepository,
    SyncWatermarkRepository,
    SyncLocalRepository,
    AseguradoraResolverService,
    SyncService,
    SyncContextService,
    SyncOrchestratorService,
  ],
  exports: [
    SyncContextService,
    SyncService,
    SyncOrchestratorService,
    InsurerConnectionService,
    AseguradoraResolverService,
    SyncWatermarkRepository,
  ],
})
export class ReportesSyncModule {}
