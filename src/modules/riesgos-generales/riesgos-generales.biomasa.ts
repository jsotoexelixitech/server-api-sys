// Proyección contractual de biomasa (Anexo I y 3.4 del condicionado de biomasa ganadera): curva por escalones, días por
// estación, engorde esperado y retención de la cobertura A. Pura, sin BD. El déficit no se calcula aquí: se conoce en el siniestro.

import { sumarMeses, type DatoBien } from './riesgos-generales.calculo';

export interface EscalonCurva {
  /** Peso promedio desde el que aplica el escalón, en kg. */
  desde: number;
  /** Ganancia diaria contractual, en kg por animal y día. */
  gdbce: number;
}

export interface ParametrosBiomasa {
  /** Escalones en orden ascendente; rige el escalón inferior alcanzado. */
  curva: EscalonCurva[];
  meses_bloque: number;
  /** Invierno como MMDD, ambos inclusive; el resto del año es verano. */
  invierno_desde: number;
  invierno_hasta: number;
  retencion_verano: number;
  retencion_invierno: number;
  /** Peso inicial individual máximo: un promedio mayor implica unidades inelegibles. */
  peso_maximo_ingreso: number;
}

/** Valores del condicionado: Anexo I, 2.5 y 3.4. */
export const PARAMETROS_CONDICIONADO: ParametrosBiomasa = {
  curva: [
    { desde: 180, gdbce: 0.194 },
    { desde: 220, gdbce: 0.237 },
    { desde: 260, gdbce: 0.28 },
    { desde: 320, gdbce: 0.345 },
    { desde: 380, gdbce: 0.41 },
  ],
  meses_bloque: 6,
  invierno_desde: 522,
  invierno_hasta: 1007,
  retencion_verano: 0.4,
  retencion_invierno: 0.2,
  peso_maximo_ingreso: 350,
};

export interface EntradaBiomasa {
  cantidad_animales: number;
  peso_promedio: number;
  /** Fecha de certificación inicial, YYYY-MM-DD. */
  fecha_inicio: string;
  horizonte_meses: number;
  /** B0 en kg (calculo.unidades). */
  b0: number;
  /** PKC (calculo.valor_unidad). */
  precio_kg: number;
  lote?: string;
  ihl?: string;
}

export interface BloqueBiomasa {
  bloque: number;
  fecha_desde: string;
  /** Excluida del bloque: es el primer día del siguiente. */
  fecha_hasta: string;
  peso_promedio_inicio: number;
  gdbce: number;
  dias: number;
  dias_verano: number;
  dias_invierno: number;
}

export interface ResultadoBiomasa {
  lote: string | null;
  ihl: string | null;
  cantidad_animales: number;
  peso_promedio: number;
  fecha_inicio: string;
  fecha_cierre: string;
  horizonte_meses: number;
  b0: number;
  precio_kg: number;
  suma_inicial: number;
  dias: number;
  dias_verano: number;
  dias_invierno: number;
  bloques: BloqueBiomasa[];
  /** Gv, en kg. */
  engorde_verano: number;
  /** Gi, en kg. */
  engorde_invierno: number;
  /** Gexp,t = Gv + Gi, en kg. */
  engorde_esperado: number;
  /** Bexp,t = B0 + Gexp,t, en kg. */
  biomasa_esperada: number;
  /** RA = 0,40 × Gv + 0,20 × Gi, en kg. */
  retencion_a: number;
  /** Uciclo = RA / Gexp,t, en forma decimal. */
  umbral_ciclo: number;
}

const DIA_MS = 86400000;
const ETIQUETA_LOTE = 'Lote Gan. Cert.';
const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;
const r6 = (n: number) => Math.round((n + Number.EPSILON) * 1e6) / 1e6;
const ymd = (d: Date) => d.toISOString().split('T')[0];

function esInvierno(dia: Date, p: ParametrosBiomasa): boolean {
  const mmdd = (dia.getUTCMonth() + 1) * 100 + dia.getUTCDate();
  return mmdd >= p.invierno_desde && mmdd <= p.invierno_hasta;
}

/**
 * Proyecta la biomasa hasta `fecha_cierre` (por defecto, inicio + horizonte), incluyendo el día inicial y excluyendo
 * el de cierre (3.4). La tasa de cada bloque sale del promedio proyectado con las tasas y días de los bloques
 * anteriores (Anexo I). Devuelve errores legibles en lugar de lanzar, igual que calcularCoberturas.
 */
export function calcularBiomasa(
  e: EntradaBiomasa,
  fecha_cierre?: string,
  p: ParametrosBiomasa = PARAMETROS_CONDICIONADO,
): { biomasa: ResultadoBiomasa | null; errores: string[] } {
  const errores: string[] = [];
  if (Math.abs(e.b0 / e.cantidad_animales - e.peso_promedio) > 0.005 + 1e-9) {
    errores.push(`El peso promedio ${e.peso_promedio} no coincide con B0 / animales (${r3(e.b0 / e.cantidad_animales)}).`);
  }
  if (e.peso_promedio < p.curva[0].desde) {
    errores.push(`Un peso promedio menor a ${p.curva[0].desde} kg requiere asignación expresa de escalón antes de la vigencia (Anexo I).`);
  }
  if (e.peso_promedio > p.peso_maximo_ingreso) {
    errores.push(`El peso promedio supera el tope de ingreso de ${p.peso_maximo_ingreso} kg por unidad (2.5).`);
  }
  if (errores.length) return { biomasa: null, errores };

  const inicio = new Date(`${e.fecha_inicio}T00:00:00Z`);
  const cierre = fecha_cierre ? new Date(`${fecha_cierre}T00:00:00Z`) : sumarMeses(inicio, e.horizonte_meses);
  const bloques: BloqueBiomasa[] = [];
  let promedio = e.peso_promedio;
  let gv = 0;
  let gi = 0;

  for (let k = 0; ; k++) {
    const desde = sumarMeses(inicio, k * p.meses_bloque);
    if (desde >= cierre) break;
    const fin = sumarMeses(inicio, (k + 1) * p.meses_bloque);
    const hasta = fin < cierre ? fin : cierre;
    const { gdbce } = [...p.curva].reverse().find((c) => promedio >= c.desde)!;
    let dias_verano = 0;
    let dias_invierno = 0;
    for (let t = desde.getTime(); t < hasta.getTime(); t += DIA_MS) {
      if (esInvierno(new Date(t), p)) dias_invierno++;
      else dias_verano++;
    }
    const dias = dias_verano + dias_invierno;
    bloques.push({
      bloque: k + 1, fecha_desde: ymd(desde), fecha_hasta: ymd(hasta), peso_promedio_inicio: r3(promedio), gdbce,
      dias, dias_verano, dias_invierno,
    });
    gv += e.cantidad_animales * gdbce * dias_verano;
    gi += e.cantidad_animales * gdbce * dias_invierno;
    promedio = r6(promedio + gdbce * dias);
  }

  const engorde_esperado = r3(gv + gi);
  const retencion_a = r3(p.retencion_verano * gv + p.retencion_invierno * gi);
  return {
    errores: [],
    biomasa: {
      lote: normalizarLote(e.lote) || null,
      ihl: e.ihl?.trim() || null,
      cantidad_animales: e.cantidad_animales,
      peso_promedio: e.peso_promedio,
      fecha_inicio: e.fecha_inicio,
      fecha_cierre: ymd(cierre),
      horizonte_meses: e.horizonte_meses,
      b0: e.b0,
      precio_kg: e.precio_kg,
      suma_inicial: Math.round(e.b0 * e.precio_kg * 100) / 100,
      dias: bloques.reduce((s, b) => s + b.dias, 0),
      dias_verano: bloques.reduce((s, b) => s + b.dias_verano, 0),
      dias_invierno: bloques.reduce((s, b) => s + b.dias_invierno, 0),
      bloques,
      engorde_verano: r3(gv),
      engorde_invierno: r3(gi),
      engorde_esperado,
      biomasa_esperada: r3(e.b0 + engorde_esperado),
      retencion_a,
      umbral_ciclo: engorde_esperado > 0 ? r6(retencion_a / engorde_esperado) : 0,
    },
  };
}

/**
 * 20000 → 20.000; 3523.3 → 3.523,3; con `fijo`, 2.5 → 2,50. Sin locale, para que el texto de la póliza no dependa del
 * ICU del servidor.
 */
export function numeroVe(n: number, decimales = 2, fijo = false): string {
  const [entero, resto] = n.toFixed(decimales).split('.');
  const miles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const fraccion = fijo ? resto : (resto ?? '').replace(/0+$/, '');
  return fraccion ? `${miles},${fraccion}` : miles;
}

/** Forma canónica del lote: la que se graba y la que se compara. Trata los espacios igual que componerDatosBien. */
export function normalizarLote(lote: string | null | undefined): string {
  return String(lote ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
}

/**
 * Patrón LIKE (ESCAPE '!') del lote en xdescrip3, en mayúsculas. datosBienBiomasa lo pone siempre de primero y al emitir
 * le sigue el IHL, así que se ancla al inicio y exige el `;` final: LT-1 no coincide con LT-10.
 */
export function patronLote(lote: string): string {
  return `${ETIQUETA_LOTE.toUpperCase()}: ${normalizarLote(lote).replace(/[!%_[]/g, '!$&')};%`;
}

/** Datos del bien para la póliza, en orden de prioridad: si no caben en 500 caracteres, se pierden los últimos. */
export function datosBienBiomasa(b: ResultadoBiomasa, cmoneda: string): DatoBien[] {
  const retencion = `40% Gv ${numeroVe(b.engorde_verano)} + 20% Gi ${numeroVe(b.engorde_invierno)} = ${numeroVe(b.retencion_a)} kg`;
  const datos: DatoBien[] = [
    { etiqueta: 'Unid. Computables', valor: `${numeroVe(b.cantidad_animales)} animales, prom. ${numeroVe(b.peso_promedio)} kg` },
    { etiqueta: 'Biomasa Aseg. Ini. (B0)', valor: `${numeroVe(b.b0)} kg` },
    { etiqueta: 'Biomasa Gan. Cert.', valor: `${numeroVe(b.b0)} kg` },
    { etiqueta: 'Precio Kg Contr.', valor: `${cmoneda} ${numeroVe(b.precio_kg, 2, true)}` },
    { etiqueta: 'Horizonte Contr.', valor: `${b.horizonte_meses} meses` },
    { etiqueta: 'Curva Contr. kg/animal/dia', valor: b.bloques.map((x) => numeroVe(x.gdbce, 3, true)).join(' / ') },
    { etiqueta: 'Engorde esperado', valor: `${numeroVe(b.engorde_esperado)} kg` },
    { etiqueta: 'Deducible engorde', valor: retencion },
    { etiqueta: 'Biomasa esperada', valor: `${numeroVe(b.biomasa_esperada)} kg` },
  ];
  if (b.ihl) datos.unshift({ etiqueta: 'Ind. Homog. Lote (IHL)', valor: b.ihl });
  if (b.lote) datos.unshift({ etiqueta: ETIQUETA_LOTE, valor: b.lote });
  return datos;
}
