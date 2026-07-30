import { createHash, randomBytes } from 'crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  createApiKeyLegacy,
  findApiKeyByDocsSlugLegacy,
  findApiKeyByHashLegacy,
  findApiKeyByIdLegacy,
  listApiKeysLegacy,
  revokeApiKeyLegacy,
  supportsDocsSlugColumn,
  touchApiKeyLastUsedLegacy,
  updateApiKeyDocsSlugLegacy,
  updateApiKeyLegacy,
} from './api-key-db.support';
import { buildScopeCatalog } from './scopes/scope-catalog.registry';

export interface ApiKeyRecord {
  id: string;
  name: string;
  keyPrefix: string;
  docsSlug: string | null;
  scopes: string[];
  active: boolean;
  cproductor: number | null;
  ccanalalt: number | null;
  cscanalalt: number | null;
  ctipocanal: string | null;
  xcanalVenta: string | null;
  createdAt: Date;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

export interface CreateApiKeyInput {
  name: string;
  scopes: string[];
  cproductor?: number;
  ccanalalt?: number;
  cscanalalt?: number;
  ctipocanal?: string;
  xcanalVenta?: string;
  expiresAt?: Date;
}

export interface CreateApiKeyResult {
  key: ApiKeyRecord;
  plainKey: string;
}

@Injectable()
export class ApiKeyService {
  constructor(private readonly prisma: PrismaService) {}

  isEnabled(): boolean {
    return this.prisma.isEnabled();
  }

  hashKey(plain: string): string {
    return createHash('sha256').update(plain).digest('hex');
  }

  generatePlainKey(): string {
    return `nest_${randomBytes(24).toString('hex')}`;
  }

  generateDocsSlug(): string {
    return `doc_${randomBytes(18).toString('hex')}`;
  }

  private newApiKeyId(): string {
    return `cl${randomBytes(12).toString('hex')}`;
  }

  private async hasDocsSlugColumn(): Promise<boolean> {
    return supportsDocsSlugColumn(this.prisma);
  }

  async listKeys(): Promise<ApiKeyRecord[]> {
    if (!this.isEnabled()) return [];

    const withDocsSlug = await this.hasDocsSlugColumn();
    if (!withDocsSlug) {
      return listApiKeysLegacy(this.prisma, false);
    }

    const rows = await this.prisma.apiKey.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        docsSlug: true,
        scopes: true,
        active: true,
        cproductor: true,
        ccanalalt: true,
        cscanalalt: true,
        ctipocanal: true,
        xcanalVenta: true,
        createdAt: true,
        expiresAt: true,
        lastUsedAt: true,
        revokedAt: true,
      },
    });

    const enriched: ApiKeyRecord[] = [];
    for (const row of rows) {
      if (!row.docsSlug && row.active) {
        const docsSlug = this.generateDocsSlug();
        await updateApiKeyDocsSlugLegacy(this.prisma, row.id, docsSlug);
        enriched.push({ ...row, docsSlug });
      } else {
        enriched.push(row);
      }
    }
    return enriched;
  }

  getScopeCatalog() {
    return buildScopeCatalog();
  }

  async createKey(input: CreateApiKeyInput): Promise<CreateApiKeyResult> {
    if (!this.isEnabled()) {
      throw new BadRequestException(
        'NEST_PG_DATABASE_URL no configurada — auth en PostgreSQL deshabilitado.',
      );
    }

    const name = String(input.name ?? '').trim();
    if (!name) throw new BadRequestException('name requerido.');

    const scopes = this.normalizeScopes(input.scopes);
    const plainKey = this.generatePlainKey();
    const keyHash = this.hashKey(plainKey);
    const keyPrefix = plainKey.slice(0, 12);
    const withDocsSlug = await this.hasDocsSlugColumn();
    const docsSlug = withDocsSlug ? this.generateDocsSlug() : null;

    if (!withDocsSlug) {
      const row = await createApiKeyLegacy(
        this.prisma,
        {
          id: this.newApiKeyId(),
          name,
          keyPrefix,
          keyHash,
          scopes,
          cproductor: input.cproductor ?? null,
          ccanalalt: input.ccanalalt ?? null,
          cscanalalt: input.cscanalalt ?? null,
          ctipocanal: input.ctipocanal?.trim()?.slice(0, 1) || null,
          xcanalVenta: input.xcanalVenta?.trim() || null,
          expiresAt: input.expiresAt ?? null,
        },
        false,
      );
      return { key: row, plainKey };
    }

    const row = await this.prisma.apiKey.create({
      data: {
        name,
        keyPrefix,
        keyHash,
        docsSlug: docsSlug!,
        scopes,
        cproductor: input.cproductor ?? null,
        ccanalalt: input.ccanalalt ?? null,
        cscanalalt: input.cscanalalt ?? null,
        ctipocanal: input.ctipocanal?.trim()?.slice(0, 1) || null,
        xcanalVenta: input.xcanalVenta?.trim() || null,
        expiresAt: input.expiresAt ?? null,
      },
    });

    return { key: row, plainKey };
  }

  async revokeKey(id: string): Promise<ApiKeyRecord> {
    if (!this.isEnabled()) {
      throw new BadRequestException('PostgreSQL auth deshabilitado.');
    }

    const withDocsSlug = await this.hasDocsSlugColumn();
    const existing = withDocsSlug
      ? await this.prisma.apiKey.findUnique({ where: { id } })
      : await findApiKeyByIdLegacy(this.prisma, id, false);
    if (!existing) throw new NotFoundException('API key no encontrada.');

    if (!withDocsSlug) {
      const row = await revokeApiKeyLegacy(this.prisma, id, false);
      if (!row) throw new NotFoundException('API key no encontrada.');
      return row;
    }

    return this.prisma.apiKey.update({
      where: { id },
      data: {
        active: false,
        revokedAt: new Date(),
      },
    });
  }

  async updateKey(
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
  ): Promise<ApiKeyRecord> {
    if (!this.isEnabled()) {
      throw new BadRequestException('PostgreSQL auth deshabilitado.');
    }

    const withDocsSlug = await this.hasDocsSlugColumn();
    const existing = withDocsSlug
      ? await this.prisma.apiKey.findUnique({ where: { id } })
      : await findApiKeyByIdLegacy(this.prisma, id, false);
    if (!existing) throw new NotFoundException('API key no encontrada.');

    const normalizedPatch = {
      ...patch,
      scopes: patch.scopes ? this.normalizeScopes(patch.scopes) : undefined,
    };

    if (!withDocsSlug) {
      const row = await updateApiKeyLegacy(
        this.prisma,
        id,
        {
          ...normalizedPatch,
          cproductor: patch.cproductor,
          ccanalalt: patch.ccanalalt,
          cscanalalt: patch.cscanalalt,
          ctipocanal: patch.ctipocanal,
          xcanalVenta: patch.xcanalVenta,
        },
        false,
      );
      if (!row) throw new NotFoundException('API key no encontrada.');
      return row;
    }

    return this.prisma.apiKey.update({
      where: { id },
      data: {
        name: normalizedPatch.name?.trim() || undefined,
        scopes: normalizedPatch.scopes,
        active: normalizedPatch.active,
        cproductor: patch.cproductor,
        ccanalalt: patch.ccanalalt,
        cscanalalt: patch.cscanalalt,
        ctipocanal: patch.ctipocanal?.trim()?.slice(0, 1) || undefined,
        xcanalVenta: patch.xcanalVenta?.trim() || undefined,
        revokedAt:
          normalizedPatch.active === false
            ? new Date()
            : normalizedPatch.active === true
              ? null
              : undefined,
      },
    });
  }

  async findByPlainKey(plain: string): Promise<ApiKeyRecord | null> {
    if (!this.isEnabled()) return null;
    const keyHash = this.hashKey(String(plain ?? '').trim());
    const withDocsSlug = await this.hasDocsSlugColumn();

    const row = withDocsSlug
      ? await this.prisma.apiKey.findUnique({ where: { keyHash } })
      : await findApiKeyByHashLegacy(this.prisma, keyHash, false);

    if (!row || !row.active || row.revokedAt) return null;
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;

    if (withDocsSlug) {
      await this.prisma.apiKey.update({
        where: { id: row.id },
        data: { lastUsedAt: new Date() },
      });
    } else {
      await touchApiKeyLastUsedLegacy(this.prisma, row.id);
    }

    return row;
  }

  async findByDocsSlug(docsSlug: string): Promise<ApiKeyRecord | null> {
    if (!this.isEnabled()) return null;
    const slug = String(docsSlug ?? '').trim();
    if (!slug) return null;

    const withDocsSlug = await this.hasDocsSlugColumn();
    if (!withDocsSlug) return null;

    const row = await findApiKeyByDocsSlugLegacy(this.prisma, slug);
    if (!row || !row.active || row.revokedAt) return null;
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;
    return row;
  }

  async findById(id: string): Promise<ApiKeyRecord | null> {
    if (!this.isEnabled()) return null;
    const withDocsSlug = await this.hasDocsSlugColumn();
    if (!withDocsSlug) {
      return findApiKeyByIdLegacy(this.prisma, id, false);
    }
    return this.prisma.apiKey.findUnique({ where: { id } });
  }

  private normalizeScopes(scopes: string[]): string[] {
    const allowed = new Set(
      this.getScopeCatalog().map((s) => s.id).concat('*', 'partner:*'),
    );
    const normalized = [...new Set(scopes.map((s) => String(s).trim()).filter(Boolean))];
    const invalid = normalized.filter((s) => !allowed.has(s));
    if (invalid.length) {
      throw new BadRequestException(`Scopes inválidos: ${invalid.join(', ')}`);
    }
    return normalized;
  }
}
