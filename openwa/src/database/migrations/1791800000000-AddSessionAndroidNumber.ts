import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `androidNumber` to `sessions`: the Android/WhatsApp number an operator says a session will
 * link, entered at creation. It is a label only — `phone` remains the number WhatsApp reports after
 * pairing — and exists so several accounts on one phone can be told apart before they connect.
 *
 * Hand-authored because `synchronize` is off for the data connection on PostgreSQL. Idempotent:
 * checks for the column first, so a database that already synchronized the entity is untouched.
 */
export class AddSessionAndroidNumber1791800000000 implements MigrationInterface {
  name = 'AddSessionAndroidNumber1791800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('sessions');
    if (table?.findColumnByName('androidNumber')) return;
    await queryRunner.query(`ALTER TABLE "sessions" ADD COLUMN "androidNumber" varchar(20) NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('sessions');
    if (!table?.findColumnByName('androidNumber')) return;
    await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN "androidNumber"`);
  }
}
