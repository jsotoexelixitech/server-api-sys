import { armarResumen, avisosContrarios, esEditable, normalizarItems, paginado, validarCambioQuienVende } from './configurador.quien-vende';

describe('validarCambioQuienVende', () => {
  it('acepta P/C/G con A/E y una lista de códigos', () => {
    expect(validarCambioQuienVende({ centidad: 'P', itipouso: 'A', items: ['80080', '628'] }, 'alta')).toEqual([]);
    expect(validarCambioQuienVende({ centidad: 'C', itipouso: 'E', items: ['8'] }, 'alta')).toEqual([]);
    expect(validarCambioQuienVende({ centidad: 'G', itipouso: 'A', items: ['80080-1155-1495'] }, 'alta')).toEqual([]);
  });

  it('null = todos; no se puede excluir a todos en el alta (sí borrar la fila «todos»)', () => {
    expect(validarCambioQuienVende({ centidad: 'C', itipouso: 'A', items: null }, 'alta')).toEqual([]);
    expect(validarCambioQuienVende({ centidad: 'P', itipouso: 'E', items: null }, 'alta').join(' ')).toMatch(/excluir a «todos»/);
    expect(validarCambioQuienVende({ centidad: 'P', itipouso: 'E', items: null }, 'baja')).toEqual([]);
  });

  it('R/U/A no se editan; itipouso solo A o E; items obligatorio', () => {
    expect(validarCambioQuienVende({ centidad: 'R', itipouso: 'A', items: ['11'] }, 'alta').join(' ')).toMatch(/R solo se muestra/);
    expect(validarCambioQuienVende({ centidad: 'P', itipouso: 'X', items: ['1'] }, 'alta').join(' ')).toMatch(/itipouso/);
    expect(validarCambioQuienVende({ centidad: 'P', itipouso: 'A' }, 'alta').join(' ')).toMatch(/items es obligatorio/);
    expect(validarCambioQuienVende({ centidad: 'P', itipouso: 'A', items: [] }, 'alta').join(' ')).toMatch(/lista vacía/);
  });

  it('P y C numéricos; C dentro de SMALLINT; G texto ≤ 50', () => {
    expect(validarCambioQuienVende({ centidad: 'P', itipouso: 'A', items: ['ABC'] }, 'alta').join(' ')).toMatch(/numéricos/);
    expect(validarCambioQuienVende({ centidad: 'C', itipouso: 'A', items: ['40000'] }, 'alta').join(' ')).toMatch(/canales/);
    expect(validarCambioQuienVende({ centidad: 'G', itipouso: 'A', items: ['x'.repeat(51)] }, 'alta').join(' ')).toMatch(/50/);
    expect(validarCambioQuienVende({ centidad: 'G', itipouso: 'A', items: [' '] }, 'alta').join(' ')).toMatch(/vacíos/);
  });

  it('normaliza y quita repetidos', () => {
    expect(normalizarItems([' 1', '1', '2 '])).toEqual(['1', '2']);
    expect(normalizarItems(null)).toBeNull();
    expect(esEditable('g')).toBe(true);
    expect(esEditable('U')).toBe(false);
  });
});

describe('paginado', () => {
  it('por defecto 50, máximo 500, offset ≥ 0', () => {
    expect(paginado(undefined, undefined)).toEqual({ limit: 50, offset: 0 });
    expect(paginado(1000, 20)).toEqual({ limit: 500, offset: 20 });
    expect(paginado(0, -5)).toEqual({ limit: 50, offset: 0 });
  });
});

describe('armarResumen y avisos', () => {
  it('cuenta, marca «todos» y las entidades no editables', () => {
    const r = armarResumen([
      { centidad: 'G', itipouso: 'A', filas: 2500, todos: 0 },
      { centidad: 'P', itipouso: 'A', filas: 10, todos: 1 },
      { centidad: 'R', itipouso: 'E', filas: 3, todos: 0 },
    ]);
    expect(r.total).toBe(2513);
    expect(r.grupos.find((g) => g.centidad === 'P')).toMatchObject({ entidad: 'productor', conTodos: true, editable: true });
    expect(r.grupos.find((g) => g.centidad === 'R')).toMatchObject({ editable: false });
    expect(r.avisos.join(' ')).toMatch(/R \(significado no confirmado\)/);
  });

  it('avisa si no hay ninguna fila A', () => {
    expect(armarResumen([{ centidad: 'C', itipouso: 'E', filas: 1, todos: 0 }]).avisos.join(' ')).toMatch(/nadie lo puede vender/);
    expect(armarResumen([]).avisos.join(' ')).toMatch(/nadie lo puede vender/);
  });

  it('avisa los items incluidos y excluidos a la vez', () => {
    expect(avisosContrarios('C', 'A', [])).toEqual([]);
    expect(avisosContrarios('C', 'A', ['8', null]).join(' ')).toMatch(/canal: 8, «todos».*excluidos/);
  });
});
