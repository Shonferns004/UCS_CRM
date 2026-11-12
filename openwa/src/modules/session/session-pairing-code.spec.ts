import { SessionService } from './session.service';
import { EngineRegistry } from '../../engine/engine-registry.service';
import { Session, SessionStatus } from './entities/session.entity';

const ID = '11111111-1111-4111-8111-111111111111';

function fixture(options: { others: Array<string | null>; own?: string | null }) {
  const row = {
    id: ID,
    name: 'pairing',
    status: SessionStatus.QR_READY,
    phone: options.own ?? null,
    config: {},
  } as Session;
  const repository = {
    findOne: jest.fn().mockResolvedValue(row),
    find: jest.fn().mockResolvedValue(options.others.filter(phone => phone !== null).map(phone => ({ phone }))),
  };
  const state = { attachTo: <T>(value: T): T => value };
  const engine = { requestPairingCode: jest.fn().mockResolvedValue('ABCD1234') };
  const registry = new EngineRegistry();
  registry.set(ID, engine as never);
  const config = { get: jest.fn((key: string) => (key === 'engine.type' ? 'baileys' : undefined)) };
  const service = new SessionService(
    repository as never,
    {} as never,
    {} as never,
    registry,
    {} as never,
    state as never,
    state as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    config as never,
  );
  return { service, repository, engine };
}

describe('SessionService.requestPairingCode', () => {
  // Baileys links a companion device, so it has no revoke hazard and may share a number with another
  // session. Pairing is a straight pass-through to the engine.
  it('asks for a code for a number no other session stores, including the session own number', async () => {
    const { service, engine } = fixture({ others: ['628222000222', null], own: '628111000111' });

    await expect(service.requestPairingCode(ID, '628111000111')).resolves.toEqual({
      pairingCode: 'ABCD1234',
      status: SessionStatus.QR_READY,
    });

    expect(engine.requestPairingCode).toHaveBeenCalledWith('628111000111');
  });

  it('allows a number another session already stores', async () => {
    const { service, repository, engine } = fixture({ others: ['628111000111'] });

    await expect(service.requestPairingCode(ID, '628111000111')).resolves.toMatchObject({ pairingCode: 'ABCD1234' });

    expect(repository.find).not.toHaveBeenCalled();
    expect(engine.requestPairingCode).toHaveBeenCalledWith('628111000111');
  });
});
