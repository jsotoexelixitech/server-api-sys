import {
  collectComponentRefs,
  pruneOpenApiComponents,
} from './prune-openapi-components';

describe('pruneOpenApiComponents', () => {
  const schemas = {
    CreatePlanDto: {
      type: 'object',
      properties: {
        nested: { $ref: '#/components/schemas/NestedDto' },
      },
    },
    NestedDto: { type: 'object', properties: { id: { type: 'string' } } },
    UnusedDto: { type: 'object', properties: { x: { type: 'number' } } },
  };
  const securitySchemes = {
    bearer: { type: 'http' as const, scheme: 'bearer' },
  };
  const components = { schemas, securitySchemes };

  it('collectComponentRefs encuentra $ref', () => {
    const out = new Set<string>();
    collectComponentRefs(
      {
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreatePlanDto' },
          },
        },
      },
      out,
    );
    expect([...out]).toEqual(['#/components/schemas/CreatePlanDto']);
  });

  it('deja solo schemas referenciados (transitivos) y securitySchemes', () => {
    const paths = {
      '/api/v1/partner/starter/plan': {
        post: {
          requestBody: {
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreatePlanDto' },
              },
            },
          },
        },
      },
    };

    const pruned = pruneOpenApiComponents(components, [paths]);
    expect(pruned?.schemas).toEqual({
      CreatePlanDto: schemas.CreatePlanDto,
      NestedDto: schemas.NestedDto,
    });
    expect(pruned?.schemas).not.toHaveProperty('UnusedDto');
    expect(pruned?.securitySchemes).toEqual(securitySchemes);
  });
});
