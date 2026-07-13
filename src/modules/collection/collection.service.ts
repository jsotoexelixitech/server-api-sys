import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { MssqlService } from '../../database/mssql.service';
import { CollectionPaymentDto } from './dto/collection-payment.dto';
import { parseSPError } from '../../common/helpers/sp-error.helper';

interface ApiClientRow {
  cproductor?: number;
  cci_rif?: number;
  cbanco_destino?: number | null;
  ctipopago?: number | null;
  cprog?: string;
}

interface SoporteRow {
  cbanco?: number | null;
  cbanco_destino?: number | null;
  cmoneda: string;
  ctipopago?: number | null;
  mpago: number;
  mpagoext: number;
  mpagoigtf?: number;
  mpagoigtfext?: number;
  mtotal: number;
  mtotalext: number;
  ptasamon: number;
  ptasaref?: number;
  xreferencia: string;
  xruta?: string;
}

interface CollectionPayload {
  asegurados: unknown[];
  cmoneda_pago: string;
  cprog: string;
  ctenedor: number;
  cusuario: number;
  fcobro: string;
  freporte: string;
  imov: string;
  mpago: number;
  mpagoext: number;
  numRecibos: number;
  recibos: string[];
  referencia: string;
  soporte: SoporteRow[];
}

@Injectable()
export class CollectionService {
  private readonly logger = new Logger(CollectionService.name);

  constructor(private readonly db: MssqlService) {}

  /** Rechaza referencias internas Exélixi; exige ref. bancaria del pago verificado. */
  private assertValidBankReference(xreferencia: string): void {
    const ref = String(xreferencia ?? '').trim();
    if (!ref) {
      throw new BadRequestException('xreferencia requerida: use la referencia bancaria del pago verificado.');
    }
    if (/^EX-/i.test(ref)) {
      throw new BadRequestException(
        'xreferencia inválida: no se aceptan referencias internas (EX-INT). Use la referencia del banco.',
      );
    }
    if (ref.length > 30) {
      throw new BadRequestException('xreferencia excede 30 caracteres.');
    }
  }

  /** ¿Existe la referencia en pago_movil o trsypago? */
  private async isPaymentRegistered(xreferencia: string): Promise<boolean> {
    const T = this.db.types;
    const req = this.db.request();
    req.input('xreferencia', T.VarChar(30), xreferencia);
    const result = await req.query(`
      SELECT CASE
        WHEN EXISTS (SELECT 1 FROM pago_movil WHERE referencia_banco LIKE '%' + @xreferencia + '%') THEN 1
        WHEN EXISTS (SELECT 1 FROM trsypago WHERE ref_ibp LIKE '%' + @xreferencia + '%') THEN 1
        ELSE 0
      END AS found
    `);
    return Number(result.recordset?.[0]?.['found'] ?? 0) === 1;
  }

  /**
   * Tras verificar pago móvil vía SysIP, la fila puede no existir en la BD que usa nest-api
   * (instancia distinta o registro solo en el gateway). Inserta en pago_movil si falta.
   */
  private async ensureMobilePaymentRegistered(body: CollectionPaymentDto): Promise<void> {
    const ref = body.xreferencia.trim();
    if (await this.isPaymentRegistered(ref)) return;

    const bankRef = body.cbanco_ref?.trim();
    if (!bankRef) {
      this.logger.warn(
        `ensureMobilePayment: ref=${ref} sin cbanco_ref — no se puede registrar en pago_movil`,
      );
      return;
    }

    const T = this.db.types;
    const destBank =
      body.cbanco_dest_ref?.trim() ||
      process.env.LAMUNDIAL_PAYMENTS_DEST_BANCO ||
      '0171';
    const fechaMov = new Date(`${body.fpago}T12:00:00`);

    const ins = this.db.request();
    ins.input('dni', T.VarChar(20), body.cci_rif?.trim() ?? null);
    ins.input('tel_orig', T.VarChar(20), body.xtelefono?.trim() ?? null);
    ins.input('tel_dest', T.VarChar(20), body.telefono_dest?.trim() ?? '04143966962');
    ins.input('banco_orig', T.VarChar(10), bankRef);
    ins.input('banco_dest', T.VarChar(10), destBank);
    ins.input('referencia', T.VarChar(50), ref);
    ins.input('monto', T.Numeric(18, 2), body.mpago);
    ins.input('fecha', T.DateTime, fechaMov);

    await ins.query(`
      INSERT INTO pago_movil
        (dni, telefono_origen, telefono_destino, banco_origen, banco_destino,
         referencia_banco, monto, fecha_movimiento, descripcion, refpk, ifuente, fcreacion)
      SELECT
        @dni, @tel_orig, @tel_dest, @banco_orig, @banco_dest,
        @referencia, @monto, @fecha, 'Pago verificado Exelixi', @referencia, 'EXELIXI', GETDATE()
      WHERE NOT EXISTS (
        SELECT 1 FROM pago_movil WHERE referencia_banco = @referencia
      )
    `);

    this.logger.log(`ensureMobilePayment: ref=${ref} registrado en pago_movil (Exelixi)`);
  }

  /** La referencia debe existir en pago_movil o trsypago (mismo criterio que SysIP). */
  private async assertPaymentRegistered(xreferencia: string): Promise<void> {
    if (!(await this.isPaymentRegistered(xreferencia))) {
      throw new BadRequestException(
        'Referencia de pago no registrada en Sis2000. Verifique el pago móvil antes de cobrar el recibo.',
      );
    }
  }

  /** Resuelve cbanco numérico desde cbanco_ref (ej. 0134 → mabanco.cbanco). */
  private async resolveCbancoFromRef(bankRef: string): Promise<number | null> {
    const ref = String(bankRef).trim();
    if (!ref) return null;
    const T = this.db.types;
    const req = this.db.request();
    req.input('ref', T.VarChar(10), ref);
    const result = await req.query(`
      SELECT TOP 1 cbanco FROM mabanco
      WHERE LTRIM(RTRIM(cbanco_ref)) = @ref OR CAST(cbanco AS VARCHAR(20)) = @ref
    `);
    const cbanco = result.recordset?.[0]?.['cbanco'];
    return cbanco != null ? Number(cbanco) : null;
  }

  /**
   * Igual que SysIP getPaymentData + datos de pago_movil para banco origen.
   * cbanco_destino: 35 pago móvil, 31 sypago.
   */
  private async resolvePaymentBanks(
    xreferencia: string,
    body: CollectionPaymentDto,
    client: ApiClientRow,
  ): Promise<{ cbanco: number | null; cbanco_destino: number | null; ctipopago: number | null }> {
    const T = this.db.types;

    const destReq = this.db.request();
    destReq.input('xreferencia', T.VarChar(30), xreferencia);
    const destResult = await destReq.query(`
      SELECT CASE
        WHEN EXISTS (SELECT 1 FROM trsypago WHERE ref_ibp LIKE '%' + @xreferencia + '%') THEN 31
        WHEN EXISTS (SELECT 1 FROM pago_movil WHERE referencia_banco LIKE '%' + @xreferencia + '%') THEN 35
        ELSE NULL
      END AS cbanco_destino
    `);
    let cbanco_destino =
      destResult.recordset?.[0]?.['cbanco_destino'] != null
        ? Number(destResult.recordset[0]['cbanco_destino'])
        : null;

    const pmReq = this.db.request();
    pmReq.input('xreferencia', T.VarChar(30), xreferencia);
    const pmResult = await pmReq.query(`
      SELECT TOP 1 banco_origen FROM pago_movil
      WHERE referencia_banco LIKE '%' + @xreferencia + '%'
    `);
    const bancoOrigenRef =
      body.cbanco_ref?.trim() ||
      (pmResult.recordset?.[0]?.['banco_origen'] as string | undefined)?.trim() ||
      null;

    let cbanco = body.cbanco != null ? Number(body.cbanco) : null;
    if (!cbanco && bancoOrigenRef) {
      cbanco = await this.resolveCbancoFromRef(bancoOrigenRef);
    }

    if (cbanco_destino == null) {
      cbanco_destino =
        body.cbanco_destino != null
          ? Number(body.cbanco_destino)
          : client.cbanco_destino != null
            ? Number(client.cbanco_destino)
            : null;
    }

    return {
      cbanco,
      cbanco_destino,
      ctipopago: client.ctipopago ?? null,
    };
  }

  /** Moneda para JSON @soporte de spNotificaPago (sis2000_qa). */
  private normalizeSoporteMoneda(cmoneda: string): string {
    const m = String(cmoneda ?? 'Bs').trim().toUpperCase();
    if (m === 'BS' || m === 'BSS' || m === 'BOLIVARES' || m === 'BOLÍVARES') return 'BS';
    if (m === '$' || m === 'USD' || m === 'DOLARES' || m === 'DÓLARES') return '$';
    return m;
  }

  /** JSON requerido por spNotificaPago en QA: [{ cmoneda, mmonto, ftasa }]. */
  private buildSoporteJson(payload: CollectionPayload): string {
    const ftasa = payload.fcobro;
    const items =
      payload.soporte.length > 0
        ? payload.soporte.map((s) => ({
            cmoneda: this.normalizeSoporteMoneda(String(s.cmoneda ?? payload.cmoneda_pago)),
            mmonto: Number(s.mpago),
            ftasa,
          }))
        : [
            {
              cmoneda: this.normalizeSoporteMoneda(payload.cmoneda_pago),
              mmonto: Number(payload.mpago),
              ftasa,
            },
          ];
    return JSON.stringify(items);
  }

  /** Busca recibos pendientes del cliente vía spSearchForCustomerByReceipt. */
  async searchByClient(cci_rif: string) {
    const T = this.db.types;
    const req = this.db.request();
    req.input('xcaso', T.NVarChar(10), 'recibos');
    req.input('iestadorec', T.NVarChar(2), 'P');
    req.input('itiporec', T.NVarChar(2), '0');
    req.input('cci_rif', T.NVarChar(20), cci_rif);

    try {
      const result = await req.execute('spSearchForCustomerByReceipt');
      const rows = result.recordset ?? [];

      const rateReq = this.db.request();
      const rateResult = await rateReq.query<{ ptasamon: number }>(
        `SELECT ptasamon FROM mamonedas WHERE TRIM(cmoneda) = '$'`,
      );
      const ptasamon = rateResult.recordset[0]?.ptasamon ?? 0;

      const data = rows.map((rec: Record<string, unknown>) => ({
        cliente: {
          cid: rec['cid'],
          xcliente: rec['xcliente'],
          xcorreo: rec['xcorreo'],
        },
        recibo: {
          cdoccob: rec['cdoccob'],
          cnpoliza: rec['cnpoliza'],
          fanopol: rec['fanopol'],
          cnrecibo: rec['cnrecibo'],
          qcuotas: rec['qcuotas'],
          cmoneda: rec['cmoneda'],
          ptasamon,
          mmontorec: parseFloat(
            (Number(rec['mmontorecext'] ?? 0) * ptasamon).toFixed(2),
          ),
          mmontorecext: rec['mmontorecext'],
        },
      }));

      return { data };
    } catch (err) {
      const msg = parseSPError(err);
      this.logger.error(`searchByClient: ${msg}`);
      throw new InternalServerErrorException(msg);
    }
  }

  /** Resuelve datos del canal desde maclient_api (o defaults Exelixi). */
  private async resolveApiClient(apikey: string): Promise<ApiClientRow> {
    const T = this.db.types;
    const req = this.db.request();
    req.input('xtoken', T.VarChar(100), apikey);
    const result = await req.query(`
      SELECT TOP 1 cproductor, cci_rif, cbanco_destino, cprog
      FROM maclient_api WHERE xtoken = @xtoken
    `);
    if (!result.recordset.length) {
      return {
        cproductor: parseInt(process.env.LAMUNDIAL_PRODUCTOR ?? '80080', 10),
        cci_rif: parseInt(process.env.LAMUNDIAL_CUSUARIO ?? '4', 10),
        cbanco_destino: null,
        ctipopago: null,
        cprog: 'buildExtPayload',
      };
    }
    return result.recordset[0] as ApiClientRow;
  }

  /** Construye payload de cobro a partir del recibo y datos de pago verificado. */
  async buildCollectionPayload(
    apikey: string,
    body: CollectionPaymentDto,
  ): Promise<CollectionPayload> {
    this.assertValidBankReference(body.xreferencia);
    if (!body.mpago || Number(body.mpago) <= 0) {
      throw new BadRequestException(
        'mpago debe ser el monto pagado en bolívares (Bs) según la verificación bancaria.',
      );
    }
    await this.ensureMobilePaymentRegistered(body);
    await this.assertPaymentRegistered(body.xreferencia.trim());
    return this.buildCollectionPayloadInternal(apikey, body);
  }

  private async buildCollectionPayloadInternal(
    apikey: string,
    body: CollectionPaymentDto,
  ): Promise<CollectionPayload> {
    const client = await this.resolveApiClient(apikey);
    const T = this.db.types;
    const xreferencia = body.xreferencia.trim();
    const banks = await this.resolvePaymentBanks(xreferencia, body, client);

    const recReq = this.db.request();
    recReq.input('cnrecibo', T.VarChar(30), body.cnrecibo);
    const recResult = await recReq.query(`
      SELECT ctenedor, cmoneda FROM adrecibos WHERE cnrecibo = @cnrecibo
    `);
    if (!recResult.recordset.length) {
      throw new BadRequestException(`Recibo no encontrado: ${body.cnrecibo}`);
    }
    const { ctenedor, cmoneda } = recResult.recordset[0] as {
      ctenedor: number;
      cmoneda: string;
    };

    const curReq = this.db.request();
    curReq.input('cmoneda', T.Char(4), cmoneda);
    const curResult = await curReq.query(`
      SELECT ptasamon FROM mamonedas WHERE cmoneda = @cmoneda
    `);
    if (!curResult.recordset.length) {
      throw new BadRequestException(`Moneda no encontrada: ${cmoneda}`);
    }
    const ptasamon = Number(curResult.recordset[0]['ptasamon'] ?? 0);
    const mpagoext = body.mpago / ptasamon;

    const cusuario = body.cusuario ?? client.cci_rif ?? 4;

    return {
      asegurados: [],
      cmoneda_pago: 'Bs',
      cprog: client.cprog ?? 'buildExtPayload',
      ctenedor,
      cusuario,
      fcobro: body.fpago,
      freporte: body.fpago,
      imov: 'CO',
      mpago: body.mpago,
      mpagoext,
      numRecibos: 1,
      recibos: [body.cnrecibo],
      referencia: xreferencia,
      soporte: [
        {
          cbanco: banks.cbanco,
          cbanco_destino: banks.cbanco_destino,
          cmoneda: 'Bs',
          ctipopago: banks.ctipopago,
          mpago: body.mpago,
          mpagoext,
          mpagoigtf: 0,
          mpagoigtfext: 0,
          mtotal: body.mpago,
          mtotalext: mpagoext,
          ptasamon,
          ptasaref: 0,
          xreferencia,
          xruta: 'Sin soporte',
        },
      ],
    };
  }

  private formatRecibosList(recibos: string[]): string {
    return `'${recibos.join("','")}'`;
  }

  /** Inserta filas de soporte en cbreporte_pago. */
  private async insertSoporteRows(
    ctransaccion: number,
    soporte: SoporteRow[],
    cusuario: number,
    cprog: string,
  ): Promise<void> {
    const T = this.db.types;
    const now = new Date();

    for (let i = 0; i < soporte.length; i++) {
      const s = soporte[i];
      const req = this.db.request();
      req.input('ctransaccion', T.Numeric(18, 0), ctransaccion);
      req.input('npago', T.Numeric(18, 0), i + 1);
      req.input('casegurado', T.Numeric(18, 0), null);
      req.input('cmoneda', T.Char(4), s.cmoneda);
      req.input('cbanco', T.Numeric(18, 2), s.cbanco ?? null);
      req.input('cbanco_destino', T.Numeric(18, 2), s.cbanco_destino ?? null);
      req.input('mpago', T.Numeric(18, 2), s.mpago);
      req.input('mpagoext', T.Numeric(18, 2), s.mpagoext);
      req.input('mpagoigtf', T.Numeric(18, 2), s.mpagoigtf ?? 0);
      req.input('mpagoigtfext', T.Numeric(18, 2), s.mpagoigtfext ?? 0);
      req.input('mtotal', T.Numeric(18, 2), s.mtotal);
      req.input('mtotalext', T.Numeric(18, 2), s.mtotalext);
      req.input('ptasamon', T.Numeric(13, 6), s.ptasamon);
      req.input('ptasaref', T.Numeric(18, 2), s.ptasaref ?? 0);
      req.input('xreferencia', T.VarChar(100), s.xreferencia);
      req.input('xruta', T.VarChar(100), s.xruta ?? 'Sin soporte');
      req.input('cusuario', T.Numeric(18, 0), cusuario);
      req.input('fingreso', T.DateTime, now);

      // Sis2000 QA: cbreporte_pago sin columna ctipopago (legacy Express insert)
      await req.query(`
        INSERT INTO cbreporte_pago (
          ctransaccion, npago, casegurado, cmoneda, cbanco, cbanco_destino,
          mpago, mpagoext, mpagoigtf, mpagoigtfext, mtotal, mtotalext,
          ptasamon, ptasaref, xreferencia, xruta, cusuario, fingreso
        ) VALUES (
          @ctransaccion, @npago, @casegurado, @cmoneda, @cbanco, @cbanco_destino,
          @mpago, @mpagoext, @mpagoigtf, @mpagoigtfext, @mtotal, @mtotalext,
          @ptasamon, @ptasaref, @xreferencia, @xruta, @cusuario, @fingreso
        )
      `);
    }
  }

  /** Notifica el pago (spNotificaPago QA: incluye @soporte, sin @cmoneda_pago). */
  async notifyPayment(payload: CollectionPayload) {
    const T = this.db.types;
    const req = this.db.request();
    req.input('freporte', T.Date, payload.fcobro);
    req.input('ctenedor', T.Numeric(19, 4), payload.ctenedor);
    req.input('numRecibos', T.Numeric(19, 4), payload.numRecibos);
    req.input('mpago', T.Decimal(19, 4), payload.mpago);
    req.input('mpagoext', T.Decimal(19, 4), payload.mpagoext);
    req.input('cprog', T.NVarChar(19), payload.cprog);
    req.input('recibos', T.NVarChar, this.formatRecibosList(payload.recibos));
    req.input('cusuario', T.Numeric(11), payload.cusuario);
    req.input('soporte', T.NVarChar(4000), this.buildSoporteJson(payload));
    req.output('status', T.Bit);
    req.output('mensaje', T.NVarChar(100));
    req.output('ptasamon', T.Numeric(13, 6));
    req.output('transaccion', T.Numeric(19, 4));

    try {
      const result = await req.execute('spNotificaPago');
      const status = result.output['status'];
      if (!status) {
        const mensaje = String(result.output['mensaje'] ?? 'spNotificaPago falló');
        throw new BadRequestException(mensaje);
      }

      const transaccion = Number(result.output['transaccion']);

      const saldoReq = this.db.request();
      saldoReq.input('cusuario', T.Numeric(10), payload.cusuario);
      saldoReq.input('transaccion', T.Numeric(7), transaccion);
      saldoReq.input('ctenedor', T.Numeric(13), payload.ctenedor);
      await saldoReq.execute('spCnSaldo_Ad');

      return {
        transaccion,
        mensaje: result.output['mensaje'],
        ptasamon: result.output['ptasamon'],
      };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const msg = parseSPError(err);
      this.logger.error(`notifyPayment: ${msg}`);
      throw new InternalServerErrorException(msg);
    }
  }

  /** Cobro directo (spCobroSis_Ad) — fallback si notific no aplica en QA. */
  async notifyPaymentLegacy(payload: CollectionPayload) {
    const T = this.db.types;
    const req = this.db.request();
    req.input('freporte', T.Date, payload.fcobro);
    req.input('cmoneda_pago', T.NVarChar, payload.cmoneda_pago);
    req.input('ctenedor', T.Numeric(19, 4), payload.ctenedor);
    req.input('numRecibos', T.Numeric(19, 4), payload.numRecibos);
    req.input('mpago', T.Decimal(19, 4), payload.mpago);
    req.input('mpagoext', T.Decimal(19, 4), payload.mpagoext);
    req.input('cprog', T.NVarChar(19), payload.cprog);
    req.input('recibos', T.NVarChar, this.formatRecibosList(payload.recibos));
    req.input('cusuario', T.Numeric(11), payload.cusuario);
    req.output('status', T.Bit);
    req.output('mensaje', T.NVarChar(100));
    req.output('ptasamon', T.Numeric(13, 6));
    req.output('transaccion', T.Numeric(19, 4));

    const result = await req.execute('spNotificaPago');
    if (!result.output['status']) {
      throw new BadRequestException(String(result.output['mensaje'] ?? 'spNotificaPago falló'));
    }
    const transaccion = Number(result.output['transaccion']);
    await this.insertSoporteRows(transaccion, payload.soporte, payload.cusuario, payload.cprog);
    const saldoReq = this.db.request();
    saldoReq.input('cusuario', T.Numeric(10), payload.cusuario);
    saldoReq.input('transaccion', T.Numeric(7), transaccion);
    saldoReq.input('ctenedor', T.Numeric(13), payload.ctenedor);
    await saldoReq.execute('spCnSaldo_Ad');
    return {
      transaccion,
      mensaje: result.output['mensaje'],
      ptasamon: result.output['ptasamon'],
    };
  }

  /** Ejecuta spCobroSis_Ad (QA puede incluir cmoneda_pago/referencia). */
  private async executeCobroSis(
    payload: CollectionPayload,
    extended: boolean,
  ): Promise<{ output: Record<string, unknown>; recordset?: unknown[] }> {
    const T = this.db.types;
    const req = this.db.request();
    req.input('freporte', T.Date, payload.fcobro);
    if (extended) {
      req.input('cmoneda_pago', T.NVarChar, payload.cmoneda_pago);
      req.input('referencia', T.NVarChar(100), payload.referencia);
    }
    req.input('ctenedor', T.Numeric(19, 4), payload.ctenedor);
    req.input('numRecibos', T.Numeric(19, 4), payload.numRecibos);
    req.input('mpago', T.Decimal(19, 4), payload.mpago);
    req.input('mpagoext', T.Decimal(19, 4), payload.mpagoext);
    req.input('cprog', T.NVarChar(20), payload.cprog);
    req.input('recibos', T.NVarChar, this.formatRecibosList(payload.recibos));
    req.input('cusuario', T.Numeric(11), payload.cusuario);
    req.output('status', T.Bit);
    req.output('ptasamon', T.Numeric(13, 6));
    req.output('mensaje', T.NVarChar(100));
    req.output('transaccion', T.Numeric(19, 4));
    req.output('cnpoliza', T.NVarChar(30));
    req.output('fanopol', T.Int);
    req.output('fmespol', T.Int);
    return req.execute('spCobroSis_Ad');
  }

  /** Registra el cobro (spCobroSis_Ad + soporte). */
  async collectPayment(payload: CollectionPayload) {
    try {
      let result: { output: Record<string, unknown>; recordset?: unknown[] };
      try {
        result = await this.executeCobroSis(payload, true);
      } catch (err) {
        const msg = parseSPError(err).toLowerCase();
        if (msg.includes('too many arguments') || msg.includes('demasiados argumentos')) {
          this.logger.warn('collectPayment: reintento spCobroSis_Ad sin cmoneda_pago/referencia');
          result = await this.executeCobroSis(payload, false);
        } else {
          throw err;
        }
      }

      const status = result.output['status'];
      if (!status) {
        const mensaje = String(result.output['mensaje'] ?? 'spCobroSis_Ad falló');
        throw new BadRequestException(mensaje);
      }

      const transaccion = Number(result.output['transaccion']);
      try {
        await this.insertSoporteRows(
          transaccion,
          payload.soporte,
          payload.cusuario,
          payload.cprog,
        );
      } catch (soporteErr) {
        this.logger.warn(`insertSoporteRows: ${parseSPError(soporteErr)}`);
      }

      return {
        transaccion,
        cnpoliza: result.output['cnpoliza'],
        fanopol: result.output['fanopol'],
        fmespol: result.output['fmespol'],
        mensaje: result.output['mensaje'],
      };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const msg = parseSPError(err);
      this.logger.error(`collectPayment: ${msg}`);
      throw new InternalServerErrorException(msg);
    }
  }

  /** Flujo completo: notificar + cobrar (activa recibo pendiente tras pago). */
  async activateReceipt(apikey: string, body: CollectionPaymentDto) {
    const payload = await this.buildCollectionPayload(apikey ?? '', body);
    this.logger.log(
      `activateReceipt cnrecibo=${body.cnrecibo} mpago=${body.mpago} ref=${body.xreferencia}`,
    );

    let notif: Awaited<ReturnType<CollectionService['notifyPayment']>> | null = null;
    try {
      notif = await this.notifyPayment(payload);
    } catch (err) {
      const msg = parseSPError(err).toLowerCase();
      try {
        if (
          msg.includes('too many arguments') ||
          msg.includes('demasiados argumentos') ||
          msg.includes('@soporte')
        ) {
          this.logger.warn(`notifyPayment QA: ${parseSPError(err)}; reintento legacy`);
          notif = await this.notifyPaymentLegacy(payload);
        } else {
          this.logger.warn(`notifyPayment omitido (${parseSPError(err)}); cobro directo`);
        }
      } catch (legacyErr) {
        this.logger.warn(`notifyPayment legacy omitido: ${parseSPError(legacyErr)}`);
      }
    }

    const collect = await this.collectPayment(payload);
    return {
      message: 'Recibo notificado y cobrado exitosamente.',
      notificacion: notif,
      cobro: collect,
    };
  }
}
