import { Injectable, Logger } from '@nestjs/common';
import { ArysMembershipJob, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ArysHttpError } from './arys.client';
import { ArysMonitorReporterService } from './arys-monitor-reporter.service';
import {
  ArysMembershipConfigService,
  ArysMembershipConfigValues,
} from './arys-membership-config.service';

export type ArysJobStage =
  | 'target'
  | 'propietario'
  | 'vehiculo'
  | 'coberturas'
  | 'subscripcion';

export type ArysJobStatus = 'PENDING' | 'RETRYING' | 'SUCCESS' | 'FAILED' | 'DEAD';

/** Un trabajo RETRYING sin actividad por este tiempo se considera abandonado (proceso caído). */
const STALE_RETRYING_MS = 10 * 60 * 1000;

/**
 * Respaldo en Postgres (nest_auth) de cada intento de registrar una membresía Arys.
 * Si NEST_PG_DATABASE_URL no está configurado, todos los métodos son no-op.
 */
@Injectable()
export class ArysMembershipJobService {
  private readonly logger = new Logger(ArysMembershipJobService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ArysMembershipConfigService,
    private readonly reporter: ArysMonitorReporterService,
  ) {}

  isEnabled(): boolean {
    return this.prisma.isEnabled();
  }

  /** Crea el trabajo o, si ya existe, cuenta un nuevo intento. Devuelve null si el respaldo está apagado. */
  async begin(input: {
    cnpoliza: string;
    cpoliza?: string | null;
    xplaca?: string | null;
    tipoMembresia: number;
  }): Promise<ArysMembershipJob | null> {
    if (!this.isEnabled()) return null;
    try {
      const { maxAttempts } = await this.config.get();
      return await this.prisma.arysMembershipJob.upsert({
        where: { cnpoliza: input.cnpoliza },
        create: {
          cnpoliza: input.cnpoliza,
          cpoliza: input.cpoliza ?? null,
          xplaca: input.xplaca ?? null,
          tipoMembresia: input.tipoMembresia,
          maxAttempts,
          attempts: 1,
        },
        update: {
          status: 'RETRYING',
          attempts: { increment: 1 },
          nextRetryAt: null,
        },
      });
    } catch (err) {
      this.logWarn('begin', input.cnpoliza, err);
      return null;
    }
  }

  async get(cnpoliza: string): Promise<ArysMembershipJob | null> {
    if (!this.isEnabled()) return null;
    return this.prisma.arysMembershipJob.findUnique({ where: { cnpoliza } });
  }

  /** Guarda los ids creados en Arys para que un reintento retome desde la etapa fallida. */
  async saveProgress(
    job: ArysMembershipJob | null,
    data: { personaId?: number; vehiculoId?: number },
  ): Promise<void> {
    if (!job) return;
    try {
      await this.prisma.arysMembershipJob.update({ where: { id: job.id }, data });
    } catch (err) {
      this.logWarn('saveProgress', job.cnpoliza, err);
    }
  }

  async markSuccess(
    job: ArysMembershipJob | null,
    detail: { request: unknown; response: unknown },
  ): Promise<void> {
    if (!job) return;
    try {
      await this.prisma.$transaction([
        this.prisma.arysMembershipJob.update({
          where: { id: job.id },
          data: {
            status: 'SUCCESS',
            succeededAt: new Date(),
            nextRetryAt: null,
            lastError: null,
            lastHttpStatus: null,
            lastStage: 'subscripcion',
          },
        }),
        this.prisma.arysMembershipAttempt.create({
          data: {
            jobId: job.id,
            attemptNo: job.attempts,
            ok: true,
            stage: 'subscripcion',
            requestBody: this.toJson(detail.request),
            responseBody: JSON.stringify(detail.response ?? null).slice(0, 2000),
          },
        }),
      ]);
    } catch (err) {
      this.logWarn('markSuccess', job.cnpoliza, err);
    }
    if (job.attempts > 1) {
      void this.reporter.report({
        type: 'arys.membership.recovered',
        severity: 'info',
        title: `Membresía Arys recuperada · ${job.cnpoliza}`,
        message: `La membresía se registró en el intento ${job.attempts}.`,
        entity: job.cnpoliza,
        details: { attempts: job.attempts, personaId: job.personaId, vehiculoId: job.vehiculoId },
        dedupeKey: `arys-membership:${job.cnpoliza}:recovered`,
        notify: true,
        // cierra los incidentes abiertos por los fallos de esta póliza
        resolves: [
          `arys-membership:${job.cnpoliza}:failed`,
          `arys-membership:${job.cnpoliza}:dead`,
        ],
      });
    }
  }

  async markFailure(
    job: ArysMembershipJob | null,
    stage: ArysJobStage,
    error: unknown,
  ): Promise<void> {
    if (!job) return;
    const msg = error instanceof Error ? error.message : String(error);
    const http = error instanceof ArysHttpError ? error : null;
    const dead = job.attempts >= job.maxAttempts;
    try {
      const cfg = await this.config.get();
      await this.prisma.$transaction([
        this.prisma.arysMembershipJob.update({
          where: { id: job.id },
          data: {
            status: dead ? 'DEAD' : 'FAILED',
            lastStage: stage,
            lastError: msg.slice(0, 2000),
            lastHttpStatus: http?.httpStatus ?? null,
            nextRetryAt: dead ? null : this.nextRetryAt(job.attempts, cfg),
          },
        }),
        this.prisma.arysMembershipAttempt.create({
          data: {
            jobId: job.id,
            attemptNo: job.attempts,
            ok: false,
            stage,
            httpStatus: http?.httpStatus ?? null,
            error: msg.slice(0, 2000),
            requestBody: this.toJson(http?.requestBody),
            responseBody: http?.responseBody ?? null,
          },
        }),
      ]);
    } catch (err) {
      this.logWarn('markFailure', job.cnpoliza, err);
    }
    void this.reporter.report({
      type: dead ? 'arys.membership.dead' : 'arys.membership.failed',
      severity: dead ? 'critical' : 'warning',
      title: dead
        ? `Membresía Arys sin recuperar · ${job.cnpoliza}`
        : `Membresía Arys falló · ${job.cnpoliza}`,
      message:
        `Etapa ${stage}${http ? ` (HTTP ${http.httpStatus})` : ''}: ${msg.slice(0, 500)}` +
        (dead ? ` — agotó ${job.maxAttempts} intentos, requiere revisión manual.` : ''),
      entity: job.cnpoliza,
      details: {
        stage,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        httpStatus: http?.httpStatus ?? null,
        personaId: job.personaId,
        vehiculoId: job.vehiculoId,
        willRetry: !dead,
      },
      dedupeKey: `arys-membership:${job.cnpoliza}:${dead ? 'dead' : 'failed'}`,
      notify: dead || job.attempts === 1,
    });
  }

  /** Trabajos FAILED vencidos, o RETRYING abandonados, listos para reintentar. */
  async findDue(limit: number): Promise<ArysMembershipJob[]> {
    if (!this.isEnabled()) return [];
    const now = new Date();
    return this.prisma.arysMembershipJob.findMany({
      where: {
        OR: [
          { status: 'FAILED', nextRetryAt: { lte: now } },
          { status: 'RETRYING', updatedAt: { lt: new Date(now.getTime() - STALE_RETRYING_MS) } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  /**
   * Reserva el trabajo de forma atómica para que dos procesos (p. ej. PM2 en cluster)
   * no lo reintenten a la vez. true si esta instancia lo obtuvo.
   */
  async claim(job: ArysMembershipJob): Promise<boolean> {
    const res = await this.prisma.arysMembershipJob.updateMany({
      where: { id: job.id, status: job.status, updatedAt: job.updatedAt },
      data: { status: 'RETRYING' },
    });
    return res.count === 1;
  }

  /** Vuelve a poner en cola trabajos FAILED/DEAD (reintento manual desde el endpoint). */
  async requeue(cnpoliza: string): Promise<ArysMembershipJob | null> {
    if (!this.isEnabled()) return null;
    const job = await this.get(cnpoliza);
    if (!job || job.status === 'SUCCESS' || job.status === 'RETRYING') return job;
    return this.prisma.arysMembershipJob.update({
      where: { id: job.id },
      data: { status: 'FAILED', nextRetryAt: new Date(), maxAttempts: Math.max(job.maxAttempts, job.attempts + 1) },
    });
  }

  async list(filter: { status?: string; limit?: number }) {
    if (!this.isEnabled()) return [];
    return this.prisma.arysMembershipJob.findMany({
      where: filter.status ? { status: filter.status } : undefined,
      orderBy: { updatedAt: 'desc' },
      take: Math.min(filter.limit ?? 50, 200),
      include: { history: { orderBy: { createdAt: 'desc' }, take: 5 } },
    });
  }

  private nextRetryAt(attempts: number, cfg: ArysMembershipConfigValues): Date {
    const minutes = Math.min(
      cfg.retryBaseMinutes * 2 ** Math.max(attempts - 1, 0),
      cfg.retryMaxMinutes,
    );
    return new Date(Date.now() + minutes * 60_000);
  }

  private toJson(value: unknown): Prisma.InputJsonValue | undefined {
    if (value == null) return undefined;
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private logWarn(op: string, cnpoliza: string, err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err);
    this.logger.warn(`Respaldo Arys ${op} falló cnpoliza=${cnpoliza}: ${msg}`);
  }
}
