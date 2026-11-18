// Revisión «¿se puede emitir?» de un plan (solo lectura). Función pura: el service junta los datos de Sis2000
// y aquí se arman los ítems con su nivel y la sección del configurador a la que llevan.

import { avisosTramosAntiguedad, esCasco, validarTramosAntiguedad, type TramoAntiguedad } from './configurador.auto';
import { SP_UNEN_ARANCEL, duplicadosLlave, duplicadosVigentes, type FilaArancel } from './configurador.comisiones';
import type { FamiliaRamo } from './configurador.familia';
import { revisarFase2, type DatosRevisionFase2 } from './configurador-revision-fase2';

export type NivelRevision = 'error' | 'aviso' | 'ok';

export interface ItemRevision {
  codigo: string;
  nivel: NivelRevision;
  mensaje: string;
  /** Sección del configurador; 'plan' = ficha del plan (cabecera, producto). */
  seccion: string;
}

export interface RevisionPlan {
  familia: FamiliaRamo;
  listo: boolean;
  items: ItemRevision[];
}

export interface CoberturaRevision {
  ccobertura: string;
  ctarifa: string;
  /** Existe en matarifa (cramo, ccober, ctarifa). */
  tarifaExiste: boolean;
  /** Filas 'V' en matarifa_d para (cramo, ccober, ctarifa). */
  detallesV: number;
  ccontrea: number | null;
  cramorea: number | null;
  /** Equivalente en el ramo 18 (null = sin equivalente). */
  cob18: number | null;
}

export interface DatosRevision {
  cramo: number;
  cplan: string;
  familia: FamiliaRamo;
  /**
   * Tabla de cabecera donde se revisa el plan. Por defecto la de la familia (maplanes_per en personas); en un ramo
   * mixto (p. ej. 25: PAS en maplanes y VIAJE en maplanes_per) el service la toma de donde está el plan.
   */
  tablaPlan?: 'maplanes' | 'maplanes_per';
  /** Cabeceras del plan en maplanes / maplanes_per (todas las versiones). */
  cabeceras: Array<{ tabla: 'maplanes' | 'maplanes_per'; iestado: string | null; cproducto: string | null }>;
  /** Otros ramos donde existe el mismo cplan. */
  ramosConMismoPlan: number[];
  /** cproducto existe en maproductos. */
  productoExiste: boolean;
  coberturas: CoberturaRevision[];
  /** Filas 'V' de maarancel del ramo (todas las de cualquier plan, para ver duplicados). */
  aranceles: FilaArancel[];
  /** ifrecuencia de maplanes_frec con iestado 'V'. */
  frecuenciasV: string[];
  /** Filas de mausuplan con itipouso 'A'. */
  usuariosPermitidos: number;
  auto?: {
    paresTipoUso: number;
    paresEnOtrosRamos: Array<{ ctipo: number; ccategotr: number; ramos: number[] }>;
    /** Tramos 'V' de maplantar_ano del plan. */
    tasasAntiguedad: Array<TramoAntiguedad & { ccober: string; ctarifa: string }>;
  };
  /** Fase 2: edades (personas), descuentos y recargos (patrimonial) e insramo. */
  fase2?: DatosRevisionFase2;
}

/**
 * Letras de frecuencia que los SP entienden (A/E=1, S=2, C=3, T=4, M=12, K=4 postpago solo auto, D = por días /
 * binacional). En Sis2000_QA hay 'V': A, S, M, T, D, E, K y una 's' minúscula.
 */
const LETRAS_FRECUENCIA = ['A', 'S', 'T', 'C', 'M', 'E', 'K', 'D'];

export function revisarPlan(d: DatosRevision): RevisionPlan {
  const items: ItemRevision[] = [];
  const add = (codigo: string, nivel: NivelRevision, mensaje: string, seccion: string) => items.push({ codigo, nivel, mensaje, seccion });
  const plan = d.cplan.trim();
  const fin = () => ({ familia: d.familia, listo: !items.some((i) => i.nivel === 'error'), items });

  // ── Cabecera del plan ──
  const tablaEsperada = d.tablaPlan ?? (d.familia === 'personas' ? 'maplanes_per' : 'maplanes');
  const propias = d.cabeceras.filter((c) => c.tabla === tablaEsperada);
  if (!d.cabeceras.length) {
    add('PLAN_NO_EXISTE', 'error', `El plan ${plan} no existe en el ramo ${d.cramo} (ni en maplanes ni en maplanes_per).`, 'plan');
    return fin();
  }
  if (!propias.length) {
    add('PLAN_TABLA_FAMILIA', 'error', `El ramo es de ${d.familia} y el plan ${plan} no está en ${tablaEsperada} (solo en ${d.cabeceras[0].tabla}).`, 'plan');
  } else if (!propias.some((c) => String(c.iestado ?? '').trim() === 'V')) {
    add('PLAN_NO_VIGENTE', 'error', `El plan ${plan} no tiene una versión con iestado 'V' en ${tablaEsperada}.`, 'plan');
  } else {
    add('PLAN_VIGENTE', 'ok', `El plan ${plan} está vigente en ${tablaEsperada}.`, 'plan');
  }

  // En Sis2000_QA ya hay cplan repetidos entre ramos (BINAC en 18 y 28, RCGGEN en 27/28/37, ...): en un plan existente
  // es aviso; al crear un plan nuevo el código repetido sigue siendo bloqueante (crearPlan responde 409).
  if (d.ramosConMismoPlan.length) {
    add('PLAN_CODIGO_REPETIDO', 'aviso',
      `El código ${plan} también existe en el/los ramo(s) ${d.ramosConMismoPlan.join(', ')}: los SP que buscan el plan solo por ` +
        'cplan (sin cramo) pueden tomar el plan del otro ramo.', 'plan');
  } else {
    add('PLAN_CODIGO_UNICO', 'ok', `El código ${plan} es único entre ramos.`, 'plan');
  }

  const cab = (propias.find((c) => String(c.iestado ?? '').trim() === 'V') ?? propias[0] ?? d.cabeceras[0]);
  const cproducto = String(cab.cproducto ?? '').trim();
  if (!cproducto) add('PRODUCTO_FALTA', 'error', 'El plan no tiene producto (cproducto).', 'plan');
  else {
    if (cproducto.length > 6) add('PRODUCTO_LARGO', 'error', `El producto ${cproducto} tiene más de 6 caracteres (spMantPlanes lo corta a 6).`, 'plan');
    if (!d.productoExiste) add('PRODUCTO_NO_EXISTE', 'error', `El producto ${cproducto} no existe en maproductos.`, 'plan');
    if (cproducto.length <= 6 && d.productoExiste) add('PRODUCTO_OK', 'ok', `Producto ${cproducto} válido.`, 'plan');
  }

  // ── Coberturas y tarifas ──
  if (!d.coberturas.length) add('COBERTURAS_FALTAN', 'error', 'El plan no tiene coberturas.', 'coberturas');
  let tarifasOk = d.coberturas.length > 0;
  let reaseguroOk = d.coberturas.length > 0;
  for (const c of d.coberturas) {
    const n = `Cobertura ${c.ccobertura.trim()} / tarifa ${c.ctarifa.trim()}`;
    if (!c.tarifaExiste) { tarifasOk = false; add('TARIFA_NO_EXISTE', 'error', `${n}: la tarifa no existe en matarifa.`, 'tarifas'); continue; }
    if (c.detallesV === 0) { tarifasOk = false; add('TARIFA_SIN_DETALLE', 'error', `${n}: no tiene detalle 'V' en matarifa_d (la cobertura se pierde al emitir).`, 'tarifas'); }
    if (c.detallesV > 1) { tarifasOk = false; add('TARIFA_DETALLE_DUPLICADO', 'error', `${n}: tiene ${c.detallesV} detalles 'V' en matarifa_d (la prima se duplica); deja solo uno.`, 'tarifas'); }
    if (c.ccontrea == null || c.cramorea == null) {
      reaseguroOk = false;
      add('REASEGURO_INCOMPLETO', 'error', `Cobertura ${c.ccobertura.trim()}: falta contrato (ccontrea) o ramo de reaseguro (cramorea) en macoberturas.`, 'coberturas');
    }
  }
  if (tarifasOk) add('TARIFAS_OK', 'ok', 'Cada cobertura tiene su tarifa y exactamente un detalle vigente.', 'tarifas');
  if (reaseguroOk) add('REASEGURO_OK', 'ok', 'Todas las coberturas tienen reaseguro.', 'coberturas');

  // ── Comisiones (maarancel) ──
  const vigentes = d.aranceles.filter((a) => String(a.iestado ?? '').trim() === 'V');
  const aplicables = vigentes.filter((a) => [plan, '0'].includes(String(a.cplan ?? '').trim()));
  if (!aplicables.length) add('COMISION_FALTA', 'error', `No hay comisión 'V' en maarancel para el plan ${plan} ni para el ramo (cplan '0').`, 'comisiones');
  else add('COMISION_OK', 'ok', `Hay ${aplicables.length} comisión(es) vigente(s) aplicable(s) al plan.`, 'comisiones');
  // Error: la misma llave lógica (sin fdesde) repetida en filas que aplican al plan. Las filas comodín '0' por cobertura
  // del ramo 18/26/28 son el patrón normal y no se repiten.
  for (const x of duplicadosLlave(aplicables)) {
    add('COMISION_DUPLICADA', 'error',
      `maarancel tiene ${x.filas} filas 'V' con la misma llave (plan ${x.cplan}, tipo de productor ${x.ctipoprod}, productor ` +
        `${x.cproductor}, cobertura ${x.ccober}, tarifa ${x.ctarifa}) en el ramo ${d.cramo}: deja solo una.`, 'comisiones');
  }
  // Avisos: varias filas 'V' en el ramo para la misma cobertura o tarifa (sin el comodín '0').
  for (const x of duplicadosVigentes(vigentes, 'ccober', d.coberturas.map((c) => c.ccobertura))) {
    add('COMISION_DUPLICADA_COBERTURA', 'aviso',
      `maarancel tiene ${x.filas} filas 'V' para la cobertura ${x.codigo} en el ramo ${d.cramo}: ${SP_UNEN_ARANCEL.ccober}.`, 'comisiones');
  }
  if (d.familia === 'patrimonial') {
    for (const x of duplicadosVigentes(vigentes, 'ctarifa', d.coberturas.map((c) => c.ctarifa))) {
      add('COMISION_DUPLICADA_TARIFA', 'aviso',
        `maarancel tiene ${x.filas} filas 'V' para la tarifa ${x.codigo} en el ramo ${d.cramo}: ${SP_UNEN_ARANCEL.ctarifa}.`, 'comisiones');
    }
  }

  // ── Frecuencias ──
  const letras = [...new Set(d.frecuenciasV.map((f) => f.trim().toUpperCase()).filter(Boolean))];
  if (!letras.length) add('FRECUENCIA_FALTA', 'error', "El plan no tiene frecuencias 'V' en maplanes_frec.", 'frecuencias');
  else {
    const minusculas = [...new Set(d.frecuenciasV.map((f) => f.trim()).filter((f) => f && f !== f.toUpperCase()))];
    if (minusculas.length) {
      add('FRECUENCIA_MINUSCULA', 'aviso',
        `Frecuencias en minúscula: ${minusculas.join(', ')}. Se normalizan a mayúscula al revisar, pero los SP comparan la letra exacta.`, 'frecuencias');
    }
    const raras = letras.filter((l) => !LETRAS_FRECUENCIA.includes(l));
    if (raras.length) add('FRECUENCIA_DESCONOCIDA', 'aviso', `Frecuencias que los SP no reconocen (se cobran en 1 cuota): ${raras.join(', ')}.`, 'frecuencias');
    if (letras.includes('K') && d.familia !== 'auto') add('FRECUENCIA_K_NO_AUTO', 'aviso', 'La frecuencia K (postpago) solo la entienden los SP de auto.', 'frecuencias');
    if (!raras.length) add('FRECUENCIAS_OK', 'ok', `Frecuencias: ${letras.join(', ')}.`, 'frecuencias');
  }

  // ── Quién vende ──
  if (d.usuariosPermitidos > 0) add('CANALES_OK', 'ok', `mausuplan tiene ${d.usuariosPermitidos} fila(s) permitida(s) (A).`, 'quien-vende');
  else add('CANALES_FALTAN', 'error', "mausuplan no tiene ninguna fila con itipouso 'A': nadie puede vender el plan.", 'quien-vende');

  // ── Auto ──
  if (d.familia === 'auto' && d.auto) {
    if (d.coberturas.some((c) => c.cob18 === 1 || c.cob18 === 2)) add('AUTO_CASCO_OK', 'ok', 'El plan incluye la cobertura 1 o la 2 (casco).', 'coberturas');
    else add('AUTO_SIN_CASCO', 'error', 'El plan no incluye la cobertura 1 ni la 2 (o su equivalente del ramo 18).', 'coberturas');

    if (d.auto.paresTipoUso > 0) add('AUTO_TIPO_USO_OK', 'ok', `macattip tiene ${d.auto.paresTipoUso} par(es) tipo/uso en el ramo.`, 'tipos-uso');
    else add('AUTO_TIPO_USO_FALTA', 'error', 'macattip no tiene pares tipo/uso para el ramo (el cálculo da THROW 99021).', 'tipos-uso');

    for (const p of d.auto.paresEnOtrosRamos) {
      add('AUTO_TIPO_USO_OTROS_RAMOS', 'aviso',
        `El par tipo ${p.ctipo} / uso ${p.ccategotr} también está en el/los ramo(s) ${p.ramos.join(', ')}: el SP lo busca sin ramo.`, 'tipos-uso');
    }

    const grupos = new Map<string, TramoAntiguedad[]>();
    for (const t of d.auto.tasasAntiguedad) {
      const k = `${t.ccober.trim()}|${t.ctarifa.trim()}`;
      grupos.set(k, [...(grupos.get(k) ?? []), t]);
    }
    for (const [k, tramos] of grupos) {
      const [ccober, ctarifa] = k.split('|');
      const cob = d.coberturas.find((c) => c.ccobertura.trim() === ccober);
      if (!cob || !esCasco(cob.cob18)) {
        add('AUTO_TASAS_NO_CASCO', 'aviso', `Hay tasas por antigüedad para la cobertura ${ccober} (tarifa ${ctarifa}), que no es casco: el SP no las usa.`, 'tasas-antiguedad');
        continue;
      }
      const errores = validarTramosAntiguedad(tramos);
      if (errores.length) add('AUTO_TASAS_HUECOS', 'error', `Tasas por antigüedad de la cobertura ${ccober} (tarifa ${ctarifa}): ${errores.join(' ')}`, 'tasas-antiguedad');
      else add('AUTO_TASAS_OK', 'ok', `Tasas por antigüedad de la cobertura ${ccober} (tarifa ${ctarifa}) sin huecos.`, 'tasas-antiguedad');
      for (const aviso of avisosTramosAntiguedad(tramos)) {
        add('AUTO_TASAS_TOPE', 'aviso', `Tasas por antigüedad de la cobertura ${ccober} (tarifa ${ctarifa}): ${aviso}`, 'tasas-antiguedad');
      }
    }

    if (d.cramo !== 18) {
      const sin = d.coberturas.filter((c) => c.cob18 == null).map((c) => c.ccobertura.trim());
      if (sin.length) {
        add('AUTO_SIN_EQUIVALENTE_18', 'aviso',
          `Coberturas sin equivalente en el ramo 18 por ccoberturaint (el SP usa la fórmula general): ${sin.join(', ')}.`, 'coberturas');
      }
    }
  }

  if (d.fase2) items.push(...revisarFase2(d.familia, d.fase2));

  return fin();
}
