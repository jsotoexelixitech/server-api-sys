// @ts-nocheck
/** Ported from ET insightsEngine.js — pure analytics engine. */
const TIPOS_TEMPORALES = new Set(['LINE', 'AREA']);
const TIPOS_DIMENSIONALES = new Set(['BAR', 'STACKED_BAR', 'PIE', 'DOUGHNUT']);

const PARES_ANTONIMOS = [
  ['bruta', 'neta'],
  ['bruto', 'neto'],
  ['emitida', 'cobrada'],
  ['emitido', 'cobrado'],
  ['exigible', 'cobrada'],
  ['exigible', 'cobrado'],
  ['pendiente', 'vencida'],
  ['pendiente', 'vencido'],
];

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function toNumber(value) {
  if (isFiniteNumber(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function formatearMonto(valor) {
  if (!isFiniteNumber(valor)) return String(valor ?? '');
  const abs = Math.abs(valor);
  if (abs >= 1_000_000) return `${(valor / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(valor / 1_000).toFixed(1)}K`;
  return valor.toFixed(2);
}

function formatearPorcentaje(decimal, digitos = 1) {
  if (!isFiniteNumber(decimal)) return '0%';
  return `${(decimal * 100).toFixed(digitos)}%`;
}

function describirFuenteDatos(datosCrudos) {
  if (!isPlainObject(datosCrudos)) return 'Datos estructurados recibidos por el servicio de insights.';
  if (datosCrudos.grafico) {
    return `Cursor de gráfico "${datosCrudos.grafico}" devuelto por el procedimiento almacenado.`;
  }
  if (datosCrudos.cifras || datosCrudos.kpi_a || datosCrudos.kpi_b) {
    return 'Cursor de KPIs devuelto por el procedimiento almacenado.';
  }
  return 'Datos estructurados recibidos por el servicio de insights.';
}

function resumirDatosCrudos(datosCrudos) {
  if (!isPlainObject(datosCrudos)) return '';

  if (datosCrudos.cifras && isPlainObject(datosCrudos.cifras)) {
    return Object.entries(datosCrudos.cifras)
      .slice(0, 8)
      .map(([k, v]) => `${k}: ${formatearMonto(v)}`)
      .join(' | ');
  }

  if (datosCrudos.kpi_a && datosCrudos.kpi_b) {
    return `${datosCrudos.kpi_a}: ${formatearMonto(datosCrudos.valor_a)} | ${datosCrudos.kpi_b}: ${formatearMonto(datosCrudos.valor_b)}`;
  }

  if (Array.isArray(datosCrudos.top_elementos)) {
    return datosCrudos.top_elementos
      .slice(0, 5)
      .map((item) => `${item.eje}: ${formatearMonto(item.valor)} (${formatearPorcentaje(item.pct)})`)
      .join(' | ');
  }

  if (Array.isArray(datosCrudos.anomalias)) {
    return datosCrudos.anomalias
      .slice(0, 5)
      .map((item) => `${item.eje}: ${formatearMonto(item.valor)} (${item.desviaciones?.toFixed?.(1) ?? item.sigmas?.toFixed?.(1)} desviaciones)`)
      .join(' | ');
  }

  if (datosCrudos.bucket_alto) {
    return `${datosCrudos.bucket_alto}: ${formatearMonto(datosCrudos.valor_alto)} de ${formatearMonto(datosCrudos.total)}`;
  }

  if (datosCrudos.elemento) {
    return `${datosCrudos.elemento}: ${formatearMonto(datosCrudos.valor_total)} en ${datosCrudos.ocurrencias} gráfico(s)`;
  }

  return Object.entries(datosCrudos)
    .filter(([, value]) => typeof value !== 'object')
    .slice(0, 6)
    .map(([k, v]) => `${k}: ${isFiniteNumber(v) ? formatearMonto(v) : String(v ?? '')}`)
    .join(' | ');
}

/**
 * Detecta el campo dimensión (eje X) de las filas del gráfico.
 * Los datos crudos del SP no usan "EjeX" — tienen el nombre real del campo
 * (p.ej. "Mes", "Canal", "Producto"). Se busca el primer campo no numérico.
 */
function detectarCampoDimension(filas) {
  if (!Array.isArray(filas) || filas.length === 0) return null;
  const primeraFila = filas[0];
  if (!isPlainObject(primeraFila)) return null;
  if ('EjeX' in primeraFila) return 'EjeX';
  for (const [clave, valor] of Object.entries(primeraFila)) {
    if (toNumber(valor) === null) return clave;
  }
  return null;
}

function detectarSeriesNumericas(filas) {
  if (!Array.isArray(filas) || filas.length === 0) return [];
  const campoDimension = detectarCampoDimension(filas);
  const claves = new Set();
  for (const fila of filas) {
    if (!isPlainObject(fila)) continue;
    for (const [clave, valor] of Object.entries(fila)) {
      if (clave === campoDimension) continue;
      if (toNumber(valor) !== null) claves.add(clave);
    }
  }
  return Array.from(claves);
}

function priorizarPorUmbral(valor, umbralAlto, umbralMedio) {
  const abs = Math.abs(valor);
  if (abs >= umbralAlto) return 'Alta';
  if (abs >= umbralMedio) return 'Media';
  return 'Baja';
}

function bloqueResumen(kpisRow) {
  if (!isPlainObject(kpisRow)) return null;
  const cifras = {};
  for (const [clave, valor] of Object.entries(kpisRow)) {
    const numero = toNumber(valor);
    if (numero !== null) cifras[clave] = numero;
  }
  if (Object.keys(cifras).length === 0) return null;

  const detalle = Object.entries(cifras)
    .map(([k, v]) => `${k}: ${formatearMonto(v)}`)
    .join(' | ');

  return {
    tipo: 'resumen',
    categoria: 'Resumen general',
    titulo: 'Cifras clave del periodo',
    detalle_template: `Resumen consolidado: ${detalle}.`,
    valor: '',
    prioridad: 'Media',
    formula: 'Cifras directas del query del reporte (sin transformación).',
    datos_crudos: { cifras },
  };
}

function bloquesTendencia(idGrafico, definicion, filas) {
  if (!Array.isArray(filas) || filas.length < 2) return [];
  const series = detectarSeriesNumericas(filas);
  if (series.length === 0) return [];

  const campoDimension = detectarCampoDimension(filas);
  const bloques = [];

  for (const serie of series) {
    const ultimo = toNumber(filas[filas.length - 1][serie]);
    const previo = toNumber(filas[filas.length - 2][serie]);
    if (ultimo === null || previo === null || previo === 0) continue;

    const deltaPct = (ultimo - previo) / Math.abs(previo);
    const magnitudDeltaPct = Math.abs(deltaPct);
    const prioridad = priorizarPorUmbral(deltaPct, 0.20, 0.10);
    const direccion = deltaPct >= 0 ? 'incremento' : 'reducción';
    const ejeXUltimo = (campoDimension ? filas[filas.length - 1][campoDimension] : null) ?? 'último periodo';
    const ejeXPrevio = (campoDimension ? filas[filas.length - 2][campoDimension] : null) ?? 'periodo anterior';

    bloques.push({
      tipo: 'tendencia',
      categoria: definicion?.titulo || idGrafico,
      titulo: `Tendencia de ${serie}`,
      detalle_template:
        `${serie} muestra ${direccion} de ${formatearPorcentaje(magnitudDeltaPct)} entre ${ejeXPrevio} y ${ejeXUltimo}.`,
      valor: `${direccion} ${formatearPorcentaje(magnitudDeltaPct)}`,
      prioridad,
      formula: 'variacion_pct = (valor_ultimo - valor_previo) / valor_absoluto_previo. Prioridad: 20% o más = Alta; 10% a 19.9% = Media; menos de 10% = Baja.',
      datos_crudos: {
        grafico: idGrafico,
        serie,
        ultimo,
        previo,
        delta_pct: deltaPct,
        eje_x_ultimo: ejeXUltimo,
        eje_x_previo: ejeXPrevio,
      },
    });
  }
  return bloques;
}

function bloquesConcentracion(idGrafico, definicion, filas) {
  if (!Array.isArray(filas) || filas.length < 3) return [];
  const series = detectarSeriesNumericas(filas);
  const campoDimension = detectarCampoDimension(filas);
  const bloques = [];

  for (const serie of series) {
    const valores = filas
      .map((fila) => ({
        eje: campoDimension ? fila[campoDimension] : fila.EjeX,
        valor: toNumber(fila[serie]) ?? 0,
      }))
      .filter((item) => item.valor > 0)
      .sort((a, b) => b.valor - a.valor);

    if (valores.length < 3) continue;

    const total = valores.reduce((sum, item) => sum + item.valor, 0);
    if (total <= 0) continue;

    let acumulado = 0;
    let topCount = 0;
    for (const item of valores) {
      acumulado += item.valor;
      topCount += 1;
      if (acumulado / total >= 0.4) break;
    }

    const concentracion = acumulado / total;
    if (concentracion < 0.4 || topCount >= valores.length) continue;

    const prioridad = priorizarPorUmbral(concentracion, 0.40, 0.20);

    // Incluir nombres reales de los elementos (máx. 5)
    const topElementos = valores.slice(0, topCount);
    const topNombres = topElementos
      .slice(0, 5)
      .map((item) => String(item.eje ?? ''))
      .filter((s) => s !== '');

    const nombresTexto = topNombres.length > 0 ? ` (${topNombres.join(', ')})` : '';

    bloques.push({
      tipo: 'concentracion',
      categoria: definicion?.titulo || idGrafico,
      titulo: `Concentración de ${serie}`,
      detalle_template:
        `El ${formatearPorcentaje(concentracion)} de ${serie} se concentra en ${topCount} elemento(s)${nombresTexto}.`,
      valor: formatearPorcentaje(concentracion),
      prioridad,
      formula: 'concentracion = suma_elementos_principales / suma_total_del_grafico. Se reporta cuando el mínimo grupo de elementos principales acumula 40% o más del total.',
      datos_crudos: {
        grafico: idGrafico,
        serie,
        campo_dimension: campoDimension,
        total_elementos: valores.length,
        top_n: topCount,
        concentracion_pct: concentracion,
        top_elementos: topElementos.map((item) => ({
          eje: item.eje,
          valor: item.valor,
          pct: item.valor / total,
        })),
      },
    });
  }

  return bloques;
}

function bloquesAnomalia(idGrafico, definicion, filas) {
  if (!Array.isArray(filas) || filas.length < 4) return [];
  const series = detectarSeriesNumericas(filas);
  const campoDimension = detectarCampoDimension(filas);
  const bloques = [];

  for (const serie of series) {
    const valores = filas
      .map((fila) => ({
        eje: campoDimension ? fila[campoDimension] : fila.EjeX,
        valor: toNumber(fila[serie]),
      }))
      .filter((item) => item.valor !== null);

    if (valores.length < 4) continue;

    const nums = valores.map((item) => item.valor);
    const media = nums.reduce((s, v) => s + v, 0) / nums.length;
    const varianza = nums.reduce((s, v) => s + (v - media) ** 2, 0) / nums.length;
    const desviacion = Math.sqrt(varianza);
    if (desviacion <= 0) continue;

    const anomalias = valores.filter((item) => item.valor > media + 2 * desviacion);
    if (anomalias.length === 0) continue;

    const masExtremo = anomalias.reduce((acc, item) =>
      item.valor > acc.valor ? item : acc, anomalias[0]);
    const sigmas = (masExtremo.valor - media) / desviacion;
    const prioridad = sigmas >= 3 ? 'Alta' : 'Media';
    const ejeNombre = String(masExtremo.eje ?? '');

    bloques.push({
      tipo: 'anomalia',
      categoria: definicion?.titulo || idGrafico,
      titulo: `Comportamiento atípico en ${serie}`,
      detalle_template:
        `${ejeNombre || 'Un elemento'} presenta ${formatearMonto(masExtremo.valor)} en ${serie}. ` +
        `Ese valor está ${sigmas.toFixed(1)} desviaciones por encima del promedio del mismo cursor (${formatearMonto(media)}).`,
      valor: `${sigmas.toFixed(1)} desviaciones`,
      prioridad,
      formula: 'promedio = AVG(serie); desviacion = desviación estándar de la serie; atípico si valor > promedio + (2 * desviacion). Prioridad Alta si supera 3 desviaciones.',
      datos_crudos: {
        grafico: idGrafico,
        serie,
        campo_dimension: campoDimension,
        media,
        desviacion,
        anomalias: anomalias.map((item) => ({
          eje: item.eje,
          valor: item.valor,
          desviaciones: (item.valor - media) / desviacion,
        })),
      },
    });
  }

  return bloques;
}

function normalizarPalabras(etiqueta) {
  return String(etiqueta || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w !== '');
}

function detectarParesAntonimos(claves) {
  const pares = [];
  const usados = new Set();

  for (let i = 0; i < claves.length; i++) {
    if (usados.has(claves[i])) continue;
    const palabrasA = normalizarPalabras(claves[i]);

    for (let j = i + 1; j < claves.length; j++) {
      if (usados.has(claves[j])) continue;
      const palabrasB = normalizarPalabras(claves[j]);

      if (palabrasA.length !== palabrasB.length) continue;

      let diferencias = 0;
      let parDetectado = null;
      for (let k = 0; k < palabrasA.length; k++) {
        if (palabrasA[k] === palabrasB[k]) continue;
        diferencias += 1;
        const par = PARES_ANTONIMOS.find(([a, b]) =>
          (palabrasA[k] === a && palabrasB[k] === b) ||
          (palabrasA[k] === b && palabrasB[k] === a)
        );
        if (par) parDetectado = par;
        else { parDetectado = null; break; }
      }

      if (diferencias === 1 && parDetectado) {
        pares.push({ a: claves[i], b: claves[j], par: parDetectado });
        usados.add(claves[i]);
        usados.add(claves[j]);
        break;
      }
    }
  }

  return pares;
}

function bloquesBrecha(kpisRow) {
  if (!isPlainObject(kpisRow)) return [];
  const claves = Object.keys(kpisRow).filter((k) => toNumber(kpisRow[k]) !== null);
  if (claves.length < 2) return [];

  const pares = detectarParesAntonimos(claves);
  const bloques = [];

  for (const { a, b } of pares) {
    const valorA = toNumber(kpisRow[a]);
    const valorB = toNumber(kpisRow[b]);
    if (valorA === null || valorB === null || valorA === 0) continue;

    const brecha = (valorA - valorB) / Math.abs(valorA);
    if (Math.abs(brecha) < 0.01) continue;

    const prioridad = priorizarPorUmbral(brecha, 0.20, 0.10);
    bloques.push({
      tipo: 'brecha',
      categoria: 'Brechas entre indicadores',
      titulo: `Brecha entre ${a} y ${b}`,
      detalle_template:
        `${a} (${formatearMonto(valorA)}) vs ${b} (${formatearMonto(valorB)}): brecha de ${formatearPorcentaje(brecha)}.`,
      valor: formatearPorcentaje(brecha),
      prioridad,
      formula: `brecha = (${a} - ${b}) / valor_absoluto(${a}). La comparación se basa en pares de KPIs con nombres relacionados detectados por el motor (por ejemplo emitida/cobrada o bruta/neta).`,
      datos_crudos: {
        kpi_a: a,
        kpi_b: b,
        valor_a: valorA,
        valor_b: valorB,
        brecha_pct: brecha,
      },
    });
  }

  return bloques;
}

function regresionLinealSimple(valores) {
  const n = valores.length;
  if (n < 3) return null;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += valores[i];
    sumXY += i * valores[i];
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  const pendiente = (n * sumXY - sumX * sumY) / denom;
  const intercepto = (sumY - pendiente * sumX) / n;
  const proximo = intercepto + pendiente * n;
  const promedio = sumY / n;
  return { pendiente, intercepto, proximo, promedio, n };
}

function bloquesPrediccion(idGrafico, definicion, filas) {
  if (!Array.isArray(filas) || filas.length < 4) return [];
  const tipoGrafico = String(definicion?.itipo_grafico || '').toUpperCase();
  if (!TIPOS_TEMPORALES.has(tipoGrafico)) return [];

  const series = detectarSeriesNumericas(filas);
  const campoDimension = detectarCampoDimension(filas);
  const bloques = [];

  for (const serie of series) {
    const valores = filas
      .map((f) => toNumber(f[serie]))
      .filter((v) => v !== null);
    if (valores.length < 4) continue;

    const reg = regresionLinealSimple(valores);
    if (!reg || !isFiniteNumber(reg.proximo)) continue;
    if (Math.abs(reg.promedio) < 1e-9) continue;

    const variacionPct = (reg.proximo - reg.promedio) / Math.abs(reg.promedio);
    if (Math.abs(variacionPct) < 0.02) continue;

    const direccion = reg.pendiente >= 0 ? 'incremento' : 'reducción';
    const magnitudVariacionPct = Math.abs(variacionPct);
    const prioridad = priorizarPorUmbral(variacionPct, 0.20, 0.10);
    const ejeSiguiente =
      campoDimension && filas[filas.length - 1] && filas[filas.length - 1][campoDimension]
        ? `después de ${filas[filas.length - 1][campoDimension]}`
        : 'en el próximo periodo';

    bloques.push({
      tipo: 'prediccion',
      categoria: definicion?.titulo || idGrafico,
      titulo: `Predicción de ${serie}`,
      detalle_template:
        `Proyección lineal de ${serie} ${ejeSiguiente}: ${formatearMonto(reg.proximo)} ` +
        `(${direccion} de ${formatearPorcentaje(magnitudVariacionPct)} vs promedio histórico ${formatearMonto(reg.promedio)}).`,
      valor: formatearMonto(reg.proximo),
      prioridad,
      formula: 'Regresión lineal simple sobre la serie temporal: y = intercepto + pendiente * x. Es una proyección estadística, no un dato devuelto por el SP.',
      datos_crudos: {
        grafico: idGrafico,
        serie,
        proximo: reg.proximo,
        promedio: reg.promedio,
        pendiente: reg.pendiente,
        n_observaciones: reg.n,
        variacion_pct: variacionPct,
      },
    });
  }

  return bloques;
}

function bloquesIncobrabilidad(graphics, meta) {
  const bloques = [];
  if (!isPlainObject(graphics)) return bloques;

  const definicionesGraficos = Array.isArray(meta?.graficos) ? meta.graficos : [];
  const idsAging = definicionesGraficos
    .filter((g) => /aging/i.test(g.xtitulo_ui || g.titulo || ''))
    .map((g) => g.id_grafico || g.xtitulo_ui);

  for (const id of idsAging) {
    const filas = graphics[id];
    if (!Array.isArray(filas) || filas.length === 0) continue;

    const series = detectarSeriesNumericas(filas);
    const campoDimension = detectarCampoDimension(filas);
    if (!campoDimension || series.length === 0) continue;
    const serie = series[0];

    const total = filas.reduce((s, f) => s + (toNumber(f[serie]) ?? 0), 0);
    if (total <= 0) continue;

    const filaAlto = filas.find((f) =>
      /\+\s*90|>?\s*90|mas de 60|mas de 90/i.test(String(f[campoDimension] ?? ''))
    );
    if (!filaAlto) continue;

    const valorAlto = toNumber(filaAlto[serie]) ?? 0;
    const score = valorAlto / total;
    if (score < 0.15) continue;

    const prioridad = priorizarPorUmbral(score, 0.40, 0.25);
    bloques.push({
      tipo: 'incobrabilidad',
      categoria: 'Riesgo de incobrabilidad',
      titulo: 'Cartera con alto riesgo de incobrabilidad',
      detalle_template:
        `${formatearPorcentaje(score)} de ${serie} (${formatearMonto(valorAlto)}) ` +
        `está en el bucket más antiguo (${filaAlto[campoDimension]}). ` +
        `Score de incobrabilidad ${formatearPorcentaje(score)} sobre el total de ${formatearMonto(total)}.`,
      valor: formatearPorcentaje(score),
      prioridad,
      formula: 'score_incobrabilidad = SUM(monto en bucket +90 días) / SUM(monto total de aging). Umbrales: ≥40% Alta, ≥25% Media, <15% se descarta.',
      datos_crudos: {
        grafico: id,
        serie,
        bucket_alto: filaAlto[campoDimension],
        valor_alto: valorAlto,
        total,
        score_incobrabilidad: score,
      },
    });
  }

  return bloques;
}

function bloquesMoraRecurrente(graphics, meta) {
  const bloques = [];
  if (!isPlainObject(graphics)) return bloques;

  const definicionesGraficos = Array.isArray(meta?.graficos) ? meta.graficos : [];
  const idsMora = definicionesGraficos
    .filter((g) => /mora|vencid|deuda|cliente con mayor/i.test(g.xtitulo_ui || g.titulo || ''))
    .map((g) => g.id_grafico || g.xtitulo_ui);

  const conteos = new Map();

  for (const id of idsMora) {
    const filas = graphics[id];
    if (!Array.isArray(filas) || filas.length === 0) continue;

    const series = detectarSeriesNumericas(filas);
    const campoDimension = detectarCampoDimension(filas);
    if (!campoDimension || series.length === 0) continue;
    const serie = series[0];

    const total = filas.reduce((s, f) => s + (toNumber(f[serie]) ?? 0), 0);
    if (total <= 0) continue;

    for (const fila of filas) {
      const eje = String(fila[campoDimension] ?? '').trim();
      if (eje === '' || /^(N\/A|VIGENTE|COBRADO|SIN PAGO)/i.test(eje)) continue;
      const valor = toNumber(fila[serie]) ?? 0;
      if (valor / total < 0.05) continue;

      const prev = conteos.get(eje) || { ocurrencias: 0, valor: 0, graficos: [] };
      prev.ocurrencias += 1;
      prev.valor += valor;
      prev.graficos.push(id);
      conteos.set(eje, prev);
    }
  }

  for (const [eje, info] of conteos.entries()) {
    if (info.ocurrencias < 2) continue;
    const prioridad = info.ocurrencias >= 3 ? 'Alta' : 'Media';
    bloques.push({
      tipo: 'mora_recurrente',
      categoria: 'Mora recurrente',
      titulo: `${eje} aparece en ${info.ocurrencias} análisis de mora`,
      detalle_template:
        `${eje} concentra mora relevante en ${info.ocurrencias} dimensiones distintas ` +
        `(monto agregado ${formatearMonto(info.valor)}). Patrón de mora recurrente.`,
      valor: `${info.ocurrencias}x`,
      prioridad,
      formula: 'Conteo de gráficos de mora donde el elemento concentra ≥5% del total. Recurrente si ocurrencias ≥2 (≥3 = Alta).',
      datos_crudos: {
        elemento: eje,
        ocurrencias: info.ocurrencias,
        valor_total: info.valor,
        graficos: info.graficos,
      },
    });
  }

  return bloques;
}

function bloquesErroresOperativos(graphics, meta) {
  const bloques = [];
  if (!isPlainObject(graphics)) return bloques;

  const definicionesGraficos = Array.isArray(meta?.graficos) ? meta.graficos : [];
  const idsAnulacion = definicionesGraficos
    .filter((g) => /anulaci/i.test(g.xtitulo_ui || g.titulo || ''))
    .map((g) => g.id_grafico || g.xtitulo_ui);

  for (const id of idsAnulacion) {
    const filas = graphics[id];
    if (!Array.isArray(filas) || filas.length < 2) continue;

    const series = detectarSeriesNumericas(filas);
    const campoDimension = detectarCampoDimension(filas);
    if (!campoDimension || series.length === 0) continue;
    const serie = series[0];

    const valores = filas
      .map((f) => ({ eje: String(f[campoDimension] ?? '').trim(), valor: toNumber(f[serie]) ?? 0 }))
      .filter((x) => x.eje !== '' && x.valor > 0)
      .sort((a, b) => b.valor - a.valor);
    if (valores.length === 0) continue;

    const total = valores.reduce((s, v) => s + v.valor, 0);
    if (total <= 0) continue;

    const top = valores[0];
    const pct = top.valor / total;
    if (pct < 0.5) continue;

    if (/^N\/A$/i.test(top.eje)) {
      bloques.push({
        tipo: 'errores_operativos',
        categoria: 'Errores operativos',
        titulo: 'Motivo de anulación no parametrizado',
        detalle_template:
          `${formatearPorcentaje(pct)} del monto anulado en "${id}" no tiene motivo asignado (N/A). ` +
          `Solicitar al área operativa parametrizar el motivo de anulación para diagnóstico de errores.`,
        valor: formatearPorcentaje(pct),
        prioridad: 'Alta',
        formula: 'pct_na = SUM(monto sin motivo) / SUM(monto anulado total). Umbral de alerta: pct_na ≥ 50%.',
        datos_crudos: { grafico: id, total, valor_na: top.valor, pct_na: pct },
      });
      continue;
    }

    bloques.push({
      tipo: 'errores_operativos',
      categoria: 'Errores operativos',
      titulo: `Causa dominante de anulación: ${top.eje}`,
      detalle_template:
        `"${top.eje}" concentra ${formatearPorcentaje(pct)} del monto anulado en "${id}" ` +
        `(${formatearMonto(top.valor)} de ${formatearMonto(total)}). Posible patrón operativo recurrente.`,
      valor: formatearPorcentaje(pct),
      prioridad: pct >= 0.7 ? 'Alta' : 'Media',
      formula: 'pct_dominante = SUM(monto del top motivo) / SUM(monto anulado total). Reportar si pct ≥50%; Alta si ≥70%.',
      datos_crudos: { grafico: id, dimension_top: top.eje, valor_top: top.valor, total, pct },
    });
  }

  return bloques;
}

function normalizarClaveAnalitica(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function obtenerNumeroKpi(kpisRow, aliases) {
  if (!isPlainObject(kpisRow)) return null;
  const aliasSet = new Set((Array.isArray(aliases) ? aliases : [aliases]).map(normalizarClaveAnalitica));
  for (const [clave, valor] of Object.entries(kpisRow)) {
    if (!aliasSet.has(normalizarClaveAnalitica(clave))) continue;
    const numero = toNumber(valor);
    if (numero !== null) return numero;
  }
  return null;
}

function esContextoRecibos(kpisRow, graphics, meta) {
  const kpiRecibos = (
    obtenerNumeroKpi(kpisRow, ['prima_emitida']) !== null
    || obtenerNumeroKpi(kpisRow, ['prima_exigible']) !== null
    || obtenerNumeroKpi(kpisRow, ['cartera_vencida']) !== null
  );
  const graphIds = new Set(Object.keys(isPlainObject(graphics) ? graphics : {}));
  const metaIds = new Set(
    (Array.isArray(meta?.graficos) ? meta.graficos : []).map((grafico) => grafico.id_grafico || grafico.xtitulo_ui),
  );
  return kpiRecibos || graphIds.has('emitido_cobrado_vencido') || metaIds.has('emitido_cobrado_vencido');
}

function detectarSeriePorAlias(filas, aliases) {
  const series = detectarSeriesNumericas(filas);
  if (series.length === 0) return null;
  const aliasSet = new Set((Array.isArray(aliases) ? aliases : [aliases]).map(normalizarClaveAnalitica));
  return series.find((serie) => aliasSet.has(normalizarClaveAnalitica(serie))) || series[0];
}

function topDimensionInsight(idGrafico, titulo, subtitulo, filas, aliasesSerie) {
  if (!Array.isArray(filas) || filas.length === 0) return null;
  const campoDimension = detectarCampoDimension(filas);
  const serie = detectarSeriePorAlias(filas, aliasesSerie);
  if (!campoDimension || !serie) return null;

  const valores = filas
    .map((fila) => ({
      eje: String(fila[campoDimension] ?? '').trim(),
      valor: toNumber(fila[serie]) ?? 0,
    }))
    .filter((item) => item.eje !== '' && item.valor > 0)
    .sort((a, b) => b.valor - a.valor);

  if (valores.length === 0) return null;

  const total = valores.reduce((sum, item) => sum + item.valor, 0);
  if (total <= 0) return null;

  const top = valores[0];
  const share = top.valor / total;

  return {
    tipo: 'concentracion',
    categoria: titulo,
    titulo: `${top.eje} lidera ${subtitulo}`,
    detalle_template:
      `${top.eje} concentra ${formatearPorcentaje(share)} del total de ${serie} ` +
      `(${formatearMonto(top.valor)} de ${formatearMonto(total)}).`,
    valor: formatearPorcentaje(share),
    prioridad: priorizarPorUmbral(share, 0.40, 0.20),
    formula: `participacion = valor_top / total_${serie}.`,
    datos_crudos: {
      grafico: idGrafico,
      serie,
      dimension_top: top.eje,
      valor_top: top.valor,
      total,
      pct: share,
      top_elementos: valores.slice(0, 5).map((item) => ({
        eje: item.eje,
        valor: item.valor,
        pct: item.valor / total,
      })),
    },
  };
}

function buildBloquesRecibos({ kpisRow, graphics }) {
  const bloques = [];
  const primaEmitida = obtenerNumeroKpi(kpisRow, ['prima_emitida']);
  const primaCobrada = obtenerNumeroKpi(kpisRow, ['prima_cobrada']);
  const primaPendiente = obtenerNumeroKpi(kpisRow, ['prima_pendiente', 'cartera_pendiente']);
  const primaExigible = obtenerNumeroKpi(kpisRow, ['prima_exigible']);
  const carteraVencida = obtenerNumeroKpi(kpisRow, ['cartera_vencida']);
  const eficienciaCobro = obtenerNumeroKpi(kpisRow, ['eficiencia_cobro', 'eficiencia']);
  const porcentajeVencida = obtenerNumeroKpi(kpisRow, ['porcentaje_cartera_vencida', 'pct_cartera_vencida']);

  if (
    primaEmitida !== null
    || primaCobrada !== null
    || primaPendiente !== null
    || primaExigible !== null
    || carteraVencida !== null
  ) {
    bloques.push({
      tipo: 'resumen',
      categoria: 'Cobranza del periodo',
      titulo: 'Panorama de cobranzas',
      detalle_template:
        `Emitido ${formatearMonto(primaEmitida ?? 0)}, cobrado ${formatearMonto(primaCobrada ?? 0)}, ` +
        `pendiente ${formatearMonto(primaPendiente ?? 0)}, exigible ${formatearMonto(primaExigible ?? 0)} ` +
        `y vencido ${formatearMonto(carteraVencida ?? 0)}.`,
      valor: eficienciaCobro !== null ? formatearPorcentaje(eficienciaCobro, 2) : undefined,
      prioridad: priorizarPorUmbral(porcentajeVencida ?? 0, 0.25, 0.10),
      formula: 'Resumen directo de los KPIs devueltos por el cursor de recibos.',
      datos_crudos: {
        cifras: {
          prima_emitida: primaEmitida,
          prima_cobrada: primaCobrada,
          prima_pendiente: primaPendiente,
          prima_exigible: primaExigible,
          cartera_vencida: carteraVencida,
          eficiencia_cobro: eficienciaCobro,
          porcentaje_cartera_vencida: porcentajeVencida,
        },
      },
    });
  }

  if (primaExigible !== null && primaCobrada !== null && primaExigible > 0) {
    const brechaMonto = primaExigible - primaCobrada;
    const brechaPct = brechaMonto / primaExigible;
    bloques.push({
      tipo: 'brecha',
      categoria: 'Cobro vs exigible',
      titulo: brechaMonto >= 0 ? 'Brecha de cobro pendiente' : 'Cobro por encima de lo exigible',
      detalle_template:
        `La diferencia entre lo exigible (${formatearMonto(primaExigible)}) y lo cobrado (${formatearMonto(primaCobrada)}) ` +
        `es ${formatearMonto(Math.abs(brechaMonto))}, equivalente a ${formatearPorcentaje(Math.abs(brechaPct), 2)} del exigible.`,
      valor: formatearPorcentaje(Math.abs(brechaPct), 2),
      prioridad: priorizarPorUmbral(Math.abs(brechaPct), 0.20, 0.10),
      formula: 'brecha_cobro = (prima_exigible - prima_cobrada) / prima_exigible.',
      datos_crudos: {
        kpi_a: 'prima_exigible',
        kpi_b: 'prima_cobrada',
        valor_a: primaExigible,
        valor_b: primaCobrada,
        brecha_pct: brechaPct,
        brecha_monto: brechaMonto,
      },
    });
  }

  if (primaPendiente !== null && primaEmitida !== null && primaEmitida > 0) {
    const sharePendiente = primaPendiente / primaEmitida;
    bloques.push({
      tipo: 'brecha',
      categoria: 'Saldo pendiente',
      titulo: 'Prima pendiente sobre lo emitido',
      detalle_template:
        `La prima pendiente asciende a ${formatearMonto(primaPendiente)}, equivalente a ` +
        `${formatearPorcentaje(sharePendiente, 2)} de la prima emitida (${formatearMonto(primaEmitida)}).`,
      valor: formatearPorcentaje(sharePendiente, 2),
      prioridad: priorizarPorUmbral(sharePendiente, 0.30, 0.15),
      formula: 'pct_pendiente = prima_pendiente / prima_emitida.',
      datos_crudos: {
        kpi_a: 'prima_emitida',
        kpi_b: 'prima_pendiente',
        valor_a: primaEmitida,
        valor_b: primaPendiente,
        brecha_pct: sharePendiente,
      },
    });
  }

  if (primaExigible !== null && carteraVencida !== null && primaExigible > 0) {
    const riesgoMora = porcentajeVencida ?? (carteraVencida / primaExigible);
    bloques.push({
      tipo: 'anomalia',
      categoria: 'Riesgo de mora',
      titulo: carteraVencida > 0 ? 'Cartera vencida dentro del exigible' : 'Sin cartera vencida relevante',
      detalle_template:
        carteraVencida > 0
          ? `De ${formatearMonto(primaExigible)} exigibles, ${formatearMonto(carteraVencida)} ya están vencidos. ` +
            `Eso representa ${formatearPorcentaje(riesgoMora, 2)} del exigible.`
          : `No se detecta cartera vencida con impacto material sobre lo exigible del periodo.`,
      valor: formatearPorcentaje(riesgoMora, 2),
      prioridad: priorizarPorUmbral(riesgoMora, 0.25, 0.10),
      formula: 'riesgo_mora = cartera_vencida / prima_exigible.',
      datos_crudos: {
        prima_exigible: primaExigible,
        cartera_vencida: carteraVencida,
        riesgo_mora: riesgoMora,
      },
    });
  }

  const seriePeriodo = Array.isArray(graphics?.emitido_cobrado_vencido)
    ? graphics.emitido_cobrado_vencido
    : [];
  if (seriePeriodo.length >= 1) {
    const campoDimension = detectarCampoDimension(seriePeriodo);
    const serieEmitido = detectarSeriePorAlias(seriePeriodo, ['emitido', 'monto_emitido', 'prima_emitida']);
    const serieCobrado = detectarSeriePorAlias(seriePeriodo, ['cobrado', 'monto_cobrado', 'prima_cobrada']);
    const serieVencido = detectarSeriePorAlias(seriePeriodo, ['vencido', 'monto_vencido', 'cartera_vencida']);
    const ultimaFila = seriePeriodo[seriePeriodo.length - 1];
    const previo = seriePeriodo.length > 1 ? seriePeriodo[seriePeriodo.length - 2] : null;
    const emitidoUltimo = serieEmitido ? toNumber(ultimaFila?.[serieEmitido]) : null;
    const cobradoUltimo = serieCobrado ? toNumber(ultimaFila?.[serieCobrado]) : null;
    const vencidoUltimo = serieVencido ? toNumber(ultimaFila?.[serieVencido]) : null;
    const emitidoPrevio = serieEmitido && previo ? toNumber(previo[serieEmitido]) : null;
    const periodo = campoDimension ? ultimaFila?.[campoDimension] : 'último periodo';
    const deltaEmitido = emitidoUltimo !== null && emitidoPrevio !== null && emitidoPrevio !== 0
      ? (emitidoUltimo - emitidoPrevio) / Math.abs(emitidoPrevio)
      : null;

    bloques.push({
      tipo: 'tendencia',
      categoria: 'Serie mensual',
      titulo: `Lectura del periodo ${periodo ?? 'actual'}`,
      detalle_template:
        `En ${periodo ?? 'el último periodo'} se observan emitido ${formatearMonto(emitidoUltimo ?? 0)}, ` +
        `cobrado ${formatearMonto(cobradoUltimo ?? 0)} y vencido ${formatearMonto(vencidoUltimo ?? 0)}` +
        `${deltaEmitido !== null ? `. Frente al periodo previo, el emitido varió ${formatearPorcentaje(deltaEmitido, 2)}.` : '.'}`,
      valor: emitidoUltimo !== null ? formatearMonto(emitidoUltimo) : undefined,
      prioridad: deltaEmitido !== null ? priorizarPorUmbral(deltaEmitido, 0.20, 0.10) : 'Media',
      formula: 'Lectura puntual del último registro del cursor emitido_cobrado_vencido, con comparación contra el periodo previo cuando existe.',
      datos_crudos: {
        grafico: 'emitido_cobrado_vencido',
        periodo,
        emitido_ultimo: emitidoUltimo,
        cobrado_ultimo: cobradoUltimo,
        vencido_ultimo: vencidoUltimo,
        delta_emitido_pct: deltaEmitido,
      },
    });
  }

  const bloqueCanal = topDimensionInsight(
    'mora_canal',
    'Mora por canal',
    'la mora por canal',
    graphics?.mora_canal,
    ['monto_total', 'mora', 'monto_recibo'],
  );
  if (bloqueCanal) bloques.push(bloqueCanal);

  const bloqueProducto = topDimensionInsight(
    'mora_producto',
    'Mora por producto',
    'la mora por producto',
    graphics?.mora_producto,
    ['monto_total', 'mora', 'monto_recibo'],
  );
  if (bloqueProducto) bloques.push(bloqueProducto);

  const bloqueProductor = topDimensionInsight(
    'eficiencia_productor',
    'Cobro por productor',
    'el cobro por productor',
    graphics?.eficiencia_productor,
    ['monto_total', 'monto_cobrado', 'prima_cobrada'],
  );
  if (bloqueProductor) bloques.push(bloqueProductor);

  return bloques;
}

function buildBloques({ kpis, graphics, meta }) {
  const bloques = [];

  const kpisRow = Array.isArray(kpis) && kpis.length > 0 ? kpis[0] : null;

  if (esContextoRecibos(kpisRow, graphics, meta)) {
    const bloquesRecibos = buildBloquesRecibos({ kpisRow, graphics, meta });
    const ordenPrioridad = { Alta: 0, Media: 1, Baja: 2 };
    bloquesRecibos.sort((a, b) =>
      (ordenPrioridad[a.prioridad] ?? 9) - (ordenPrioridad[b.prioridad] ?? 9)
    );
    return bloquesRecibos;
  }

  const resumen = bloqueResumen(kpisRow);
  if (resumen) bloques.push(resumen);

  if (kpisRow) bloques.push(...bloquesBrecha(kpisRow));

  if (isPlainObject(graphics)) {
    const definicionesGraficos = Array.isArray(meta?.graficos) ? meta.graficos : [];
    const definicionPorId = new Map(
      definicionesGraficos.map((g) => [g.id_grafico || g.xtitulo_ui, g])
    );

    for (const [idGrafico, filas] of Object.entries(graphics)) {
      const definicion = definicionPorId.get(idGrafico) || null;
      const tipoGrafico = String(definicion?.itipo_grafico || '').toUpperCase();

      if (TIPOS_TEMPORALES.has(tipoGrafico)) {
        bloques.push(...bloquesTendencia(idGrafico, definicion, filas));
        bloques.push(...bloquesAnomalia(idGrafico, definicion, filas));
      } else if (TIPOS_DIMENSIONALES.has(tipoGrafico)) {
        bloques.push(...bloquesConcentracion(idGrafico, definicion, filas));
        bloques.push(...bloquesAnomalia(idGrafico, definicion, filas));
      } else {
        bloques.push(...bloquesConcentracion(idGrafico, definicion, filas));
      }
    }

    bloques.push(...bloquesIncobrabilidad(graphics, meta));
    bloques.push(...bloquesMoraRecurrente(graphics, meta));
    bloques.push(...bloquesErroresOperativos(graphics, meta));
  }

  const ordenPrioridad = { Alta: 0, Media: 1, Baja: 2 };
  bloques.sort((a, b) =>
    (ordenPrioridad[a.prioridad] ?? 9) - (ordenPrioridad[b.prioridad] ?? 9)
  );

  return bloques;
}

function bloqueAInsight(bloque) {
  const insight = {
    tipo: bloque.tipo,
    categoria: bloque.categoria,
    titulo: bloque.titulo,
    detalle: bloque.detalle_template,
    valor: bloque.valor || undefined,
    prioridad: bloque.prioridad,
    formula: bloque.formula || undefined,
    origen_datos: bloque.origen_datos || describirFuenteDatos(bloque.datos_crudos),
    metodologia: bloque.metodologia || bloque.formula || undefined,
    datos_base: bloque.datos_base || resumirDatosCrudos(bloque.datos_crudos),
  };

  // Exponer los elementos top de concentraciones para mostrarlos en UI
  if (bloque.tipo === 'concentracion' && Array.isArray(bloque.datos_crudos?.top_elementos)) {
    insight.top_elementos = bloque.datos_crudos.top_elementos.map((e) => ({
      nombre: e.eje,
      valor: e.valor,
      pct: e.pct,
    }));
  }

  return insight;
}

export { buildBloques, bloqueAInsight };
