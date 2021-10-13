import { MigrationInterface, QueryRunner } from "typeorm";

export class AddExcerptAndImageToPoll1634125137636
  implements MigrationInterface
{
  name = "AddExcerptAndImageToPoll1634125137636";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "poll" ADD "excerpt" character varying NOT NULL`
    );
    await queryRunner.query(`ALTER TABLE "poll" ADD "image" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "poll" DROP COLUMN "image"`);
    await queryRunner.query(`ALTER TABLE "poll" DROP COLUMN "excerpt"`);
  }
}
