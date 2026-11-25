import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Baileys auth state (the device credentials plus every Signal key) on the `data` connection, so a
 * session's WhatsApp login survives a container restart, a redeploy or a host move without a durable
 * volume. Only used when `BAILEYS_AUTH_STORE=database`; the default remains the multi-file auth dir.
 *
 * One row per (session, category, key id), the same triple the file store encodes in its file name
 * (`<category>-<id>.json`). `value` is the BufferJSON JSON text Baileys would have written to disk, so
 * the payload is byte-for-byte the file store's and a database-backed session can be moved back to a
 * file dir, or the other way, without relinking.
 *
 * `quarantinedAt` replaces the file store's `corrupt-<ms>/` move aside: when creds cannot be parsed, the
 * session's rows are marked instead of deleted, so the (possibly still linked) device's keys are kept for
 * inspection while a fresh identity starts.
 */
@Entity('baileys_auth_state')
export class BaileysAuthState {
  /** `Session.id` of the session that owns this auth state. */
  @PrimaryColumn({ type: 'varchar', length: 64 })
  sessionId!: string;

  /** Baileys key category: `creds`, `pre-key`, `session`, `app-state-sync-key`, `sender-key`, ... */
  @PrimaryColumn({ type: 'varchar', length: 64 })
  category!: string;

  /**
   * Baileys key id within the category (a pre-key id, a JID pair for a sender key, ...). 512 keeps the
   * composite primary key inside PostgreSQL's btree entry limit even at 4 bytes per character.
   */
  @PrimaryColumn({ type: 'varchar', length: 512 })
  keyId!: string;

  /** BufferJSON JSON text (`JSON.stringify(value, BufferJSON.replacer)`). Never null: a delete removes the row. */
  @Column({ type: 'text' })
  value!: string;

  /**
   * Epoch MILLISECONDS the row was moved aside because the stored creds were unusable, else null.
   * Quarantined rows are not loaded by a connect, which starts a fresh link instead.
   */
  @Column({
    type: 'bigint',
    nullable: true,
    transformer: { to: (v: number | null) => v, from: (v: string | null) => (v == null ? null : Number(v)) },
  })
  quarantinedAt!: number | null;

  @UpdateDateColumn()
  updatedAt!: Date;
}
