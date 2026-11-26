import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { BaileysAuthState } from './baileys-auth-state.entity';
import type { BaileysAuthRow, BaileysAuthStore } from '../types/baileys.types';

/**
 * The `data`-connection implementation of {@link BaileysAuthStore}. Reads are one query per connect
 * (the caller keeps the rows in memory), writes are one transaction per Baileys `keys.set` batch, which
 * is where most of the rows come from: a batch touches several categories at once and a half-applied
 * batch would leave Signal sessions inconsistent with their pre-keys.
 */
@Injectable()
export class BaileysAuthStateStoreService implements BaileysAuthStore {
  constructor(
    @InjectRepository(BaileysAuthState, 'data')
    private readonly repo: Repository<BaileysAuthState>,
  ) {}

  async load(sessionId: string): Promise<BaileysAuthRow[]> {
    const rows = await this.repo.find({ where: { sessionId, quarantinedAt: IsNull() } });
    return rows.map(row => ({ category: row.category, keyId: row.keyId, value: row.value }));
  }

  async write(sessionId: string, rows: BaileysAuthRow[]): Promise<void> {
    if (rows.length === 0) return;
    const puts = rows.filter((row): row is BaileysAuthRow & { value: string } => row.value !== null);
    const deletes = rows.filter(row => row.value === null);
    await this.repo.manager.transaction(async manager => {
      const repo = manager.getRepository(BaileysAuthState);
      if (puts.length > 0) {
        // quarantinedAt: null revives a row the session already had quarantined, since this value is
        // one Baileys just wrote for the live identity.
        await repo.upsert(
          puts.map(row => ({
            sessionId,
            category: row.category,
            keyId: row.keyId,
            value: row.value,
            quarantinedAt: null,
          })),
          ['sessionId', 'category', 'keyId'],
        );
      }
      for (const row of deletes) {
        await repo.delete({ sessionId, category: row.category, keyId: row.keyId });
      }
    });
  }

  async clear(sessionId: string): Promise<void> {
    await this.repo.delete({ sessionId });
  }

  async hasQuarantined(sessionId: string): Promise<boolean> {
    const quarantined = await this.repo.count({ where: { sessionId, quarantinedAt: Not(IsNull()) } });
    return quarantined > 0;
  }

  async quarantine(sessionId: string): Promise<void> {
    await this.repo.update({ sessionId }, { quarantinedAt: Date.now() });
  }
}
