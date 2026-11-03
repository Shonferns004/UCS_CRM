import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Session } from '../../session/entities/session.entity';

// One template name per session: makes resolve-by-name deterministic and rejects duplicates.
// Mirrored by the AddTemplateNameUnique migration for non-synchronize (Postgres / opted-out) DBs.
@Index('IDX_templates_session_name', ['sessionId', 'name'], { unique: true })
@Entity('templates')
export class Template {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // varchar (not uuid) to match the authoritative migration DDL and sessions.id; the data connection
  // runs synchronize:false, so a 'uuid' decorator here would only mislead schema diffs / a stray sync.
  @Column({ type: 'varchar' })
  sessionId!: string;

  @ManyToOne(() => Session, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sessionId' })
  session!: Session;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'text', nullable: true })
  header!: string | null;

  @Column({ type: 'text', nullable: true })
  footer!: string | null;

  // A template is a reusable message of one type. Media templates store a URL (not bytes):
  // the Broadcast page attaches it to every recipient's bulk message.
  @Column({ type: 'varchar', length: 20, default: 'text' })
  messageType!: string;

  @Column({ type: 'text', nullable: true })
  mediaUrl!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  mediaFilename!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
