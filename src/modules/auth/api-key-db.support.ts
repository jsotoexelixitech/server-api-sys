import { PrismaService } from '../../database/prisma/prisma.service';
import { ApiKeyRecord } from './api-key.service';

let docsSlugColumnCached: boolean | null = null;

/** Detecta si la columna docs_slug existe (migración nest-auth-add-docs-slug.sql). */
export async function supportsDocsSlugColumn(
  prisma: PrismaService,
): Promise<boolean> {
  if (docsSlugColumnCached !== null) return docsSlugColumnCached;
  if (!prisma.isEnabled()) {
    docsSlugColumnCached = false;
    return false;
  }

  try {
    const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'nest_auth'
          AND table_name = 'api_key'
          AND column_name = 'docs_slug'
      ) AS "exists"
    `;
    docsSlugColumnCached = Boolean(rows[0]?.exists);
  } catch {
    docsSlugColumnCached = false;
  }

  return docsSlugColumnCached;
}

type LegacyApiKeyRow = {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  active: boolean;
  cproductor: number | null;
  ccanalalt: number | null;
  cscanalalt: number | null;
  ctipocanal: string | null;
  xcanal_venta: string | null;
  created_at: Date;
  expires_at: Date | null;
  last_used_at: Date | null;
  revoked_at: Date | null;
  docs_slug?: string | null;
};

export function mapLegacyApiKeyRow(row: LegacyApiKeyRow): ApiKeyRecord {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.key_prefix,
    docsSlug: row.docs_slug ?? null,
    scopes: row.scopes ?? [],
    active: row.active,
    cproductor: row.cproductor,
    ccanalalt: row.ccanalalt,
    cscanalalt: row.cscanalalt,
    ctipocanal: row.ctipocanal,
    xcanalVenta: row.xcanal_venta,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

const LEGACY_SELECT = `
  id, name, key_prefix, scopes, active,
  cproductor, ccanalalt, cscanalalt, ctipocanal, xcanal_venta,
  created_at, expires_at, last_used_at, revoked_at
`;

export async function listApiKeysLegacy(
  prisma: PrismaService,
  withDocsSlug: boolean,
): Promise<ApiKeyRecord[]> {
  const select = withDocsSlug
    ? `${LEGACY_SELECT}, docs_slug`
    : LEGACY_SELECT;
  const rows = await prisma.$queryRawUnsafe<LegacyApiKeyRow[]>(
    `SELECT ${select} FROM nest_auth.api_key ORDER BY created_at DESC`,
  );
  return rows.map(mapLegacyApiKeyRow);
}

export async function findApiKeyByHashLegacy(
  prisma: PrismaService,
  keyHash: string,
  withDocsSlug: boolean,
): Promise<ApiKeyRecord | null> {
  const select = withDocsSlug
    ? `${LEGACY_SELECT}, docs_slug`
    : LEGACY_SELECT;
  const rows = await prisma.$queryRawUnsafe<LegacyApiKeyRow[]>(
    `SELECT ${select} FROM nest_auth.api_key WHERE key_hash = $1 LIMIT 1`,
    keyHash,
  );
  return rows[0] ? mapLegacyApiKeyRow(rows[0]) : null;
}

export async function findApiKeyByDocsSlugLegacy(
  prisma: PrismaService,
  docsSlug: string,
): Promise<ApiKeyRecord | null> {
  const rows = await prisma.$queryRawUnsafe<LegacyApiKeyRow[]>(
    `SELECT ${LEGACY_SELECT}, docs_slug
     FROM nest_auth.api_key WHERE docs_slug = $1 LIMIT 1`,
    docsSlug,
  );
  return rows[0] ? mapLegacyApiKeyRow(rows[0]) : null;
}

export async function findApiKeyByIdLegacy(
  prisma: PrismaService,
  id: string,
  withDocsSlug: boolean,
): Promise<ApiKeyRecord | null> {
  const select = withDocsSlug
    ? `${LEGACY_SELECT}, docs_slug`
    : LEGACY_SELECT;
  const rows = await prisma.$queryRawUnsafe<LegacyApiKeyRow[]>(
    `SELECT ${select} FROM nest_auth.api_key WHERE id = $1 LIMIT 1`,
    id,
  );
  return rows[0] ? mapLegacyApiKeyRow(rows[0]) : null;
}

export async function touchApiKeyLastUsedLegacy(
  prisma: PrismaService,
  id: string,
): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE nest_auth.api_key SET last_used_at = NOW() WHERE id = $1`,
    id,
  );
}

export async function updateApiKeyDocsSlugLegacy(
  prisma: PrismaService,
  id: string,
  docsSlug: string,
): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE nest_auth.api_key SET docs_slug = $1 WHERE id = $2`,
    docsSlug,
    id,
  );
}

export async function createApiKeyLegacy(
  prisma: PrismaService,
  data: {
    id: string;
    name: string;
    keyPrefix: string;
    keyHash: string;
    scopes: string[];
    cproductor?: number | null;
    ccanalalt?: number | null;
    cscanalalt?: number | null;
    ctipocanal?: string | null;
    xcanalVenta?: string | null;
    expiresAt?: Date | null;
    docsSlug?: string | null;
  },
  withDocsSlug: boolean,
): Promise<ApiKeyRecord> {
  const columns = [
    'id',
    'name',
    'key_prefix',
    'key_hash',
    'scopes',
    'cproductor',
    'ccanalalt',
    'cscanalalt',
    'ctipocanal',
    'xcanal_venta',
    'expires_at',
  ];
  const values = [
    data.id,
    data.name,
    data.keyPrefix,
    data.keyHash,
    data.scopes,
    data.cproductor ?? null,
    data.ccanalalt ?? null,
    data.cscanalalt ?? null,
    data.ctipocanal ?? null,
    data.xcanalVenta ?? null,
    data.expiresAt ?? null,
  ];

  if (withDocsSlug) {
    columns.push('docs_slug');
    values.push(data.docsSlug ?? null);
  }

  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
  const returning = withDocsSlug
    ? `${LEGACY_SELECT}, docs_slug`
    : LEGACY_SELECT;

  const rows = await prisma.$queryRawUnsafe<LegacyApiKeyRow[]>(
    `INSERT INTO nest_auth.api_key (${columns.join(', ')})
     VALUES (${placeholders})
     RETURNING ${returning}`,
    ...values,
  );

  return mapLegacyApiKeyRow(rows[0]);
}

export async function revokeApiKeyLegacy(
  prisma: PrismaService,
  id: string,
  withDocsSlug: boolean,
): Promise<ApiKeyRecord | null> {
  await prisma.$executeRawUnsafe(
    `UPDATE nest_auth.api_key SET active = false, revoked_at = NOW() WHERE id = $1`,
    id,
  );
  return findApiKeyByIdLegacy(prisma, id, withDocsSlug);
}

export async function updateApiKeyLegacy(
  prisma: PrismaService,
  id: string,
  patch: {
    name?: string;
    scopes?: string[];
    active?: boolean;
    cproductor?: number;
    ccanalalt?: number;
    cscanalalt?: number;
    ctipocanal?: string;
    xcanalVenta?: string;
  },
  withDocsSlug: boolean,
): Promise<ApiKeyRecord | null> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (patch.name !== undefined) {
    sets.push(`name = $${idx++}`);
    values.push(patch.name);
  }
  if (patch.scopes !== undefined) {
    sets.push(`scopes = $${idx++}`);
    values.push(patch.scopes);
  }
  if (patch.active !== undefined) {
    sets.push(`active = $${idx++}`);
    values.push(patch.active);
    sets.push(`revoked_at = $${idx++}`);
    values.push(patch.active ? null : new Date());
  }
  if (patch.cproductor !== undefined) {
    sets.push(`cproductor = $${idx++}`);
    values.push(patch.cproductor);
  }
  if (patch.ccanalalt !== undefined) {
    sets.push(`ccanalalt = $${idx++}`);
    values.push(patch.ccanalalt);
  }
  if (patch.cscanalalt !== undefined) {
    sets.push(`cscanalalt = $${idx++}`);
    values.push(patch.cscanalalt);
  }
  if (patch.ctipocanal !== undefined) {
    sets.push(`ctipocanal = $${idx++}`);
    values.push(patch.ctipocanal?.trim()?.slice(0, 1) || null);
  }
  if (patch.xcanalVenta !== undefined) {
    sets.push(`xcanal_venta = $${idx++}`);
    values.push(patch.xcanalVenta?.trim() || null);
  }

  if (sets.length === 0) {
    return findApiKeyByIdLegacy(prisma, id, withDocsSlug);
  }

  values.push(id);
  await prisma.$executeRawUnsafe(
    `UPDATE nest_auth.api_key SET ${sets.join(', ')} WHERE id = $${idx}`,
    ...values,
  );
  return findApiKeyByIdLegacy(prisma, id, withDocsSlug);
}
