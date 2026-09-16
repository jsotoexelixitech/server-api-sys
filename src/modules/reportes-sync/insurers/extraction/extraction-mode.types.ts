export const EXTRACT_MODES = Object.freeze({
  QUERY: 'query',
  VIEW: 'view',
  API: 'api',
} as const);

export type ExtractMode = (typeof EXTRACT_MODES)[keyof typeof EXTRACT_MODES];

const DATABASE_MODES = new Set<string>([
  EXTRACT_MODES.QUERY,
  EXTRACT_MODES.VIEW,
]);

export function isDatabaseMode(mode: string): boolean {
  return DATABASE_MODES.has(mode);
}
