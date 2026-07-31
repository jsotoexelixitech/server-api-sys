import {
  grantMatchesRoute,
  scopeMatches,
  toRouteGrantLine,
} from './nest-auth-scopes.constants';

describe('grantMatchesRoute', () => {
  const personEmision = toRouteGrantLine(
    'POST',
    '/api/v1/personas/emision',
  );
  const autoEmision = toRouteGrantLine(
    'POST',
    '/api/v1/external/createEmissionAuto',
  );

  it('acepta scope legacy completo', () => {
    expect(
      grantMatchesRoute(
        ['emissions:person'],
        'POST',
        '/api/v1/personas/emision',
        'emissions:person',
      ),
    ).toBe(true);
    expect(
      grantMatchesRoute(
        ['emissions:person'],
        'POST',
        '/api/v1/external/createEmissionPerson',
        'emissions:person',
      ),
    ).toBe(true);
  });

  it('acepta solo la ruta concedida (granular)', () => {
    expect(
      grantMatchesRoute(
        [personEmision],
        'POST',
        '/api/v1/personas/emision',
        'emissions:person',
      ),
    ).toBe(true);
    expect(
      grantMatchesRoute(
        [personEmision],
        'POST',
        '/api/v1/external/createEmissionPerson',
        'emissions:person',
      ),
    ).toBe(false);
    expect(
      grantMatchesRoute(
        [personEmision],
        'POST',
        '/api/v1/external/createEmissionAuto',
        'emissions:auto',
      ),
    ).toBe(false);
  });

  it('deniega sin grants en ruta protegida', () => {
    expect(
      grantMatchesRoute([], 'POST', '/api/v1/personas/emision', 'emissions:person'),
    ).toBe(false);
    expect(
      grantMatchesRoute(
        [autoEmision],
        'POST',
        '/api/v1/personas/emision',
        'emissions:person',
      ),
    ).toBe(false);
  });

  it('permite rutas públicas (sin scope requerido)', () => {
    expect(
      grantMatchesRoute([], 'POST', '/api/v1/personas/cotizacion', undefined),
    ).toBe(true);
  });
});

describe('scopeMatches (legacy)', () => {
  it('soporta wildcard partner', () => {
    expect(scopeMatches(['partner:*'], 'partner:starter')).toBe(true);
  });
});
