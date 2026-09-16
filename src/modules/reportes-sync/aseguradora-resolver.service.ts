import { Injectable } from '@nestjs/common';
import { InsurerConnectionService } from './insurers/insurer-connection.service';
import { extractAseguradoraIdExplicit } from './aseguradora-context';

@Injectable()
export class AseguradoraResolverService {
  constructor(
    private readonly insurerConnection: InsurerConnectionService,
  ) {}

  private normalizeId(value: unknown): number | null {
    if (value === undefined || value === null || value === '') return null;
    const id = Number(value);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  /**
   * Resuelve id de aseguradora para sync/reportes.
   * - Header X-Aseguradora-Id, body.sync, body.filtros o body.aseguradoraId
   * - Si hay una sola activa → se infiere
   * - Si hay varias → requiere id explícito
   */
  async resolveAseguradoraId(
    explicitId?: unknown,
    body: Record<string, unknown> | null = null,
    headers: Record<string, unknown> | null = null,
  ): Promise<number | null> {
    const fromContext =
      body || headers
        ? extractAseguradoraIdExplicit(body || {}, headers || {})
        : null;
    const candidate = explicitId ?? fromContext;
    const normalized = this.normalizeId(candidate);
    if (normalized) return normalized;

    const active = await this.insurerConnection.listActiveConnectionsSafe();

    if (active.length === 0) {
      return null;
    }

    if (active.length === 1) {
      return Number(active[0].id);
    }

    return null;
  }

  aseguradoraRequiredMessage(activeCount: number): string {
    if (activeCount === 0) {
      return 'No hay aseguradoras activas configuradas en aseguradora_conexion';
    }
    return 'aseguradoraId es requerido cuando hay múltiples orígenes activos';
  }
}
