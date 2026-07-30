export interface NestAuthSession {
  id: string;
  apikey: string;
  createdAt: number;
  lastUsedAt: number;
}

export interface NestAuthContext {
  apikey: string;
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

declare module 'express-serve-static-core' {
  interface Request {
    nestAuth?: NestAuthContext;
  }
}
