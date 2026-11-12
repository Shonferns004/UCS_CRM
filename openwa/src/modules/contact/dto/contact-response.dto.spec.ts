import 'reflect-metadata';
import { DECORATORS } from '@nestjs/swagger';
import { ContactDto } from './contact-response.dto';
import { BaileysSessionStore } from '../../../engine/adapters/baileys-session-store';

const description = (key: string): string | undefined =>
  (
    Reflect.getMetadata(DECORATORS.API_MODEL_PROPERTIES, ContactDto.prototype, key) as
      { description?: string } | undefined
  )?.description;

// A lid's digits are not a phone number. This reads what the engine emits next to the text that
// describes it.
describe('ContactDto.number', () => {
  it('publishes what the engine carries for a lid contact', () => {
    expect(description('number')).toBe(
      'MSISDN digits, without a leading + or any separators, for a `<phone>@c.us` contact. For a `<lid>@lid` ' +
        "contact it carries the phone's digits when the phone is known and an empty string when it is not; " +
        "the digits are never the lid's own, which are not a phone number.",
    );
  });

  it('is the phone digits for a lid contact whose phone is known and empty otherwise', () => {
    const store = new BaileysSessionStore();
    store.upsertContacts([
      { id: '123456789012345@lid', name: 'Ada', phoneNumber: '628123456789@s.whatsapp.net' },
      { id: '223456789012345@lid', name: 'Grace' },
    ]);

    const byId = Object.fromEntries(store.listContacts().map(c => [c.id, c.number]));

    expect(byId).toEqual({ '123456789012345@lid': '628123456789', '223456789012345@lid': '' });
  });
});
