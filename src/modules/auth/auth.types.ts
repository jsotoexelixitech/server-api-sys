export const NEST_LEGACY_API_KEY_ID = 'legacy-maclient';

export interface NestAuthSession {
  id: string;
  apiKeyId: string;
  apikey: string;
  scopes: string[];
  createdAt: number;
  lastUsedAt: number;
}

export interface NestAuthContext {
  apikey: string;
  apiKeyId?: string;
  scopes: string[];
  sessionId?: string;
  via: 'bearer' | 'apikey' | 'none';
  refreshedAccessToken?: string;
}

export interface TokenPairResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
}

declare global {
  namespace Express {
    interface Request {
      nestAuth?: NestAuthContext;
    }
  }
}

declare module 'express-serve-static-core' {
  interface Request {
    nestAuth?: NestAuthContext;
  }
}

declare module 'express' {
  interface Request {
    nestAuth?: NestAuthContext;
  }
}

