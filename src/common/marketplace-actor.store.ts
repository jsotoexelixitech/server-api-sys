import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

type ActorRec = { cgestor: string; at: number };

const TTL_MS = 8 * 60 * 60 * 1000;

@Injectable()
export class MarketplaceActorStore {
  private readonly logger = new Logger(MarketplaceActorStore.name);
  private readonly byKey = new Map<string, ActorRec>();
  private readonly filePath =
    process.env.MARKETPLACE_ACTOR_CACHE_FILE ||
    path.join(os.tmpdir(), 'exelixi-marketplace-actor.json');

  remember(cgestor: unknown, ...keys: Array<string | null | undefined>): void {
    const g = cgestor != null ? String(cgestor).trim() : '';
    if (!g) return;
    this.hydrate();
    const rec = { cgestor: g, at: Date.now() };
    const saved: string[] = [];
    for (const raw of keys) {
      const key = raw != null ? String(raw).trim() : '';
      if (!key) continue;
      this.byKey.set(key, rec);
      saved.push(key);
    }
    this.persist();
    if (saved.length) {
      this.logger.log(`actor remember cgestor=${g} keys=${saved.join(',')}`);
    }
  }

  lookup(...keys: Array<string | null | undefined>): string {
    this.hydrate();
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

  private hydrate(): void {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const data = JSON.parse(raw) as Record<string, ActorRec>;
      if (!data || typeof data !== 'object') return;
      for (const [key, rec] of Object.entries(data)) {
        if (!rec?.cgestor || !rec.at) continue;
        if (Date.now() - rec.at > TTL_MS) continue;
        const existing = this.byKey.get(key);
        if (!existing || rec.at > existing.at) this.byKey.set(key, rec);
      }
    } catch {
      /* ignore corrupt cache */
    }
  }

  private persist(): void {
    try {
      const out: Record<string, ActorRec> = {};
      for (const [key, rec] of this.byKey.entries()) {
        if (!rec?.cgestor || Date.now() - rec.at > TTL_MS) continue;
        out[key] = rec;
      }
      fs.writeFileSync(this.filePath, JSON.stringify(out));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`actor cache persist: ${msg}`);
    }
  }
}
