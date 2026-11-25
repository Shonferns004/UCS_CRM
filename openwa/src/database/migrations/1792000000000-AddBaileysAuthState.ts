import { MigrationInterface, QueryRunner, Table } from 'typeorm';

/**
 * Adds `baileys_auth_state`, the database-backed Baileys auth state used when
 * `BAILEYS_AUTH_STORE=database` (see BaileysAuthStateStoreService). Without the table the setting fails
 * the session's connect rather than silently relinking, which is why the migration is separate from the
 * entity: `synchronize` is off on the `data` connection for Postgres.
 *
 * The composite primary key is the same (session, category, key id) triple the file store encodes in its
 * file names, so a session can be moved between the two stores without relinking. `quarantinedAt` holds
 * the equivalent of the file store's `corrupt-<ms>/` directory: rows kept aside after unparseable creds.
 */
export class AddBaileysAuthState1792000000000 implements MigrationInterface {
  name = 'AddBaileysAuthState1792000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('baileys_auth_state')) return;
    await queryRunner.createTable(
      new Table({
        name: 'baileys_auth_state',
        columns: [
          { name: 'sessionId', type: 'varchar', length: '64', isPrimary: true },
          { name: 'category', type: 'varchar', length: '64', isPrimary: true },
          // 512 keeps the composite btree entry inside PostgreSQL's limit even at 4 bytes per character.
          { name: 'keyId', type: 'varchar', length: '512', isPrimary: true },
          { name: 'value', type: 'text', isNullable: false },
          { name: 'quarantinedAt', type: 'bigint', isNullable: true },
          {
            name: 'updatedAt',
            type: 'datetime',
            isNullable: false,
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('baileys_auth_state'))) return;
    await queryRunner.dropTable('baileys_auth_state');
  }
}
