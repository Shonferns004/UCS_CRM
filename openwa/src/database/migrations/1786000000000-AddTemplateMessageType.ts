import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the message kind to templates: a template may describe a text message (the old
 * behaviour, the default) or a media message whose URL the Broadcast page attaches.
 *
 * Hand-authored because the `data` connection runs with synchronize:false. Idempotent:
 * boot and CLI may both run it, and a newer DB created from the entity already has them.
 */
export class AddTemplateMessageType1786000000000 implements MigrationInterface {
  name = 'AddTemplateMessageType1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('templates'))) return;

    if (!(await queryRunner.hasColumn('templates', 'messageType'))) {
      await queryRunner.query(
        `ALTER TABLE "templates" ADD COLUMN "messageType" varchar(20) NOT NULL DEFAULT 'text'`,
      );
    }
    if (!(await queryRunner.hasColumn('templates', 'mediaUrl'))) {
      await queryRunner.query(`ALTER TABLE "templates" ADD COLUMN "mediaUrl" text`);
    }
    if (!(await queryRunner.hasColumn('templates', 'mediaFilename'))) {
      await queryRunner.query(`ALTER TABLE "templates" ADD COLUMN "mediaFilename" varchar(255)`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('templates'))) return;
    // DROP COLUMN is supported by SQLite 3.35+ and every supported PostgreSQL; guarded so a
    // revert on an older engine leaves the (harmless) extra columns instead of failing.
    for (const column of ['mediaFilename', 'mediaUrl', 'messageType']) {
      try {
        if (await queryRunner.hasColumn('templates', column)) {
          await queryRunner.query(`ALTER TABLE "templates" DROP COLUMN "${column}"`);
        }
      } catch {
        /* leave the column in place on engines without DROP COLUMN */
      }
    }
  }
}
