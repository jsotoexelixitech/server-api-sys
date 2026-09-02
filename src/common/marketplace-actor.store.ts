import { Injectable, Logger } from '@nestjs/common';

type ActorRec = { cgestor: string; at: number };

const TTL_MS = 8 * 60 * 60 * 1000;

@Injectable()
export class MarketplaceActorStore {
  private readonly logger = new Logger(MarketplaceActorStore.name);
  private readonly byKey = new Map<string, ActorRec>();

  remember(cgestor: unknown, ...keys: Array<string | null | undefined>): void {
    const g = cgestor != null ? String(cgestor).trim() : '';
    if (!g) return;
    const rec = { cgestor: g, at: Date.now() };
    for (const raw of keys) {
      const key = raw != null ? String(raw).trim() : '';
      if (!key) continue;
      this.byKey.set(key, rec);
    }
    this.logger.log(`actor remember cgestor=${g} keys=${keys.filter(Boolean).join(',')}`);
  }

  lookup(...keys: Array<string | null | undefined>): string {
    let best = '';
    for (const raw of keys) {
      const key = raw != null ? String(raw).trim() : '';
      if (!key) continue;
      const rec = this.byKey.get(key);
      if (!rec || Date.now() - rec.at > TTL_MS) continue;
      if (!best) best = rec.cgestor;
      if (rec.cgestor.includes('-') && !best.includes('-')) best = rec.cgestor;
    }
    return best;
  }
}
