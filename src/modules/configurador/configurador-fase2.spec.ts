import { DISPOSITIVOS, SUSTANCIAS, avisosReparto, tablaCondominio, validarPorcentaje } from './configurador-patrimonial';
import { avisosFilasDias, esPlanBinacional, validarFilasDias, type FilaDias } from './configurador-tarifa-dias';
import { estadoHttpCasco, filtrosJson, validarCrearVersion } from './configurador-tasa-casco';

describe('patrimonial: dispositivos y sustancias', () => {
  it('alta: descripción y % obligatorios, % entre 0 y 100 con los decimales de la columna', () => {
    expect(validarPorcentaje(DISPOSITIVOS, { descripcion: 'TRANCA PALANCA', porcentaje: 10 }, true)).toEqual([]);
    expect(validarPorcentaje(SUSTANCIAS, { codigo: 2, descripcion: 'QUIMIC.', porcentaje: 12.5 }, true)).toEqual([]);
    expect(validarPorcentaje(DISPOSITIVOS, { descripcion: ' ', porcentaje: 101 }, true).join(' ')).toMatch(/xdisseg es obligatorio.*entre 0 y 100/);
    expect(validarPorcentaje(SUSTANCIAS, { descripcion: 'X', porcentaje: 1.12345 }, true).join(' ')).toMatch(/4 decimales/);
    expect(validarPorcentaje(DISPOSITIVOS, { descripcion: 'X'.repeat(61), porcentaje: 0 }, true).join(' ')).toMatch(/60 caracteres/);
    expect(validarPorcentaje(DISPOSITIVOS, { codigo: 0, descripcion: 'X', porcentaje: 0 }, true).join(' ')).toMatch(/cdisseg/);
  });

  it('edición: al menos un campo; «quitar» = % en 0 es válido', () => {
    expect(validarPorcentaje(DISPOSITIVOS, { codigo: 3, porcentaje: 0 }, false)).toEqual([]);
    expect(validarPorcentaje(SUSTANCIAS, { codigo: 1 }, false)).toEqual(['No hay nada que cambiar.']);
  });
});

describe('patrimonial: condominio', () => {
  it('tabla por nombre corto o completo', () => {
    expect(tablaCondominio('reparto')).toBe('reparto');
    expect(tablaCondominio('MATARIFA_ANTIGUEDAD_NEXUS')).toBe('antiguedad');
    expect(tablaCondominio('Rango')).toBe('rango');
    expect(tablaCondominio('maplanes')).toBeNull();
  });

  it('reparto: los % de itipo P suman 100 (datos del ramo 16)', () => {
    expect(avisosReparto([{ itipo: 'P', pvalor: 20 }, { itipo: 'P', pvalor: 80 }, { itipo: 'F', pvalor: 0.05 }])).toEqual([]);
    expect(avisosReparto([{ itipo: 'P ', pvalor: 20 }, { itipo: 'P', pvalor: 70 }])[0]).toMatch(/suman 90/);
    expect(avisosReparto([{ itipo: 'F', pvalor: 3 }])).toEqual([]);
  });
});

/** Tramos reales de 18/BINAC y 28/BINAC (qdias 1..4: 0-3, 3-7, 7-15, 15-30). */
const tramos = (ctarifabi: number, anual: number | null = 583): FilaDias[] => [
  { ctarifabi, qdias: 1, bnacional: true, ndias_min: 0, ndias_max: 3, mprima: 29.3, mprima_anual: 0 },
  { ctarifabi, qdias: 2, bnacional: true, ndias_min: 3, ndias_max: 7, mprima: 45.74, mprima_anual: 0 },
  { ctarifabi, qdias: 3, bnacional: true, ndias_min: 7, ndias_max: 15, mprima: 80.06, mprima_anual: 0 },
  { ctarifabi, qdias: 4, bnacional: true, ndias_min: 15, ndias_max: 30, mprima: 137.24, mprima_anual: anual, mprima_dia: 476.6 },
];

describe('tarifa por días (maplantar_dias)', () => {
  it('datos reales: tramos contiguos que comparten el borde son válidos', () => {
    expect(validarFilasDias([...tramos(1), ...tramos(2)], 'BINAC')).toEqual([]);
    expect(validarFilasDias([tramos(4)[3]], 'BINACA')).toEqual([]);
  });

  it('solape, PK repetida y días invertidos', () => {
    const filas = tramos(1);
    filas[1] = { ...filas[1], ndias_min: 2 };
    expect(validarFilasDias(filas, 'BINAC').join(' ')).toMatch(/3-7|2-7/);
    expect(validarFilasDias([...tramos(1), { ...tramos(1)[0] }], 'BINAC').join(' ')).toMatch(/repetida/);
    expect(validarFilasDias([{ ...tramos(1)[3], ndias_min: 30 }], 'X1').join(' ')).toMatch(/mayor que ndias_min/);
  });

  it('el solape se mide por (ctarifabi, bnacional): nacional e internacional no chocan', () => {
    const intl = tramos(1).map((f) => ({ ...f, bnacional: false }));
    expect(validarFilasDias([...tramos(1), ...intl], 'BINAC')).toEqual([]);
  });

  it('plan BINAC*: cada grupo necesita la fila anual (ndias_max 30) con mprima_anual; vacío no vale', () => {
    expect(validarFilasDias(tramos(1).slice(0, 3), 'BINAC').join(' ')).toMatch(/falta la fila anual/);
    expect(validarFilasDias(tramos(1, null), 'BINACB').join(' ')).toMatch(/necesita mprima_anual/);
    expect(validarFilasDias([], 'BINAC').join(' ')).toMatch(/Binacional/);
    expect(validarFilasDias([], 'OTRO')).toEqual([]);
    expect(validarFilasDias(tramos(1).slice(0, 3), 'OTRO')).toEqual([]);
  });

  it('aviso (no bloquea) si la fila anual de un BINAC trae mprima_anual 0 (como 18/BINAC hoy)', () => {
    expect(avisosFilasDias(tramos(1, 0), 'BINAC')).toHaveLength(1);
    expect(avisosFilasDias(tramos(1, 0), 'OTRO')).toEqual([]);
    expect(esPlanBinacional(' binaca ')).toBe(true);
  });
});

describe('tasa de casco', () => {
  it('AJUSTE pide movimiento, porcentaje y alcance; RESTAURACION, version_id; ambos una fecha o rige_al_aprobar', () => {
    expect(validarCrearVersion({ origen: 'AJUSTE', movimiento: 'INCREMENTO', porcentaje: 5, alcance: 'GLOBAL', vigente_desde: '2026-12-01' })).toEqual([]);
    expect(validarCrearVersion({ origen: 'RESTAURACION', version_id: 3, rige_al_aprobar: true })).toEqual([]);
    expect(validarCrearVersion({ origen: 'AJUSTE', alcance: 'TODO' }).length).toBe(4);
    expect(validarCrearVersion({ origen: 'RESTAURACION', porcentaje: 5, vigente_desde: '2026-12-01' }).join(' ')).toMatch(/version_id.*solo aplican/);
  });

  it('filtros con los nombres del SP; vacíos → null', () => {
    expect(filtrosJson({ coverages: [' 1 ', '28'], vehicleTypes: [] })).toBe('{"coverages":["1","28"]}');
    expect(filtrosJson({ ageFrom: -1, ageTo: 5, ranges: [10] })).toBe('{"ranges":[10],"ageFrom":-1,"ageTo":5}');
    expect(filtrosJson({})).toBeNull();
    expect(filtrosJson(undefined)).toBeNull();
  });

  it('THROW del tarificador → HTTP', () => {
    expect([50101, 50102].map(estadoHttpCasco)).toEqual([403, 403]);
    expect([50103, 50110, 50111, 50122].map(estadoHttpCasco)).toEqual([409, 409, 409, 409]);
    expect([50105, 50106, 50109, 50116].map(estadoHttpCasco)).toEqual([400, 400, 400, 400]);
    expect([undefined, 51000, 2627].map(estadoHttpCasco)).toEqual([null, null, null]);
  });
});
