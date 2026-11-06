import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPersonalization,
  designToText,
  escapeHtml,
  renderEmailTemplate,
  validateDesign,
} from './emailTemplateRenderer.js';

const baseDesign = {
  settings: { width: 600, backgroundColor: '#eef2f1' },
  blocks: [
    { type: 'logo', src: 'https://example.com/logo.png', alt: 'NGO logo', width: 140, align: 'center' },
    { type: 'header', src: 'https://example.com/hero.jpg', alt: 'Hero' },
    { type: 'heading', text: 'Welcome {{Name}}', align: 'center' },
    { type: 'text', text: 'Hello {{Name}},\nYour email is {{Email}}.' },
    { type: 'image', src: 'https://example.com/photo.jpg', caption: 'Our work' },
    { type: 'imageText', src: 'https://example.com/side.jpg', heading: 'Our mission', text: 'Serving communities.' },
    { type: 'gallery', images: [{ src: 'https://example.com/a.jpg', caption: 'A' }, { src: 'https://example.com/b.jpg' }], columns: 2 },
    { type: 'button', label: 'Donate now', url: 'https://example.com/donate', align: 'center' },
    { type: 'social', items: [{ platform: 'facebook', url: 'https://facebook.com/ngo' }, { platform: 'instagram', url: 'https://instagram.com/ngo' }] },
    { type: 'divider' },
    { type: 'spacer', height: 24 },
    { type: 'footer', text: 'Team Being Sevak' },
  ],
};

test('renders every supported block into email-safe html', () => {
  const { html, text } = renderEmailTemplate(baseDesign);
  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /max-width:600px/);
  assert.match(html, /@media only screen and \(max-width:600px\)/);
  assert.match(html, /https:\/\/example.com\/logo.png/);
  assert.match(html, /https:\/\/example.com\/donate/);
  assert.match(html, /Donate now/);
  assert.match(html, /Facebook/);
  assert.match(html, /{{Name}}/);
  assert.match(html, /{{Email}}/);
  assert.match(text, /Welcome {{Name}}/);
});

test('escapes user text and blocks unsafe urls', () => {
  const { html } = renderEmailTemplate({
    blocks: [
      { type: 'text', text: '<script>alert(1)</script>' },
      { type: 'button', label: 'Bad', url: 'javascript:alert(1)' },
      { type: 'image', src: 'javascript:alert(1)' },
    ],
  });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /javascript:/);
});

test('personalizes name and email with html escaping', () => {
  const value = 'Hi {{Name}} ({{Email}})';
  assert.equal(applyPersonalization(value, { name: 'Aarav', email: 'aarav@example.com' }), 'Hi Aarav (aarav@example.com)');
  assert.equal(
    applyPersonalization(value, { name: '<b>Aarav</b>', email: 'aarav@example.com' }, { html: true }),
    'Hi &lt;b&gt;Aarav&lt;/b&gt; (aarav@example.com)',
  );
});

test('validateDesign rejects empty or malformed designs', () => {
  assert.throws(() => validateDesign(null), /Invalid email design/);
  assert.throws(() => validateDesign({}), /blocks/);
  assert.throws(() => validateDesign({ blocks: [] }), /at least one block/i);
  assert.equal(validateDesign(baseDesign), baseDesign);
});

test('designToText keeps readable fallback content', () => {
  const text = designToText(baseDesign);
  assert.match(text, /NGO logo/);
  assert.match(text, /Welcome {{Name}}/);
  assert.match(text, /Our mission/);
  assert.match(text, /Donate now/);
  assert.match(text, /Facebook/);
});

test('escapeHtml escapes all special characters', () => {
  assert.equal(escapeHtml(`<&>"'`), '&lt;&amp;&gt;&quot;&#39;');
});
