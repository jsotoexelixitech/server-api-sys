import { Injectable, Logger } from '@nestjs/common';
import { ValrepService } from '../valrep/valrep.service';
import { PersonasService } from '../personas/personas.service';
import { CotizacionPerDto } from '../personas/dto/cotizacion-per.dto';
import { CreateEmissionPersonDto } from '../personas/dto/create-emission-person.dto';
import {
  VIAJERO_NACIONAL,
  type ViajeroRiesgosPlan,
} from './viajero-nacional.constants';
import { GetViaje3PlanDto } from './dto/get-viaje3-plan.dto';
import { CotizacionViaje3Dto } from './dto/cotizacion-viaje3.dto';
import { EmitViaje3Dto } from './dto/emit-viaje3.dto';

@Injectable()
export class ViajeroNacionalService {
  private readonly logger = new Logger(ViajeroNacionalService.name);

  constructor(
    private readonly valrep: ValrepService,
    private readonly personas: PersonasService,
  ) {}

  /** Plan fijo ramo 25 (VIAJE3 o VIAJE4). */
  getPlan(body: GetViaje3PlanDto = {}, plan: ViajeroRiesgosPlan = VIAJERO_NACIONAL) {
    const fdesde = this.resolveFdesde(body.fdesde);
    return {
      ...plan,
      fdesde,
      fhasta: this.addCoverageDays(fdesde, plan.ndias),
    };
  }

  /** Detalle Sis2000 (`spBuscaDetallePlan`) del plan fijo. */
  async getDetalle(plan: ViajeroRiesgosPlan = VIAJERO_NACIONAL) {
    const planes = await this.valrep.getPlanesDetallePersonas({
      cramo: plan.cramo,
      cplan: plan.cplan,
    });
    return {
      ...this.getPlan({}, plan),
      plan: planes[0] ?? null,
    };
  }

  /** Frecuencias del plan; si el SP no trae ndias se completa con el contrato. */
  async getFrecuencia(plan: ViajeroRiesgosPlan = VIAJERO_NACIONAL) {
    try {
      const rows = await this.valrep.getFrecuencia(plan.cplan, plan.cramo);
      return rows.map((row) => ({
        ...row,
        ndias: row.ndias ?? plan.ndias,
        cramo: plan.cramo,
        cplan: plan.cplan,
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`getFrecuencia ${plan.cplan}: ${msg} — usando contrato fijo`);
      return [
        {
          cvalor: plan.ifrecuencia,
          xdescripcion: plan.xfrecuencia,
          ndias: plan.ndias,
          cramo: plan.cramo,
          cplan: plan.cplan,
        },
      ];
    }
  }

  async cotizar(body: CotizacionViaje3Dto, plan: ViajeroRiesgosPlan = VIAJERO_NACIONAL) {
    const dto: CotizacionPerDto = {
      cramo: plan.cramo,
      cplan: plan.cplan,
      ifrecuencia: plan.ifrecuencia,
      asegurados: body.asegurados,
    };
    return this.personas.getCotizacionPer(dto);
  }

  async validar(body: Record<string, unknown>, plan: ViajeroRiesgosPlan = VIAJERO_NACIONAL) {
    return this.personas.validateEmissionPerson(this.lockEmissionFields(body, plan));
  }

  async emitir(
    apikey: string,
    dto: EmitViaje3Dto,
    plan: ViajeroRiesgosPlan = VIAJERO_NACIONAL,
  ) {
    const locked = this.lockEmissionFields(dto as unknown as Record<string, unknown>, plan);
    return this.personas.createEmissionPerson(
      apikey ?? '',
      locked as unknown as CreateEmissionPersonDto,
    );
  }

  /**
   * Fija ramo, plan, frecuencia y vigencia del contrato.
   * El cliente no puede emitir otro plan por esta API.
   * Canal: aplana `canal` / alias planos hacia lo que ya consume emisión de personas.
   */
  private lockEmissionFields(
    body: Record<string, unknown>,
    plan: ViajeroRiesgosPlan,
  ): Record<string, unknown> {
    const withCanal = this.flattenCanal(body);
    const femision = String(withCanal['fecha_emision'] ?? withCanal['femision'] ?? '').trim();
    const fdesde = this.resolveFdesde(
      String(withCanal['fdesde'] ?? femision ?? '').trim() || undefined,
    );
    return {
      ...withCanal,
      cramo: plan.cramo,
      plan: plan.cplan,
      cplan: plan.cplan,
      frecuencia: plan.ifrecuencia,
      ifrecuencia: plan.ifrecuencia,
      cmoneda: withCanal['cmoneda'] ?? plan.cmoneda,
      fdesde,
      fhasta: this.addCoverageDays(fdesde, plan.ndias),
      ndias: plan.ndias,
      fecha_emision: femision || fdesde,
    };
  }

  /**
   * Prioridad: campo plano del body, luego objeto `canal`.
   * `productor` es lo que lee `createEmissionPerson` hacia el SP (`cproductor`).
   */
  private flattenCanal(body: Record<string, unknown>): Record<string, unknown> {
    const canal =
      body['canal'] && typeof body['canal'] === 'object'
        ? (body['canal'] as Record<string, unknown>)
        : {};
    const pick = (...keys: string[]) => {
      for (const key of keys) {
        const value = body[key] ?? canal[key];
        if (value !== undefined && value !== null && value !== '') return value;
      }
      return undefined;
    };
    const productor = pick('productor', 'cproductor');
    const ctipocanal = pick('ctipocanal');
    const ccanalalt = pick('ccanalalt', 'ccanalalt_in');
    const cscanalalt = pick('cscanalalt', 'cscanalalt_in');
    const cusuario = pick('cusuario');
    const cgestor = pick('cgestor', 'cgestor_in');
    return {
      ...body,
      ...(productor !== undefined ? { productor, cproductor: productor } : {}),
      ...(ctipocanal !== undefined ? { ctipocanal } : {}),
      ...(ccanalalt !== undefined ? { ccanalalt, ccanalalt_in: ccanalalt } : {}),
      ...(cscanalalt !== undefined ? { cscanalalt, cscanalalt_in: cscanalalt } : {}),
      ...(cusuario !== undefined ? { cusuario } : {}),
      ...(cgestor !== undefined ? { cgestor } : {}),
    };
  }

  private resolveFdesde(value?: string): string {
    const raw = value?.trim();
    if (raw) return raw.slice(0, 10);
    return new Date().toISOString().slice(0, 10);
  }

  /** Cobertura comercial: 3 o 7 días corridos. fhasta = fdesde + ndias (07→14 = 7 días). */
  private addCoverageDays(fdesde: string, ndias: number): string {
    const d = new Date(`${fdesde}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + ndias);
    return d.toISOString().slice(0, 10);
  }
}
