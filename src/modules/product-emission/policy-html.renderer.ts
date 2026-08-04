import * as fs from 'fs';
import * as path from 'path';
import { PartyDto } from './dto/party.dto';
import {
  dash,
  escapeHtml,
  formatDateVe,
  formatDayVe,
  formatMonthNameVe,
  formatMoneyVe,
  formatYearVe,
  mapMonedaLabel,
  mapMonedaSymbol,
  pickRiskValue,
} from './policy-formatters.util';
import {
  PolicyDocumentCoverageRow,
  PolicyDocumentData,
} from './policy-document.service';
import { htmlTemplatesRoot, readTemplateFile, resolveLogoDataUri } from './policy-html.paths.util';
import { PolicyTemplateKey, templateFileName } from './policy-template.util';

const EXELIXI_REBRAND: Array<[string, string]> = [
  ['La Mundial de Seguros, C.A.', 'Exelixi Technology'],
  ['La Mundial de Seguros', 'Exelixi Technology'],
  ['La Mundial de', 'Exelixi'],
  ['POR LA MUNDIAL DE SEGUROS', 'POR EXELIXI TECHNOLOGY'],
  ['www.lamundialdeseguros.com', 'www.exelixitech.com'],
  ['https://www.lamundialdeseguros.com', 'https://exelixitech.com'],
  ['https://lamundialdeseguros.com/', 'https://exelixitech.com/'],
  ['info@lamundialdeseguros.com', 'info@exelixitech.com'],
  ['Humberto Martínez', 'Representante Autorizado'],
];

function rebrand(text: string): string {
  let out = text;
  for (const [from, to] of EXELIXI_REBRAND) {
    out = out.split(from).join(to);
  }
  return out;
}

function replaceAll(html: string, vars: Record<string, string>): string {
  let out = html;
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{{${key}}}`).join(value);
  }
  return out;
}

function loadSection(name: string): string {
  return rebrand(readTemplateFile(path.join('sections', `section_${name}.html`)));
}

function partyTomador(p: PartyDto | undefined): Record<string, string> {
  const x = p ?? ({} as PartyDto);
  const direccion = escapeHtml(dash(x.direccion));
  return {
    xtomador: escapeHtml(dash(x.nombre).toUpperCase()),
    xcedula_tomador: escapeHtml(dash(x.identificacion)),
    xdireccion_tomador: direccion,
    xcorreo_tomador: escapeHtml(dash(x.email)),
    xciudad_tomador: escapeHtml(dash(x.ciudad)),
    xestado_tomador: escapeHtml(dash(x.estado)),
    xzona_postal_tomador: escapeHtml(dash(x.zonaPostal)),
    xtelefono_tomador: escapeHtml(dash(x.telefono)),
  };
}

function partyAsegurado(p: PartyDto | undefined): Record<string, string> {
  const x = p ?? ({} as PartyDto);
  return {
    xasegurado: escapeHtml(dash(x.nombre).toUpperCase()),
    xcedula_asegurado: escapeHtml(dash(x.identificacion)),
    xdireccion_asegurado: escapeHtml(dash(x.direccion)),
    xcorreo_asegurado: escapeHtml(dash(x.email)),
    xciudad_asegurado: escapeHtml(dash(x.ciudad)),
    xestado_asegurado: escapeHtml(dash(x.estado)),
    xzona_postal_asegurado: escapeHtml(dash(x.zonaPostal)),
    xtelefono_asegurado: escapeHtml(dash(x.telefono)),
  };
}

function partyBeneficiario(p: PartyDto | undefined): Record<string, string> {
  const x = p ?? ({} as PartyDto);
  return {
    xbeneficiario: escapeHtml(dash(x.nombre).toUpperCase()),
    xcedula_beneficiario: escapeHtml(dash(x.identificacion)),
    xdireccion_beneficiario: escapeHtml(dash(x.direccion)),
    xcorreo_beneficiario: escapeHtml(dash(x.email)),
    xciudad_beneficiario: escapeHtml(dash(x.ciudad)),
    xestado_beneficiario: escapeHtml(dash(x.estado)),
    xzona_postal_beneficiario: escapeHtml(dash(x.zonaPostal)),
    xtelefono_beneficiario: escapeHtml(dash(x.telefono)),
  };
}

function buildCoberturasAutomovilHtml(
  coberturas: PolicyDocumentCoverageRow[],
  moneda: string,
  primaTotal: number,
): string {
  const tag = mapMonedaSymbol(moneda);
  const rows = coberturas.map(
    (c) => `
    <tr>
      <td class="bold">${escapeHtml(c.name)}</td>
      <td class="right">${formatMoneyVe(c.sumaAsegurada)}</td>
      <td class="right">${tag}</td>
      <td class="right"></td>
      <td class="right">${formatMoneyVe(c.prima)}</td>
    </tr>`,
  );
  rows.push(`
    <tr>
      <td colspan="3" class="bold" style="vertical-align:top">TOTAL:</td>
      <td></td>
      <td class="right bold" style="vertical-align:bottom">${formatMoneyVe(primaTotal)}</td>
    </tr>`);
  return rows.join('');
}

function buildCoberturasSaludHtml(
  coberturas: PolicyDocumentCoverageRow[],
  primaTotal: number,
): string {
  const rows = coberturas.map(
    (c) => `
    <tr>
      <td class="bold">${escapeHtml(c.name)}</td>
      <td class="right">${formatMoneyVe(c.sumaAsegurada)}</td>
      <td class="right">${formatMoneyVe(c.prima)}</td>
    </tr>`,
  );
  rows.push(`
    <tr>
      <td colspan="2" class="bold" style="vertical-align:top">TOTAL:</td>
      <td class="right bold" style="vertical-align:bottom">${formatMoneyVe(primaTotal)}</td>
    </tr>`);
  return rows.join('');
}

function buildRecibosHtml(data: PolicyDocumentData): string {
  const monedaLabel = mapMonedaLabel(data.moneda);
  const sym = mapMonedaSymbol(data.moneda);
  return `
    <tr>
      <td>${escapeHtml(data.numeroPoliza)}</td>
      <td class="right">Primer Año (Nuevo)</td>
      <td class="right">${formatDateVe(data.vigenciaDesde)}</td>
      <td class="right">${formatDateVe(data.vigenciaHasta)}</td>
      <td class="right">N/A</td>
      <td class="right">${monedaLabel} (${sym})</td>
      <td class="right">${formatMoneyVe(data.primaTotal)}</td>
    </tr>`;
}

function buildAseguradosHtml(asegurado: PartyDto): string {
  return `
    <tr>
      <td class="bold" width="12%">Nombre y Apellido:</td>
      <td width="26%">${escapeHtml(dash(asegurado.nombre))}</td>
      <td class="bold" width="10%">${escapeHtml(dash(asegurado.identificacion))}</td>
      <td class="bold" width="9%">TITULAR</td>
      <td class="bold" width="9%">F. Nacimiento:</td>
      <td>—</td>
      <td class="bold" style="text-align:right">SEXO:</td>
      <td style="text-align:left">—</td>
      <td class="bold" style="text-align:right">F. Ingreso:</td>
      <td style="text-align:left">${formatDateVe(new Date())}</td>
    </tr>`;
}

function buildBeneficiariosHtml(beneficiarios: PartyDto[]): string {
  if (!beneficiarios.length) {
    return `
    <tr>
      <td class="bold" width="12%">Nombre y Apellido:</td>
      <td>—</td>
      <td class="bold" width="6%">C.I./R.I.F.</td>
      <td width="8%">—</td>
      <td class="bold" width="10%">PARENTESCO:</td>
      <td width="15%">—</td>
    </tr>`;
  }
  return beneficiarios
    .map(
      (b) => `
    <tr>
      <td class="bold" width="12%">Nombre y Apellido:</td>
      <td>${escapeHtml(dash(b.nombre))}</td>
      <td class="bold" width="6%">C.I./R.I.F.</td>
      <td width="8%">${escapeHtml(dash(b.identificacion))}</td>
      <td class="bold" width="10%">PARENTESCO:</td>
      <td width="15%">${escapeHtml(dash(b.parentesco))}</td>
    </tr>`,
    )
    .join('');
}

function buildFirmaHtml(data: PolicyDocumentData): string {
  const estatus = (data.estatus ?? 'PAGADO').toUpperCase();
  const stamp =
    estatus === 'PAGADO'
      ? '<strong style="font-size:14px;color:#008000">PAGADO</strong>'
      : estatus === 'ANULADO'
        ? '<strong style="font-size:14px;color:#cc0000">ANULADO</strong>'
        : '<strong style="font-size:14px;color:#666">PENDIENTE</strong>';
  return `
    <tr>
      <td width="40%" class="bold" style="border-right:1px solid black">Nombre Apellido / Denominación Social:</td>
      <td width="20%" class="bold">Representante:</td>
      <td rowspan="5" style="text-align:center;">${stamp}</td>
    </tr>`;
}

function buildVehicleVars(risk: Record<string, unknown>): Record<string, string> {
  return {
    XMARCA: escapeHtml(pickRiskValue(risk, 'Marca') || '—'),
    XMODELO: escapeHtml(pickRiskValue(risk, 'Modelo') || '—'),
    XVERSION: escapeHtml(pickRiskValue(risk, 'Version', 'Versión') || '—'),
    FANO: escapeHtml(pickRiskValue(risk, 'Anio', 'Año', 'Ano') || '—'),
    XSERIALCARROCERIA: escapeHtml(
      pickRiskValue(risk, 'SerialCarroceria', 'SerialCarr', 'Carroceria') || '—',
    ),
    XSERIALMOTOR: escapeHtml(pickRiskValue(risk, 'SerialMotor', 'SerialMot') || '—'),
    XPLACA: escapeHtml(pickRiskValue(risk, 'Placa') || '—'),
    XTRANSMISION: escapeHtml(pickRiskValue(risk, 'Transmision', 'Transmisión') || '—'),
    XUSO: escapeHtml(pickRiskValue(risk, 'Uso') || 'PARTICULAR'),
    NCAPACIDADPASAJEROS: escapeHtml(pickRiskValue(risk, 'Puestos', 'NumeroDePuestos') || '—'),
    NPESOVACIO: escapeHtml(pickRiskValue(risk, 'Peso') || '—'),
    NCAPCARGA: escapeHtml(pickRiskValue(risk, 'Capacidad') || '—'),
    XCOLOR: escapeHtml(pickRiskValue(risk, 'Color') || '—'),
  };
}

function buildPdfHeaderHtml(ramo: string, capitalSuscrito: string): string {
  const logo = resolveLogoDataUri();
  const logoCell = logo
    ? `<img style="width:140px;height:90px;object-fit:contain" src="${logo}" alt="Exelixi"/>`
    : '<strong>EXELIXI</strong>';
  return `
    <table style="width:100%;margin-bottom:8px">
      <tr>
        <td style="text-align:left;width:40%">${logoCell}</td>
        <td style="text-align:center;width:30%"></td>
        <td style="text-align:right;font-size:10px;width:30%">
          <p style="margin:0">Inscrita en la Superintendencia de la Actividad Aseguradora bajo el Nro.</p>
          <p style="margin:0">Capital Suscrito Bs.</p>
          <p style="margin:0">Capital Pagado Bs.</p>
        </td>
        <td style="text-align:right;font-size:10px;width:12%">
          <p style="margin:0">ES-73</p>
          <p style="margin:0">${capitalSuscrito}</p>
          <p style="margin:0">${capitalSuscrito}</p>
        </td>
      </tr>
    </table>`;
}

function inlineStyles(html: string): string {
  const cssPath = path.join(htmlTemplatesRoot(), 'style.css');
  const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';
  const withoutLink = html.replace(
    /<link[^>]*href=["'][^"']*style\.css["'][^>]*>/i,
    `<style>${css}
      pagebreak, .pagebreak { display:block; page-break-before: always; }
    </style>`,
  );
  return withoutLink.replace(/<pagebreak\s*\/?>/gi, '<div class="pagebreak"></div>');
}

export function renderPolicyHtml(
  data: PolicyDocumentData,
  templateKey: PolicyTemplateKey,
): string {
  let html = rebrand(readTemplateFile(templateFileName(templateKey)));

  const beneficiario = data.beneficiarios?.[0];
  const estatusLabel = (data.estatus ?? 'PAGADO').toUpperCase();
  const title = `CUADRO - RECIBO DE PÓLIZA<br>${escapeHtml(data.ramoPoliza)}`;
  const capitalSuscrito = process.env.PRODUCT_EMISSION_CAPITAL_SUSCRITO ?? '70.000.000,00';

  const vars: Record<string, string> = {
    title,
    titulo_pdf: `RECIBO DE PÓLIZA - ${data.ramoPoliza}`,
    xramo: escapeHtml(data.ramoPoliza),
    cpoliza: escapeHtml(data.numeroPoliza),
    cnpoliza_rel: '—',
    certificado: '1',
    istatpol: escapeHtml(estatusLabel),
    femision_pol: formatDateVe(data.fechaEmision),
    fdesde_pol: formatDateVe(data.vigenciaDesde),
    fhasta_pol: formatDateVe(data.vigenciaHasta),
    xmoneda: mapMonedaLabel(data.moneda),
    xsucursal: 'PRINCIPAL',
    xcanal_venta: escapeHtml(dash(data.canalVenta || 'AGENTE EXCLUSIVO')),
    xfrecuencia: 'ANUAL',
    xintermediario: escapeHtml(dash(data.intermediario || 'EXELIXI TECHNOLOGY')),
    xplan: escapeHtml(dash(data.planName)),
    fdiapol: formatDayVe(data.fechaEmision),
    fmespol: formatMonthNameVe(data.fechaEmision),
    fanopol: formatYearVe(data.fechaEmision),
    section_tomador_asegurado: loadSection('tomador_asegurado'),
    section_poliza: loadSection('poliza'),
    section_declaracion: loadSection('declaracion'),
    section_firma: replaceAll(loadSection('firma'), {
      firma_html: buildFirmaHtml(data),
      ...partyTomador(data.tomador),
    }),
    section_recibos: replaceAll(loadSection('recibos'), {
      recibos: buildRecibosHtml(data),
    }),
    section_coberturas: replaceAll(loadSection('coberturas'), {
      suma_asegurada: `
        <tr>
          <th width="64%"></th>
          <th width="15%" style="text-align:right">SUMA ASEGURADA</th>
          <th width="4%"></th>
          <th width="15%" style="text-align:right">PRIMA</th>
        </tr>`,
      coberturas: buildCoberturasSaludHtml(data.coberturas, data.primaTotal),
    }),
    section_coberturas_automovil: replaceAll(loadSection('coberturas_automovil'), {
      coberturas_automovil: buildCoberturasAutomovilHtml(
        data.coberturas,
        data.moneda,
        data.primaTotal,
      ),
    }),
    section_automovil: loadSection('automovil'),
    section_asegurados: buildAseguradosHtml(data.asegurado),
    section_beneficiarios: buildBeneficiariosHtml(data.beneficiarios ?? []),
    coberturas: buildCoberturasSaludHtml(data.coberturas, data.primaTotal),
    coberturas_automovil: buildCoberturasAutomovilHtml(
      data.coberturas,
      data.moneda,
      data.primaTotal,
    ),
    recibos: buildRecibosHtml(data),
    firma_html: buildFirmaHtml(data),
    section_beneficiario_preferencial: '',
    ...partyTomador(data.tomador),
    ...partyAsegurado(data.asegurado),
    ...partyBeneficiario(beneficiario),
    ...buildVehicleVars(data.riskData ?? {}),
  };

  html = replaceAll(html, vars);
  html = inlineStyles(html);

  const header = buildPdfHeaderHtml(data.ramoPoliza, capitalSuscrito);
  const footer = `<div style="text-align:center;font-size:9px;margin-top:8px">Tel: +58-212-7726767 | info@exelixitech.com | https://exelixitech.com/</div>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${header}${html}${footer}</body></html>`;
}
