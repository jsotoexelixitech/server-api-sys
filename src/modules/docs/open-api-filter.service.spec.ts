import { OpenAPIObject } from '@nestjs/swagger/dist/interfaces';
import { OpenApiDocumentStore } from './open-api-document.store';
import { OpenApiFilterService } from './open-api-filter.service';

function sampleDoc(): OpenAPIObject {
  const op = (tag: string, summary: string) => ({
    tags: [tag],
    summary,
    responses: { '200': { description: 'ok' } },
  });

  return {
    openapi: '3.0.0',
    info: { title: 'nest-api', version: '1' },
    tags: [
      { name: 'Autenticación' },
      { name: 'Endosos' },
      { name: 'Orphan' },
    ],
    paths: {
      '/api/v1/auth/token': {
        post: op('Autenticación', 'token'),
      },
      '/api/endoso-recibos/crearRecibo': {
        parameters: [{ name: 'ghost', in: 'query' }],
        post: op('Endosos', 'crearRecibo'),
      },
      '/api/v1/personas/emision': {
        post: op('Personas', 'emision'),
      },
    },
  };
}

describe('OpenApiFilterService', () => {
  let service: OpenApiFilterService;

  beforeEach(() => {
    const store = new OpenApiDocumentStore();
    store.setDocument(sampleDoc());
    service = new OpenApiFilterService(store);
  });

  it('sin scopes solo deja auth; no publica el alias endoso-recibos', () => {
    const filtered = service.filterByScopes([]);
    expect(Object.keys(filtered.paths ?? {})).toEqual([
      '/api/v1/auth/token',
    ]);
    expect(filtered.paths?.['/api/endoso-recibos/crearRecibo']).toBeUndefined();
  });

  it('con endosos:write publica crearRecibo', () => {
    const filtered = service.filterByScopes(['endosos:write']);
    expect(
      filtered.paths?.['/api/endoso-recibos/crearRecibo']?.post,
    ).toBeDefined();
    expect(filtered.paths?.['/api/v1/personas/emision']).toBeUndefined();
  });
});
