import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MssqlService } from '../../database/mssql.service';
import { RegistrarSiniestroDto, TIPOS_PERDIDA } from './dto/registrar-siniestro.dto';

export const SP_REGISTRA_SINIESTRO_NEXUS = 'sp_registra_siniestro_nexus';

export interface SiniestroRegistrado {
  csinies: string;
  cnsinies: string;
  /** true si ya estaba registrado (llamada repetida): no se creó otro. */
  yaExistia: boolean;
  mensaje: string;
}

/**
 * Alta de un siniestro de Automóvil en SIS2000 (`snsinies` es el registro, D14) mediante `sp_registra_siniestro_nexus`,
 * que envuelve `sp_genera_siniestro_nexus` con idempotencia, moneda de la póliza y tipo de pérdida.
 * El usuario de SIS2000 que queda en el siniestro sale de `SINIESTROS_CUSUARIO` (nunca 999: es el de la sincronización con RMS).
 */
@Injectable()
export class SiniestrosRegistroService {
  private readonly logger = new Logger(SiniestrosRegistroService.name);

  constructor(
    private readonly db: MssqlService,
    private readonly config: ConfigService,
  ) {}

  private cusuario(): number {
    const n = Number(this.config.get('SINIESTROS_CUSUARIO'));
    if (!Number.isInteger(n) || n <= 0 || n === 999) {
      this.logger.error('SINIESTROS_CUSUARIO no está configurado (o es 999, reservado a RMS).');
      throw new ServiceUnavailableException('El registro de siniestros no está habilitado en este ambiente.');
    }
    return n;
  }

  async registrar(dto: RegistrarSiniestroDto): Promise<SiniestroRegistrado> {
    const cusuario = this.cusuario();
    const hoy = new Date().toISOString().slice(0, 10);
    const fnotificacion = dto.fnotificacion ?? hoy;
    if (dto.focurrencia > fnotificacion) {
      throw new BadRequestException('La fecha de ocurrencia no puede ser posterior a la de notificación.');
    }
    if (fnotificacion > hoy) {
      throw new BadRequestException('La fecha de notificación no puede ser futura.');
    }

    try {
      const T = this.db.types;
      const req = this.db.request();
      req.input('cnpoliza', T.VarChar(30), dto.cnpoliza);
      req.input('placa', T.VarChar(50), dto.placa.toUpperCase());
      // Mediodía local: evita que la zona horaria cambie el día al convertir a DATETIME.
      req.input('fnotificacion', T.DateTime, new Date(`${fnotificacion}T12:00:00`));
      req.input('focurencia', T.DateTime, new Date(`${dto.focurrencia}T12:00:00`));
      req.input('ccausa', T.Int, dto.ccausa);
      req.input('cusuario', T.Numeric(11, 0), cusuario);
      if (dto.monto !== undefined) req.input('mmonto', T.Numeric(16, 2), dto.monto);
      if (dto.tipoPerdida) req.input('ctipoperdida', T.Int, TIPOS_PERDIDA[dto.tipoPerdida]);
      if (dto.cpais !== undefined) req.input('cpais', T.Int, dto.cpais);
      if (dto.cestado !== undefined) req.input('cestado', T.Int, dto.cestado);
      if (dto.cciudad !== undefined) req.input('cciudad', T.Int, dto.cciudad);
      if (dto.xobserva) req.input('xobserva', T.VarChar(254), dto.xobserva);
      req.output('csinies', T.Numeric(19, 0));
      req.output('cnsinies', T.Char(30));
      req.output('bexistia', T.Bit);
      req.output('cerror', T.Int);
      req.output('msj', T.VarChar(255));

      const r = await req.execute(SP_REGISTRA_SINIESTRO_NEXUS);
      const out = (r.output ?? {}) as Record<string, unknown>;
      const cerror = Number(out.cerror ?? 0);
      const mensaje = String(out.msj ?? '').trim();
      if (cerror !== 0) {
        // Rechazo de negocio de SIS2000 (póliza fuera de vigencia, causa inexistente...): se explica al usuario.
        throw new BadRequestException(mensaje || 'SIS2000 rechazó el registro del siniestro.');
      }
      const cnsinies = String(out.cnsinies ?? '').trim();
      if (!cnsinies) throw new Error('El procedimiento no devolvió el número de siniestro');
      return { csinies: String(out.csinies ?? ''), cnsinies, yaExistia: Boolean(out.bexistia), mensaje };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`registrarSiniestro: ${msg}`);
      throw new InternalServerErrorException('Error al registrar el siniestro.');
    }
  }
}
