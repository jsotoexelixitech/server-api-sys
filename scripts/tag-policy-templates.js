#!/usr/bin/env node
/**
 * Prepara las plantillas .docx "tageadas" para docxtemplater a partir de los
 * .docx ORIGINALES del cuadro-poliza (mismo diseno exacto usado por La
 * Mundial: tablas, logo, textos legales). Reemplaza cada dato de muestra por
 * un tag {campo} en la posicion EXACTA que ocupaba en el documento original
 * (usando el indice de aparicion del nodo <w:t>, no busqueda de texto por
 * contenido), y convierte la tabla de "COBERTURAS CONTRATADAS" en un bloque
 * de repeticion dinamica {#coberturas}...{/coberturas} (sin limite de filas).
 *
 * Se ejecuta UNA sola vez en desarrollo (no en cada request). El resultado se
 * guarda en src/assets/product-emission/templates/*.template.docx y se
 * consume en tiempo de ejecucion con docxtemplater (ver policy-docx.util.ts).
 *
 * Uso:
 *   node scripts/tag-policy-templates.js <ruta auto.docx> <ruta salud.docx>
 */
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

function escapeXml(v) {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getTokens(xml) {
  const re = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  const tokens = [];
  let m;
  while ((m = re.exec(xml))) {
    const openEnd = m.index + m[0].indexOf('>') + 1;
    const closeStart = m.index + m[0].length - '</w:t>'.length;
    tokens.push({ inner: m[1], innerStart: openEnd, innerEnd: closeStart });
  }
  return tokens;
}

function applyOps(xml, opsMap, label) {
  const tokens = getTokens(xml);
  const edits = [];
  for (const [idx, op] of opsMap) {
    const tok = tokens[idx];
    if (!tok) {
      console.warn(`  (!) [${label}] token faltante idx=${idx}`);
      continue;
    }
    let value;
    if (op.type === 'set') value = op.value;
    else if (op.type === 'clear') value = '';
    else if (op.type === 'replaceSubstr') value = tok.inner.split(op.from).join(op.to);
    else if (op.type === 'replaceMulti') {
      value = tok.inner;
      for (const [from, to] of op.pairs) value = value.split(from).join(to);
    } else throw new Error('op desconocida: ' + op.type);
    edits.push({ start: tok.innerStart, end: tok.innerEnd, value: escapeXml(value) });
  }
  edits.sort((a, b) => b.start - a.start);
  let result = xml;
  for (const e of edits) result = result.slice(0, e.start) + e.value + result.slice(e.end);
  return result;
}

/** Reemplaza la frase "La Mundial de Seguros, C.A.," (fragmentada en varios
 * <w:t> consecutivos) por "Exelixi Technology," dondequiera que aparezca. Se
 * usa en el carnet-resumen RCV, donde la frase se repite 4 veces con el mismo
 * patron de runs, a diferencia del cuerpo principal (con multiples variantes
 * de puntuacion) que se maneja con anclas puntuales en *_MAIN_OPS. */
function rebrandRepeatedLegalPhrase(xml) {
  const tokens = getTokens(xml);
  const seq = ['La', ' Mundial', ' de', ' Seguros,', ' C.A.,'];
  const edits = [];
  for (let i = 0; i <= tokens.length - seq.length; i++) {
    let match = true;
    for (let j = 0; j < seq.length; j++) {
      if (tokens[i + j].inner !== seq[j]) { match = false; break; }
    }
    if (!match) continue;
    edits.push({ start: tokens[i].innerStart, end: tokens[i].innerEnd, value: escapeXml('Exelixi Technology,') });
    for (let j = 1; j < seq.length; j++) {
      edits.push({ start: tokens[i + j].innerStart, end: tokens[i + j].innerEnd, value: '' });
    }
  }
  edits.sort((a, b) => b.start - a.start);
  let result = xml;
  for (const e of edits) result = result.slice(0, e.start) + e.value + result.slice(e.end);
  return result;
}

function buildOpsMap(relativeOps, offsets) {
  const map = new Map();
  for (const offset of offsets) {
    for (const [idx, op] of relativeOps) map.set(idx + offset, op);
  }
  return map;
}

/**
 * Inserta un nuevo <w:r> con el tag indicado justo despues del run que
 * contiene `labelText` (para campos que en la plantilla de muestra vienen
 * completamente vacios, ej. DIRECCION/EMAIL/CIUDAD/ESTADO en el certificado
 * de salud: el label existe pero no hay ningun <w:t> de valor a su lado que
 * podamos "hijackear" con un reemplazo de texto).
 */
function insertValueAfterLabel(xml, labelText, tagText, occurrence) {
  const escaped = labelText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('<w:r>(?:(?!<w:r>|</w:r>).)*?<w:t[^>]*>' + escaped + '</w:t></w:r>', 'gs');
  let m;
  let count = 0;
  let target = null;
  while ((m = re.exec(xml))) {
    count += 1;
    if (count === occurrence) {
      target = { end: m.index + m[0].length };
      break;
    }
  }
  if (!target) {
    console.warn(`  (!) label no encontrada (occurrence ${occurrence}): ${labelText}`);
    return xml;
  }
  const insertion = `<w:r><w:rPr><w:rFonts w:ascii="Arial MT"/><w:sz w:val="11"/></w:rPr><w:t xml:space="preserve">${escapeXml(tagText)}</w:t></w:r>`;
  return xml.slice(0, target.end) + insertion + xml.slice(target.end);
}

const set = (value) => ({ type: 'set', value });
const clear = () => ({ type: 'clear' });
const sub = (from, to) => ({ type: 'replaceSubstr', from, to });
const multi = (pairs) => ({ type: 'replaceMulti', pairs });

/** Convierte UN parrafo de cobertura (con columna de tag TCR/$ y PRIMA) en fila de loop dinamico. */
function convertCoverageParagraphWithTagAndPrima(paraXml) {
  const ops = new Map([
    [0, set('{#coberturas}{name}')],
    [1, clear()],
    [2, set('{suma}')],
    [4, set('{covTag}')],
    [5, set('{prima}{/coberturas}')],
  ]);
  return applyOps(paraXml, ops, 'cov-row');
}

/** Convierte UN parrafo de cobertura SIN columna de tag (solo nombre, suma, prima). */
function convertCoverageParagraphNoTag(paraXml) {
  const ops = new Map([
    [0, set('{#coberturas}{name}')],
    [1, set('{suma}')],
    [2, set('{prima}{/coberturas}')],
  ]);
  return applyOps(paraXml, ops, 'cov-row-salud');
}

/** Ubica el bloque de N parrafos de cobertura (ancla inicio/fin) y lo reemplaza por 1 parrafo-loop. */
function convertCoverageBlock(xml, firstAnchor, lastAnchor, fromCursor, convertFn) {
  const startAnchorIdx = xml.indexOf(firstAnchor, fromCursor);
  if (startAnchorIdx < 0) throw new Error('No se encontro ancla inicio cobertura: ' + firstAnchor);
  const endAnchorIdx = xml.indexOf(lastAnchor, startAnchorIdx);
  if (endAnchorIdx < 0) throw new Error('No se encontro ancla fin cobertura: ' + lastAnchor);

  let pStart = xml.lastIndexOf('<w:p>', startAnchorIdx);
  const pStartAlt = xml.lastIndexOf('<w:p ', startAnchorIdx);
  if (pStartAlt > pStart) pStart = pStartAlt;
  const firstParaEnd = xml.indexOf('</w:p>', pStart) + '</w:p>'.length;
  const blockEnd = xml.indexOf('</w:p>', endAnchorIdx) + '</w:p>'.length;

  const firstPara = xml.slice(pStart, firstParaEnd);
  const loopPara = convertFn(firstPara);

  return {
    xml: xml.slice(0, pStart) + loopPara + xml.slice(blockEnd),
    nextCursor: pStart + loopPara.length,
  };
}

// ---------------------------------------------------------------------------
// AUTOMOVIL — mapeo relativo a la 1ra copia (0-328). La 2da copia repite
// exactamente la misma estructura con offset +330 (verificado token a token).
// ---------------------------------------------------------------------------

/** 7 filas fijas de COBERTURAS CONTRATADAS (1 parrafo Word por fila). */
const AUTO_MAIN_COV_OPS = [
  [216, set('{cov0Nombre}')], [217, clear()], [218, set('{cov0Suma}')], [219, clear()], [220, set('{cov0Tag}')], [221, set('{cov0Prima}')],
  [222, set('{cov1Nombre}')], [223, clear()], [224, set('{cov1Suma}')], [225, clear()], [226, set('{cov1Tag}')], [227, set('{cov1Prima}')],
  [228, set('{cov2Nombre}')], [229, clear()], [230, set('{cov2Suma}')], [231, set('{cov2Tag}')], [232, set('{cov2Prima}')],
  [233, set('{cov3Nombre}')], [234, clear()], [235, set('{cov3Suma}')], [236, set('{cov3Tag}')], [237, set('{cov3Prima}')],
  [238, set('{cov4Nombre}')], [239, clear()], [240, set('{cov4Suma}')], [241, set('{cov4Tag}')], [242, set('{cov4Prima}')],
  [243, set('{cov5Nombre}')], [244, clear()], [245, set('{cov5Suma}')], [246, set('{cov5Tag}')], [247, set('{cov5Prima}')],
  [248, set('{cov6Nombre}')], [249, clear()], [250, set('{cov6Suma}')], [251, set('{cov6Tag}')], [252, set('{cov6Prima}')],
];

const AUTO_MAIN_OPS = [
  [5, set('{tomadorNombre}')], [6, clear()], [7, clear()], [8, clear()], [9, clear()],
  [12, set('{tomadorIdentificacion}')], [13, clear()],
  [18, set('{ramoPoliza}')],
  [20, set('{numeroPoliza}')],
  [32, set('{tomadorDireccion}')],
  [33, clear()], [34, clear()], [35, clear()], [36, clear()], [37, clear()], [38, clear()],
  [39, clear()], [40, clear()], [41, clear()], [42, clear()], [43, clear()], [44, clear()],
  [45, clear()], [46, clear()],
  [49, set('{tomadorEmail}')],
  [52, set('{certificado}')],
  [54, set('{tomadorCiudad}')],
  [57, set('{tomadorEstado}')],
  [62, set('{tomadorZonaPostal}')],
  [65, set('{tomadorTelefono}')],
  [67, set('{estatus}')],
  [70, set('{aseguradoNombre}')], [71, clear()], [72, clear()], [73, clear()], [74, clear()], [75, clear()], [76, clear()],
  [79, set('{aseguradoIdentificacion}')], [80, clear()],
  [82, set('{aseguradoDireccion}')],
  [85, set('{aseguradoEmail}')],
  [87, set('{aseguradoCiudad}')],
  [90, set('{aseguradoEstado}')],
  [95, set('{aseguradoZonaPostal}')],
  [98, set('{aseguradoTelefono}')],
  [101, set('{beneficiarioNombre}')], [102, clear()], [103, clear()],
  [106, set('{beneficiarioIdentificacion}')], [107, clear()], [108, clear()], [109, clear()],
  [111, set('{beneficiarioDireccion}')],
  [112, clear()], [113, clear()], [114, clear()], [115, clear()], [116, clear()], [117, clear()],
  [118, clear()], [119, clear()], [120, clear()], [121, clear()], [122, clear()], [123, clear()],
  [124, clear()], [125, clear()], [126, clear()], [127, clear()], [128, clear()],
  [131, set('{beneficiarioEmail}')],
  [137, set('{beneficiarioCiudad}')],
  [140, set('{beneficiarioEstado}')],
  [145, set('{beneficiarioZonaPostal}')],
  [148, set('{beneficiarioTelefono}')],
  [151, set('{fechaEmision}')],
  [153, set('{vigenciaDesde} - ')], [154, set('{vigenciaHasta}')],
  [156, set('{moneda}')],
  [161, set('{canalVenta}')],
  [168, set('{intermediario}')], [169, clear()],
  [285, set('POR EXELIXI ')], [286, set('TECHNOLOGY')],
  [174, set('{planContratado}')], [175, clear()],
  [180, set('{vehTransmision}')], [181, clear()],
  [183, set('{vehMarca}')],
  [185, set('{vehModelo}')],
  [188, set('{vehVersion}')], [189, clear()],
  [191, set('{vehAnio}')],
  [194, set('{vehSerialCarr}')],
  [197, set('{vehSerialMot}')],
  [200, set('{vehPlaca}')],
  [203, set('{vehUso}')],
  [205, set('{vehPuestos}')],
  [209, set('{vehColor}')],
  // 216-252: tabla de coberturas -> ver AUTO_MAIN_COV_OPS (7 filas fijas)
  [254, set('{primaTotalFormateada}')],
  [273, set('{numeroPoliza}')], [274, clear()],
  [277, set('{vigenciaDesde}')],
  [278, set('{vigenciaHasta}')],
  [280, set('{monedaReciboLabel}')], [281, clear()],
  [282, set('{primaTotalFormateada}')],
  [290, set('{tomadorNombre}')], [291, clear()],
  [292, set('{intermediario}')], [293, clear()],
  [294, set('{tomadorIdentificacion}')], [295, clear()],
  [299, set('En Caracas a los {fechaEmisionLarga}')], [300, clear()],
  [310, set('www.exelixitech.com')],
  [311, sub('JOSE ISAIAC GOMEZ ARAGUANEY', '{aseguradoNombre}')],
  [313, sub('La Mundial de', 'Exelixi Technology')],
  [315, sub('Seguros, C.A ', '')],
  [316, multi([['CONSORCIO JA-NA, C.A.', '{tomadorNombre}'], ['J-502663061', '{tomadorIdentificacion}']])],
  [320, sub('La Mundial de Seguros, C.A.,', 'Exelixi Technology,')],
  [324, sub('La Mundial de Seguros, C.A.', 'Exelixi Technology')],
  [326, set('info@exelixitech.com')],
  [327, sub('La Mundial de Seguros, C.A,', 'Exelixi Technology,')],
];

// Carnet-resumen RCV (solo automovil): se repite 2 veces, offset +79.
// Indices relativos verificados contra el token 693 (inicio de "Poliza de
// Seguro de Responsabilidad...") del documento original.
const AUTO_WALLET_CARD_OPS = [
  [6, sub('18-1-100102748', '{numeroPoliza}')],
  [7, set('{aseguradoNombre}')], [8, clear()], [9, clear()], [10, clear()], [11, clear()], [12, clear()], [13, clear()],
  [17, set('{aseguradoIdentificacion}')], [18, clear()],
  [20, set('{vigenciaDesde}')],
  [24, set('{vigenciaHasta}')],
  [29, set('{vehMarca}')],
  [30, set('{vehModelo}')],
  [31, set('{vehAnio}')],
  [32, set('{vehVersion}')], [33, clear()], [34, clear()], [35, clear()], [36, clear()], [37, clear()],
  [38, set('{vehTransmision}')],
  [42, set('{vehColor}')],
  [43, set('{vehPlaca}')],
  [44, set('{vehSerialCarr}')],
];

// Lista resumen de coberturas dentro del carnet (sin columna PRIMA): 7 slots fijos
// (tarjeta fisica de tamano fijo para recortar, igual que en la plantilla original).
// Indices relativos al token "COBERTURAS" (incluido, indice 0, sin tocar).
const AUTO_WALLET_COVLIST_OPS = [
  [1, set('{cov0Nombre}')], [2, clear()], [3, set('{cov0Suma}')], [5, set('{cov0Tag}')],
  [6, set('{cov1Nombre}')], [7, clear()], [8, set('{cov1Suma}')], [10, set('{cov1Tag}')],
  [11, set('{cov2NombreFull}')], [12, clear()], [13, set('{cov2Suma}')], [14, set('{cov2Tag}')],
  [15, set('{cov3NombreFull}')], [16, clear()], [17, set('{cov3Suma}')], [18, set('{cov3Tag}')],
  [19, set('{cov4Nombre}')], [20, clear()], [21, set('{cov4Suma}')], [22, set('{cov4Tag}')],
  [23, set('{cov5Nombre}')], [24, clear()], [25, set('{cov5Suma}')], [26, set('{cov5Tag}')],
  [27, set('{cov6NombreFull}')], [28, clear()], [29, set('{cov6Suma}')], [30, set('{cov6Tag}')],
];

function tagAutomovilDocument(xml) {
  let out = xml;
  const mainMap = buildOpsMap([...AUTO_MAIN_OPS, ...AUTO_MAIN_COV_OPS], [0, 330]);
  out = applyOps(out, mainMap, 'auto-main');

  // Carnet-resumen RCV (2 tarjetas + 2 listas de coberturas sin prima).
  const introIdx = out.indexOf('recorte de las siguientes im');
  const walletTextIdx = out.indexOf('Póliza de Seguro de Responsabilidad', introIdx);
  const walletStart = out.lastIndexOf('<w:t', walletTextIdx);
  const walletTokensXml = out.slice(walletStart);

  // Tarjeta 1 y 2 (offset relativo al inicio del carnet-resumen).
  const walletMap = buildOpsMap(AUTO_WALLET_CARD_OPS, [0, 79]);
  let taggedWallet = applyOps(walletTokensXml, walletMap, 'auto-wallet-card');

  // Listas de coberturas (sin prima), 2 veces. Se recalculan los indices tras
  // cada reemplazo porque el largo del string cambia (los tags no miden lo
  // mismo que el texto de muestra original).
  let searchFrom = 0;
  for (let i = 0; i < 2; i++) {
    const textIdx = taggedWallet.indexOf('COBERTURAS', searchFrom);
    if (textIdx < 0) break;
    const covIdx = taggedWallet.lastIndexOf('<w:t', textIdx);
    const covXmlFromHere = taggedWallet.slice(covIdx);
    const patched = applyOps(covXmlFromHere, new Map(AUTO_WALLET_COVLIST_OPS), 'auto-wallet-cov');
    taggedWallet = taggedWallet.slice(0, covIdx) + patched;
    searchFrom = covIdx + patched.indexOf('COBERTURAS') + 'COBERTURAS'.length;
  }

  taggedWallet = rebrandRepeatedLegalPhrase(taggedWallet);
  out = out.slice(0, walletStart) + taggedWallet;
  return removeBackgroundDrawings(out);
}

// ---------------------------------------------------------------------------
// SALUD — mapeo relativo a la 1ra copia (0-233). 2da copia offset +235.
// ---------------------------------------------------------------------------
/** 3 filas fijas de COBERTURAS (salud tiene 3 filas en la plantilla original). */
const SALUD_MAIN_COV_OPS = [
  [141, set('{cov0Nombre}')], [142, set('{cov0Suma}')], [143, set('{cov0Prima}')],
  [144, set('{cov1Nombre}')], [145, clear()], [146, set('{cov1Suma}')], [147, set('{cov1Prima}')],
  [148, set('{cov2NombreFull}')], [149, clear()], [150, set('{cov2Suma}')], [151, set('{cov2Prima}')],
];

const SALUD_MAIN_OPS = [
  [4, clear()], [5, clear()], // mini-box decorativo antes de "TOMADOR:" (sin dato equivalente en el payload)
  [7, set('{tomadorNombre}')], [8, clear()], [9, clear()], [10, clear()], [11, clear()], [12, clear()], [13, clear()],
  [16, set('{tomadorIdentificacion}')], [17, clear()],
  [22, set('{ramoPoliza}')],
  [24, set('{numeroPoliza}')],
  [30, clear()], // "PÓLIZA REL:" valor de muestra sin campo equivalente
  [35, set('{certificado}')],
  [44, clear()], [45, clear()], // mini-box antes de "ASEGURADO:"
  [48, set('{aseguradoNombre}')], [49, clear()], [50, clear()], [51, clear()], [52, clear()], [53, clear()], [54, clear()],
  [57, set('{aseguradoIdentificacion}')], [58, clear()],
  [67, clear()], [68, clear()], // mini-box antes de "BENEFICIARIO:"
  [71, set('{beneficiarioNombre}')], [72, clear()], [73, clear()], [74, clear()], [75, clear()], [76, clear()], [77, clear()],
  [80, set('{beneficiarioIdentificacion}')], [81, clear()],
  [94, set('{fechaEmision}')],
  [96, set('{vigenciaDesde} - ')], [97, set('{vigenciaHasta}')],
  [99, set('{moneda}')],
  [104, set('{canalVenta}')],
  [109, set('{intermediario}')], [110, clear()],
  [115, set('{planContratado}')], [116, clear()],
  [120, set('{aseguradoNombre}')], [121, clear()],
  [122, set('{aseguradoIdentificacion}')], [123, clear()],
  [129, clear()], // fecha nacimiento de muestra (sin campo equivalente en el payload)
  [133, clear()], // sexo de muestra (sin campo equivalente en el payload)
  [136, set('{vigenciaDesde}')],
  // 141-151: tabla de coberturas -> ver SALUD_MAIN_COV_OPS
  [153, set('{primaTotalFormateada}')],
  [159, set('{beneficiarioNombre}')], [160, clear()],
  [164, set('{beneficiarioParentesco}')], [165, clear()],
  [180, set('{numeroPoliza}')], [181, clear()],
  [184, set('{vigenciaDesde}')],
  [185, set('{vigenciaHasta}')],
  [187, set('{monedaReciboLabel}')], [188, clear()],
  [189, set('{primaTotalFormateada}')],
  [192, set('POR EXELIXI ')], [193, set('TECHNOLOGY')],
  [197, set('{tomadorNombre}')], [198, clear()],
  [199, set('{intermediario}')], [200, clear()],
  [201, set('{tomadorIdentificacion}')], [202, clear()],
  [206, set('En Caracas a los {fechaEmisionLarga}')], [207, clear()],
  [213, set('www.exelixitech.com')],
  [216, sub('ANA ANGELINA JIMENEZ DE MONAGAS', '{aseguradoNombre}')],
  [218, sub('La Mundial de', 'Exelixi Technology')],
  [220, sub('Seguros, C.A ', '')],
  [221, multi([['ANA ANGELINA JIMENEZ DE MONAGAS', '{tomadorNombre}'], ['V-7716530', '{tomadorIdentificacion}']])],
  [225, sub('La Mundial de Seguros, C.A.,', 'Exelixi Technology,')],
  [229, sub('La Mundial de Seguros, C.A.', 'Exelixi Technology')],
  [231, set('info@exelixitech.com')],
  [232, sub('La Mundial de Seguros, C.A,', 'Exelixi Technology,')],
];

// DIRECCION/EMAIL/CIUDAD/ESTADO/ZONA POSTAL/TELEFONO/ESTATUS vienen con el
// label pero SIN ningun valor de muestra al lado (el cliente de ejemplo no
// tenia esos datos cargados en La Mundial), por lo que no hay texto que
// reemplazar: hay que insertar un <w:r> nuevo justo despues del label.
// occurrence = orden de aparicion del label DENTRO DE UNA SOLA COPIA del
// documento (1=tomador, 2=asegurado, 3=beneficiario). ESTATUS: solo aparece
// una vez (bloque tomador).
const SALUD_INSERT_OPS = [
  { label: 'DIRECCIÓN:', occurrence: 1, tag: '{tomadorDireccion}', perCopy: 3 },
  { label: 'EMAIL:', occurrence: 1, tag: '{tomadorEmail}', perCopy: 3 },
  { label: 'CIUDAD:', occurrence: 1, tag: '{tomadorCiudad}', perCopy: 3 },
  { label: 'ESTADO:', occurrence: 1, tag: '{tomadorEstado}', perCopy: 3 },
  { label: 'POSTAL:', occurrence: 1, tag: '{tomadorZonaPostal}', perCopy: 3 },
  { label: 'TELÉFONO:', occurrence: 1, tag: '{tomadorTelefono}', perCopy: 3 },
  { label: 'ESTATUS:', occurrence: 1, tag: '{estatus}', perCopy: 1 },

  { label: 'DIRECCIÓN:', occurrence: 2, tag: '{aseguradoDireccion}', perCopy: 3 },
  { label: 'EMAIL:', occurrence: 2, tag: '{aseguradoEmail}', perCopy: 3 },
  { label: 'CIUDAD:', occurrence: 2, tag: '{aseguradoCiudad}', perCopy: 3 },
  { label: 'ESTADO:', occurrence: 2, tag: '{aseguradoEstado}', perCopy: 3 },
  { label: 'POSTAL:', occurrence: 2, tag: '{aseguradoZonaPostal}', perCopy: 3 },
  { label: 'TELÉFONO:', occurrence: 2, tag: '{aseguradoTelefono}', perCopy: 3 },

  { label: 'DIRECCIÓN:', occurrence: 3, tag: '{beneficiarioDireccion}', perCopy: 3 },
  { label: 'EMAIL:', occurrence: 3, tag: '{beneficiarioEmail}', perCopy: 3 },
  { label: 'CIUDAD:', occurrence: 3, tag: '{beneficiarioCiudad}', perCopy: 3 },
  { label: 'ESTADO:', occurrence: 3, tag: '{beneficiarioEstado}', perCopy: 3 },
  { label: 'POSTAL:', occurrence: 3, tag: '{beneficiarioZonaPostal}', perCopy: 3 },
  { label: 'TELÉFONO:', occurrence: 3, tag: '{beneficiarioTelefono}', perCopy: 3 },
];

function tagSaludDocument(xml) {
  let out = xml;
  const mainMap = buildOpsMap([...SALUD_MAIN_OPS, ...SALUD_MAIN_COV_OPS], [0, 235]);
  out = applyOps(out, mainMap, 'salud-main');

  for (const copy of [0, 1]) {
    for (const { label, occurrence, tag, perCopy } of SALUD_INSERT_OPS) {
      out = insertValueAfterLabel(out, label, tag, occurrence + copy * perCopy);
    }
  }
  return removeBackgroundDrawings(out);
}

function tagHeaderFooterBranding(xml) {
  return xml
    .split('info@lamundialdeseguros.com').join('info@exelixitech.com')
    .split('https://lamundialdeseguros.com/').join('https://exelixitech.com/')
    .split('www.lamundialdeseguros.com').join('www.exelixitech.com');
}

function replaceRamoInHeader(xml, ramoSample) {
  return xml.split(ramoSample).join('{ramoPoliza}');
}

/** Quita runs con imagen de fondo (watermark La Mundial: behindDoc="1"). */
function removeBackgroundDrawings(xml) {
  let result = xml;
  let idx = 0;
  while ((idx = result.indexOf('<w:drawing>', idx)) >= 0) {
    const drawEnd = result.indexOf('</w:drawing>', idx) + '</w:drawing>'.length;
    const chunk = result.slice(idx, drawEnd);
    if (!chunk.includes('behindDoc="1"')) {
      idx = drawEnd;
      continue;
    }
    let rStart = result.lastIndexOf('<w:r>', idx);
    const rStartAlt = result.lastIndexOf('<w:r ', idx);
    if (rStartAlt > rStart) rStart = rStartAlt;
    const rEnd = result.indexOf('</w:r>', drawEnd) + '</w:r>'.length;
    if (rStart >= 0 && rEnd > rStart) {
      result = result.slice(0, rStart) + result.slice(rEnd);
      idx = rStart;
    } else {
      idx = drawEnd;
    }
  }
  return result;
}

function processTemplate(srcPath, outPath, kind) {
  console.log(`\n== Procesando ${kind}: ${srcPath} ==`);
  const zip = new PizZip(fs.readFileSync(srcPath));

  const docXml = zip.file('word/document.xml').asText();
  const tagged = kind === 'automovil' ? tagAutomovilDocument(docXml) : tagSaludDocument(docXml);
  zip.file('word/document.xml', tagged);

  for (const f of ['header1.xml', 'header2.xml']) {
    const entry = zip.file(`word/${f}`);
    if (!entry) continue;
    let xml = tagHeaderFooterBranding(entry.asText());
    xml = replaceRamoInHeader(xml, kind === 'automovil' ? 'AUTOMOVIL' : 'SALUD');
    zip.file(`word/${f}`, xml);
  }
  for (const f of ['footer1.xml', 'footer2.xml']) {
    const entry = zip.file(`word/${f}`);
    if (!entry) continue;
    zip.file(`word/${f}`, tagHeaderFooterBranding(entry.asText()));
  }

  const logoPath = path.join(__dirname, '..', 'src', 'assets', 'product-emission', 'exelixi-logo-blanco.png');
  if (fs.existsSync(logoPath) && zip.file('word/media/image1.png')) {
    zip.file('word/media/image1.png', fs.readFileSync(logoPath));
    console.log('  Logo Exelixi inyectado en word/media/image1.png');
  }

  const buf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);
  console.log(`  -> ${outPath} (${buf.length} bytes)`);
}

const [, , autoSrc, saludSrc] = process.argv;
if (!autoSrc || !saludSrc) {
  console.error('Uso: node scripts/tag-policy-templates.js <auto.docx> <salud.docx>');
  process.exit(1);
}

const templatesDir = path.join(__dirname, '..', 'src', 'assets', 'product-emission', 'templates');
processTemplate(autoSrc, path.join(templatesDir, 'certificado-automovil.template.docx'), 'automovil');
processTemplate(saludSrc, path.join(templatesDir, 'certificado-salud.template.docx'), 'salud');
console.log('\nListo.');
