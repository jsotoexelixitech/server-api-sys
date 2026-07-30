import { PartnerScopeMeta } from '@jsotoexelixitech/nest-api-sdk';

/** Catálogo de scopes que el host expone en /admin (paso 2 al crear token). */
export const partnerScopes: PartnerScopeMeta[] = [
  {
    id: 'partner:starter',
    label: 'Partner starter',
    description: 'Health del módulo partner de ejemplo',
    routes: ['GET /api/v1/partner/starter/health'],
  },
];
