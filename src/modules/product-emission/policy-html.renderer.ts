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
import { htmlTemplatesRoot, readTemplateFile, resolveLogoDataUri, resolveWatermarkDataUri } from './policy-html.paths.util';
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

/** Varias pasadas: las secciones se insertan después de vars escalares en el objeto. */
function fillTemplate(html: string, vars: Record<string, string>, passes = 3): string {
  let out = html;
  for (let i = 0; i < passes; i++) {
    out = replaceAll(out, vars);
  }
  return out;
}

function loadSection(name: string): string {
  return rebrand(readTemplateFile(path.join('sections', `section_${name}.html`)));
}

function fillSection(name: string, vars: Record<string, string>): string {
  return replaceAll(loadSection(name), vars);
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
  const tasa = moneda.toUpperCase().includes('USD') ? 'TCR' : 'Bs';
  const rows = coberturas.map(
    (c) => `
    <tr>
      <td class="bold">${escapeHtml(c.name)}</td>
      <td class="right">${formatMoneyVe(c.sumaAsegurada)}</td>
      <td class="right">${tasa}</td>
      <td class="right">0,00</td>
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

function buildAseguradosHtml(
  asegurado: PartyDto,
  risk: Record<string, unknown>,
  fechaIngreso: Date,
): string {
  const fnacRaw = pickRiskValue(
    risk,
    'fechaNacimiento',
    'Fecha de nacimiento',
    'fecha_nacimiento',
    'fnacimiento',
    'F. Nacimiento',
  );
  let fnac = '—';
  if (fnacRaw) {
    fnac = fnacRaw.includes('/') ? fnacRaw : formatDateVe(new Date(fnacRaw));
  }
  const sexo = pickRiskValue(risk, 'sexo', 'Sexo', 'genero', 'Género') || '—';
  const edad = pickRiskValue(risk, 'edad', 'Edad');
  const ocupacion = pickRiskValue(risk, 'ocupacion', 'Ocupación', 'ocupacion');
  const titular = pickRiskValue(risk, 'parentescoAsegurado', 'Parentesco') || 'TITULAR';

  return `
    <tr>
      <td class="bold" width="12%">Nombre y Apellido:</td>
      <td width="26%">${escapeHtml(dash(asegurado.nombre))}</td>
      <td class="bold" width="10%">${escapeHtml(dash(asegurado.identificacion))}</td>
      <td class="bold" width="9%">${escapeHtml(titular)}</td>
      <td class="bold" width="9%">F. Nacimiento:</td>
      <td>${escapeHtml(fnac)}</td>
      <td class="bold" style="text-align:right">SEXO:</td>
      <td style="text-align:left">${escapeHtml(sexo)}</td>
      <td class="bold" style="text-align:right">F. Ingreso:</td>
      <td style="text-align:left">${formatDateVe(fechaIngreso)}</td>
    </tr>
    ${edad || ocupacion ? `<tr>
      <td class="bold">Edad:</td>
      <td>${escapeHtml(edad || '—')}</td>
      <td class="bold" colspan="2">Ocupación:</td>
      <td colspan="6">${escapeHtml(ocupacion || '—')}</td>
    </tr>` : ''}`;
}

function emptyOr(value: string, fallback = 'N/A'): string {
  return value.trim() ? value : fallback;
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
  const stampColor =
    estatus === 'PAGADO' ? '#008000' : estatus === 'ANULADO' ? '#cc0000' : '#666666';
  const stamp = `<span class="firma-estatus" style="color:${stampColor}">${estatus}</span>`;
  return `
    <tr>
      <td width="39%" class="bold" style="border-right:1px solid black">Nombre Apellido / Denominación Social:</td>
      <td width="39%" class="bold" style="border-right:1px solid black">Representante:</td>
      <td rowspan="5" class="firma-stamp">${stamp}</td>
    </tr>`;
}

function buildVehicleVars(risk: Record<string, unknown>): Record<string, string> {
  const req = (...candidates: string[]) =>
    escapeHtml(pickRiskValue(risk, ...candidates) || '—');
  const opt = (...candidates: string[]) =>
    escapeHtml(emptyOr(pickRiskValue(risk, ...candidates), 'N/A'));
  const uso =
    pickRiskValue(risk, 'Uso', 'Uso del vehículo', 'uso', 'Uso del Vehiculo') || 'PARTICULAR';
  const gruaRaw = pickRiskValue(risk, 'Grua', 'Grúa', 'grua', 'Servicio de grua', 'Servicio de grúa');
  return {
    XMARCA: req('Marca', 'marca'),
    XMODELO: req('Modelo', 'modelo'),
    XVERSION: req('Version', 'Versión', 'version', 'versionVehiculo'),
    FANO: req('Anio', 'Año', 'Ano', 'anio', 'ano', 'year'),
    XSERIALCARROCERIA: req(
      'serial',
      'SerialCarroceria',
      'SerialCarr',
      'Serial de carrocería',
      'Serial de carroceria',
      'serialCarroceria',
      'serial_carroceria',
      'Carroceria',
      'Carrocería',
    ),
    XSERIALMOTOR: req(
      'serialMotor',
      'SerialMotor',
      'SerialMot',
      'Serial de motor',
      'serial_motor',
      'Serial Motor',
    ),
    XPLACA: req('Placa', 'placa'),
    XTRANSMISION: req('Transmision', 'Transmisión', 'transmision', 'transmisión'),
    XUSO: escapeHtml(uso),
    NCAPACIDADPASAJEROS: req(
      'Puestos',
      'puestos',
      'NumeroDePuestos',
      'Cantidad de puestos',
      'Capacidad de pasajeros',
    ),
    NPESOVACIO: opt('Peso', 'peso', 'Peso vacío', 'Peso vacio', 'Peso Vacio'),
    NCAPCARGA: opt('Capacidad', 'capacidad', 'Capacidad de carga', 'Cap. carga'),
    XCOLOR: req('Color', 'color'),
    XGRUA: escapeHtml(gruaRaw || 'NO'),
  };
}

function buildPdfHeaderHtml(_ramo: string, capitalSuscrito: string): string {
  const logo = resolveLogoDataUri();
  const rif = process.env.PRODUCT_EMISSION_RIF?.trim();
  const rifLine = rif ? `<p style="margin:2px 0 0;font-size:8px">${escapeHtml(rif)}</p>` : '';
  const logoCell = logo
    ? `<img style="width:140px;height:70px;object-fit:contain" src="${logo}" alt="Exelixi"/>${rifLine}`
    : `<strong>EXELIXI</strong>${rifLine}`;
  return `
    <table style="width:100%;margin-bottom:8px;border-collapse:collapse">
      <tr>
        <td style="text-align:left;width:42%;vertical-align:top">${logoCell}</td>
        <td style="width:18%"></td>
        <td style="text-align:right;width:40%;vertical-align:top;font-size:9px">
          <table style="width:100%;border-collapse:collapse;margin-left:auto">
            <tr>
              <td style="text-align:right;padding:1px 6px 1px 0;vertical-align:top">
                Inscrita en la Superintendencia de la Actividad Aseguradora bajo el Nro.
              </td>
              <td style="text-align:right;padding:1px 0;white-space:nowrap;vertical-align:top;width:32%">ES-73</td>
            </tr>
            <tr>
              <td style="text-align:right;padding:1px 6px 1px 0">Capital Suscrito Bs.</td>
              <td style="text-align:right;padding:1px 0;white-space:nowrap">${escapeHtml(capitalSuscrito)}</td>
            </tr>
            <tr>
              <td style="text-align:right;padding:1px 6px 1px 0">Capital Pagado Bs.</td>
              <td style="text-align:right;padding:1px 0;white-space:nowrap">${escapeHtml(capitalSuscrito)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

function inlineStyles(html: string, watermarkUri: string | null): string {
  const cssPath = path.join(htmlTemplatesRoot(), 'style.css');
  const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';
  const watermarkCss = watermarkUri
    ? `.policy-watermark::before{background-image:url('${watermarkUri}');}.policy-watermark::after{display:none!important;}`
    : `.policy-watermark::before{display:none;}`;
  const withoutLink = html.replace(
    /<link[^>]*href=["'][^"']*style\.css["'][^>]*>/i,
    `<style>${css}
      pagebreak, .pagebreak { display:block; page-break-before: always; }
      ${watermarkCss}
    </style>`,
  );
  return withoutLink.replace(/<pagebreak\s*\/?>/gi, '<div class="pagebreak"></div>');
}

function wrapPolicyPages(html: string, header: string, footer: string): string {
  const parts = html.split('<div class="pagebreak"></div>');
  return parts
    .map((part, index) => {
      const isLast = index === parts.length - 1;
      const pageFooter = isLast ? footer : '';
      return `<div class="policy-page policy-watermark">${header}${part.trim()}${pageFooter}</div>`;
    })
    .join('<div class="pagebreak"></div>');
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
  const coberturasAutomovilHtml = buildCoberturasAutomovilHtml(
    data.coberturas,
    data.moneda,
    data.primaTotal,
  );
  const coberturasSaludHtml = buildCoberturasSaludHtml(data.coberturas, data.primaTotal);

  const dataVars: Record<string, string> = {
    title,
    titulo_pdf: `RECIBO DE PÓLIZA - ${data.ramoPoliza}`,
    xramo: escapeHtml(data.ramoPoliza),
    cpoliza: escapeHtml(data.numeroPoliza),
    cnpoliza_rel: 'N/A',
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
    coberturas: coberturasSaludHtml,
    coberturas_automovil: coberturasAutomovilHtml,
    recibos: buildRecibosHtml(data),
    firma_html: buildFirmaHtml(data),
    asegurados: buildAseguradosHtml(data.asegurado, data.riskData ?? {}, data.vigenciaDesde),
    beneficiarios: buildBeneficiariosHtml(data.beneficiarios ?? []),
    section_beneficiario_preferencial: '',
    xsuma_asegurada: '',
    suma_asegurada: `
        <tr>
          <th width="64%"></th>
          <th width="15%" style="text-align:right">SUMA ASEGURADA</th>
          <th width="4%"></th>
          <th width="15%" style="text-align:right">PRIMA</th>
        </tr>`,
    ...partyTomador(data.tomador),
    ...partyAsegurado(data.asegurado),
    ...partyBeneficiario(beneficiario),
    ...buildVehicleVars(data.riskData ?? {}),
  };

  const sectionVars: Record<string, string> = {
    section_tomador_asegurado: fillSection('tomador_asegurado', dataVars),
    section_poliza: fillSection('poliza', dataVars),
    section_declaracion: fillSection('declaracion', dataVars),
    section_automovil: fillSection('automovil', dataVars),
    section_firma: fillSection('firma', dataVars),
    section_recibos: fillSection('recibos', dataVars),
    section_coberturas: fillSection('coberturas', dataVars),
    section_coberturas_automovil: fillSection('coberturas_automovil', dataVars),
    section_asegurados: fillSection('asegurados', dataVars),
    section_beneficiarios: fillSection('beneficiarios', dataVars),
  };

  html = fillTemplate(html, { ...dataVars, ...sectionVars });
  html = inlineStyles(html, resolveWatermarkDataUri());

  const header = buildPdfHeaderHtml(data.ramoPoliza, capitalSuscrito);
  const footer = `<div class="policy-footer">Tel: +58-212-7726767 | info@exelixitech.com | https://exelixitech.com/</div>`;
  const body = wrapPolicyPages(html, header, footer);

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`;
}
