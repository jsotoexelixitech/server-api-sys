import { PartnerScopeMeta } from '@jsotoexelixitech/nest-api-sdk';

/** Catálogo de scopes — aparece en el panel admin del host al crear tokens. */
export const partnerScopes: PartnerScopeMeta[] = [
  {
    id: 'partner:starter',
    label: 'Partner starter',
    description: 'Health y ping del módulo partner',
    routes: [
      'GET /api/v1/partner/starter/health',
      'GET /api/v1/partner/starter/ping',
    ],
  },
];
