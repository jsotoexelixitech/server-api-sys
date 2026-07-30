import { createHash, randomBytes } from 'crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { buildScopeCatalog } from './scopes/scope-catalog.registry';

export interface ApiKeyRecord {
  id: string;
  name: string;
  keyPrefix: string;
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

  listKeys(): Promise<ApiKeyRecord[]> {
    if (!this.isEnabled()) return Promise.resolve([]);
    return this.prisma.apiKey.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
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

    const row = await this.prisma.apiKey.create({
      data: {
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
    });

    return { key: row, plainKey };
  }

  async revokeKey(id: string): Promise<ApiKeyRecord> {
    if (!this.isEnabled()) {
      throw new BadRequestException('PostgreSQL auth deshabilitado.');
    }

    const existing = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('API key no encontrada.');

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
    patch: { name?: string; scopes?: string[]; active?: boolean },
  ): Promise<ApiKeyRecord> {
    if (!this.isEnabled()) {
      throw new BadRequestException('PostgreSQL auth deshabilitado.');
    }

    const existing = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('API key no encontrada.');

    return this.prisma.apiKey.update({
      where: { id },
      data: {
        name: patch.name?.trim() || undefined,
        scopes: patch.scopes ? this.normalizeScopes(patch.scopes) : undefined,
        active: patch.active,
        revokedAt: patch.active === false ? new Date() : patch.active === true ? null : undefined,
      },
    });
  }

  async findByPlainKey(plain: string): Promise<ApiKeyRecord | null> {
    if (!this.isEnabled()) return null;
    const keyHash = this.hashKey(String(plain ?? '').trim());
    const row = await this.prisma.apiKey.findUnique({
      where: { keyHash },
    });
    if (!row || !row.active || row.revokedAt) return null;
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;

    await this.prisma.apiKey.update({
      where: { id: row.id },
      data: { lastUsedAt: new Date() },
    });

    return row;
  }

  async findById(id: string): Promise<ApiKeyRecord | null> {
    if (!this.isEnabled()) return null;
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
