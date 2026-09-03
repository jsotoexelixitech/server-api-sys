import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ArysClient } from './arys.client';
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
   */
  async registerMembershipFromEmission(
    input: ArysRegisterMembershipInput,
  ): Promise<ArysMembershipRegistrationResult | null> {
    if (!this.client.isEnabled()) {
      return null;
    }

    try {
      const target = await this.repository.resolveEmissionTarget({
        cnpoliza: input.cnpoliza,
        cpoliza: input.cpoliza,
        xplaca: input.xplaca,
      });

      const cnpoliza = target.cnpoliza ?? input.cnpoliza ?? '';
      const tipoMembresia = this.resolveTipoMembresia(input.tipoMembresia);

      let personaId = input.personaId;
      if (!personaId) {
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
        this.logger.log(`Arys propietario OK cnpoliza=${cnpoliza} personaId=${personaId}`);
      }

      let vehiculoId = input.vehiculoId;
      if (!vehiculoId) {
        const vehiculoRow = await this.repository.getVehiculoByTarget(target);
        const catalog = await this.client.resolveVehicleCatalogFromVinma(vehiculoRow);
        const vehiculoBody = buildVehiculoRequest(vehiculoRow, catalog, personaId);
        vehiculoId = await this.client.addVehiculo(vehiculoBody);
        this.logger.log(`Arys vehículo OK cnpoliza=${cnpoliza} vehiculoId=${vehiculoId}`);
      }

      const primas = await this.client.getCoberturas(vehiculoId, tipoMembresia);
      const membresia = await this.client.registrarSubcripcion(
        vehiculoId,
        personaId,
        tipoMembresia,
        primas,
      );

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
        `Arys membresía falló cnpoliza=${input.cnpoliza ?? input.xplaca ?? 'n/a'}: ${msg}`,
      );
      return null;
    }
  }
}
