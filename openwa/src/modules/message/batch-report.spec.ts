import {
  BatchStatus,
  BatchMessageStatus,
  type BatchMessageResult,
} from './entities/message-batch.entity';
import { MessageStatus } from './entities/message.entity';
import { buildBatchReport, classifyBatchReply, summariseBatchReport } from './batch-report';

const result = (chatId: string, overrides: Partial<BatchMessageResult> = {}): BatchMessageResult => ({
  chatId,
  status: BatchMessageStatus.SENT,
  messageId: `wa-${chatId}`,
  sentAt: new Date('2026-11-04T10:00:00.000Z'),
  ...overrides,
});

describe('classifyBatchReply', () => {
  it.each([
    ['yes', 'yes'],
    ['YES!', 'yes'],
    ['1. Yes please', 'yes'],
    ['✅ ok', 'yes'],
    ['haan bhejo', 'yes'],
    ['no', 'no'],
    ['No thank you', 'no'],
    ['2', 'no'],
    ['nahi chahiye', 'no'],
    ['send me details', 'yes'],
    ['maybe later', 'other'],
    ['what is this?', 'other'],
    ['', null],
    [null, null],
  ])('classifies %j as %s', (body, expected) => {
    expect(classifyBatchReply(body)).toBe(expected);
  });
});

describe('buildBatchReport', () => {
  const batch = {
    status: BatchStatus.COMPLETED,
    progress: { total: 4, sent: 3, failed: 1, pending: 0, cancelled: 0 },
    startedAt: new Date('2026-11-04T09:59:00.000Z'),
    completedAt: new Date('2026-11-04T10:01:00.000Z'),
    results: [
      result('919000000001@c.us'),
      result('919000000002@c.us', { status: BatchMessageStatus.FAILED, messageId: undefined }),
      result('919000000003@c.us'),
      result('919000000004@c.us'),
    ],
  };

  it('counts delivery acks and the first yes/no reply per chat', () => {
    const report = buildBatchReport({
      batchId: 'batch-1',
      batch,
      outbound: [
        { waMessageId: 'wa-919000000001@c.us', status: MessageStatus.READ, createdAt: batch.startedAt },
        { waMessageId: 'wa-919000000003@c.us', status: MessageStatus.DELIVERED, createdAt: batch.startedAt },
        { waMessageId: 'wa-919000000004@c.us', status: MessageStatus.SENT, createdAt: batch.startedAt },
      ],
      inbound: [
        {
          chatId: '919000000001@c.us',
          from: '919000000001@c.us',
          body: 'Yes, I want to donate',
          createdAt: new Date('2026-11-04T10:05:00.000Z'),
        },
        {
          chatId: '919000000003@c.us',
          from: '919000000003@c.us',
          body: 'no',
          createdAt: new Date('2026-11-04T10:06:00.000Z'),
        },
        // A second message from the same donor must not count as a second reply.
        {
          chatId: '919000000003@c.us',
          from: '919000000003@c.us',
          body: 'yes',
          createdAt: new Date('2026-11-04T10:07:00.000Z'),
        },
      ],
    });

    expect(report.total).toBe(4);
    expect(report.attempted).toBe(4);
    expect(report.accepted).toBe(3);
    expect(report.delivered).toBe(2); // read + delivered
    expect(report.read).toBe(1);
    expect(report.failed).toBe(1);
    expect(report.pending).toBe(0);
    expect(report.replied).toBe(2);
    expect(report.repliedYes).toBe(1);
    expect(report.repliedNo).toBe(1);
    expect(report.noReply).toBe(2);
    expect(report.recipients[0]).toMatchObject({ delivery: 'read', reply: 'yes' });
    expect(report.recipients[2]).toMatchObject({ delivery: 'delivered', reply: 'no' });
  });

  it('carries donor labels from the batch variables and summarises the totals', () => {
    const report = buildBatchReport({
      batchId: 'batch-3',
      batch: { ...batch, results: [result('919000000001@c.us')] },
      outbound: [],
      inbound: [],
      labels: new Map([['919000000001@c.us', { name: 'Asha', mobile: '919000000001' }]]),
    });
    expect(report.recipients[0]).toMatchObject({ name: 'Asha', mobile: '919000000001' });
    expect(summariseBatchReport(report, batch, 'Donation appeal')).toMatchObject({
      batchId: 'batch-3',
      preview: 'Donation appeal',
      total: 4,
      delivered: 0,
      replied: 0,
    });
  });

  it('counts a reply sent from the privacy lid mapped to the recipient phone', () => {
    const report = buildBatchReport({
      batchId: 'batch-lid',
      batch: { ...batch, results: [result('7977486261@c.us')] },
      outbound: [],
      inbound: [
        {
          chatId: '3853223231541@lid',
          from: '3853223231541@lid',
          body: 'yes',
          createdAt: new Date('2026-11-04T10:05:00.000Z'),
        },
      ],
      aliases: new Map([['7977486261@c.us', ['7977486261@c.us', '3853223231541@lid']]]),
    });
    expect(report.recipients[0].reply).toBe('yes');
    expect(report.repliedYes).toBe(1);
  });

  it('matches a reply by phone digits when the chat id differs', () => {
    const report = buildBatchReport({
      batchId: 'batch-2',
      batch: { ...batch, results: [result('919000000001@c.us')] },
      outbound: [],
      inbound: [
        {
          chatId: '212575228846175@lid',
          from: '919000000001@c.us',
          body: 'ok',
          createdAt: new Date('2026-11-04T10:05:00.000Z'),
        },
      ],
    });
    expect(report.recipients[0].reply).toBe('yes');
  });
});
