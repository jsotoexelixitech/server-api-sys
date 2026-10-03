import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ArysMembershipJob } from '@prisma/client';
import { ArysClient } from './arys.client';
import { ArysJobStage, ArysMembershipJobService } from './arys-membership-job.service';
import { buildPropietarioRequest, buildVehiculoRequest } from './arys.mapper';
import { ArysRepository } from './arys.repository';
import {
  ArysCoberturas,
  ArysMembershipRegistrationResult,
  ArysRegisterMembershipInput,
} from './arys.types';

@Injectable()
export class ArysService {
  private readonly logger = new Logger(ArysService.name);
  private readonly defaultTipoMembresia: number;

  constructor(
    private readonly client: ArysClient,
    private readonly repository: ArysRepository,
    private readonly config: ConfigService,
    private readonly jobs: ArysMembershipJobService,
  ) {
    this.defaultTipoMembresia = Number(
      this.config.get<string>('SARYS_TIPO_MEMBRESIA_RCV') ?? 6,
    );
  }

  resolveTipoMembresia(override?: number): number {
    if (override != null && Number.isFinite(override) && override > 0) {
      return Number(override);
    }
    return this.defaultTipoMembresia;
  }

  async getPrimas(vehiculoId: number, tipoMembresia?: number): Promise<ArysCoberturas> {
    const tipo = this.resolveTipoMembresia(tipoMembresia);
    this.logger.log(`Arys getPrimas vehiculoId=${vehiculoId} tipoMembresia=${tipo}`);
    return this.client.getCoberturas(vehiculoId, tipo);
  }

  /**
   * Flujo completo: propietario → vehículo → primas → membresía.
   * Cada intento queda respaldado en Postgres (ArysMembershipJob); si falla, un reintento
   * retoma con el personaId/vehiculoId ya creados en Arys en lugar de duplicarlos.
   */
  async registerMembershipFromEmission(
    input: ArysRegisterMembershipInput,
  ): Promise<ArysMembershipRegistrationResult | null> {
    if (!this.client.isEnabled()) {
      return null;
    }

    const tipoMembresia = this.resolveTipoMembresia(input.tipoMembresia);
    let job: ArysMembershipJob | null = null;
    let stage: ArysJobStage = 'target';
    let primas: ArysCoberturas | undefined;

    try {
      const target = await this.repository.resolveEmissionTarget({
        cnpoliza: input.cnpoliza,
        cpoliza: input.cpoliza,
        xplaca: input.xplaca,
      });

      const cnpoliza = target.cnpoliza ?? input.cnpoliza ?? '';

      const existing = cnpoliza ? await this.jobs.get(cnpoliza) : null;
      if (existing?.status === 'SUCCESS') {
        this.logger.log(`Arys membresía ya registrada cnpoliza=${cnpoliza}, se omite`);
        return null;
      }

      job = cnpoliza
        ? await this.jobs.begin({
            cnpoliza,
            cpoliza: target.cpoliza,
            xplaca: target.xplaca,
            tipoMembresia,
          })
        : null;

      let personaId = input.personaId ?? existing?.personaId ?? undefined;
      if (!personaId) {
        stage = 'propietario';
        const propietary = await this.repository.getPropietaryByCid(target.cid);
        const estado = await this.client.findEstadoByName(propietary.xestado);
        if (!estado) {
          throw new Error(`Estado no encontrado en Arys: ${propietary.xestado}`);
        }
        const ciudad = await this.client.findCiudadByName(Number(estado.id_estado), propietary.xciudad);
        if (!ciudad) {
          throw new Error(`Ciudad no encontrada en Arys: ${propietary.xciudad}`);
        }

        const propietarioBody = buildPropietarioRequest(
          propietary,
          estado,
          ciudad,
          target.casegurado,
        );
        personaId = await this.client.addPropietario(propietarioBody);
        await this.jobs.saveProgress(job, { personaId });
        this.logger.log(`Arys propietario OK cnpoliza=${cnpoliza} personaId=${personaId}`);
      }

      let vehiculoId = input.vehiculoId ?? existing?.vehiculoId ?? undefined;
      if (!vehiculoId) {
        stage = 'vehiculo';
        const vehiculoRow = await this.repository.getVehiculoByTarget(target);
        this.logger.log(
          `Arys vinma cnpoliza=${cnpoliza} xmarca=${vehiculoRow.xmarca ?? ''} ` +
            `xmodelo=${vehiculoRow.xmodelo ?? ''} xversion=${vehiculoRow.xversion ?? ''} ` +
            `xcolor=${vehiculoRow.xcolor ?? ''}`,
        );
        const catalog = await this.client.resolveVehicleCatalogFromVinma(vehiculoRow);
        const vehiculoBody = buildVehiculoRequest(vehiculoRow, catalog, personaId);
        this.logger.log(
          `Arys AddVehiculo cnpoliza=${cnpoliza} placa=${vehiculoBody.placa} ` +
            `marca=${vehiculoBody.id_marca} modelo=${vehiculoBody.id_modelo} ` +
            `version=${vehiculoBody.id_version} color=${vehiculoBody.id_color} ` +
            `tipo=${vehiculoBody.id_tipo_vehi}`,
        );
        vehiculoId = await this.client.addVehiculo(vehiculoBody);
        await this.jobs.saveProgress(job, { vehiculoId });
        this.logger.log(`Arys vehículo OK cnpoliza=${cnpoliza} vehiculoId=${vehiculoId}`);
      }

      stage = 'coberturas';
      primas = await this.client.getCoberturas(vehiculoId, tipoMembresia);
      stage = 'subscripcion';
      const membresia = await this.client.registrarSubcripcion(
        vehiculoId,
        personaId,
        tipoMembresia,
        primas,
      );

      await this.jobs.markSuccess(job, { request: primas, response: membresia });
      this.logger.log(
        `Arys membresía OK cnpoliza=${cnpoliza} vehiculoId=${vehiculoId} personaId=${personaId} ` +
          `primaTotal=${primas.primaTotal ?? 'n/a'}`,
      );

      return {
        cnpoliza,
        personaId,
        vehiculoId,
        tipoMembresia,
        primas,
        membresia,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Arys membresía falló cnpoliza=${input.cnpoliza ?? input.xplaca ?? 'n/a'} etapa=${stage}: ${msg}`,
      );
      await this.jobs.markFailure(job, stage, error);
      return null;
    }
  }

  /**
   * Reintenta los trabajos fallidos que ya vencieron. Retoma desde lo ya creado en Arys.
   * Devuelve cuántos se procesaron y cuántos terminaron en éxito.
   */
  async retryDueMemberships(limit = 10): Promise<{ processed: number; succeeded: number }> {
    const due = await this.jobs.findDue(limit);
    let processed = 0;
    let succeeded = 0;
    for (const job of due) {
      if (!(await this.jobs.claim(job))) continue;
      processed += 1;
      const result = await this.registerMembershipFromEmission({
        cnpoliza: job.cnpoliza,
        cpoliza: job.cpoliza ?? undefined,
        xplaca: job.xplaca ?? undefined,
        tipoMembresia: job.tipoMembresia,
        personaId: job.personaId ?? undefined,
        vehiculoId: job.vehiculoId ?? undefined,
      });
      if (result) succeeded += 1;
    }
    return { processed, succeeded };
  }

  /** Reintento manual de una póliza (también para trabajos DEAD). */
  async retryMembership(cnpoliza: string): Promise<ArysMembershipRegistrationResult | null> {
    const job = await this.jobs.requeue(cnpoliza);
    if (!job || job.status === 'SUCCESS') return null;
    return this.registerMembershipFromEmission({
      cnpoliza: job.cnpoliza,
      cpoliza: job.cpoliza ?? undefined,
      xplaca: job.xplaca ?? undefined,
      tipoMembresia: job.tipoMembresia,
      personaId: job.personaId ?? undefined,
      vehiculoId: job.vehiculoId ?? undefined,
    });
  }
}
