import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Renames the short-lived `sessions.androidNumber` column to `androidName` and widens it to a free
 * text label. The field records which Android phone/account a session is meant for, which is a name
 * ("Office Android", "Redmi — accounts"), not a phone number. The value is copied across rather than
 * dropped, so a database that already used the old column keeps what was entered.
 *
 * Works on both SQLite and PostgreSQL without a table rebuild: add the new column, copy, drop the
 * old one. Idempotent — a fresh database that runs the earlier migration first simply converts it.
 */
export class RenameAndroidNumberToName1791900000000 implements MigrationInterface {
  name = 'RenameAndroidNumberToName1791900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('sessions');
    if (!table) return;
    const hasOld = table.findColumnByName('androidNumber');
    const hasNew = table.findColumnByName('androidName');

    if (!hasNew) {
      await queryRunner.query(`ALTER TABLE "sessions" ADD COLUMN "androidName" varchar(100) NULL`);
    }
    if (hasOld) {
      await queryRunner.query(`UPDATE "sessions" SET "androidName" = "androidNumber" WHERE "androidName" IS NULL`);
      await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN "androidNumber"`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('sessions');
    if (!table) return;
    const hasNew = table.findColumnByName('androidName');
    const hasOld = table.findColumnByName('androidNumber');

    if (!hasOld) {
      await queryRunner.query(`ALTER TABLE "sessions" ADD COLUMN "androidNumber" varchar(20) NULL`);
    }
    if (hasNew) {
      await queryRunner.query(
        `UPDATE "sessions" SET "androidNumber" = SUBSTR("androidName", 1, 20) WHERE "androidNumber" IS NULL`,
      );
      await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN "androidName"`);
    }
  }
}
