import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Ruta sin autenticación nest-api (catálogos, auth/token, etc.). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
