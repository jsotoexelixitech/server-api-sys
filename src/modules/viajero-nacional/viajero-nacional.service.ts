import { Injectable, Logger } from '@nestjs/common';
import { ValrepService } from '../valrep/valrep.service';
import { PersonasService } from '../personas/personas.service';
import { CotizacionPerDto } from '../personas/dto/cotizacion-per.dto';
import { CreateEmissionPersonDto } from '../personas/dto/create-emission-person.dto';
import { VIAJERO_NACIONAL } from './viajero-nacional.constants';
import { GetViaje3PlanDto } from './dto/get-viaje3-plan.dto';
import { CotizacionViaje3Dto } from './dto/cotizacion-viaje3.dto';

@Injectable()
export class ViajeroNacionalService {
  private readonly logger = new Logger(ViajeroNacionalService.name);

  constructor(
    private readonly valrep: ValrepService,
    private readonly personas: PersonasService,
  ) {}

  /** Igual que por-días: resuelve el plan, pero aquí el código es siempre VIAJE3. */
  getPlan(body: GetViaje3PlanDto = {}) {
    const fdesde = this.resolveFdesde(body.fdesde);
    return {
      ...VIAJERO_NACIONAL,
      fdesde,
      fhasta: this.addInclusiveDays(fdesde, VIAJERO_NACIONAL.ndias),
    };
  }

  /** Detalle Sis2000 (spBuscaDetallePlan) del plan fijo. */
  async getDetalle() {
    const planes = await this.valrep.getPlanesDetallePersonas({
      cramo: VIAJERO_NACIONAL.cramo,
      cplan: VIAJERO_NACIONAL.cplan,
    });
    return {
      ...this.getPlan({}),
      plan: planes[0] ?? null,
    };
  }

  /** Frecuencias del plan; si el SP no trae ndias se completa con el contrato. */
  async getFrecuencia() {
    try {
      const rows = await this.valrep.getFrecuencia(
        VIAJERO_NACIONAL.cplan,
        VIAJERO_NACIONAL.cramo,
      );
      return rows.map((row) => ({
        ...row,
        ndias: row.ndias ?? VIAJERO_NACIONAL.ndias,
        cramo: VIAJERO_NACIONAL.cramo,
        cplan: VIAJERO_NACIONAL.cplan,
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`getFrecuencia VIAJE3: ${msg} — usando contrato fijo`);
      return [
        {
          cvalor: VIAJERO_NACIONAL.ifrecuencia,
          xdescripcion: VIAJERO_NACIONAL.xfrecuencia,
          ndias: VIAJERO_NACIONAL.ndias,
          cramo: VIAJERO_NACIONAL.cramo,
          cplan: VIAJERO_NACIONAL.cplan,
        },
      ];
    }
  }

  async cotizar(body: CotizacionViaje3Dto) {
    const dto: CotizacionPerDto = {
      cramo: VIAJERO_NACIONAL.cramo,
      cplan: VIAJERO_NACIONAL.cplan,
      ifrecuencia: VIAJERO_NACIONAL.ifrecuencia,
      asegurados: body.asegurados,
    };
    return this.personas.getCotizacionPer(dto);
  }

  async validar(body: Record<string, unknown>) {
    return this.personas.validateEmissionPerson(this.lockEmissionFields(body));
  }

  async emitir(apikey: string, dto: CreateEmissionPersonDto) {
    const locked = this.lockEmissionFields(dto as unknown as Record<string, unknown>);
    return this.personas.createEmissionPerson(
      apikey ?? '',
      locked as unknown as CreateEmissionPersonDto,
    );
  }

  /**
   * Fija ramo, plan, frecuencia y vigencia de 3 días.
   * El cliente no puede emitir otro plan por esta API.
   */
  private lockEmissionFields(body: Record<string, unknown>): Record<string, unknown> {
    const femision = String(body['fecha_emision'] ?? body['femision'] ?? '').trim();
    const fdesde = this.resolveFdesde(
      String(body['fdesde'] ?? femision ?? '').trim() || undefined,
    );
    return {
      ...body,
      cramo: VIAJERO_NACIONAL.cramo,
      plan: VIAJERO_NACIONAL.cplan,
      cplan: VIAJERO_NACIONAL.cplan,
      frecuencia: VIAJERO_NACIONAL.ifrecuencia,
      ifrecuencia: VIAJERO_NACIONAL.ifrecuencia,
      cmoneda: body['cmoneda'] ?? VIAJERO_NACIONAL.cmoneda,
      fdesde,
      fhasta: String(body['fhasta'] ?? '').trim() || this.addInclusiveDays(fdesde, VIAJERO_NACIONAL.ndias),
      ndias: VIAJERO_NACIONAL.ndias,
      fecha_emision: femision || fdesde,
    };
  }

  private resolveFdesde(value?: string): string {
    const raw = value?.trim();
    if (raw) return raw.slice(0, 10);
    return new Date().toISOString().slice(0, 10);
  }

  /** Vigencia inclusiva: 3 días desde fdesde → fhasta = fdesde + 2. */
  private addInclusiveDays(fdesde: string, ndias: number): string {
    const d = new Date(`${fdesde}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + ndias - 1);
    return d.toISOString().slice(0, 10);
  }
}
