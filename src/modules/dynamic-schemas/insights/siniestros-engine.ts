// @ts-nocheck
/**
 * siniestrosEngine.js
 * 
 * Motor de evaluación y pre-procesamiento para Siniestros (Fase I).
 * Este motor se encarga de calcular scores de riesgo y fraude basándose en reglas duras,
 * antes de enviar los datos al servicio de IA (siniestrosIAService) para su interpretación.
 */

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

/**
 * Evalúa un siniestro individual aplicando reglas de negocio configurables
 * para generar un risk_score y detectar posibles banderas rojas.
 * 
 * @param {Object} siniestro - Objeto con los datos del siniestro
 * @returns {Object} Evaluación de riesgo
 */
function evaluarRiesgoSiniestro(siniestro) {
  let riskScore = 0;
  let fraudScore = 0;
  const razones = [];
  
  const monto = toNumber(siniestro.monto) || toNumber(siniestro.monto_reclamado) || toNumber(siniestro.total);

  // 1. Reglas basadas en el MONTO
  if (monto !== null) {
    if (monto > 500000) {
      riskScore += 40;
      razones.push(`Monto del siniestro atípicamente alto (${monto})`);
    } else if (monto > 100000) {
      riskScore += 20;
      razones.push(`Monto del siniestro elevado (${monto})`);
    }
  }

  // 2. Reglas basadas en FRECUENCIA HISTÓRICA (si existe el dato)
  const frecuencia = toNumber(siniestro.frecuencia_historica) || toNumber(siniestro.siniestros_previos) || 0;
  if (frecuencia >= 3) {
    fraudScore += 40;
    riskScore += 30;
    razones.push(`Alta frecuencia: el asegurado presenta ${frecuencia} siniestros previos recientes`);
  }

  // 3. Reglas basadas en RESULTADO DE FRAUDE PREVIO (banderas operativas)
  if (siniestro.marca_fraude === true || siniestro.alerta_operativa === true) {
    fraudScore += 60;
    riskScore += 50;
    razones.push("Banderas de posible fraude o anomalía detectadas en operaciones");
  }
  
  // 4. Reglas basadas en el TIPO de Siniestro (ejemplo genérico)
  const tipo = String(siniestro.tipo || siniestro.cobertura || '').toLowerCase();
  if (tipo.includes('robo') || tipo.includes('pérdida total')) {
    riskScore += 15;
    fraudScore += 10;
    razones.push(`La cobertura involucrada (${tipo}) históricamente presenta mayor propensión a fraude`);
  }

  // Normalizar scores al 100%
  riskScore = Math.min(riskScore, 100);
  fraudScore = Math.min(fraudScore, 100);

  // Calcular Nivel de Riesgo General
  let nivelRiesgo = 'Bajo';
  if (riskScore >= 70 || fraudScore >= 50) {
    nivelRiesgo = 'Alto';
  } else if (riskScore >= 30) {
    nivelRiesgo = 'Medio';
  }

  return {
    id_referencia: siniestro.id || siniestro.referencia || 'N/A',
    fraud_score: fraudScore,
    risk_score: riskScore,
    nivel_riesgo: nivelRiesgo,
    razones_explicables: razones
  };
}

/**
 * Pre-procesa un conjunto de datos (ej. devuelto por un SP) agregándole el análisis de riesgo
 * antes de pasarlo a Gemini.
 * 
 * @param {Array|Object} datosCrudos - Datos provenientes de la BD o del reporte
 * @returns {Array|Object} Datos enriquecidos con scores
 */
function preprocesarDatosSiniestros(datosCrudos) {
  if (!datosCrudos) return null;

  // Si recibimos un arreglo (ej. lista de siniestros detallados o top siniestros)
  if (Array.isArray(datosCrudos)) {
    return datosCrudos.map(item => {
      // Evitamos intentar puntuar filas de KPIs globales, solo puntuamos si parece un siniestro
      if (item.id || item.referencia || item.monto || item.tipo) {
        return {
          ...item,
          analisis_motor: evaluarRiesgoSiniestro(item)
        };
      }
      return item;
    });
  }

  // Si recibimos un objeto estructurado (ej. kpis, graficos, listados)
  if (typeof datosCrudos === 'object' && !Array.isArray(datosCrudos)) {
    const datosEnriquecidos = { ...datosCrudos };
    
    // Supongamos que hay una propiedad "detalle" o "lista_siniestros"
    for (const key of Object.keys(datosEnriquecidos)) {
      if (Array.isArray(datosEnriquecidos[key])) {
        datosEnriquecidos[key] = datosEnriquecidos[key].map(item => {
          if (item.id || item.referencia || item.monto) {
            return {
              ...item,
              analisis_motor: evaluarRiesgoSiniestro(item)
            };
          }
          return item;
        });
      }
    }
    return datosEnriquecidos;
  }

  return datosCrudos;
}

export { evaluarRiesgoSiniestro, preprocesarDatosSiniestros };
