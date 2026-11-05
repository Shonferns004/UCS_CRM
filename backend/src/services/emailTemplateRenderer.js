// ---------------------------------------------------------------------------
// HTML email template renderer.
//
// Turns the block-based design produced by the Accounts "Email Builder" into
// an email-client-safe HTML document and a plain-text fallback. The design
// stores dynamic tokens ({{Name}}, {{Email}}) untouched; the send/preview
// paths run applyPersonalization() over the rendered output.
// ---------------------------------------------------------------------------

const DEFAULT_SETTINGS = {
  backgroundColor: '#eef2f1',
  contentBackground: '#ffffff',
  width: 600,
  fontFamily: "'Segoe UI', Arial, Helvetica, sans-serif",
  textColor: '#1f2937',
  linkColor: '#0f766e',
  footerColor: '#6b7280',
};

const MAX_BLOCKS = 100;

const SOCIAL_LABELS = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  x: 'X',
  twitter: 'X (Twitter)',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  website: 'Website',
};

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function safeColor(value, fallback) {
  const text = String(value || '').trim();
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(text)) return text;
  if (/^rgb(a)?\([0-9.,%\s]+\)$/i.test(text)) return text;
  return fallback;
}

function safeAlign(value, fallback = 'left') {
  const text = String(value || '').trim().toLowerCase();
  return ['left', 'center', 'right'].includes(text) ? text : fallback;
}

function safeFont(value) {
  const text = String(value || '').replace(/[<>"']/g, '').trim();
  return text || DEFAULT_SETTINGS.fontFamily;
}

function safeHref(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (/^(https?:\/\/|mailto:|tel:)/i.test(url)) return url;
  return '';
}

function safeImageSrc(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(url)) return url;
  if (/^https?:\/\/[^\s"']+/i.test(url)) return url;
  return '';
}

function nl2br(value) {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, '<br />');
}

function imageMargin(align) {
  if (align === 'center') return '0 auto';
  if (align === 'right') return '0 0 0 auto';
  return '0';
}

export function applyPersonalization(value, data = {}, { html = false } = {}) {
  const name = String(data?.name ?? '').trim();
  const email = String(data?.email ?? '').trim();
  return String(value || '').replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (match, token) => {
    const key = String(token || '').toLowerCase();
    if (key === 'name') return html ? escapeHtml(name) : name;
    if (key === 'email') return html ? escapeHtml(email) : email;
    return match;
  });
}

export function validateDesign(design) {
  if (!design || typeof design !== 'object' || Array.isArray(design)) {
    throw new Error('Invalid email design');
  }
  if (!Array.isArray(design.blocks)) throw new Error('Email design must include blocks');
  if (design.blocks.length === 0) throw new Error('Add at least one block to the email');
  if (design.blocks.length > MAX_BLOCKS) throw new Error(`Too many blocks (max ${MAX_BLOCKS})`);
  return design;
}

function settingsOf(design) {
  const raw = design?.settings && typeof design.settings === 'object' ? design.settings : {};
  return {
    backgroundColor: safeColor(raw.backgroundColor, DEFAULT_SETTINGS.backgroundColor),
    contentBackground: safeColor(raw.contentBackground, DEFAULT_SETTINGS.contentBackground),
    width: clamp(raw.width, 320, 720, DEFAULT_SETTINGS.width),
    fontFamily: safeFont(raw.fontFamily),
    textColor: safeColor(raw.textColor, DEFAULT_SETTINGS.textColor),
    linkColor: safeColor(raw.linkColor, DEFAULT_SETTINGS.linkColor),
    footerColor: safeColor(raw.footerColor, DEFAULT_SETTINGS.footerColor),
  };
}

function renderLogo(block) {
  const src = safeImageSrc(block.src);
  if (!src) return '';
  const align = safeAlign(block.align, 'center');
  const width = clamp(block.width, 40, 320, 150);
  const href = safeHref(block.href);
  const alt = escapeAttr(block.alt || 'Logo');
  const img = `<img src="${escapeAttr(src)}" alt="${alt}" width="${width}" style="display:block;width:${width}px;max-width:100%;height:auto;border:0;outline:none;margin:${imageMargin(align)};" />`;
  const inner = href ? `<a href="${escapeAttr(href)}" target="_blank" style="text-decoration:none;">${img}</a>` : img;
  return `<tr><td class="eb-pad" style="padding:24px 32px 8px;text-align:${align};">${inner}</td></tr>`;
}

function renderHeader(block) {
  const src = safeImageSrc(block.src);
  if (!src) return '';
  const href = safeHref(block.href);
  const alt = escapeAttr(block.alt || 'Header image');
  const img = `<img src="${escapeAttr(src)}" alt="${alt}" style="display:block;width:100%;max-width:100%;height:auto;border:0;outline:none;" />`;
  const inner = href ? `<a href="${escapeAttr(href)}" target="_blank" style="text-decoration:none;">${img}</a>` : img;
  return `<tr><td style="padding:0;font-size:0;line-height:0;">${inner}</td></tr>`;
}

function renderHeading(block, settings) {
  const text = String(block.text || '').trim();
  if (!text) return '';
  const align = safeAlign(block.align, 'left');
  const size = clamp(block.size, 16, 40, 26);
  const color = safeColor(block.color, settings.textColor);
  return `<tr><td class="eb-pad" style="padding:24px 32px 8px;text-align:${align};">`
    + `<h1 style="margin:0;font-family:${settings.fontFamily};font-size:${size}px;line-height:1.25;font-weight:700;color:${color};">${nl2br(text)}</h1>`
    + '</td></tr>';
}

function renderText(block, settings) {
  const text = String(block.text || '').trim();
  if (!text) return '';
  const align = safeAlign(block.align, 'left');
  const size = clamp(block.size, 10, 24, 15);
  const color = safeColor(block.color, settings.textColor);
  return `<tr><td class="eb-pad" style="padding:8px 32px;text-align:${align};">`
    + `<div style="font-family:${settings.fontFamily};font-size:${size}px;line-height:1.65;color:${color};white-space:normal;">${nl2br(text)}</div>`
    + '</td></tr>';
}

function renderImage(block) {
  const src = safeImageSrc(block.src);
  if (!src) return '';
  const align = safeAlign(block.align, 'center');
  const width = clamp(block.width, 100, 600, 520);
  const href = safeHref(block.href);
  const alt = escapeAttr(block.alt || '');
  const img = `<img src="${escapeAttr(src)}" alt="${alt}" width="${width}" style="display:block;width:${width}px;max-width:100%;height:auto;border:0;outline:none;margin:${imageMargin(align)};" />`;
  const linked = href ? `<a href="${escapeAttr(href)}" target="_blank" style="text-decoration:none;">${img}</a>` : img;
  const caption = String(block.caption || '').trim()
    ? `<div style="margin-top:8px;font-size:12px;line-height:1.5;color:#6b7280;text-align:${align};">${nl2br(block.caption)}</div>`
    : '';
  return `<tr><td class="eb-pad" style="padding:12px 32px;text-align:${align};">${linked}${caption}</td></tr>`;
}

function renderImageText(block, settings) {
  const src = safeImageSrc(block.src);
  const heading = String(block.heading || '').trim();
  const text = String(block.text || '').trim();
  if (!src && !heading && !text) return '';
  const href = safeHref(block.href);
  const alt = escapeAttr(block.alt || '');
  const img = src
    ? `<img src="${escapeAttr(src)}" alt="${alt}" style="display:block;width:100%;max-width:100%;height:auto;border:0;outline:none;border-radius:8px;" />`
    : '';
  const imgCell = img
    ? `<td class="eb-stack" width="45%" valign="top" style="width:45%;">${href ? `<a href="${escapeAttr(href)}" target="_blank" style="text-decoration:none;">${img}</a>` : img}</td>`
    : '';
  const headingHtml = heading
    ? `<h2 style="margin:0 0 8px;font-family:${settings.fontFamily};font-size:19px;line-height:1.3;font-weight:700;color:${settings.textColor};">${nl2br(heading)}</h2>`
    : '';
  const textHtml = text
    ? `<div style="font-family:${settings.fontFamily};font-size:14px;line-height:1.65;color:${settings.textColor};">${nl2br(text)}</div>`
    : '';
  const textCell = `<td class="eb-stack" width="${img ? '55' : '100'}%" valign="top" style="width:${img ? '55' : '100'}%;${block.imagePosition === 'right' ? 'padding-right:18px;' : img ? 'padding-left:18px;' : ''}">${headingHtml}${textHtml}</td>`;
  const cells = block.imagePosition === 'right' ? `${textCell}${imgCell}` : `${imgCell}${textCell}`;
  return `<tr><td class="eb-pad" style="padding:12px 32px;">`
    + `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>`
    + '</td></tr>';
}

function renderGallery(block, settings) {
  const images = Array.isArray(block.images) ? block.images.filter((img) => safeImageSrc(img?.src)).slice(0, 6) : [];
  if (!images.length) return '';
  const columns = images.length >= 3 ? 3 : 2;
  const rows = [];
  for (let i = 0; i < images.length; i += columns) {
    const slice = images.slice(i, i + columns);
    const cells = slice.map((img, index) => {
      const src = safeImageSrc(img.src);
      const href = safeHref(img.href);
      const alt = escapeAttr(img.alt || '');
      const image = `<img src="${escapeAttr(src)}" alt="${alt}" style="display:block;width:100%;max-width:100%;height:auto;border:0;outline:none;border-radius:8px;" />`;
      const linked = href ? `<a href="${escapeAttr(href)}" target="_blank" style="text-decoration:none;">${image}</a>` : image;
      const caption = String(img.caption || '').trim()
        ? `<div style="margin-top:6px;font-size:11.5px;line-height:1.4;color:#6b7280;text-align:center;">${nl2br(img.caption)}</div>`
        : '';
      const pad = index === 0 ? '0 6px 6px 0' : index === slice.length - 1 ? '0 0 6px 6px' : '0 6px 6px';
      return `<td class="eb-gallery-cell" width="${Math.floor(100 / columns)}%" valign="top" style="width:${Math.floor(100 / columns)}%;padding:${pad};">${linked}${caption}</td>`;
    }).join('');
    rows.push(`<tr>${cells}</tr>`);
  }
  return `<tr><td class="eb-pad" style="padding:12px 32px;">`
    + `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="font-family:${settings.fontFamily};">${rows.join('')}</table>`
    + '</td></tr>';
}

function renderButton(block, settings) {
  const label = String(block.label || '').trim();
  const href = safeHref(block.url);
  if (!label || !href) return '';
  const align = safeAlign(block.align, 'center');
  const bg = safeColor(block.backgroundColor, settings.linkColor);
  const color = safeColor(block.textColor, '#ffffff');
  const radius = clamp(block.radius, 0, 40, 8);
  const fullWidth = block.fullWidth === true;
  const linkStyle = `display:${fullWidth ? 'block' : 'inline-block'};padding:13px 28px;font-family:${settings.fontFamily};font-size:15px;font-weight:700;line-height:1.2;color:${color};text-decoration:none;border-radius:${radius}px;`;
  const tableWidth = fullWidth ? 'width="100%" style="width:100%;"' : '';
  return `<tr><td class="eb-pad" style="padding:14px 32px;text-align:${align};">`
    + `<table role="presentation" border="0" cellpadding="0" cellspacing="0" align="${align}" ${tableWidth}>`
    + `<tr><td align="center" bgcolor="${escapeAttr(bg)}" style="border-radius:${radius}px;">`
    + `<a href="${escapeAttr(href)}" target="_blank" style="${linkStyle}">${escapeHtml(label)}</a>`
    + '</td></tr></table></td></tr>';
}

function renderSocial(block, settings) {
  const items = Array.isArray(block.items) ? block.items : [];
  const links = [];
  for (const item of items) {
    const url = safeHref(item?.url);
    if (!url) continue;
    const label = String(item?.label || '').trim() || SOCIAL_LABELS[String(item?.platform || '').toLowerCase()] || 'Link';
    links.push(`<a href="${escapeAttr(url)}" target="_blank" style="display:inline-block;margin:4px 8px;font-family:${settings.fontFamily};font-size:12.5px;font-weight:600;color:${settings.linkColor};text-decoration:none;">${escapeHtml(label)}</a>`);
  }
  if (!links.length) return '';
  return `<tr><td class="eb-pad" style="padding:12px 32px;text-align:center;">`
    + `<div style="font-family:${settings.fontFamily};font-size:12px;line-height:1.8;">${links.join('<span style="color:#cbd5e1;">|</span>')}</div>`
    + '</td></tr>';
}

function renderDivider(block) {
  const color = safeColor(block.color, '#e2e8f0');
  return `<tr><td class="eb-pad" style="padding:12px 32px;"><div style="border-top:1px solid ${color};font-size:0;line-height:0;">&nbsp;</div></td></tr>`;
}

function renderSpacer(block) {
  const height = clamp(block.height, 4, 120, 24);
  return `<tr><td style="height:${height}px;line-height:${height}px;font-size:0;">&nbsp;</td></tr>`;
}

function renderFooter(block, settings) {
  const text = String(block.text || '').trim();
  if (!text) return '';
  const align = safeAlign(block.align, 'center');
  const size = clamp(block.size, 9, 16, 11.5);
  const color = safeColor(block.color, settings.footerColor);
  return `<tr><td class="eb-pad" style="padding:20px 32px 28px;text-align:${align};">`
    + `<div style="font-family:${settings.fontFamily};font-size:${size}px;line-height:1.6;color:${color};">${nl2br(text)}</div>`
    + '</td></tr>';
}

function renderBlock(block, settings) {
  if (!block || typeof block !== 'object') return '';
  switch (String(block.type || '')) {
    case 'logo': return renderLogo(block);
    case 'header': return renderHeader(block);
    case 'heading': return renderHeading(block, settings);
    case 'text': return renderText(block, settings);
    case 'image': return renderImage(block);
    case 'imageText': return renderImageText(block, settings);
    case 'gallery': return renderGallery(block, settings);
    case 'button': return renderButton(block, settings);
    case 'social': return renderSocial(block, settings);
    case 'divider': return renderDivider(block);
    case 'spacer': return renderSpacer(block);
    case 'footer': return renderFooter(block, settings);
    default: return '';
  }
}

export function designToText(design) {
  const blocks = Array.isArray(design?.blocks) ? design.blocks : [];
  const lines = [];
  for (const block of blocks) {
    if (!block) continue;
    switch (String(block.type || '')) {
      case 'logo':
      case 'header':
        if (block.alt) lines.push(String(block.alt));
        break;
      case 'heading':
      case 'text':
      case 'footer':
        if (block.text) lines.push(String(block.text).trim());
        break;
      case 'image':
        if (block.caption) lines.push(String(block.caption).trim());
        break;
      case 'imageText':
        if (block.heading) lines.push(String(block.heading).trim());
        if (block.text) lines.push(String(block.text).trim());
        break;
      case 'gallery':
        for (const img of Array.isArray(block.images) ? block.images : []) {
          if (img?.caption) lines.push(String(img.caption).trim());
        }
        break;
      case 'button':
        if (block.label) lines.push(`${String(block.label).trim()}${block.url ? `: ${String(block.url).trim()}` : ''}`);
        break;
      case 'social':
        for (const item of Array.isArray(block.items) ? block.items : []) {
          if (!item?.url) continue;
          const label = String(item.label || '').trim() || SOCIAL_LABELS[String(item.platform || '').toLowerCase()] || 'Link';
          lines.push(`${label}: ${String(item.url).trim()}`);
        }
        break;
      default:
        break;
    }
  }
  return lines.filter(Boolean).join('\n\n');
}

export function renderEmailTemplate(design) {
  const settings = settingsOf(design);
  const blocks = Array.isArray(design?.blocks) ? design.blocks.slice(0, MAX_BLOCKS) : [];
  const body = blocks.map((block) => renderBlock(block, settings)).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no" />
<title>Email</title>
<style>
  body { margin:0; padding:0; background:${settings.backgroundColor}; }
  img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
  table { border-collapse:collapse; }
  a { color:${settings.linkColor}; }
  .eb-content { width:100%; max-width:${settings.width}px; }
  @media only screen and (max-width:600px) {
    .eb-content { width:100% !important; max-width:100% !important; }
    .eb-pad { padding-left:16px !important; padding-right:16px !important; }
    .eb-stack { display:block !important; width:100% !important; padding:0 0 12px 0 !important; }
    .eb-gallery-cell { display:block !important; width:100% !important; padding:0 0 12px 0 !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${settings.backgroundColor};">
<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background:${settings.backgroundColor};">
<tr><td align="center" style="padding:20px 10px;">
<table role="presentation" class="eb-content" width="${settings.width}" border="0" cellpadding="0" cellspacing="0" style="width:100%;max-width:${settings.width}px;background:${settings.contentBackground};border-radius:10px;overflow:hidden;">
${body}
</table>
</td></tr>
</table>
</body>
</html>`;

  return { html, text: designToText(design) };
}

export default renderEmailTemplate;
