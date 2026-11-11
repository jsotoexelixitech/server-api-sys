import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MssqlService } from '../../database/mssql.service';
import { ApiChannelService } from '../auth/api-channel.service';
import { NEST_AUTH_SCOPES } from '../auth/scopes/nest-auth-scopes.constants';
import { buildPolicyPdfUrl } from '../../common/helpers/policy-url.helper';
import { parseSPError, toUserFacingError } from '../../common/helpers/sp-error.helper';
import { SP_PRE_EMISION_COLECTIVO } from '../../config/sis2000-sp.constants';
import { CreateEmissionColectivoDto } from './dto/create-emission-colectivo.dto';
import {
  assertNominaSinDuplicados,
  assertVigenciaColectivo,
  canalColectivoDesdeFila,
  colectivoErrorFromMessage,
  filaEmisionColectivo,
  valoresSpColectivo,
  type CanalEmisorColectivo,
  type ValoresSpColectivo,
} from './emision-colectivo.rules';

export interface EmisionColectivoResultado {
  message: string;
  cnpoliza: string;
  cnrecibo: string;
  /** 19 dígitos: va como texto para no perder precisión en JSON. */
  cpoliza: string;
  cproces: number | null;
  fanopol: number;
  fmespol: number;
  urlpoliza: string;
  /** Prima anual emitida (igual a la cotizada: el SP la reparte entre recibos sin recalcularla). */
  prima: number;
  cmoneda: string;
  titulares: number;
  asegurados: number;
}

const toDate = (iso: string | null): Date | null => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`) : null);

/**
 * Emisión colectiva en Sis2000 (sp_pre_emision_personas_colectivo_nexus → sp_emision_personas_colectivo_nexus).
 * La prima viene del cotizador, así que la ruta exige el scope `emissions:colectivo` escrito tal cual en la key: los
 * comodines (`*`, `emissions:*`) no lo otorgan y con la autenticación apagada tampoco pasa.
 */
@Injectable()
export class EmisionColectivoService {
  private readonly logger = new Logger(EmisionColectivoService.name);

  constructor(
    private readonly db: MssqlService,
    private readonly config: ConfigService,
    private readonly channels: ApiChannelService,
  ) {}

  async emitir(
    apikey: string,
    dto: CreateEmissionColectivoDto,
    scopes: string[] | undefined,
  ): Promise<EmisionColectivoResultado> {
    if (!(scopes ?? []).includes(NEST_AUTH_SCOPES.EMISSIONS_COLECTIVO)) {
      throw new ForbiddenException(
        `Permiso requerido: ${NEST_AUTH_SCOPES.EMISSIONS_COLECTIVO} (explícito en la key) para emitir colectivos con prima informada.`,
      );
    }
    assertVigenciaColectivo(dto.fdesde, dto.fhasta);
    assertNominaSinDuplicados(dto.titulares);

    const canal = await this.resolverCanal(apikey);
    const valores = valoresSpColectivo(dto, canal);
    const asegurados = dto.titulares.reduce((n, t) => n + 1 + (t.asegurados?.length ?? 0), 0);

    this.logger.log(
      `emision-colectiva: EXEC ${SP_PRE_EMISION_COLECTIVO} plantilla=${dto.cnpoliza_plantilla} plan=${dto.plan} ` +
        `ramo=${dto.cramo} titulares=${dto.titulares.length} asegurados=${asegurados} prima=${dto.prima} ${dto.cmoneda}`,
    );

    const fila = await this.ejecutarSp(valores);

    const pdfBase = this.config.get<string>('POLICY_PDF_URL') ?? this.config.get<string>('URLPoliza');
    const urlpoliza = buildPolicyPdfUrl(pdfBase, fila.cnpoliza, fila.fanopol, fila.fmespol);

    this.logger.log(`emision-colectiva: emitida cnpoliza=${fila.cnpoliza} cpoliza=${fila.cpoliza}`);
    return {
      message: 'Emisión colectiva registrada exitosamente.',
      cnpoliza: fila.cnpoliza,
      cnrecibo: fila.cnrecibo,
      cpoliza: fila.cpoliza,
      cproces: fila.cproces,
      fanopol: fila.fanopol,
      fmespol: fila.fmespol,
      urlpoliza,
      prima: dto.prima,
      cmoneda: dto.cmoneda,
      titulares: dto.titulares.length,
      asegurados,
    };
  }

  private async resolverCanal(apikey: string): Promise<CanalEmisorColectivo> {
    const cproductorDefecto = parseInt(this.config.get<string>('LAMUNDIAL_PRODUCTOR', '80080') ?? '80080', 10);
    try {
      const fila = await this.channels.resolveChannel(apikey);
      return canalColectivoDesdeFila(fila, cproductorDefecto);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`emision-colectiva: no se pudo resolver el canal de la key: ${msg}`);
      throw new InternalServerErrorException('No se pudo identificar el canal emisor. Inténtalo de nuevo.');
    }
  }

  private async ejecutarSp(v: ValoresSpColectivo) {
    const T = this.db.types;
    const req = this.db.request();
    // Texto: el driver pasa los numeric por double y perdería precisión en 19 dígitos; SQL Server lo convierte.
    req.input('cpoliza_plantilla', T.VarChar(19), v.cpoliza_plantilla);
    req.input('cnpoliza_plantilla', T.VarChar(30), v.cnpoliza_plantilla);
    req.input('cplan', T.VarChar(10), v.cplan);
    req.input('cramo', T.Int, v.cramo);
    req.input('xcanal_venta', T.VarChar(250), v.xcanal_venta);
    req.input('icedula_tomador', T.Char(1), v.icedula_tomador);
    req.input('xrif_tomador', T.Numeric(9, 0), v.xrif_tomador);
    req.input('xnombre_tomador', T.VarChar(250), v.xnombre_tomador);
    req.input('xapellido_tomador', T.VarChar(250), v.xapellido_tomador);
    req.input('isexo_tomador', T.Char(1), v.isexo_tomador);
    req.input('iestado_civil_tomador', T.Char(1), v.iestado_civil_tomador);
    req.input('fnac_tomador', T.DateTime, toDate(v.fnac_tomador));
    req.input('cestado_tomador', T.VarChar(100), v.cestado_tomador);
    req.input('cciudad_tomador', T.VarChar(100), v.cciudad_tomador);
    req.input('xdireccion_tomador', T.VarChar(1000), v.xdireccion_tomador);
    req.input('xtelefono_tomador', T.VarChar(250), v.xtelefono_tomador);
    req.input('xcorreo_tomador', T.VarChar(250), v.xcorreo_tomador);
    req.input('icedula_titular', T.Char(1), v.icedula_titular);
    req.input('xrif_titular', T.Numeric(9, 0), v.xrif_titular);
    req.input('xnombre_titular', T.VarChar(250), v.xnombre_titular);
    req.input('xapellido_titular', T.VarChar(250), v.xapellido_titular);
    req.input('isexo_titular', T.Char(1), v.isexo_titular);
    req.input('iestado_civil_titular', T.Char(1), v.iestado_civil_titular);
    req.input('cestado_titular', T.VarChar(100), v.cestado_titular);
    req.input('cciudad_titular', T.VarChar(100), v.cciudad_titular);
    req.input('xdireccion_titular', T.VarChar(1000), v.xdireccion_titular);
    req.input('xtelefono_titular', T.VarChar(250), v.xtelefono_titular);
    req.input('xcorreo_titular', T.VarChar(250), v.xcorreo_titular);
    req.input('cpersona_politica', T.Char(1), v.cpersona_politica);
    req.input('cterm_y_cod', T.Char(1), v.cterm_y_cod);
    req.input('cdiagnos_enferm', T.Char(1), v.cdiagnos_enferm);
    req.input('xdiagnos_enferm', T.VarChar(1000), v.xdiagnos_enferm);
    req.input('cproductor', T.Int, v.cproductor);
    req.input('cmoneda', T.Char(4), v.cmoneda);
    req.input('msumaaseg', T.Numeric(18, 2), v.msumaaseg);
    req.input('mprimaext', T.Numeric(18, 2), v.mprimaext);
    req.input('ifrecuencia', T.Char(1), v.ifrecuencia);
    req.input('femision', T.DateTime, toDate(v.femision));
    req.input('fdesde', T.Date, toDate(v.fdesde));
    req.input('fhasta', T.Date, toDate(v.fhasta));
    req.input('corigen_rel', T.Char(2), v.corigen_rel);
    req.input('api', T.VarChar(100), v.api);
    req.input('method', T.VarChar(100), v.method);
    req.input('cprog', T.Char(20), v.cprog);
    req.input('ifuente', T.Char(10), v.ifuente);
    req.input('fingreso', T.DateTime, new Date());
    req.input('ccanalalt', T.Int, v.ccanalalt);
    req.input('cscanalalt', T.Int, v.cscanalalt);
    req.input('ctipocanal', T.Char(1), v.ctipocanal);
    req.input('titulares', T.NVarChar(T.MAX), v.titulares);
    req.output('id', T.Int);
    req.output('cpoliza', T.Numeric(19, 0));
    req.output('cnpoliza', T.VarChar(30));
    req.output('cproces', T.Numeric(13, 0));

    let result: Awaited<ReturnType<typeof req.execute>>;
    try {
      result = await req.execute(SP_PRE_EMISION_COLECTIVO);
    } catch (err) {
      const msg = parseSPError(err);
      const deNegocio = colectivoErrorFromMessage(msg);
      if (deNegocio) {
        this.logger.warn(`emision-colectiva: rechazada por el SP: ${msg}`);
        throw deNegocio;
      }
      this.logger.error(`emision-colectiva: error del SP: ${msg}`);
      throw new BadRequestException(toUserFacingError(msg));
    }

    const fila = filaEmisionColectivo(result as Parameters<typeof filaEmisionColectivo>[0]);
    if (!fila) {
      this.logger.error(
        `emision-colectiva: ${SP_PRE_EMISION_COLECTIVO} no devolvió cnpoliza (id=${String(result.output?.['id'] ?? '')}).`,
      );
      throw new InternalServerErrorException('La emisión no devolvió el número de póliza. Contacta a soporte.');
    }
    return fila;
  }
}
