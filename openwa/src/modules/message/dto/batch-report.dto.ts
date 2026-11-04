import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BatchStatus } from '../entities/message-batch.entity';
import type { BatchReportDelivery, BatchReportReply } from '../batch-report';

export class BatchReportRecipientDto {
  @ApiProperty({ example: '628123456789@c.us' })
  chatId!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'WhatsApp message id assigned to this recipient, null when the send failed before one existed.',
    example: 'true_628123456789@c.us_3EB0123456789',
  })
  messageId!: string | null;

  @ApiProperty({
    enum: ['pending', 'sent', 'delivered', 'read', 'failed', 'cancelled'],
    description:
      'Delivery state from the stored message row (a later ack upgrades sent → delivered → read). ' +
      'Failed/cancelled come from the batch result; pending means no row/ack yet.',
    example: 'delivered',
  })
  delivery!: BatchReportDelivery;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  sentAt!: string | null;

  @ApiPropertyOptional({
    enum: ['yes', 'no', 'other'],
    nullable: true,
    description: "The first inbound reply after the batch started, classified as yes/no/other. Null when nobody replied.",
    example: 'yes',
  })
  reply!: BatchReportReply;

  @ApiPropertyOptional({ type: String, nullable: true, description: "The reply text as WhatsApp delivered it." })
  replyText!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  repliedAt!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "Donor name carried by the batch's template variables (`{{name}}` / `{{donor_name}}`), when sent.",
  })
  name?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "Phone carried by the batch's template variables (`{{mobile}}`), when sent.",
  })
  mobile?: string | null;
}

export class BatchReportResponseDto {
  @ApiProperty({ example: 'batch_abc123' })
  batchId!: string;

  @ApiProperty({ enum: BatchStatus, example: BatchStatus.COMPLETED })
  status!: BatchStatus;

  @ApiProperty({ example: 120, description: 'Recipients in the batch (from its progress).' })
  total!: number;

  @ApiProperty({ example: 118, description: 'Recipients the batch has attempted so far.' })
  attempted!: number;

  @ApiProperty({ example: 112, description: 'Accepted by WhatsApp (sent, delivered or read).' })
  accepted!: number;

  @ApiProperty({ example: 90, description: 'Delivered or read (a read receipt implies delivery).' })
  delivered!: number;

  @ApiProperty({ example: 40, description: 'Read receipts.' })
  read!: number;

  @ApiProperty({ example: 4 })
  failed!: number;

  @ApiProperty({ example: 2 })
  pending!: number;

  @ApiProperty({ example: 0 })
  cancelled!: number;

  @ApiProperty({ example: 21, description: 'Recipients who answered at all.' })
  replied!: number;

  @ApiProperty({ example: 12 })
  repliedYes!: number;

  @ApiProperty({ example: 6 })
  repliedNo!: number;

  @ApiProperty({ example: 3, description: 'Answered with something that is neither yes nor no.' })
  repliedOther!: number;

  @ApiProperty({ example: 97, description: 'Attempted recipients with no inbound reply.' })
  noReply!: number;

  @ApiProperty({ type: [BatchReportRecipientDto] })
  recipients!: BatchReportRecipientDto[];
}

/** One row of the recent-broadcasts list: the report's totals without the recipient rows. */
export class BatchReportSummaryDto {
  @ApiProperty({ example: 'batch_abc123' })
  batchId!: string;

  @ApiProperty({ enum: BatchStatus, example: BatchStatus.COMPLETED })
  status!: BatchStatus;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  createdAt!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  startedAt!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  completedAt!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'First line of the sent message.' })
  preview!: string | null;

  @ApiProperty({ example: 120 })
  total!: number;

  @ApiProperty({ example: 90 })
  delivered!: number;

  @ApiProperty({ example: 40 })
  read!: number;

  @ApiProperty({ example: 4 })
  failed!: number;

  @ApiProperty({ example: 21 })
  replied!: number;

  @ApiProperty({ example: 12 })
  repliedYes!: number;

  @ApiProperty({ example: 6 })
  repliedNo!: number;

  @ApiProperty({ example: 3 })
  repliedOther!: number;

  @ApiProperty({ example: 97 })
  noReply!: number;
}

export class BatchHistoryResponseDto {
  @ApiProperty({ type: [BatchReportSummaryDto] })
  batches!: BatchReportSummaryDto[];
}
