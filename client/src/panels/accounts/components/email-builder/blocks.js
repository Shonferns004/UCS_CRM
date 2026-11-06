let counter = 0;

function newId() {
  counter += 1;
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `block_${Date.now()}_${counter}`;
}

export const BLOCK_MENU = [
  { type: 'logo', label: 'Logo', hint: 'NGO logo' },
  { type: 'header', label: 'Header image', hint: 'Full-width banner' },
  { type: 'heading', label: 'Heading', hint: 'Section title' },
  { type: 'text', label: 'Text', hint: 'Paragraph copy' },
  { type: 'image', label: 'Image', hint: 'Single photo' },
  { type: 'imageText', label: 'Image + Text', hint: 'Two-column row' },
  { type: 'gallery', label: 'Gallery', hint: '2-3 images' },
  { type: 'button', label: 'Button', hint: 'Donate / website link' },
  { type: 'social', label: 'Social links', hint: 'Facebook, Instagram...' },
  { type: 'divider', label: 'Divider', hint: 'Horizontal rule' },
  { type: 'spacer', label: 'Spacer', hint: 'Vertical gap' },
  { type: 'footer', label: 'Footer', hint: 'Contact / signature' },
];

export const SOCIAL_PLATFORMS = [
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'x', label: 'X' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'website', label: 'Website' },
];

export const DEFAULT_SETTINGS = {
  backgroundColor: '#eef2f1',
  contentBackground: '#ffffff',
  width: 600,
  fontFamily: "'Segoe UI', Arial, Helvetica, sans-serif",
  textColor: '#1f2937',
  linkColor: '#0f766e',
  footerColor: '#6b7280',
};

export function createBlock(type) {
  const id = newId();
  switch (type) {
    case 'logo':
      return { id, type, src: '', alt: 'NGO logo', width: 150, align: 'center', href: '' };
    case 'header':
      return { id, type, src: '', alt: 'Header image', href: '' };
    case 'heading':
      return { id, type, text: 'A message from Being Sevak', align: 'left', size: 26, color: '#1f2937' };
    case 'text':
      return { id, type, text: 'Dear {{Name}},\n\nThank you for being part of our journey. Your support helps us serve more communities every day.', align: 'left', size: 15, color: '#1f2937' };
    case 'image':
      return { id, type, src: '', alt: '', caption: '', href: '', align: 'center', width: 520 };
    case 'imageText':
      return { id, type, src: '', alt: '', heading: 'Our work', text: 'Share a short update about your programmes and the impact donors made possible.', imagePosition: 'left', href: '' };
    case 'gallery':
      return { id, type, images: [{ src: '', alt: '', caption: '', href: '' }, { src: '', alt: '', caption: '', href: '' }] };
    case 'button':
      return { id, type, label: 'Donate now', url: 'https://beingsevak.org/donate', align: 'center', backgroundColor: '#0f766e', textColor: '#ffffff', radius: 8, fullWidth: false };
    case 'social':
      return { id, type, items: [{ platform: 'facebook', label: 'Facebook', url: '' }, { platform: 'instagram', label: 'Instagram', url: '' }] };
    case 'divider':
      return { id, type, color: '#e2e8f0' };
    case 'spacer':
      return { id, type, height: 24 };
    case 'footer':
      return { id, type, text: 'Team Being Sevak\nbeingsevak.org', align: 'center', size: 11.5, color: '#6b7280' };
    default:
      return { id, type: 'text', text: '' };
  }
}

export function createDefaultDesign() {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    blocks: [
      createBlock('logo'),
      createBlock('header'),
      createBlock('heading'),
      createBlock('text'),
      createBlock('button'),
      createBlock('social'),
      createBlock('footer'),
    ],
  };
}

export function blockLabel(type) {
  return BLOCK_MENU.find((item) => item.type === type)?.label || type;
}
