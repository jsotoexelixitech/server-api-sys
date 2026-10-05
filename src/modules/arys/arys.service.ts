import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ArysMembershipJob } from '@prisma/client';
import { ArysClient } from './arys.client';
import { ArysMembershipConfigService } from './arys-membership-config.service';
import { ArysJobStage, ArysMembershipJobService } from './arys-membership-job.service';
import { ArysMonitorReporterService } from './arys-monitor-reporter.service';
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
  /** Registros en curso por póliza: evita duplicar propietario/vehículo si coinciden dos llamadas. */
  private readonly inFlight = new Map<string, Promise<ArysMembershipRegistrationResult | null>>();

  constructor(
    private readonly client: ArysClient,
    private readonly repository: ArysRepository,
    private readonly config: ConfigService,
    private readonly jobs: ArysMembershipJobService,
    private readonly reporter: ArysMonitorReporterService,
    private readonly membershipConfig: ArysMembershipConfigService,
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
   * Punto de entrada de la emisión de automóvil: TODA emisión registra su membresía Arys, sin que el
   * cliente tenga que llamar aparte al endpoint de membresía. Respeta el interruptor
   * arys_emission_enabled (BD) para poder apagarlo sin reiniciar si Arys tiene problemas.
   */
  async registerMembershipForEmission(
    input: ArysRegisterMembershipInput,
  ): Promise<ArysMembershipRegistrationResult | null> {
    const { arysEmissionEnabled } = await this.membershipConfig.get();
    if (!arysEmissionEnabled) {
      this.logger.log(
        `Arys post-emisión desactivado (arys_emission_enabled=false) cnpoliza=${input.cnpoliza ?? 'n/a'}`,
      );
      return null;
    }
    return this.registerMembershipFromEmission(input);
  }

  /**
   * Flujo completo: propietario → vehículo → primas → membresía.
   * Cada intento queda respaldado en Postgres (ArysMembershipJob); si falla, un reintento
   * retoma con el personaId/vehiculoId ya creados en Arys en lugar de duplicarlos.
   * Si ya hay un registro en curso para la misma póliza, se espera a ese en vez de lanzar otro.
   */
  async registerMembershipFromEmission(
    input: ArysRegisterMembershipInput,
  ): Promise<ArysMembershipRegistrationResult | null> {
    const key = input.cnpoliza?.trim() || input.cpoliza?.trim() || input.xplaca?.trim();
    if (!key) return this.runRegistration(input);

    const running = this.inFlight.get(key);
    if (running) {
      this.logger.log(`Arys registro ya en curso para ${key}, se reutiliza`);
      return running;
    }
    const promise = this.runRegistration(input).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return promise;
  }

  private async runRegistration(
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
      // Si ya conocemos la póliza se abre el respaldo ANTES de consultar Sis2000: así un fallo al
      // resolverla (replicación aún pendiente, póliza no encontrada) también queda registrado y se reintenta.
      const early = input.cnpoliza?.trim() || '';
      let existing = early ? await this.jobs.get(early) : null;
      if (existing?.status === 'SUCCESS') {
        this.logger.log(`Arys membresía ya registrada cnpoliza=${early}, se omite`);
        return null;
      }
      if (early) {
        job = await this.jobs.begin({
          cnpoliza: early,
          cpoliza: input.cpoliza ?? null,
          xplaca: input.xplaca ?? null,
          tipoMembresia,
        });
      }

      const target = await this.repository.resolveEmissionTarget({
        cnpoliza: input.cnpoliza,
        cpoliza: input.cpoliza,
        xplaca: input.xplaca,
      });

      const cnpoliza = target.cnpoliza ?? early;

      if (!job) {
        // Solo se conocía la placa o cpoliza: el cnpoliza sale recién de Sis2000.
        existing = cnpoliza ? await this.jobs.get(cnpoliza) : null;
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
      }

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
      if (!job) {
        // Falló antes de existir el respaldo (p. ej. la póliza no se encuentra en Sis2000) o el
        // respaldo no pudo crearse: markFailure no reporta nada, así que se avisa al monitor aquí.
        const entity = input.cnpoliza ?? input.cpoliza ?? input.xplaca ?? 'n/a';
        void this.reporter.report({
          type: 'arys.membership.failed',
          severity: 'warning',
          title: `Membresía Arys falló · ${entity}`,
          message: `Etapa ${stage}: ${msg.slice(0, 500)} — sin respaldo: no habrá reintento automático.`,
          entity,
          details: { stage, sinRespaldo: true },
          dedupeKey: `arys-membership:${entity}:failed`,
          notify: true,
        });
      }
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
