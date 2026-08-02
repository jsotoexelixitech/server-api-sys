import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import * as T from 'mssql';
import { MssqlService } from '../../database/mssql.service';
import { SearchPoliciesDto } from './dto/search-policies.dto';
import { AnularRecibosDto } from './dto/anular-recibos.dto';
import { CrearReciboEndosoDto } from './dto/crear-recibo.dto';
import { AnularPolizaDto } from './dto/anular-poliza.dto';
import { ReactivarPolizaDto } from './dto/reactivar-poliza.dto';
import { CambioDatosPolizaDto } from './dto/cambio-datos-poliza.dto';
import { CambioDatosVehiculoDto } from './dto/cambio-datos-vehiculo.dto';
import { AsientoContableEndosoDto } from './dto/asiento-contable.dto';
import { CalcularPrimaEndosoDto } from './dto/calcular-prima-endoso.dto';

@Injectable()
export class EndososService {
  private readonly logger = new Logger(EndososService.name);

  constructor(private readonly db: MssqlService) {}

  /**
   * Búsqueda general de pólizas con filtros y paginado.
   */
  async getPolizas(dto: SearchPoliciesDto) {
    try {
      const req = this.db.request();
      req.input('cramo', T.Int, dto.cramo || null);
      req.input('cnpoliza', T.NVarChar(30), dto.cnpoliza || null);
      req.input('cedula', T.NVarChar(20), dto.cedula || null);
      req.input('xcliente', T.NVarChar(250), dto.xcliente || null);
      req.input('cplan', T.NVarChar(10), dto.cplan || null);
      req.input('iestado', T.Char(1), dto.iestado || null);
      req.input('page', T.Int, dto.page || 1);
      req.input('limit', T.Int, dto.limit || 20);

      const res = await req.execute('sp_lista_polizas_endosos_nexus');
      const items = res.recordset || [];
      const total = items.length > 0 ? items[0]['total_records'] || items.length : 0;

      return { items, total, page: dto.page || 1, limit: dto.limit || 20 };
    } catch (err: any) {
      this.logger.error(`Error en getPolizas: ${err.message}`, err.stack);
      throw new InternalServerErrorException(err.message || 'Error al listar pólizas.');
    }
  }

  /**
   * Lista de pólizas asociadas a una cédula o RIF.
   */
  async getPolizasByCedula(cedula: string) {
    try {
      const req = this.db.request();
      req.input('cedula', T.NVarChar(30), cedula);
      const res = await req.execute('sp_lista_polizas_cedula_nexus');
      return res.recordset || [];
    } catch (err: any) {
      this.logger.error(`Error en getPolizasByCedula: ${err.message}`, err.stack);
      throw new InternalServerErrorException(err.message || 'Error al consultar pólizas por cédula.');
    }
  }

  /**
   * Consulta detallada de póliza por número de póliza (cnpoliza).
   */
  async getPolizaByCnpoliza(cnpoliza: string) {
    try {
      const req = this.db.request();
      req.input('cnpoliza', T.NVarChar(50), cnpoliza);
      const res = await req.execute('sp_obtener_poliza_endosos_nexus');

      const poliza = res.recordsets[0]?.[0];
      if (!poliza) {
        throw new NotFoundException(`No se encontró la póliza N° ${cnpoliza}`);
      }

      const certificado = res.recordsets[1]?.[0] || null;
      const recibos = res.recordsets[2] || [];

      return { poliza, certificado, recibos };
    } catch (err: any) {
      if (err instanceof NotFoundException) throw err;
      this.logger.error(`Error en getPolizaByCnpoliza: ${err.message}`, err.stack);
      throw new InternalServerErrorException(err.message || 'Error al obtener detalle de la póliza.');
    }
  }

  /**
   * Anulación de recibos específicos de endosos.
   */
  async anularRecibos(dto: AnularRecibosDto) {
    try {
      const req = this.db.request();
      req.input('recibosJson', T.NVarChar(T.MAX), JSON.stringify(dto.recibos));
      req.input('fanulacion', T.DateTime, dto.fanulacion ? new Date(dto.fanulacion) : null);
      req.input('cusuario', T.Int, dto.cusuario || 1);
      req.output('pSuccess', T.Bit);
      req.output('pErrorMessage', T.NVarChar(T.MAX));

      const res = await req.execute('sp_anular_recibos_endoso_nexus');
      const success = Boolean(res.output?.['pSuccess']);
      const message = String(res.output?.['pErrorMessage'] || '');

      if (!success) {
        throw new BadRequestException(message || 'Error al anular recibos');
      }

      return { status: true, message, recibos: dto.recibos };
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`Error en anularRecibos: ${err.message}`, err.stack);
      throw new InternalServerErrorException(err.message || 'Fallo al procesar anulación de recibos.');
    }
  }

  /**
   * Creación de un nuevo recibo de endoso.
   */
  async crearRecibo(dto: CrearReciboEndosoDto) {
    try {
      const req = this.db.request();
      req.input('cnpoliza', T.NVarChar(50), dto.cnpoliza);
      req.input('mprima', T.Numeric(18, 2), dto.mprima);
      req.input('fdesde', T.Date, new Date(dto.fdesde));
      req.input('fhasta', T.Date, new Date(dto.fhasta));
      req.input('cplan', T.NVarChar(10), dto.cplan || null);
      req.input('cusuario', T.Int, dto.cusuario || 1);
      req.output('pCnrecibo', T.NVarChar(30));
      req.output('pCrecibo', T.Numeric(19, 0));
      req.output('pSuccess', T.Bit);
      req.output('pErrorMessage', T.NVarChar(T.MAX));

      const res = await req.execute('sp_crear_recibo_endoso_nexus');
      const success = Boolean(res.output?.['pSuccess']);
      const message = String(res.output?.['pErrorMessage'] || '');
      const cnrecibo = String(res.output?.['pCnrecibo'] || '').trim();
      const crecibo = res.output?.['pCrecibo'];

      if (!success) {
        throw new BadRequestException(message || 'Error al generar recibo de endoso');
      }

      return { status: true, message, cnrecibo, crecibo };
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`Error en crearRecibo: ${err.message}`, err.stack);
      throw new InternalServerErrorException(err.message || 'Fallo al crear recibo de endoso.');
    }
  }

  /**
   * Anulación completa de póliza/contrato.
   */
  async anularPoliza(dto: AnularPolizaDto) {
    try {
      const req = this.db.request();
      req.input('cnpoliza', T.NVarChar(30), dto.cnpoliza);
      req.input('fanopol', T.Int, dto.fanopol);
      req.input('fmespol', T.Int, dto.fmespol);
      req.input('fanulacion', T.DateTime, dto.fanulacion ? new Date(dto.fanulacion) : null);
      req.input('canulacion', T.Int, dto.canulacion || 1);
      req.input('cusuario', T.Int, dto.cusuario || 1);
      req.output('pSuccess', T.Bit);
      req.output('pErrorMessage', T.NVarChar(T.MAX));

      const res = await req.execute('sp_anular_contrato_endoso_nexus');
      const success = Boolean(res.output?.['pSuccess']);
      const message = String(res.output?.['pErrorMessage'] || '');

      if (!success) {
        throw new BadRequestException(message || 'Error al anular póliza');
      }

      return { status: true, message, cnpoliza: dto.cnpoliza };
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`Error en anularPoliza: ${err.message}`, err.stack);
      throw new InternalServerErrorException(err.message || 'Fallo al anular la póliza.');
    }
  }

  /**
   * Reverso / Reactivación de póliza anulada.
   */
  async reactivarPoliza(dto: ReactivarPolizaDto) {
    try {
      const req = this.db.request();
      req.input('cnpoliza', T.NVarChar(30), dto.cnpoliza);
      req.input('fanopol', T.Int, dto.fanopol);
      req.input('fmespol', T.Int, dto.fmespol);
      req.input('cusuario', T.Int, dto.cusuario || 1);
      req.output('pSuccess', T.Bit);
      req.output('pErrorMessage', T.NVarChar(T.MAX));

      const res = await req.execute('sp_reversar_anulacion_endoso_nexus');
      const success = Boolean(res.output?.['pSuccess']);
      const message = String(res.output?.['pErrorMessage'] || '');

      if (!success) {
        throw new BadRequestException(message || 'Error al reactivar la póliza');
      }

      return { status: true, message, cnpoliza: dto.cnpoliza };
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`Error en reactivarPoliza: ${err.message}`, err.stack);
      throw new InternalServerErrorException(err.message || 'Fallo al reactivar la póliza.');
    }
  }

  /**
   * Modificación de tomador, asegurado o beneficiario.
   */
  async cambioDatosPoliza(dto: CambioDatosPolizaDto) {
    try {
      const req = this.db.request();
      req.input('cnpoliza', T.NVarChar(30), dto.cnpoliza);
      req.input('fanopol', T.Int, dto.fanopol);
      req.input('fmespol', T.Int, dto.fmespol);
      req.input('tipoCambio', T.NVarChar(20), dto.tipoCambio);
      req.input('cci_rif', T.Numeric(19, 0), dto.cci_rif);
      req.input('ipersona', T.Char(1), dto.ipersona || 'N');
      req.input('icedula', T.Char(1), dto.icedula || 'V');
      req.input('xcliente', T.NVarChar(250), dto.xcliente);
      req.input('xnombre', T.NVarChar(120), dto.xnombre || null);
      req.input('xapellido', T.NVarChar(120), dto.xapellido || null);
      req.input('xdireccion', T.NVarChar(500), dto.xdireccion || null);
      req.input('xtelefono', T.NVarChar(50), dto.xtelefono || null);
      req.input('xcorreo', T.NVarChar(250), dto.xcorreo || null);
      req.input('cusuario', T.Int, dto.cusuario || 1);
      req.output('pSuccess', T.Bit);
      req.output('pErrorMessage', T.NVarChar(T.MAX));

      const res = await req.execute('sp_cambio_datos_poliza_endoso_nexus');
      const success = Boolean(res.output?.['pSuccess']);
      const message = String(res.output?.['pErrorMessage'] || '');

      if (!success) {
        throw new BadRequestException(message || 'Error al cambiar datos de la póliza');
      }

      return { status: true, message, cnpoliza: dto.cnpoliza };
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`Error en cambioDatosPoliza: ${err.message}`, err.stack);
      throw new InternalServerErrorException(err.message || 'Fallo al cambiar datos de la póliza.');
    }
  }

  /**
   * Modificación de datos de vehículo en el certificado.
   */
  async cambioDatosVehiculo(dto: CambioDatosVehiculoDto) {
    try {
      const req = this.db.request();
      req.input('cnpoliza', T.NVarChar(30), dto.cnpoliza);
      req.input('fanopol', T.Int, dto.fanopol);
      req.input('fmespol', T.Int, dto.fmespol);
      req.input('ccerti', T.Int, dto.ccerti || 1);
      req.input('xplaca', T.NVarChar(30), dto.xplaca);
      req.input('xsermot', T.NVarChar(30), dto.xsermot);
      req.input('xsercar', T.NVarChar(30), dto.xsercar);
      req.input('xcolor', T.NVarChar(30), dto.xcolor);
      req.input('fano', T.Int, dto.fano);
      req.input('cmarca', T.NVarChar(10), dto.cmarca);
      req.input('cmodelo', T.NVarChar(10), dto.cmodelo);
      req.input('cversion', T.NVarChar(10), dto.cversion);
      req.input('cusuario', T.Int, dto.cusuario || 1);
      req.output('pSuccess', T.Bit);
      req.output('pErrorMessage', T.NVarChar(T.MAX));

      const res = await req.execute('sp_cambio_datos_vehiculo_endoso_nexus');
      const success = Boolean(res.output?.['pSuccess']);
      const message = String(res.output?.['pErrorMessage'] || '');

      if (!success) {
        throw new BadRequestException(message || 'Error al actualizar vehículo');
      }

      return { status: true, message, xplaca: dto.xplaca };
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`Error en cambioDatosVehiculo: ${err.message}`, err.stack);
      throw new InternalServerErrorException(err.message || 'Fallo al actualizar vehículo.');
    }
  }

  /**
   * Procesamiento de cobro y generación de asiento contable.
   */
  async asientoContable(dto: AsientoContableEndosoDto) {
    try {
      const req = this.db.request();
      req.input('cnrecibo', T.NVarChar(30), dto.cnrecibo);
      req.input('mpagadoext', T.Numeric(18, 2), dto.mpagadoext);
      req.input('fcobro', T.DateTime, dto.fcobro ? new Date(dto.fcobro) : null);
      req.input('xbanco', T.NVarChar(100), dto.xbanco || 'BANCO MERCANTIL');
      req.input('xreferencia', T.NVarChar(100), dto.xreferencia || null);
      req.input('cusuario', T.Int, dto.cusuario || 1);
      req.output('pSuccess', T.Bit);
      req.output('pErrorMessage', T.NVarChar(T.MAX));

      const res = await req.execute('sp_asiento_contable_cobro_endoso_nexus');
      const success = Boolean(res.output?.['pSuccess']);
      const message = String(res.output?.['pErrorMessage'] || '');

      if (!success) {
        throw new BadRequestException(message || 'Error al procesar el asiento contable');
      }

      return { status: true, message, cnrecibo: dto.cnrecibo };
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`Error en asientoContable: ${err.message}`, err.stack);
      throw new InternalServerErrorException(err.message || 'Fallo al generar asiento contable.');
    }
  }

  /**
   * Catálogo de planes disponibles.
   */
  async getPlanes(cramo?: number) {
    try {
      const req = this.db.request();
      req.input('cramo', T.Int, cramo || null);
      const res = await req.execute('sp_catalogo_planes_endoso_nexus');
      return res.recordset || [];
    } catch (err: any) {
      this.logger.error(`Error en getPlanes: ${err.message}`, err.stack);
      throw new InternalServerErrorException(err.message || 'Error al consultar catálogo de planes.');
    }
  }

  /**
   * Coberturas asociadas a un plan.
   */
  async getCoberturasPlan(cplan: string, cramo?: number) {
    try {
      const req = this.db.request();
      req.input('cplan', T.NVarChar(10), cplan);
      req.input('cramo', T.Int, cramo || null);
      const res = await req.execute('sp_coberturas_plan_endoso_nexus');
      return res.recordset || [];
    } catch (err: any) {
      this.logger.error(`Error en getCoberturasPlan: ${err.message}`, err.stack);
      throw new InternalServerErrorException(err.message || 'Error al obtener coberturas del plan.');
    }
  }

  /**
   * Cálculo de prima prorrateada para endoso.
   */
  async calcularPrima(dto: CalcularPrimaEndosoDto) {
    try {
      const req = this.db.request();
      req.input('cnpoliza', T.NVarChar(30), dto.cnpoliza || null);
      req.input('cplan', T.NVarChar(10), dto.cplan);
      req.input('fdesde', T.Date, new Date(dto.fdesde));
      req.input('fhasta', T.Date, new Date(dto.fhasta));
      req.input('mprima_anual', T.Numeric(18, 2), dto.mprima_anual || null);
      req.output('pSuccess', T.Bit);
      req.output('pErrorMessage', T.NVarChar(T.MAX));

      const res = await req.execute('sp_calcula_prima_endoso_nexus');
      const calculation = res.recordset?.[0] || {};
      const success = Boolean(res.output?.['pSuccess']);
      const message = String(res.output?.['pErrorMessage'] || '');

      if (!success) {
        throw new BadRequestException(message || 'Error al calcular prima de endoso');
      }

      return { status: true, calculation };
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`Error en calcularPrima: ${err.message}`, err.stack);
      throw new InternalServerErrorException(err.message || 'Fallo al calcular prima de endoso.');
    }
  }
}
