import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MssqlService } from '../../database/mssql.service';
import { DGBOSS_SQL } from './dgboss-catalogos.queries';
import { buildCatalogos } from './dgboss-catalogos.mapper';
import { DgbossClientService } from './dgboss-client.service';
import type { DgbossCatalogos, DgbossResult } from './dgboss.types';

@Injectable()
export class DgbossCatalogosService {
  constructor(
    private readonly db: MssqlService,
    private readonly config: ConfigService,
    private readonly client: DgbossClientService,
  ) {}

  /** Arma los catálogos desde Sis2000 (productos "-nexus" y sus ramos). No envía nada. */
  async build(): Promise<DgbossCatalogos> {
    const rif = String(this.config.get<string>('DGBOSS_ASEGURADORA_RIF', '')).trim();
    const run = async (sql: string) => (await this.db.request().query(sql)).recordset ?? [];
    const [lineas, ramos, coberturas, moneda, producto, frecuencia] = await Promise.all([
      run(DGBOSS_SQL.lineas),
      run(DGBOSS_SQL.ramos),
      run(DGBOSS_SQL.coberturas),
      run(DGBOSS_SQL.moneda),
      run(DGBOSS_SQL.producto),
      run(DGBOSS_SQL.frecuencia),
    ]);
    return buildCatalogos(rif, { lineas, ramos, coberturas, moneda, producto, frecuencia });
  }

  /** Construye y envía los catálogos a DGBOSS. */
  async sync(idempotencyKey?: string): Promise<DgbossResult> {
    return this.client.postCatalogos(await this.build(), idempotencyKey);
  }
}
