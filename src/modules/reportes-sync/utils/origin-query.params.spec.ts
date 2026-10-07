import {
  hasExtraOriginFilters,
  resolveDateColumn,
  resolveEstadoLetter,
} from './origin-query.params';
import { resolveLocalDateColumn } from '../repositories/sync-local.repository';

const originConfig = {
  defaultTipoFecha: 'fecha_emision',
  dateColByTipoFecha: {
    fecha_emision: 'rec.fdesde',
    fecha_pago: 'rec.fcobro',
    default: 'rec.fdesde',
  },
  dateColByEstado: {
    C: 'rec.fcobro',
    A: 'rec.fanulacion',
    P: 'rec.fdesde',
  },
  filterParams: {
    desde: { source: 'desde', type: 'date' },
    hasta: { source: 'hasta', type: 'date' },
    ramo: { source: 'ramo', type: 'int' },
    iestadorec: {
      source: 'estado',
      type: 'map',
      normalize: 'upper',
      map: {
        '1': 'N',
        '2': 'P',
        '3': 'C',
        '4': 'A',
        COBRADO: 'C',
        PAGADO: 'C',
        PENDIENTE: 'P',
        ANULADO: 'A',
      },
    },
  },
};

describe('resolveEstadoLetter', () => {
  it('mapea id numérico y etiqueta a la letra del origen', () => {
    expect(resolveEstadoLetter({ estado: 3 }, originConfig)).toBe('C');
    expect(resolveEstadoLetter({ estado: 'Cobrado' }, originConfig)).toBe('C');
  });

  it('devuelve null sin filtro de estado o sin filterParams', () => {
    expect(resolveEstadoLetter({}, originConfig)).toBeNull();
    expect(resolveEstadoLetter({ estado: 3 }, {})).toBeNull();
  });
});

describe('resolveDateColumn', () => {
  it('Cobrado extrae por fecha de cobro (coincide con el SP)', () => {
    expect(resolveDateColumn({ estado: 3 }, originConfig)).toBe('rec.fcobro');
  });

  it('Anulado y Pendiente usan su propia fecha', () => {
    expect(resolveDateColumn({ estado: 4 }, originConfig)).toBe('rec.fanulacion');
    expect(resolveDateColumn({ estado: 2 }, originConfig)).toBe('rec.fdesde');
  });

  it('sin estado conserva la vigencia (comportamiento previo)', () => {
    expect(resolveDateColumn({}, originConfig)).toBe('rec.fdesde');
  });

  it('un tipoFecha explícito tiene prioridad sobre el estado', () => {
    expect(
      resolveDateColumn({ estado: 3, tipoFecha: 'fecha_emision' }, originConfig),
    ).toBe('rec.fdesde');
  });

  it('sin dateColByEstado en la config no cambia nada', () => {
    const legacy = { ...originConfig, dateColByEstado: null };
    expect(resolveDateColumn({ estado: 3 }, legacy)).toBe('rec.fdesde');
  });
});

describe('resolveLocalDateColumn', () => {
  it('traduce la expresión de origen a la columna local', () => {
    expect(resolveLocalDateColumn('recibos', 'rec.fcobro')).toBe('fecha_pago');
    expect(resolveLocalDateColumn('recibos', 'rec.fdesde')).toBe('fecha_desde');
    expect(resolveLocalDateColumn('recibos', 'FHASTA')).toBe('fecha_hasta');
  });

  it('devuelve null si no hay equivalente (no interpola nombres desconocidos)', () => {
    expect(resolveLocalDateColumn('recibos', 'rec.x; DROP TABLE recibo')).toBeNull();
    expect(resolveLocalDateColumn('siniestros', 'rec.fdesde')).toBeNull();
    expect(resolveLocalDateColumn('recibos', null)).toBeNull();
  });
});

describe('hasExtraOriginFilters', () => {
  it('rango + estado no cuentan como filtros adicionales', () => {
    expect(
      hasExtraOriginFilters(
        { desde: '2026-01-01', hasta: '2026-09-14', estado: 3 },
        originConfig,
      ),
    ).toBe(false);
  });

  it('detecta ramo u otros filtros del origen', () => {
    expect(
      hasExtraOriginFilters({ desde: '2026-01-01', ramo: 18 }, originConfig),
    ).toBe(true);
  });
});
