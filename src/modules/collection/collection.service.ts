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

interface ReceiptAmounts {
  ctenedor: number;
  cmoneda: string;
  mprimabrutaext: number;
  mmontorecext: number;
  mmontorec: number;
  ptasamon: number;
}

interface PagoMovilOperacion {
  banco_origen: string | null;
  banco_destino: string | null;
  fecha_movimiento: Date | null;
}

interface MabancoDestinoPair {
  cbanco_destino: number;
  ctipopago: number;
}

interface CollectionPayload {
  asegurados: unknown[];
  cmoneda_pago: string;
  cprog: string;
  ctenedor: number;
  cusuario: number;
  fcobro: string;
  freporte: string;
  fingresoOperacion?: Date;
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

  /** Variantes de cbanco_ref (0105, 105) para lookup en mabanco. */
  private bankRefVariants(bankRef: string): string[] {
    const ref = String(bankRef).trim();
    if (!ref) return [];
    const variants = new Set<string>([ref]);
    if (/^\d+$/.test(ref)) {
      variants.add(ref.padStart(4, '0'));
      const stripped = ref.replace(/^0+/, '');
      if (stripped) variants.add(stripped);
    }
    return [...variants];
  }

  /** Resuelve cbanco numérico desde cbanco_ref (ej. 0105 → mabanco.cbanco). */
  private async resolveCbancoFromRef(bankRef: string): Promise<number | null> {
    const variants = this.bankRefVariants(bankRef);
    if (!variants.length) return null;

    const T = this.db.types;
    for (const ref of variants) {
      const req = this.db.request();
      req.input('ref', T.VarChar(10), ref);
      const result = await req.query(`
        SELECT TOP 1 cbanco FROM mabanco
        WHERE LTRIM(RTRIM(cbanco_ref)) = @ref OR CAST(cbanco AS VARCHAR(20)) = @ref
      `);
      const cbanco = result.recordset?.[0]?.['cbanco'];
      if (cbanco != null) return Number(cbanco);
    }
    return null;
  }

  /** Montos del recibo: prima bruta ext para TOTAL EXT (igual que createPaymentPasarela). */
  private async getReceiptAmounts(cnrecibo: string): Promise<ReceiptAmounts> {
    const T = this.db.types;
    const req = this.db.request();
    req.input('cnrecibo', T.VarChar(30), cnrecibo);
    const result = await req.query(`
      SELECT ctenedor, TRIM(cmoneda) AS cmoneda,
             mprimabrutaext, mmontorecext, mmontorec, ptasamon
      FROM adrecibos WHERE cnrecibo = @cnrecibo
    `);
    if (!result.recordset.length) {
      throw new BadRequestException(`Recibo no encontrado: ${cnrecibo}`);
    }
    const row = result.recordset[0] as Record<string, unknown>;
    return {
      ctenedor: Number(row['ctenedor']),
      cmoneda: String(row['cmoneda'] ?? 'Bs'),
      mprimabrutaext: Number(row['mprimabrutaext'] ?? 0),
      mmontorecext: Number(row['mmontorecext'] ?? 0),
      mmontorec: Number(row['mmontorec'] ?? 0),
      ptasamon: Number(row['ptasamon'] ?? 0),
    };
  }

  /** Datos de operación desde pago_movil (banco origen + fecha operación). */
  private async getPagoMovilOperacion(
    xreferencia: string,
  ): Promise<PagoMovilOperacion | null> {
    const T = this.db.types;
    const req = this.db.request();
    req.input('xreferencia', T.VarChar(30), xreferencia);
    const result = await req.query(`
      SELECT TOP 1 banco_origen, banco_destino, fecha_movimiento
      FROM pago_movil
      WHERE referencia_banco LIKE '%' + @xreferencia + '%'
      ORDER BY fcreacion DESC
    `);
    if (!result.recordset.length) return null;
    const row = result.recordset[0] as Record<string, unknown>;
    const fecha = row['fecha_movimiento'];
    return {
      banco_origen: row['banco_origen'] != null ? String(row['banco_origen']).trim() : null,
      banco_destino: row['banco_destino'] != null ? String(row['banco_destino']).trim() : null,
      fecha_movimiento: fecha instanceof Date ? fecha : fecha ? new Date(String(fecha)) : null,
    };
  }

  /**
   * Igual que SysIP buildcollectReceiptPayload: cbanco_destino del canal (35/31)
   * y ctipopago de maclient_api — sin reemplazar por lookup en MABANCO_DESTINO.
   */
  private resolveDestinoSoporte(
    channelHint: number | null,
    client: ApiClientRow,
    body: CollectionPaymentDto,
  ): MabancoDestinoPair {
    const cbanco_destino =
      channelHint ??
      (body.cbanco_destino != null ? Number(body.cbanco_destino) : null) ??
      (client.cbanco_destino != null ? Number(client.cbanco_destino) : null) ??
      35;

    const ctipopago = parseInt(process.env.LAMUNDIAL_CTIPOPAGO ?? '3', 10);

    return { cbanco_destino, ctipopago };
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
    const channelHint =
      destResult.recordset?.[0]?.['cbanco_destino'] != null
        ? Number(destResult.recordset[0]['cbanco_destino'])
        : null;

    const pmOperacion = await this.getPagoMovilOperacion(xreferencia);
    const bancoOrigenRef =
      body.cbanco_ref?.trim() || pmOperacion?.banco_origen || null;

    let cbanco = body.cbanco != null ? Number(body.cbanco) : null;
    if (!cbanco && bancoOrigenRef) {
      cbanco = await this.resolveCbancoFromRef(bancoOrigenRef);
    }

    const destinoPair = this.resolveDestinoSoporte(channelHint, client, body);

    return {
      cbanco,
      cbanco_destino: destinoPair.cbanco_destino,
      ctipopago: destinoPair.ctipopago,
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
    // maclient_api en QA no tiene ctipopago; SysIP usa SELECT * y LAMUNDIAL default.
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
    const receipt = await this.getReceiptAmounts(body.cnrecibo);
    const pmOperacion = await this.getPagoMovilOperacion(xreferencia);

    let ptasamon = receipt.ptasamon;
    if (!ptasamon) {
      const curReq = this.db.request();
      curReq.input('cmoneda', T.Char(4), receipt.cmoneda);
      const curResult = await curReq.query(`
        SELECT ptasamon FROM mamonedas WHERE cmoneda = @cmoneda
      `);
      if (!curResult.recordset.length) {
        throw new BadRequestException(`Moneda no encontrada: ${receipt.cmoneda}`);
      }
      ptasamon = Number(curResult.recordset[0]['ptasamon'] ?? 0);
    }

    // TOTAL EXT = suma prima bruta ext del recibo (createPaymentPasarela usa mmontorecext)
    const mpagoext = parseFloat(
      Number(receipt.mprimabrutaext || receipt.mmontorecext || 0).toFixed(2),
    );

    let cbanco = banks.cbanco;
    if (!cbanco) {
      const bancoRef = body.cbanco_ref?.trim() || pmOperacion?.banco_origen;
      if (bancoRef) cbanco = await this.resolveCbancoFromRef(bancoRef);
    }

    const fingresoOperacion =
      pmOperacion?.fecha_movimiento ?? new Date(`${body.fpago}T12:00:00`);

    const cusuario = body.cusuario ?? client.cci_rif ?? 4;

    this.logger.log(
      `buildPayload cnrecibo=${body.cnrecibo} cbanco=${cbanco} cbanco_destino=${banks.cbanco_destino} ` +
        `ctipopago=${banks.ctipopago} freporte=${fingresoOperacion.toISOString()}`,
    );

    return {
      asegurados: [],
      cmoneda_pago: 'Bs',
      cprog: client.cprog ?? 'buildExtPayload',
      ctenedor: receipt.ctenedor,
      cusuario,
      fcobro: body.fpago,
      freporte: body.fpago,
      fingresoOperacion,
      imov: 'CO',
      mpago: body.mpago,
      mpagoext,
      numRecibos: 1,
      recibos: [body.cnrecibo],
      referencia: xreferencia,
      soporte: [
        {
          cbanco,
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

  /**
   * UPSERT en cbreporte_pago via spUpsertCbreportePago_Ad.
   * El SP maneja internamente la compatibilidad QA/PROD (COL_LENGTH para ctipopago/freporte).
   */
  private async upsertSoporteRows(
    ctransaccion: number,
    soporte: SoporteRow[],
    cusuario: number,
    cprog: string,
    casegurado: number,
    fingresoOperacion?: Date,
  ): Promise<void> {
    const T = this.db.types;
    const operacion = fingresoOperacion ?? new Date();

    for (let i = 0; i < soporte.length; i++) {
      const s = soporte[i];
      const npago = i + 1;

      const req = this.db.request();
      req.input('ctransaccion',   T.Numeric(18, 0), ctransaccion);
      req.input('npago',          T.Numeric(18, 0), npago);
      req.input('casegurado',     T.Numeric(18, 0), casegurado);
      req.input('cmoneda',        T.Char(4),        s.cmoneda);
      req.input('cbanco',         T.Numeric(18, 2), s.cbanco         ?? null);
      req.input('cbanco_destino', T.Numeric(18, 2), s.cbanco_destino ?? null);
      req.input('ctipopago',      T.Numeric(10, 0), s.ctipopago      ?? null);
      req.input('mpago',          T.Numeric(18, 2), s.mpago);
      req.input('mpagoext',       T.Numeric(18, 2), s.mpagoext);
      req.input('mpagoigtf',      T.Numeric(18, 2), s.mpagoigtf      ?? 0);
      req.input('mpagoigtfext',   T.Numeric(18, 2), s.mpagoigtfext   ?? 0);
      req.input('mtotal',         T.Numeric(18, 2), s.mtotal);
      req.input('mtotalext',      T.Numeric(18, 2), s.mtotalext);
      req.input('ptasamon',       T.Numeric(13, 6), s.ptasamon);
      req.input('ptasaref',       T.Numeric(18, 2), s.ptasaref       ?? 0);
      req.input('xreferencia',    T.VarChar(30),    s.xreferencia);
      req.input('xruta',          T.VarChar(100),   s.xruta          ?? 'Sin soporte');
      req.input('cusuario',       T.Numeric(18, 0), cusuario);
      req.input('fingreso',       T.DateTime,       operacion);
      req.input('freporte',       T.DateTime,       operacion);
      req.input('cprog',          T.Char(20),       cprog);
      req.output('accion',        T.Char(1));
      req.output('mensaje',       T.VarChar(500));

      const result = await req.execute('spUpsertCbreportePago_Ad');
      const accion  = String(result.output['accion']  ?? '').trim();
      const mensaje = String(result.output['mensaje'] ?? '').trim();

      if (accion === 'E') {
        throw new BadRequestException(
          `spUpsertCbreportePago_Ad fila ${npago}: ${mensaje}`,
        );
      }

      this.logger.log(
        `upsertSoporte [${accion}] ctransaccion=${ctransaccion} npago=${npago} ` +
          `cbanco_destino=${s.cbanco_destino} ctipopago=${s.ctipopago} ` +
          `freporte=${operacion.toISOString()}`,
      );
    }
  }

  /** Verifica que cbreporte_pago tenga banco destino y fecha de operación tras el cobro. */
  private async verifySoporteGuardado(ctransaccion: number): Promise<void> {
    const T = this.db.types;
    const req = this.db.request();
    req.input('ctransaccion', T.Numeric(18, 0), ctransaccion);

    const result = await req.query(`
      SELECT TOP 1 cbanco_destino, ctipopago, freporte, fingreso, xreferencia
      FROM cbreporte_pago WHERE ctransaccion = @ctransaccion
    `);
    if (!result.recordset.length) {
      throw new BadRequestException(
        `Ingreso ${ctransaccion}: no se creó fila en cbreporte_pago (soporte de pago).`,
      );
    }
    const row = result.recordset[0] as Record<string, unknown>;
    const fechaOk = (row['freporte'] ?? row['fingreso']) != null;

    if (row['cbanco_destino'] == null || !fechaOk) {
      this.logger.error(
        `verifySoporte INCOMPLETO ctransaccion=${ctransaccion} ` +
          `cbanco_destino=${row['cbanco_destino']} ctipopago=${row['ctipopago'] ?? 'n/a'} ` +
          `freporte=${row['freporte'] ?? 'n/a'} fingreso=${row['fingreso']}`,
      );
      throw new BadRequestException(
        `Ingreso ${ctransaccion}: faltan banco destino o fecha operación en cbreporte_pago.`,
      );
    }

    this.logger.log(
      `verifySoporte OK ctransaccion=${ctransaccion} destino=${row['cbanco_destino']} ` +
        `tipo=${row['ctipopago'] ?? 'n/a'} fecha=${row['freporte'] ?? row['fingreso']}`,
    );
  }
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
    await this.upsertSoporteRows(
      transaccion,
      payload.soporte,
      payload.cusuario,
      payload.cprog,
      payload.ctenedor,
      payload.fingresoOperacion,
    );
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
      await this.upsertSoporteRows(
        transaccion,
        payload.soporte,
        payload.cusuario,
        payload.cprog,
        payload.ctenedor,
        payload.fingresoOperacion,
      );
      await this.verifySoporteGuardado(transaccion);
      if (payload.fingresoOperacion) {
        const T = this.db.types;
        const upd = this.db.request();
        upd.input('ctransaccion', T.Numeric(19, 4), transaccion);
        upd.input('fingreso', T.DateTime, payload.fingresoOperacion);
        upd.input('mpagoext', T.Decimal(19, 4), payload.mpagoext);
        await upd.query(`
          UPDATE cbreporte_tran
          SET fingreso = @fingreso, mpagoext = @mpagoext
          WHERE ctransaccion = @ctransaccion
        `);
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

  /**
   * Flujo igual que SysIP collectReceip (externalChannels):
   * spCobroSis_Ad + INSERT cbreporte_pago (Soport.insert). Sin spNotificaPago previo.
   */
  async activateReceipt(apikey: string, body: CollectionPaymentDto) {
    const payload = await this.buildCollectionPayload(apikey ?? '', body);
    const sop = payload.soporte[0];
    this.logger.log(
      `activateReceipt cnrecibo=${body.cnrecibo} mpago=${body.mpago} ref=${body.xreferencia} ` +
        `cbanco_destino=${sop?.cbanco_destino} ctipopago=${sop?.ctipopago} cbanco=${sop?.cbanco}`,
    );

    const collect = await this.collectPayment(payload);
    return {
      message: 'Recibo cobrado exitosamente.',
      cobro: collect,
    };
  }
}
