import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInlineImageAttachments, resolveLocalEmailAsset } from './emailImageAssets.js';

test('resolveLocalEmailAsset accepts absolute, relative and localhost URLs', () => {
  assert.equal(resolveLocalEmailAsset('/uploads/email-assets/email_1_abc.png'), 'email_1_abc.png');
  assert.equal(resolveLocalEmailAsset('http://localhost:5000/uploads/email-assets/email_1_abc.png'), 'email_1_abc.png');
  assert.equal(resolveLocalEmailAsset('https://api.example.org/uploads/email-assets/email_1_abc.jpg'), 'email_1_abc.jpg');
});

test('resolveLocalEmailAsset ignores external and unsafe URLs', () => {
  assert.equal(resolveLocalEmailAsset('https://example.com/photo.png'), null);
  assert.equal(resolveLocalEmailAsset('/uploads/email-assets/../secret.txt'), null);
  assert.equal(resolveLocalEmailAsset('/uploads/other/photo.png'), null);
  assert.equal(resolveLocalEmailAsset(''), null);
});

test('buildInlineImageAttachments leaves external images untouched', async () => {
  const html = '<img src="https://example.com/photo.png" alt="" />';
  const result = await buildInlineImageAttachments(html);
  assert.equal(result.html, html);
  assert.deepEqual(result.attachments, []);
});

test('buildInlineImageAttachments leaves missing local files untouched', async () => {
  const html = '<img src="/uploads/email-assets/does_not_exist_12345.png" alt="" />';
  const result = await buildInlineImageAttachments(html);
  assert.equal(result.html, html);
  assert.deepEqual(result.attachments, []);
});
