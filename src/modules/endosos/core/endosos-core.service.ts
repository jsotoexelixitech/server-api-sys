import { Injectable, Logger } from '@nestjs/common';
import * as T from 'mssql';
import { MssqlService } from '../../../database/mssql.service';

/**
 * Rutas del Core que consume el backend del Motor de Endosos, centralizadas en server-api-sys.
 *
 * Portadas de SysIP-backend (rama fb_endosos) manteniendo el MISMO contrato de respuesta
 * (el backend de Endosos las lee tal cual), pero con consultas parametrizadas: el legado
 * concatenaba strings en el SQL.
 *
 * Mapa legado → ruta Nest (`/api/endosos/core/...`):
 *   POST /api/v1/client/search/policies-info   → policies-info
 *   POST /api/v1/poliza/searchPoliza           → poliza
 *   POST /api/v1/poliza/searchPolizaOnly       → poliza-only
 *   POST /api/v1/poliza/search-polizaRecibos   → poliza-recibos
 *   POST /api/v1/poliza/plan-coberturas        → plan-coberturas
 *   POST /api/v1/emissions/calculatePlanSis    → calcular-plan-sis
 *   POST /api/v1/emissions/planesSolicitud     → planes-solicitud
 *   POST /api/v1/changes/anularRecibos         → anular-recibos
 * El reporte de pago usa la ruta Nest ya existente POST /api/v1/external/collection/collect.
 */

export type CoreResult<TData = any> =
  | { ok: true; httpStatus: number; body: TData }
  | { ok: false; httpStatus: number; body: { status: false; message: string; code?: number } };

const ok = <TData>(body: TData, httpStatus = 200): CoreResult<TData> => ({ ok: true, httpStatus, body });
const fail = (message: string, httpStatus = 500): CoreResult => ({
  ok: false,
  httpStatus,
  body: { status: false, message, ...(httpStatus === 500 ? { code: 500 } : {}) },
});

/** Columnas de adpoliza que searchPolizaOnly acepta como filtro de igualdad (evita inyección por nombre de columna). */
const POLIZA_ONLY_FILTERS = new Set([
  'cnpoliza',
  'cpoliza',
  'cramo',
  'fanopol',
  'fmespol',
  'cplan',
  'cproductor',
  'ctenedor',
  'casegurado',
  'cbeneficiario',
  'istatpol',
  'iestado',
  'cgestor',
  'csucur',
]);

const RECEIPT_STATUS_SQL = `
  CASE
    WHEN iestadorec = 'C' THEN 'Cobrado'
    WHEN iestadorec = 'P' THEN 'Pendiente'
    WHEN iestadorec = 'A' THEN 'Anulado'
    WHEN iestadorec = 'S' THEN 'Suspendido'
    WHEN iestadorec = 'N' THEN 'Notificado'
    ELSE TRIM(iestadorec)
  END`;

/** Campos que spCalculoAuto necesita para poder calcular (el resto tiene valor por defecto). */
const CALCULO_REQUIRED = [
  'cmarca',
  'cmodelo',
  'cversion',
  'cano',
  'idPlan',
  'suma',
  'fdesde',
  'fhasta',
  'tipo',
  'uso',
  'puestos',
] as const;

const missingCalculoFields = (body: Record<string, any>): string[] =>
  CALCULO_REQUIRED.filter((k) => body?.[k] === undefined || body?.[k] === null || String(body[k]).trim() === '');

const toInt = (v: unknown): number | null => {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
};

@Injectable()
export class EndososCoreService {
  private readonly logger = new Logger(EndososCoreService.name);

  constructor(private readonly db: MssqlService) {}

  // ─── policies-info (searchPolicies) ────────────────────────────────────────

  async policiesInfo(query: Record<string, any>): Promise<CoreResult> {
    try {
      const page = query.page ? parseInt(query.page, 10) : null;
      const limitRaw = query.steps || query.limit;
      const limit = limitRaw ? parseInt(limitRaw, 10) : null;
      const includeReceipts = query.includeReceipts === true || query.includeReceipts === 'true';
      const includeCoverages = query.includeCoverages === true || query.includeCoverages === 'true';

      if (page !== null && page < 1) return fail('El parámetro page debe ser mayor a 0.', 400);
      if (limit !== null && limit < 1) return fail('El parámetro limit/steps debe ser mayor a 0.', 400);
      const offset = page !== null && limit !== null ? (page - 1) * limit : null;

      const where: string[] = [];
      const params: Array<[string, any, unknown]> = [];
      const has = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== '';

      if (has(query.ccorredor)) {
        where.push('A.cproductor = @ccorredor');
        params.push(['ccorredor', T.Int, parseInt(query.ccorredor, 10)]);
      }
      if (has(query.cramo)) {
        where.push('A.cramo = @cramo');
        params.push(['cramo', T.Int, parseInt(query.cramo, 10)]);
      }
      if (has(query.cplan)) {
        where.push('TRIM(A.cplan) = @cplan');
        params.push(['cplan', T.VarChar(10), String(query.cplan).trim()]);
      }
      if (has(query.casegurado)) {
        where.push('A.casegurado = @casegurado');
        params.push(['casegurado', T.Numeric(11, 0), parseFloat(query.casegurado)]);
      }
      if (has(query.cnpoliza)) {
        where.push("TRIM(A.cnpoliza) LIKE '%' + @cnpoliza + '%'");
        params.push(['cnpoliza', T.VarChar(30), String(query.cnpoliza).trim()]);
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const bind = (req: T.Request) => {
        params.forEach(([name, type, value]) => req.input(name, type, value));
        return req;
      };

      const counts = await bind(this.db.request()).query(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN has_tel = 1 OR has_corr = 1 THEN 1 ELSE 0 END) AS con_contacto,
          SUM(CASE WHEN has_tel = 0 AND has_corr = 0 THEN 1 ELSE 0 END) AS sin_contacto
        FROM (
          SELECT
            A.cpoliza,
            CASE WHEN tel.cci_rif IS NOT NULL THEN 1 ELSE 0 END AS has_tel,
            CASE WHEN corr.cci_rif IS NOT NULL THEN 1 ELSE 0 END AS has_corr
          FROM adpoliza A
          LEFT JOIN (SELECT DISTINCT cci_rif FROM maclient_tel) tel ON A.casegurado = tel.cci_rif
          LEFT JOIN (SELECT DISTINCT cci_rif FROM maclient_correo) corr ON A.casegurado = corr.cci_rif
          ${whereSql}
        ) sub`);
      const stats = counts.recordset[0] || {};
      const campanaInfo = {
        totalPolizas: stats.total || 0,
        conContacto: stats.con_contacto || 0,
        sinContacto: stats.sin_contacto || 0,
      };

      const policiesReq = bind(this.db.request());
      let paginationSql = '';
      if (offset !== null && limit !== null) {
        policiesReq.input('offset', T.Int, offset);
        policiesReq.input('limit', T.Int, limit);
        paginationSql = 'OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY';
      }

      const policiesRes = await policiesReq.query(`
        SELECT
          A.cpoliza,
          TRIM(A.cnpoliza) AS cnpoliza,
          A.cramo,
          TRIM(A.cplan) AS cplan,
          A.casegurado,
          A.ctenedor,
          A.fanopol,
          A.fmespol,
          TRIM(A.cprog) AS cprog,
          CONVERT(VARCHAR(10), A.fdesde, 105) AS Fecha_desde_Pol,
          CONVERT(VARCHAR(10), A.fhasta, 105) AS Fecha_hasta_Pol,
          CASE WHEN A.istatpol = 'V' THEN 'Vigente' WHEN A.istatpol = 'A' THEN 'Anulado' ELSE TRIM(A.istatpol) END AS Estatus_Poliza,
          TRIM(R.xdescripcion_l) AS Descripcion_Ramo,
          TRIM(M.xdescripcion_l) AS Moneda,
          TRIM(S.xdescripcion_l) AS Sucursal,
          TRIM(P.xproductor) AS Intermediario_Nombre,
          A.cproductor AS Intermediario_Codigo,
          COALESCE(PL1.xplan, PL2.xplan, 'N/A') AS Descripcion_Plan,
          TRIM(tom.cid) AS tom_cid,
          TRIM(tom.xnombre) AS tom_xnombre,
          TRIM(tom.xapellido) AS tom_xapellido,
          TRIM(cli.xnombre) AS cli_xnombre,
          TRIM(cli.xapellido) AS cli_xapellido,
          TRIM(cli.isexo) AS cli_isexo,
          TRIM(cli.iestado_civil) AS cli_iestado_civil,
          CONVERT(VARCHAR(10), cli.fnacimiento, 105) AS cli_fnacimiento,
          (SELECT TRIM(xtelefono) AS xTelefono FROM maclient_tel T WHERE T.cci_rif = A.casegurado FOR JSON PATH) AS telefonos_json,
          (SELECT TRIM(xcorreo) AS xCorreo FROM maclient_correo C WHERE C.cci_rif = A.casegurado FOR JSON PATH) AS correos_json,
          (SELECT cestado AS cEstado, cciudad AS cCiudad, RTRIM(xavecalle) AS xAveCalle FROM maclient_dir D WHERE D.cci_rif = A.casegurado FOR JSON PATH) AS direcciones_json
        FROM adpoliza A
        INNER JOIN (
          SELECT cci_rif FROM (
            SELECT cci_rif FROM maclient_tel
            UNION
            SELECT cci_rif FROM maclient_correo
          ) U
        ) contact ON A.casegurado = contact.cci_rif
        LEFT JOIN maramos R ON A.cramo = R.cramo
        LEFT JOIN mamonedas M ON A.cmoneda = M.cmoneda
        LEFT JOIN masucur S ON A.csucur = S.csucur
        LEFT JOIN maproduc P ON A.cproductor = P.cproductor
        LEFT JOIN maplanes PL1 ON A.cramo = PL1.cramo AND A.cplan = PL1.cplan
        LEFT JOIN maplanes_per PL2 ON A.cramo = PL2.cramo AND A.cplan = PL2.cplan
        LEFT JOIN maclient cli ON A.casegurado = cli.cci_rif
        LEFT JOIN maclient tom ON A.ctenedor = tom.cci_rif
        ${whereSql}
        ORDER BY A.fingreso DESC, A.cnpoliza DESC
        ${paginationSql}`);

      const policies = policiesRes.recordset as any[];
      const pagination = {
        total: campanaInfo.conContacto,
        page: page || 1,
        limit: limit || campanaInfo.conContacto,
        pages: limit ? Math.ceil(campanaInfo.conContacto / limit) : 1,
      };
      if (policies.length === 0) {
        return ok({ status: true, result: { polizas: [], campanaInfo, pagination } });
      }

      const receiptMap: Record<string, any[]> = {};
      const coberturasMap: Record<string, any[]> = {};

      if (includeReceipts || includeCoverages) {
        // Con límite: lista de pólizas de la página; sin límite: mismo filtro como subconsulta.
        const scoped = (req: T.Request) => {
          if (limit !== null) {
            req.input(
              'policies',
              T.NVarChar(T.MAX),
              JSON.stringify(policies.map((p) => p.cnpoliza).filter(Boolean)),
            );
            return 'cnpoliza IN (SELECT value FROM OPENJSON(@policies))';
          }
          bind(req);
          return `cnpoliza IN (SELECT cnpoliza FROM adpoliza A ${whereSql})`;
        };

        if (includeReceipts) {
          const req = this.db.request();
          const cond = scoped(req);
          const res = await req.query(`
            SELECT
              crecibo, cpoliza, TRIM(cnrecibo) AS cnrecibo, fanopol, fmespol, TRIM(cprog) AS cprog,
              qcuotas AS Cuotas,
              CONVERT(VARCHAR(10), fdesde, 105) AS Fdesde_Rec,
              CONVERT(VARCHAR(10), fhasta, 105) AS Fhasta_Rec,
              mmontorec AS Monto_Rec, mmontorecext AS Monto_Rec_Ext,
              TRIM(cnpoliza) AS cnpoliza,
              CONVERT(VARCHAR(10), fcobro, 105) AS Fecha_Cobro,
              ${RECEIPT_STATUS_SQL} AS Status_Rec,
              cdoccob AS ctransaccion
            FROM adrecibos
            WHERE ${cond}`);
          for (const row of res.recordset) {
            (receiptMap[row.cnpoliza] ||= []).push({
              cnRecibo: row.cnrecibo,
              fanopol: row.fanopol,
              fmespol: row.fmespol,
              cProg: row.cprog,
              cuotas: row.Cuotas,
              fdesdeRec: row.Fdesde_Rec,
              fhastaRec: row.Fhasta_Rec,
              montoRec: row.Monto_Rec,
              montoRecExt: row.Monto_Rec_Ext,
              fechaCobro: row.Fecha_Cobro,
              statusRec: row.Status_Rec,
              cRecibo: row.crecibo,
              cTransaccion: row.ctransaccion,
            });
          }
        }

        if (includeCoverages) {
          const req = this.db.request();
          const cond = scoped(req).replace('cnpoliza IN', 'a.cnpoliza IN');
          const res = await req.query(`
            SELECT
              TRIM(a.cnpoliza) AS cnpoliza,
              a.ccober AS ccobertura,
              TRIM(b.xdescripcion_l) AS xcobertura,
              a.ptasamon AS ptasa,
              COALESCE(a.msumaasegext, a.msumaaseg) AS msumaasegurada,
              COALESCE(a.mprimabrutaext, a.mprimabruta) AS mprima
            FROM adpolcob a
            INNER JOIN macoberturas b ON a.ccober = b.ccobertura AND a.cramo = b.cramo
            WHERE ${cond}`);
          for (const row of res.recordset) {
            (coberturasMap[row.cnpoliza] ||= []).push({
              cCobertura: parseInt(row.ccobertura, 10) || row.ccobertura,
              xCobertura: row.xcobertura,
              pTasa: row.ptasa,
              mSumaAsegurada: row.msumaasegurada,
              mPrima: row.mprima,
            });
          }
        }
      }

      const polizas = policies.map((policy) => {
        const nameTomador = (policy.tom_xnombre ? `${policy.tom_xnombre} ${policy.tom_xapellido || ''}` : '').trim();
        const nameAsegurado = (policy.cli_xnombre ? `${policy.cli_xnombre} ${policy.cli_xapellido || ''}` : '').trim();
        const cobs = coberturasMap[policy.cnpoliza] || [];
        const sumaAsegurada = cobs.length > 0 ? Math.max(...cobs.map((c) => c.mSumaAsegurada)) : 0;

        const item: Record<string, any> = {
          nroPoliza: policy.cnpoliza,
          codigoRamo: policy.cramo,
          descripcionRamo: policy.Descripcion_Ramo ? policy.Descripcion_Ramo.trim() : 'N/A',
          plan: policy.cplan,
          descripcionPlan: policy.Descripcion_Plan ? String(policy.Descripcion_Plan).trim() : 'N/A',
          cciRif: policy.casegurado ? String(policy.casegurado) : null,
          cid: policy.tom_cid || (policy.ctenedor ? `V-${policy.ctenedor}` : null),
          nombreDelTomador: nameTomador || null,
          nombreAsegurado: nameAsegurado || null,
          iSexo: policy.cli_isexo || null,
          iEstadoCivil: policy.cli_iestado_civil || null,
          fNacimiento: policy.cli_fnacimiento || null,
          telefonos: JSON.parse(policy.telefonos_json || '[]'),
          correos: JSON.parse(policy.correos_json || '[]'),
          direcciones: JSON.parse(policy.direcciones_json || '[]').map((d: any) => ({
            cEstado: d.cEstado,
            cCiudad: d.cCiudad,
            xAveCalle: d.xAveCalle,
          })),
          fanopol: policy.fanopol,
          fmespol: policy.fmespol,
          cprog: policy.cprog,
          fechaDesdePol: policy.Fecha_desde_Pol,
          fechaHastaPol: policy.Fecha_hasta_Pol,
          estatusPoliza: policy.Estatus_Poliza,
          sumaAsegurada,
          coberArys: 0,
          moneda: policy.Moneda ? policy.Moneda.trim() : 'N/A',
          sucursal: policy.Sucursal ? policy.Sucursal.trim() : 'N/A',
          intermediario: [
            policy.Intermediario_Codigo && policy.Intermediario_Nombre
              ? `${policy.Intermediario_Codigo} - ${policy.Intermediario_Nombre.trim()}`
              : 'DIRECTO',
            'LA MUNDIAL DE SEGUROS',
          ],
          segmento: policy.cramo === 18 ? 'particular' : 'general',
          descripcionSegmento: policy.cramo === 18 ? 'Particular' : 'General',
          tipoRenovacion: '',
          siniestros: 0,
        };
        if (includeReceipts) item.recibos = receiptMap[policy.cnpoliza] || [];
        if (includeCoverages) item.coberturasReal = cobs;
        return item;
      });

      return ok({ status: true, result: { polizas, campanaInfo, pagination } });
    } catch (err: any) {
      this.logger.error(`policiesInfo: ${err.message}`, err.stack);
      return fail(err.message);
    }
  }

  // ─── poliza (getPolicyById) ────────────────────────────────────────────────

  async searchPoliza(data: Record<string, any>): Promise<CoreResult> {
    try {
      const hasFilters = data.cnpoliza || data.cgestor || data.ccorredor || data.casegurado;
      const hasPagination = data.page && data.steps;
      const selectPrefix = !hasFilters && !hasPagination ? 'SELECT TOP 500' : 'SELECT';
      const req = this.db.request();

      let where = '';
      let hasWhere = false;
      if (data.cnpoliza) {
        where = ' WHERE A.cnpoliza = @cnpoliza';
        req.input('cnpoliza', T.VarChar(30), String(data.cnpoliza).trim());
        hasWhere = true;
      } else if (data.cgestor && data.cgestor != `${data.ccorredor}-0-0`) {
        where = " WHERE A.cgestor LIKE CONCAT(REPLACE(@cgestor, '-0', ''), '%')";
        req.input('cgestor', T.VarChar(40), String(data.cgestor));
        hasWhere = true;
      } else if (data.ccorredor) {
        where = ' WHERE A.cproductor = @ccorredor';
        req.input('ccorredor', T.VarChar(20), String(data.ccorredor));
        hasWhere = true;
      } else if (data.casegurado) {
        let cleanVal = String(data.casegurado).trim().replace(/[-.]/g, '');
        if (/^[VE]/i.test(cleanVal)) cleanVal = cleanVal.substring(1);
        where = ' WHERE CAST(A.casegurado AS VARCHAR(50)) = @casegurado';
        req.input('casegurado', T.VarChar(50), cleanVal);
        hasWhere = true;
      }
      if (data.cramo) {
        where += `${hasWhere ? ' AND' : ' WHERE'} A.cramo = @cramo`;
        req.input('cramo', T.Int, parseInt(data.cramo, 10));
      }

      let paginate = '';
      if (data.page && data.steps) {
        const page = parseInt(data.page, 10) || 1;
        const steps = parseInt(data.steps, 10) || 100;
        paginate = ` OFFSET ${(page - 1) * steps} ROWS FETCH NEXT ${steps} ROWS ONLY`;
      }

      const res = await req.query(`
        ${selectPrefix} A.fanopol, A.fmespol, A.cproces, A.cprog, R.cdoccob as [ctransaccion],
          CASE cestado_civil WHEN 'S' THEN 'Soltero' WHEN 'C' THEN 'Casado/a' WHEN 'V' THEN 'Viudo' WHEN 'D' THEN 'Divorciado' END AS cestado_civil_asegurado,
          CASE csexo WHEN 'F' THEN 'Femenino' WHEN 'M' THEN 'Masculino' END AS [csexo_asegurado],
          CASE WHEN A.cramo = 18 AND M.xplan IS NOT NULL THEN M.xplan ELSE TRIM(S.xplan) END AS [Descripcion_Plan],
          CASE R.iestadorec WHEN 'P' THEN 'Pendiente' WHEN 'A' THEN 'Anulado' WHEN 'C' THEN 'Cobrado' WHEN 'N' THEN 'Notificado' END AS [Status_Rec],
          CASE A.itiporen WHEN 'A' THEN 'Anual' WHEN 'S' THEN 'Semestral' WHEN 'M' THEN 'Mensual' WHEN 'T' THEN 'Trimestral' ELSE A.itiporen END AS [Tipo_Renovacion],
          CASE TRIM(A.istatpol) WHEN 'V' THEN 'Vigente' WHEN 'A' THEN 'Anulado' ELSE A.iestado END AS [Estatus_Poliza],
          TRIM(maclient.xcliente) as xasegurado,
          TRIM(maclient.cid) as xcedula_asegurado,
          TRIM(xparentesco) as xparentesco_asegurado,
          FORMAT(peasegurados.fnacimiento, 'dd-MM-yyyy') as fnacimiento_asegurado,
          FORMAT(peasegurados.fdesde, 'dd-MM-yyyy') as fingreso_asegurado,
          CONVERT(varchar, A.cpoliza) AS [cpoliza],
          TRIM(A.cnpoliza) AS [Nro_Poliza],
          TRIM(A.cnpoliza) AS [cnpoliza],
          A.cramo AS [Codigo_Ramo],
          M.cplan, S.cplan,
          TRIM(B.xdescripcion_l) [Descripcion_Ramo],
          FORMAT(A.fdesde,'dd-MM-yyyy') AS [Fecha_desde_Pol],
          FORMAT(A.fhasta,'dd-MM-yyyy') AS [Fecha_hasta_Pol],
          TRIM(E.cid) AS [CID],
          TRIM(E.xcliente) AS [Nombre_del_Tomador],
          TRIM(C.cid) AS [Id_Asegurado],
          TRIM(C.xcliente) AS [Nombre_Asegurado],
          TRIM(D.cid) AS [Id_del_Beneficiario],
          TRIM(D.xcliente) AS [Nombre_Beneficiario],
          F.cmoneda AS [Codigo_Moneda],
          TRIM(F.xdescripcion_l) AS [Moneda],
          FORMAT(A.fdesde,'dd-MM-yyyy') AS [Fecha_desde_Recibo],
          FORMAT(A.fhasta,'dd-MM-yyyy') AS [Fecha_hasta_Recibo],
          A.ptasamon AS [Tasa_Cambio],
          DATEDIFF(DAY, A.fdesde, A.fhasta) AS [Dias_de_vigencia],
          TRIM(G.xdescripcion_l) AS [Sucursal],
          G.xdescripcion_c AS [Descripcion_Corta_Sucursal],
          A.cproductor AS [cproductor_adpoliza],
          TRIM(H.xcliente) AS [Intermediario],
          P.xobserva AS [Poliza_Origen],
          A.xobserva AS [Observacion],
          R.cnrecibo AS [cnrecibo],
          FORMAT(A.forigen ,'dd-MM-yyyy') AS [Fecha_Emision],
          R.qcuotas AS [Cuotas],
          FORMAT(R.fdesde, 'dd-MM-yyyy') AS [Fdesde_Rec],
          FORMAT(R.fhasta, 'dd-MM-yyyy') AS [Fhasta_Rec],
          R.mmontorec AS [Monto_Rec],
          R.mmontorecext AS [Monto_Rec_Ext],
          R.crecibo AS [crecibo],
          FORMAT(R.fcobro, 'dd-MM-yyyy') AS [Fecha_Cobro],
          TRIM(A.cplan) AS [Plan],
          TRIM(U.xproductor) AS cproductor2,
          U.cproductor AS [cproductor],
          TRIM(U.xproductor) AS [Intermediario],
          trim(m.cproducto) 'cproducto',
          CASE WHEN a.cramo = 18 THEN CASE
              WHEN EXISTS (SELECT 1 FROM adpolcob WHERE cpoliza = a.cpoliza AND ccober = '15' AND cramo = 18) THEN 1
              ELSE 0 END
            ELSE 0 END AS CoberArys
        FROM adpoliza A
        LEFT JOIN maramos B ON A.cramo = B.cramo
        LEFT JOIN maclient C ON CAST(A.casegurado AS VARCHAR(50)) = C.cci_rif
        LEFT JOIN maclient D ON CAST(A.cbeneficiario AS VARCHAR(50)) = D.cci_rif
        LEFT JOIN maclient E ON CAST(A.ctenedor AS VARCHAR(50)) = E.cci_rif
        LEFT JOIN mamonedas F ON A.cmoneda = F.cmoneda
        LEFT JOIN masucur G ON A.csucur = G.csucur
        LEFT JOIN maclient H ON A.cproductor = H.cci_rif
        LEFT JOIN adpoliza P ON A.cnpoliza = P.cnpoliza
          AND YEAR(P.fdesde) > YEAR(A.fdesde)
          AND MONTH(P.fdesde) >= MONTH(A.fdesde)
        LEFT JOIN adrecibos R ON A.cpoliza = R.cpoliza and A.fanopol = R.fanopol and A.fmespol = R.fmespol
        LEFT JOIN maplanes M ON M.cplan = A.cplan AND M.cramo = A.cramo
        LEFT JOIN maplanes_per S ON S.cplan = A.cplan AND S.cramo = A.cramo
        LEFT JOIN maproduc U ON U.cproductor = A.cproductor
        LEFT JOIN peasegurados ON peasegurados.cpoliza = A.cpoliza
        LEFT JOIN maclient ON maclient.cci_rif = CAST(peasegurados.casegurado AS VARCHAR(50))
        LEFT JOIN maparent ON maparent.cparentesco = peasegurados.cparentesco
        ${where}
        ORDER BY A.fingreso DESC${paginate}`);

      const poliza: Record<string, any> = {};
      for (const item of res.recordset as any[]) {
        const uniqueKey = `${item.cpoliza}-${item.fanopol}-${item.fmespol}`;
        if (!poliza[uniqueKey]) {
          poliza[uniqueKey] = {
            Nro_Poliza: item.cnpoliza,
            fanopol: item.fanopol,
            fmespol: item.fmespol,
            ccorredor: item.ccorredor,
            cprog: item.cprog,
            CID: item.CID,
            Nombre_del_Tomador: item.Nombre_del_Tomador,
            Codigo_Ramo: item.Codigo_Ramo,
            Id_Asegurado: item.Id_Asegurado,
            Nombre_Asegurado: item.Nombre_Asegurado,
            Descripcion_Ramo: item.Descripcion_Ramo,
            Id_del_Beneficiario: item.Id_del_Beneficiario,
            Nombre_Beneficiario: item.Nombre_Beneficiario,
            Fecha_desde_Pol: item.Fecha_desde_Pol,
            Fecha_hasta_Pol: item.Fecha_hasta_Pol,
            Dias_de_vigencia: item.Dias_de_vigencia,
            Sucursal: item.Sucursal,
            Intermediario: item.Intermediario,
            cproductor: item.cproductor,
            cproductor2: item.cproductor2,
            Moneda: item.Moneda,
            Tasa_Cambio: item.Tasa_Cambio,
            Tipo_Renovacion: item.Tipo_Renovacion,
            Estatus_Poliza: item.Estatus_Poliza,
            Fecha_Emision: item.Fecha_Emision,
            Plan: item.Plan,
            Descripcion_Plan: item.Descripcion_Plan,
            Observacion: item.Observacion,
            xasegurado: item.xasegurado,
            xcedula_asegurado: item.xcedula_asegurado,
            xparentesco_asegurado: item.xparentesco_asegurado,
            fnacimiento_asegurado: item.fnacimiento_asegurado,
            csexo_asegurado: item.csexo_asegurado,
            cestado_civil_asegurado: item.cestado_civil_asegurado,
            fingreso_asegurado: item.fingreso_asegurado,
            Descripcion_Planes: item.Descripcion_Planes,
            CoberArys: item.CoberArys,
            cproducto: item.cproducto,
            recibos: [],
          };
        }
        if (!poliza[uniqueKey].recibos.some((r: any) => r.cnrecibo === item.cnrecibo)) {
          poliza[uniqueKey].recibos.push({
            cnrecibo: item.cnrecibo,
            fanopol: item.fanopol,
            cprog: item.cprog,
            fmespol: item.fmespol,
            Cuotas: item.Cuotas,
            Fdesde_Rec: item.Fdesde_Rec,
            Fhasta_Rec: item.Fhasta_Rec,
            Monto_Rec: item.Monto_Rec,
            Monto_Rec_Ext: item.Monto_Rec_Ext,
            cnpoliza: item.cnpoliza,
            Fecha_Cobro: item.Fecha_Cobro ? item.Fecha_Cobro : 'N/A',
            Status_Rec: item.Status_Rec,
            crecibo: item.crecibo,
            ctransaccion: item.ctransaccion ? item.ctransaccion : 'N/A',
          });
        }
      }
      return ok({ status: true, data: { list: poliza } });
    } catch (err: any) {
      this.logger.error(`searchPoliza: ${err.message}`, err.stack);
      return fail(err.message);
    }
  }

  // ─── poliza-only (searchPolizaOnly, fallback de getPolicyById) ────────────

  async searchPolizaOnly(input: Record<string, any>): Promise<CoreResult> {
    try {
      const { page, steps, ...filters } = input;
      const conds: string[] = [];
      const binds: Array<[string, string]> = [];
      for (const [key, value] of Object.entries(filters)) {
        if (!POLIZA_ONLY_FILTERS.has(key)) continue;
        if (value === undefined || value === null || value === '') continue;
        const p = `f${binds.length}`;
        conds.push(`a.${key} = @${p}`);
        binds.push([p, String(value).trim()]);
      }
      const whereSql = conds.length ? ` WHERE ${conds.join(' AND ')}` : '';
      const mkReq = () => {
        const r = this.db.request();
        binds.forEach(([name, value]) => r.input(name, T.VarChar(60), value));
        return r;
      };

      const from = `
        FROM adpoliza a
        INNER JOIN maramos b ON a.cramo = b.cramo
        INNER JOIN maclient c ON a.ctenedor = c.cci_rif
        INNER JOIN maclient d ON a.casegurado = d.cci_rif
        LEFT JOIN maplanes m ON m.cplan = a.cplan AND m.cramo = a.cramo
        LEFT JOIN maplanes_per s ON s.cplan = a.cplan AND s.cramo = a.cramo`;

      const pageN = Math.max(1, parseInt(page, 10) || 1);
      const stepsN = Math.max(1, parseInt(steps, 10) || 100);
      const offset = (pageN - 1) * stepsN;

      const total = await mkReq().query(`SELECT COUNT(*) AS count ${from}${whereSql}`);
      const items = await mkReq().query(`
        SELECT
          a.cpoliza, a.cnpoliza, a.cramo AS cramo,
          LTRIM(RTRIM(b.xdescripcion_l)) AS xramo,
          LTRIM(RTRIM(c.xcliente)) AS xintermediario,
          DATEDIFF(DAY, a.fdesde, a.fhasta) AS diff_vigencia,
          LTRIM(RTRIM(d.cid)) AS xdocidentidad_asegurado,
          LTRIM(RTRIM(d.xcliente)) AS xasegurado,
          CASE TRIM(a.istatpol) WHEN 'V' THEN 'Vigente' WHEN 'A' THEN 'Anulado' ELSE a.iestado END AS xstatus,
          a.fanopol, a.fmespol,
          CONVERT(varchar, CONVERT(date, a.fdesde)) AS fdesde,
          CONVERT(varchar, CONVERT(date, a.fhasta)) AS fhasta,
          TRIM(a.cplan) AS cplan,
          CASE WHEN a.cramo = 18 AND m.xplan IS NOT NULL THEN m.xplan ELSE TRIM(s.xplan) END AS Descripcion_Plan
        ${from}${whereSql}
        ORDER BY a.cnpoliza OFFSET ${offset} ROWS FETCH NEXT ${stepsN} ROWS ONLY`);

      return ok({
        status: true,
        data: { list: items.recordset, total: total.recordset[0]?.count ?? 0 },
      });
    } catch (err: any) {
      this.logger.error(`searchPolizaOnly: ${err.message}`, err.stack);
      return fail(err.message);
    }
  }

  // ─── poliza-recibos (getPolicyDetails) ─────────────────────────────────────

  async searchRecibosFromPoliza(data: Record<string, any>): Promise<CoreResult> {
    try {
      const cnpoliza = String(data.cnpoliza ?? '').trim();
      const cramo = toInt(data.cramo);
      const fanopol = toInt(data.fanopol);
      const fmespol = toInt(data.fmespol);
      if (!cnpoliza || cramo === null || fanopol === null || fmespol === null) {
        return fail('cnpoliza, cramo, fanopol y fmespol son requeridos.', 400);
      }

      const ramoRes = await this.db
        .request()
        .input('cramo', T.Int, cramo)
        .query('SELECT xdescripcion_l AS xramo FROM maramos WHERE cramo = @cramo');

      const polRes = await this.db
        .request()
        .input('cnpoliza', T.VarChar(30), cnpoliza)
        .input('fanopol', T.Int, fanopol)
        .input('fmespol', T.Int, fmespol)
        .query('SELECT * FROM adpoliza WHERE cnpoliza = @cnpoliza AND fanopol = @fanopol AND fmespol = @fmespol');
      const poliza: Record<string, any> | undefined = polRes.recordset[0];
      if (!poliza) return fail('No se encontró la póliza.', 404);

      if (cramo === 18) {
        const certRes = await this.db
          .request()
          .input('cnpoliza', T.VarChar(30), cnpoliza)
          .query('SELECT * FROM vhcerti WHERE cnpoliza = @cnpoliza');
        if (certRes.recordset.length === 0) {
          return fail('No se encontro datos correctos del certificado');
        }
        const cert: Record<string, any> = certRes.recordset[0];
        const certLower = Object.fromEntries(Object.entries(cert).map(([k, v]) => [k.toLowerCase(), v]));

        let vehicleDesc: Record<string, any> = {
          xmarca: '',
          xmodelo: '',
          xversion: '',
          xvehiculo: 'Vehículo Desconocido',
        };
        const ccategovh = cert.ccategovh;
        if (ccategovh && ccategovh > 0) {
          const r = await this.db
            .request()
            .input('id', T.Int, ccategovh)
            .query(`SELECT TRIM(xmarca) AS xmarca, TRIM(xmodelo) AS xmodelo, TRIM(xversion) AS xversion,
                           CONCAT(TRIM(xmarca) + ' ', TRIM(xmodelo) + ' ', TRIM(xversion)) AS xvehiculo
                    FROM mainma WHERE id = @id`);
          if (r.recordset.length > 0) vehicleDesc = r.recordset[0];
        } else {
          const r = await this.db
            .request()
            .input('cmarca', T.VarChar(10), String(cert.cmarca ?? ''))
            .input('cmodelo', T.VarChar(10), String(cert.cmodelo ?? ''))
            .input('cversion', T.VarChar(10), String(cert.cversion ?? ''))
            .query(`SELECT TRIM(ma.xmarca) AS xmarca, TRIM(mo.xmodelo) AS xmodelo, TRIM(ve.xversion) AS xversion,
                           CONCAT(TRIM(ma.xmarca) + ' ', TRIM(mo.xmodelo) + ' ', TRIM(ve.xversion)) AS xvehiculo
                    FROM mamarcas ma
                    LEFT JOIN mamodelo mo ON ma.cmarca = mo.cmarca AND mo.cmodelo = @cmodelo
                    LEFT JOIN maversion ve ON ma.cmarca = ve.cmarca AND ve.cmodelo = @cmodelo AND ve.cversion = @cversion
                    WHERE ma.cmarca = @cmarca`);
          if (r.recordset.length > 0 && r.recordset[0].xmarca) vehicleDesc = r.recordset[0];
        }

        poliza.contrato = {
          ...certLower,
          xmarca: vehicleDesc.xmarca || '',
          xmodelo: vehicleDesc.xmodelo || '',
          xversion: vehicleDesc.xversion || '',
          xvehiculo: vehicleDesc.xvehiculo || 'Vehículo Desconocido',
        };
        poliza.vehicle = {
          placa: cert.xplaca ? String(cert.xplaca).trim() : '',
          marca: cert.cmarca ? String(cert.cmarca).trim() : '',
          modelo: cert.cmodelo ? String(cert.cmodelo).trim() : '',
          version: cert.cversion ? String(cert.cversion).trim() : '',
          xmarca: vehicleDesc.xmarca || '',
          xmodelo: vehicleDesc.xmodelo || '',
          xversion: vehicleDesc.xversion || '',
          xvehiculo: vehicleDesc.xvehiculo || '',
          anio: cert.cano || cert.qano || 0,
          mvalor: cert.mvalor || 0,
          cplan: cert.cplan || poliza.cplan || 'AutoII',
        };

        let coberturas: any[] = [];
        const flotaRes = await this.db
          .request()
          .input('cnpoliza', T.VarChar(30), cnpoliza)
          .query('SELECT ccontratoflota FROM surecibo_h WHERE cnpoliza = @cnpoliza');
        const ccontratoflota = flotaRes.recordset[0]?.ccontratoflota;
        if (ccontratoflota) {
          const contrato = await this.db
            .request()
            .input('ccontratoflota', T.Int, ccontratoflota)
            .query('SELECT * FROM SUCONTRATOFLOTA WHERE ccontratoflota = @ccontratoflota');
          if (contrato.recordset.length > 0) poliza.contrato.ccontratoflota = ccontratoflota;

          const resFlota = await this.db
            .request()
            .input('ccontratoflota', T.Int, ccontratoflota)
            .query(`SELECT ccobertura, xcobertura, ptasa, msuma_aseg, mprima
                    FROM VWBUSCARCOBERTURASXCONTRATOFLOTA WHERE ccontratoflota = @ccontratoflota ORDER BY CORDEN`);
          if (resFlota.recordset.length > 0) {
            coberturas = resFlota.recordset.map((c: any) => ({
              ccobertura: c.ccobertura,
              xcobertura: c.xcobertura ? c.xcobertura.trim() : '',
              ptasa: c.ptasa,
              msumaasegurada: c.msuma_aseg,
              mprima: c.mprima,
            }));
          }
        }
        if (coberturas.length === 0) {
          const resTrad = await this.db
            .request()
            .input('cnpoliza', T.VarChar(30), cnpoliza)
            .query(`SELECT a.ccober AS ccobertura, TRIM(b.xdescripcion_l) AS xcobertura, a.ptasamon AS ptasa,
                           COALESCE(a.msumaasegext, a.msumaaseg) AS msumaasegurada,
                           COALESCE(a.mprimabrutaext, a.mprimabruta) AS mprima
                    FROM adpolcob a
                    INNER JOIN macoberturas b ON a.ccober = b.ccobertura AND a.cramo = b.cramo
                    WHERE a.cnpoliza = @cnpoliza
                    ORDER BY a.ccober`);
          coberturas = resTrad.recordset.map((c: any) => ({
            ccobertura: parseInt(c.ccobertura, 10) || c.ccobertura,
            xcobertura: c.xcobertura,
            ptasa: c.ptasa,
            msumaasegurada: c.msumaasegurada,
            mprima: c.mprima,
          }));
        }
        if (coberturas.length > 0) poliza.coberturasReal = coberturas;
      }

      poliza.xramo = ramoRes.recordset[0]?.xramo;

      const recRes = await this.db
        .request()
        .input('cnpoliza', T.VarChar(30), cnpoliza)
        .input('fanopol', T.Int, fanopol)
        .input('fmespol', T.Int, fmespol)
        .query(`SELECT cnrecibo, iestadorec, mmontorecext, mmontorec, ptasamon, TRIM(cmoneda) AS cmoneda, fdesde, fhasta
                FROM adrecibos
                WHERE cnpoliza = @cnpoliza AND fanopol = @fanopol AND fmespol = @fmespol`);
      if (recRes.recordset.length === 0) {
        return fail('No se encontro datos de los recibos de la poliza');
      }
      // El driver entrega fechas SQL como medianoche UTC: se formatea en UTC para no depender de la zona del servidor.
      const iso = (d: unknown) => new Date(d as any).toISOString().slice(0, 10);
      poliza.recibos = recRes.recordset.map((r: any) => ({
        ...r,
        fdesde: iso(r.fdesde),
        fhasta: iso(r.fhasta),
        selected: false,
      }));

      return ok({ status: true, message: 'Recibos Encontrados.', recibosInfo: poliza });
    } catch (err: any) {
      this.logger.error(`searchRecibosFromPoliza: ${err.message}`, err.stack);
      return fail(err.message);
    }
  }

  // ─── plan-coberturas (planCoverages) ───────────────────────────────────────

  async getPlanCoverages(data: Record<string, any>): Promise<CoreResult> {
    try {
      const res = await this.db
        .request()
        .input('cplan', T.VarChar(20), String(data.cplan ?? ''))
        .input('cramo', T.Int, toInt(data.cramo) ?? 18)
        .query(`SELECT b.ccobertura, TRIM(c.xdescripcion_l) AS xcobertura
                FROM maplanes a
                JOIN maplancob b ON a.cplan = b.cplan AND b.cramo = @cramo
                JOIN macoberturas c ON b.ccobertura = c.ccobertura AND b.cramo = c.cramo
                WHERE a.cplan = @cplan`);
      const list = res.recordset.map((r: any) => ({
        ccobertura: parseInt(r.ccobertura, 10) || r.ccobertura,
        xcobertura: r.xcobertura,
      }));
      return ok({ status: true, data: list, message: 'Coberturas del plan encontradas.' });
    } catch (err: any) {
      this.logger.error(`getPlanCoverages: ${err.message}`, err.stack);
      return fail(err.message);
    }
  }

  // ─── calcular-plan-sis / planes-solicitud (spCalculoAuto) ──────────────────

  private async spCalculoAuto(plan: Record<string, any>, cusuario: number): Promise<any[][]> {
    const req = this.db.request();
    req.input('cmarca', T.NVarChar(4), plan.cmarca);
    req.input('cmodelo', T.NVarChar(4), plan.cmodelo);
    req.input('cversion', T.NVarChar(4), plan.cversion);
    req.input('cano', T.Int, plan.cano);
    req.input('cplan', T.VarChar(20), plan.idPlan);
    req.input('sumaAseg', T.Numeric(18, 2), plan.suma);
    req.input('sumaAsegBl', T.Numeric(18, 2), plan.sumaAsegBl);
    req.input('sumaAsegAd', T.Numeric(18, 2), plan.sumaAsegAd);
    req.input('iplaca', T.Char(1), plan.iplaca || 'N');
    req.input('fdesde', T.Date, plan.fdesde);
    req.input('fhasta', T.Date, plan.fhasta);
    req.input('tasaPt', T.Numeric(18, 2), plan.tasaPt);
    req.input('tasaCa', T.Numeric(18, 2), plan.tasaCa);
    req.input('tasaPp', T.Numeric(18, 2), plan.tasaPp);
    req.input('recargo', T.Numeric(18, 2), plan.recargo);
    req.input('tipoV', T.Numeric(4), plan.tipo);
    req.input('uso', T.Numeric(4), plan.uso);
    req.input('puestos', T.Numeric(4), plan.puestos);
    req.input('toneladas', T.Numeric(4), plan.toneladas || 0);
    req.input('recargoRcv', T.Numeric(6), plan.recargoRcv);
    req.input('cramo', T.Numeric(4), plan.cramo || 18);
    req.input('cusuario', T.Numeric(20), cusuario);
    req.input('coberAdicional', T.VarChar(2), plan.coberAdicional || 'RC');
    const res = await req.execute('spCalculoAuto');
    return res.recordsets as unknown as any[][];
  }

  async calculatePlanSis(body: Record<string, any>): Promise<CoreResult> {
    const missing = missingCalculoFields(body);
    if (missing.length) return fail(`Faltan campos requeridos para calcular: ${missing.join(', ')}.`, 400);
    try {
      const sets = await this.spCalculoAuto(body, toInt(body?.cusuario) ?? 7);
      if (!sets || sets.length === 0) {
        return fail('Error en calculos, por favor validar informacion');
      }
      const detalle = sets[0] ?? [];
      const precio = sets[1] && sets[1][0] ? sets[1][0] : null;
      if (!precio || detalle.length === 0) {
        return fail('Error en calculos, por favor validar informacion');
      }
      const { totalPA, totalCA, totalPT, totalAP, totalPP } = precio;
      return ok({
        message: 'Calculo generado con exito',
        status: true,
        mount: detalle,
        pa: totalPA,
        ca: totalCA,
        pt: totalPT,
        ap: totalAP,
        pp: totalPP,
        boolPT: totalPT > 0,
        boolPP: totalPP > 0,
        boolCA: totalCA > 0,
        boolBl: totalAP > 0,
        boolAd: totalAP > 0,
        cproducto: detalle[0].cproducto,
      });
    } catch (err: any) {
      this.logger.error(`calculatePlanSis: ${err.message}`, err.stack);
      return fail(err.message || 'Problemas en el calculo');
    }
  }

  async calculatePlanSolicitud(body: Record<string, any>): Promise<CoreResult> {
    const missing = missingCalculoFields(body);
    if (missing.length) return fail(`Faltan campos requeridos para calcular: ${missing.join(', ')}.`, 400);
    try {
      const sets = await this.spCalculoAuto(body, toInt(body?.cusuario) ?? 7);
      if (!sets || sets.length === 0) {
        return fail('Error en cálculos, por favor validar información');
      }
      const detalle = sets[0] ?? [];
      const precio = sets[1] && sets[1][0] ? sets[1][0] : null;
      if (!precio) return fail('No se encontraron datos de precios para esta solicitud');

      const { totalPA, totalCA, totalPT, totalAP, totalPP } = precio;
      const coberPT = totalPT > 0;
      const coberCA = totalCA > 0;
      const coberPP = totalPP > 0;
      const coberBl = totalAP > 0;
      const coberAd = totalAP > 0;

      const planes: Record<string, any> = {};
      for (const item of detalle) {
        const cplan = String(item.cplan).trim();
        const xplan = String(item.xplan).trim();
        if (!planes[cplan]) {
          planes[cplan] = {
            cplan,
            xplan,
            tipoPlan: item.cproducto,
            PT: Number(totalPT).toFixed(2),
            CA: Number(totalCA).toFixed(2),
            PA: Number(totalPA).toFixed(2),
            PP: Number(totalPP).toFixed(2),
            TCA: item.tasaCA,
            TPT: item.tasaPT,
            TPP: item.tasaPP,
            boolPT: coberPT,
            boolCA: coberCA,
            boolPP: coberPP,
            boolBl: coberBl,
            boolAd: coberAd,
            coberturas: [],
          };
        }
        planes[cplan].coberturas.push({
          ccobertura: String(item.ccobertura).trim(),
          xdescripcion_l: String(item.xdescripcion_l).trim(),
          cmoneda: String(item.cmoneda).trim(),
          prima: item.prima,
          masegurada: item.masegurada,
        });
      }
      return ok({ message: 'Calculo generado con exito', status: true, planes: Object.values(planes) });
    } catch (err: any) {
      this.logger.error(`calculatePlanSolicitud: ${err.message}`, err.stack);
      return fail(err.message || 'Problemas en el calculo');
    }
  }

  // ─── anular-recibos (voidReceipts) ─────────────────────────────────────────

  /**
   * Anula recibos pendientes por número (cnrecibo): recibo, cobertura asociada y, si es de un
   * contrato de flota, el recibo del contrato. Atómico y con bitácora en auoperaciones.
   */
  async anularRecibos(body: Record<string, any>): Promise<CoreResult> {
    const recibos: string[] = Array.isArray(body?.recibos)
      ? body.recibos.map((r: unknown) => String(r).trim()).filter(Boolean)
      : [];
    if (recibos.length === 0) return fail('recibos es requerido (lista de cnrecibo).', 400);

    const cusuario = toInt(body.cusuario) ?? 1;
    const fanulacion = body.fanulacion ? new Date(body.fanulacion) : new Date();
    if (Number.isNaN(fanulacion.getTime())) return fail('fanulacion inválida.', 400);

    try {
      const req = this.db.request();
      req.input('xitem', T.VarChar(60), String(body.cnpoliza ?? '').trim());
      req.input('cusuario', T.Int, cusuario);
      req.input('fanulacion', T.DateTime, fanulacion);
      req.input('recibos', T.NVarChar(T.MAX), JSON.stringify(recibos));

      await req.query(`
        DECLARE @coperacion INT;
        INSERT INTO auoperaciones (xitem, cproceso, xobservacion, ifuente, cusuario, finicio, iestatus)
        VALUES (@xitem, 1, 'Anulacion de recibos', 'SIS2000_WEB', @cusuario, GETDATE(), 'I');
        SET @coperacion = SCOPE_IDENTITY();
        BEGIN TRY
          BEGIN TRAN;
          UPDATE adrecibos
             SET fanulacion = @fanulacion, iestadorec = 'A', cusuariomod = @cusuario, fultmod = GETDATE()
           WHERE cnrecibo IN (SELECT value FROM OPENJSON(@recibos));
          UPDATE adpolcob
             SET iestado = 'N', cusuariomod = @cusuario, fultmod = GETDATE()
           WHERE cnrecibo IN (SELECT value FROM OPENJSON(@recibos));
          UPDATE SURECIBO
             SET cestatusgeneral = 3, fanulado = @fanulacion
           WHERE crecibo IN (SELECT crecibo FROM SURECIBO_H WHERE cnrecibo IN (SELECT value FROM OPENJSON(@recibos)));
          COMMIT TRAN;
          UPDATE auoperaciones SET iestatus = 'F', ffinal = GETDATE() WHERE coperacion = @coperacion;
        END TRY
        BEGIN CATCH
          IF @@TRANCOUNT > 0 ROLLBACK TRAN;
          UPDATE auoperaciones SET iestatus = 'E' WHERE coperacion = @coperacion;
          THROW;
        END CATCH`);

      return ok({ status: true, data: { message: 'Anulacion Exitosa', body } });
    } catch (err: any) {
      this.logger.error(`anularRecibos: ${err.message}`, err.stack);
      return fail(err.message);
    }
  }
}
