import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { DECORATORS } from '@nestjs/swagger';
import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { GLOBAL_VALIDATION_OPTIONS } from '../../../config/app-validation';
import { CreateSessionDto } from './create-session.dto';

// The session name is a free-text label: only emptiness, length and control characters are refused,
// so an operator can name a number after a person or station with the punctuation they use.
describe('CreateSessionDto name validation', () => {
  const failing = (name: unknown): string[] =>
    validateSync(
      plainToInstance(CreateSessionDto, { name }, GLOBAL_VALIDATION_OPTIONS.transformOptions),
      GLOBAL_VALIDATION_OPTIONS,
    ).map(error => error.property);

  it.each([
    ['a single character', 'a'],
    ['the longest name, 50 characters', 'a'.repeat(50)],
    ['letters, digits and hyphens', 'My-Bot-01'],
    ['spaces', 'my bot'],
    ['an underscore and a dot', 'my_bot.v2'],
    ['symbols and a slash', 'Hiral 1 · BFD/BOD & co.'],
    ['a non-ASCII letter', 'bot-é'],
    ['a non-Latin script', 'हीरल-1'],
    ['an emoji', '🔥-1'],
  ])('accepts %s', (_label, name) => {
    expect(failing(name)).toEqual([]);
  });

  it.each([
    ['51 characters', 'a'.repeat(51)],
    ['an empty name', ''],
    ['only spaces', '   '],
    ['a control character', 'line\nbreak'],
    ['an object instead of a string', { value: 'abc' }],
  ])('rejects %s', (_label, name) => {
    expect(failing(name)).toEqual(['name']);
  });

  it('rejects a missing name', () => {
    expect(failing(undefined)).toEqual(['name']);
  });
});

describe('CreateSessionDto proxyUrl validation', () => {
  const errs = (proxyUrl: string): ReturnType<typeof validateSync> =>
    validateSync(plainToInstance(CreateSessionDto, { name: 'my-bot', proxyUrl }));

  it.each([
    'http://proxy.example.com:8080',
    'http://user:pass@proxy.example.com:8080',
    'https://proxy.example.com:8443',
    'socks5://proxy.example.com:1080',
    'socks4://proxy.example.com:1080',
    // Single-label hosts are common in containerized setups (e.g. a `squid` service) — must validate.
    'http://localhost:8080',
    'http://squid:3128',
    'socks5://proxy:1080',
    'http://10.0.0.1:8080',
  ])('accepts a valid proxy URL: %s', url => {
    expect(errs(url)).toHaveLength(0);
  });

  it.each([
    'not a url',
    'proxy.example.com:8080', // no scheme
    'ftp://proxy.example.com:21', // unsupported scheme
    'javascript:alert(1)',
  ])('rejects an invalid / non-proxy-scheme proxyUrl: %s', url => {
    expect(errs(url).length).toBeGreaterThan(0);
  });

  it('allows an omitted proxyUrl (optional)', () => {
    expect(validateSync(plainToInstance(CreateSessionDto, { name: 'my-bot' }))).toHaveLength(0);
  });

  // @nestjs/swagger derives no bound from @MaxCodePoints, so the decorator has to state it.
  it('publishes the 255 code point cap', () => {
    const published = Reflect.getMetadata(DECORATORS.API_MODEL_PROPERTIES, CreateSessionDto.prototype, 'proxyUrl') as
      { maxLength?: number } | undefined;
    expect(published?.maxLength).toBe(255);
  });
});

describe('CreateSessionDto config validation', () => {
  const errs = (config: unknown): ReturnType<typeof validateSync> =>
    validateSync(plainToInstance(CreateSessionDto, { name: 'my-bot', config }));

  it.each([['abc'], [[1, 2]], [42]])('rejects a config that is not an object: %j', config => {
    expect(errs(config).map(e => e.property)).toEqual(['config']);
  });

  it('accepts an object, unknown keys included (they are stored but ignored)', () => {
    expect(errs({ maxReconnectAttempts: 5, custom: 'x' })).toHaveLength(0);
  });
});

/**
 * The three keys the session reads are held to the same rules as PATCH /config. Stored unvalidated, an
 * out-of-range value was clamped at start time without a word: -1 or 0.5 became 0 and disabled
 * reconnect, and the string "true" left autoRejectCalls off.
 */
describe('CreateSessionDto config keys through the global pipe', () => {
  const pipe = new ValidationPipe(GLOBAL_VALIDATION_OPTIONS);
  const create = (config: Record<string, unknown>): Promise<CreateSessionDto> =>
    pipe.transform(
      { name: 'my-bot', config },
      { type: 'body', metatype: CreateSessionDto },
    ) as Promise<CreateSessionDto>;

  it.each([
    [{ maxReconnectAttempts: -1 }, 'config.maxReconnectAttempts must not be less than 0'],
    [{ maxReconnectAttempts: 0.5 }, 'config.maxReconnectAttempts must be an integer number'],
    [{ maxReconnectAttempts: 50 }, 'config.maxReconnectAttempts must not be greater than 20'],
    [{ reconnectBaseDelay: 500 }, 'config.reconnectBaseDelay must not be less than 1000'],
    [{ autoRejectCalls: 'yes' }, 'config.autoRejectCalls must be a boolean value'],
  ])('refuses %j with a 400 naming the key', async (config, message) => {
    const error = await create(config).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(BadRequestException);
    expect(((error as BadRequestException).getResponse() as { message: string[] }).message).toEqual([
      expect.stringContaining(message),
    ]);
  });

  it('stores the strict spellings PATCH /config accepts as their typed values', async () => {
    const dto = await create({ autoRejectCalls: 'true', maxReconnectAttempts: '5', reconnectBaseDelay: 2000 });
    expect(dto.config).toEqual({ autoRejectCalls: true, maxReconnectAttempts: 5, reconnectBaseDelay: 2000 });
  });

  it('keeps unknown keys and leaves absent ones absent', async () => {
    const dto = await create({ custom: 'x', maxReconnectAttempts: null });
    expect(dto.config).toEqual({ custom: 'x', maxReconnectAttempts: null });
  });
});
