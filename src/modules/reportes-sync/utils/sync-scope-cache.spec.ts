import { buildScopeKey, SyncScopeCache } from './sync-scope-cache';

describe('buildScopeKey', () => {
  it('es estable ante el orden de las claves y el tamaño de letra', () => {
    const a = buildScopeKey('recibos', { ramo: 18, estado: 'C', poliza: ' ABC ' });
    const b = buildScopeKey('recibos', { poliza: 'abc', estado: 'c', ramo: 18 });
    expect(a).toBe(b);
  });

  it('distingue entidades y filtros distintos', () => {
    expect(buildScopeKey('recibos', { ramo: 18 })).not.toBe(buildScopeKey('siniestros', { ramo: 18 }));
    expect(buildScopeKey('recibos', { ramo: 18 })).not.toBe(buildScopeKey('recibos', { ramo: 4 }));
    expect(buildScopeKey('recibos', { estado: 'C' })).not.toBe(buildScopeKey('recibos', { estado: 'A' }));
  });

  it('las fechas se comparan por día y no por hora', () => {
    const a = buildScopeKey('recibos', { desde: new Date('2026-01-01T00:00:00Z'), hasta: new Date('2026-09-15T00:00:00Z') });
    const b = buildScopeKey('recibos', { desde: new Date('2026-01-01T13:30:00Z'), hasta: new Date('2026-09-15T01:00:00Z') });
    expect(a).toBe(b);
  });

  it('ignora paginación, presentación y valores vacíos', () => {
    const base = buildScopeKey('recibos', { ramo: 18 });
    expect(
      buildScopeKey('recibos', { ramo: 18, pagina: 7, tamano: 200, bexportar: 1, canal: '', productor: null, grilla: ['a'] }),
    ).toBe(base);
  });

  it('sin filtros devuelve una clave válida', () => {
    expect(buildScopeKey('recibos', {})).toBe('recibos|[]');
  });
});

describe('SyncScopeCache', () => {
  it('un alcance recién marcado está vigente hasta el TTL', () => {
    const cache = new SyncScopeCache();
    cache.mark('k', 1_000);
    expect(cache.isFresh('k', 30_000, 1_000)).toBe(true);
    expect(cache.isFresh('k', 30_000, 30_999)).toBe(true);
    expect(cache.isFresh('k', 30_000, 31_000)).toBe(false);
  });

  it('otro alcance no hereda la vigencia', () => {
    const cache = new SyncScopeCache();
    cache.mark('a', 1_000);
    expect(cache.isFresh('b', 30_000, 1_001)).toBe(false);
  });

  it('con TTL 0 nunca está vigente', () => {
    const cache = new SyncScopeCache();
    cache.mark('k', 1_000);
    expect(cache.isFresh('k', 0, 1_001)).toBe(false);
  });

  it('descarta los alcances más antiguos al superar el máximo', () => {
    const cache = new SyncScopeCache(3);
    ['a', 'b', 'c', 'd'].forEach((k, i) => cache.mark(k, i + 1));
    expect(cache.size).toBe(3);
    expect(cache.ageMs('a', 10)).toBeNull();
    expect(cache.ageMs('d', 10)).toBe(6);
  });

  it('volver a marcar renueva la antigüedad', () => {
    const cache = new SyncScopeCache(2);
    cache.mark('a', 1);
    cache.mark('b', 2);
    cache.mark('a', 3);
    cache.mark('c', 4);
    expect(cache.ageMs('b', 5)).toBeNull();
    expect(cache.ageMs('a', 5)).toBe(2);
  });
});
