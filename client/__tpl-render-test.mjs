// src/panels/fro/components/enhanced/TemplatePreview.render.test.mjs
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// src/panels/fro/components/enhanced/TemplatePreview.jsx
import { useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
function componentOf(template, type) {
  if (!Array.isArray(template?.components)) return null;
  return template.components.find((c) => c && c.type === type) || null;
}
function buttonsOf(template) {
  const buttons = [];
  const container = componentOf(template, "BUTTONS");
  for (const button of container?.buttons ?? []) {
    buttons.push({
      kind: String(button.type ?? "").toUpperCase(),
      label: String(button.text ?? ""),
      url: button.url ?? null,
      index: buttons.length
    });
  }
  for (const component of template?.components ?? []) {
    if (!String(component?.type ?? "").startsWith("BUTTON")) continue;
    const parameter = (component.parameters ?? []).find((p) => p?.url) ?? {};
    buttons.push({
      kind: String(component.sub_type ?? "").toUpperCase(),
      label: String(parameter.text ?? component.text ?? ""),
      url: parameter.url ?? component.url ?? null,
      index: Number.isInteger(component.index) ? component.index : buttons.length
    });
  }
  return buttons;
}
function renderText(text, values = {}) {
  const parts = [];
  const pattern = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
  let last = 0;
  let match;
  while ((match = pattern.exec(String(text ?? ""))) !== null) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index) });
    const token = match[1];
    const filled = String(values[token] ?? "").trim();
    parts.push({ token, text: filled || `{{${token}}}` });
    last = match.index + match[0].length;
  }
  if (last < String(text ?? "").length) parts.push({ text: text.slice(last) });
  return parts;
}
function TextWithBold({ text, values }) {
  const parts = renderText(text, values);
  return parts.map((part, index) => {
    if (part.token) {
      const filled = String(values?.[part.token] ?? "").trim();
      return filled ? /* @__PURE__ */ jsx("span", { style: { background: "#dcfce7", borderRadius: 3, padding: "0 2px" }, children: filled }, index) : /* @__PURE__ */ jsx("span", { style: { background: "#fef3c7", color: "#92400e", borderRadius: 3, padding: "0 3px", fontWeight: 600 }, children: `{{${part.token}}}` }, index);
    }
    return /* @__PURE__ */ jsx("span", { children: String(part.text).split(/(\*[^*\n]+\*)/g).map(
      (chunk, j) => chunk.startsWith("*") && chunk.endsWith("*") && chunk.length > 2 ? /* @__PURE__ */ jsx("strong", { children: chunk.slice(1, -1) }, j) : /* @__PURE__ */ jsx("span", { children: chunk }, j)
    ) }, index);
  });
}
function TemplatePreview({ template, values = {}, mediaUrl, mediaFormat }) {
  if (!template) return null;
  const header = componentOf(template, "HEADER");
  const body = componentOf(template, "BODY");
  const footer = componentOf(template, "FOOTER");
  const headerFormat = String(header?.format ?? "").toUpperCase();
  const buttons = buttonsOf(template);
  const previewUrl = mediaUrl || header?.example?.header_handle?.[0] || "";
  return /* @__PURE__ */ jsxs("div", { style: { maxWidth: 300 }, children: [
    /* @__PURE__ */ jsx("div", { style: { fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }, children: "WhatsApp preview" }),
    /* @__PURE__ */ jsx("div", { style: { background: "#e5ddd5", borderRadius: 8, padding: 12, display: "flex", justifyContent: "flex-start" }, children: /* @__PURE__ */ jsxs("div", { style: {
      background: "#fff",
      borderRadius: 8,
      maxWidth: 280,
      overflow: "hidden",
      boxShadow: "0 1px 1px rgba(0,0,0,.16)",
      padding: 0
    }, children: [
      previewUrl && headerFormat === "IMAGE" && /* @__PURE__ */ jsx("img", { src: previewUrl, alt: "", style: { width: "100%", display: "block", maxHeight: 220, objectFit: "cover" } }),
      previewUrl && headerFormat === "VIDEO" && /* @__PURE__ */ jsx("video", { src: previewUrl, controls: true, playsInline: true, style: { width: "100%", display: "block", maxHeight: 220 } }),
      headerFormat === "DOCUMENT" && /* @__PURE__ */ jsxs(
        "a",
        {
          href: previewUrl || void 0,
          target: "_blank",
          rel: "noreferrer",
          style: { display: "flex", alignItems: "center", gap: 8, padding: 10, background: "#f5f6f6", borderBottom: "1px solid #e9edef", textDecoration: "none", color: "inherit" },
          children: [
            /* @__PURE__ */ jsx("span", { style: { fontSize: 22 }, children: "\u{1F4C4}" }),
            /* @__PURE__ */ jsx("span", { style: { fontSize: 12, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: header?.example?.filename || "Document" })
          ]
        }
      ),
      /* @__PURE__ */ jsxs("div", { style: { padding: headerFormat === "DOCUMENT" ? "8px 10px 4px" : "8px 10px 4px" }, children: [
        headerFormat === "TEXT" && header?.text && /* @__PURE__ */ jsx("div", { style: { fontSize: 13.5, fontWeight: 700, color: "#111827", marginBottom: 3, whiteSpace: "pre-wrap" }, children: /* @__PURE__ */ jsx(TextWithBold, { text: header.text, values }) }),
        /* @__PURE__ */ jsx("div", { style: { fontSize: 13.5, color: "#111827", whiteSpace: "pre-wrap", lineHeight: 1.4 }, children: /* @__PURE__ */ jsx(TextWithBold, { text: body?.text || "", values }) }),
        footer?.text && /* @__PURE__ */ jsx("div", { style: { fontSize: 11.5, color: "#6b7280", marginTop: 4 }, children: footer.text })
      ] }),
      buttons.map((button, i) => {
        const resolvedUrl = String(button.url || "").replace(
          /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g,
          (match, token) => String(values?.[token] ?? "").trim() || match
        );
        const href = resolvedUrl && !resolvedUrl.includes("{{") ? resolvedUrl : null;
        return /* @__PURE__ */ jsx("div", { style: {
          borderTop: "1px solid #e9edef",
          padding: "9px 12px",
          textAlign: "center",
          fontSize: 13,
          fontWeight: 500,
          color: button.kind === "URL" ? "#027eb5" : "#111827"
        }, children: href ? /* @__PURE__ */ jsx("a", { href, target: "_blank", rel: "noreferrer", style: { color: "inherit" }, children: button.label || resolvedUrl }) : button.label || button.url || "Button" }, `b-${button.index}-${i}`);
      }),
      /* @__PURE__ */ jsx("div", { style: { display: "flex", justifyContent: "flex-end", padding: "2px 10px 5px" }, children: /* @__PURE__ */ jsx("span", { style: { fontSize: 10.5, color: "#667781" }, children: "12:04 PM \u2713\u2713" }) })
    ] }) }),
    /* @__PURE__ */ jsx("div", { style: { fontSize: 10.5, color: "#9ca3af", marginTop: 6 }, children: "Preview is an approximation. WhatsApp renders the final message on the donor's phone." })
  ] });
}

// src/panels/fro/components/enhanced/TemplatePreview.render.test.mjs
var tplNavratri = {
  name: "navratri",
  language: "en",
  category: "MARKETING",
  status: "APPROVED",
  headerFormat: "IMAGE",
  headerFromTemplate: true,
  headerMediaUrl: "https://example.test/navratri.jpg",
  components: [
    { type: "HEADER", format: "IMAGE" },
    { type: "BODY", text: "Dear Donor,\nPlease refer to the attached *NAVRATRI* appeal for {{name}}." },
    { type: "FOOTER", text: "Being Sevak Charitable Trust" },
    { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Yes, I will donate" }, { type: "URL", text: "Donate now", url: "https://donate.test/{{name}}" }] }
  ]
};
var tplHelloMaam = {
  name: "hello_maam",
  language: "en",
  category: "MARKETING",
  status: "APPROVED",
  components: [{ type: "BODY", text: "Hello maam... Myself {{name}} from *Being Sevak charitable trust*" }]
};
var tplReceipt = {
  name: "bsct_receipt_2",
  language: "en",
  category: "UTILITY",
  status: "APPROVED",
  headerFormat: "DOCUMENT",
  headerFromTemplate: true,
  headerMediaUrl: "https://example.test/receipt.pdf",
  components: [
    { type: "HEADER", format: "DOCUMENT", example: { filename: "receipt.pdf" } },
    { type: "BODY", text: "*Dear Donor,* Thank you for your generous support." }
  ]
};
var tplTextHeader = {
  name: "hello_world",
  language: "en_US",
  category: "UTILITY",
  status: "APPROVED",
  components: [
    { type: "HEADER", format: "TEXT", text: "Hello {{name}}" },
    { type: "BODY", text: "Welcome and congratulations!!" }
  ]
};
var cases = [
  ["IMAGE header + footer + buttons, nothing filled", tplNavratri, {}, "https://example.test/navratri.jpg"],
  ["IMAGE header, variable filled", tplNavratri, { name: "Mr Sharma" }, "https://example.test/navratri.jpg"],
  ["named variable only", tplHelloMaam, {}, null],
  ["named variable filled", tplHelloMaam, { name: "Mrs Patel" }, null],
  ["DOCUMENT header", tplReceipt, {}, "https://example.test/receipt.pdf"],
  ["TEXT header with variable", tplTextHeader, { name: "Ramesh" }, null]
];
var failures = 0;
for (const [label, template, values, mediaUrl] of cases) {
  try {
    const html = renderToStaticMarkup(
      React.createElement(TemplatePreview, { template, values, mediaUrl })
    );
    const filledVar = Object.values(values).filter(Boolean)[0];
    const checks = [
      ["renders html", html.length > 40],
      ["has bubble", html.includes("12:04 PM")],
      ["no raw {{}} leak when filled", filledVar ? !html.includes("{{" + Object.keys(values)[0] + "}}") : true],
      ["shows {{var}} when empty", Object.keys(values).length && !filledVar ? html.includes("{{" + Object.keys(values)[0] + "}}") : true]
    ];
    if (mediaUrl) checks.push(["embeds media url", html.includes(mediaUrl)]);
    if (template.components.some((c) => c.type === "FOOTER")) checks.push(["shows footer", html.includes("Being Sevak Charitable Trust")]);
    if (template.components.some((c) => c.type === "BUTTONS")) {
      checks.push(["renders quick reply", html.includes("Yes, I will donate")]);
      checks.push(["renders url button", html.includes("Donate now")]);
    }
    if (template.components.some((c) => c.type === "BODY" && c.text.includes("*"))) {
      checks.push(["renders <strong> for *bold*", html.includes("<strong>")]);
    }
    const bad = checks.filter(([, ok]) => !ok);
    if (bad.length) {
      failures++;
      console.log(`FAIL  ${label}`);
      for (const [what] of bad) console.log(`        missing: ${what}`);
      console.log(`        html: ${html.slice(0, 260)}`);
    } else {
      console.log(`PASS  ${label}  (${html.length} chars)`);
    }
  } catch (err) {
    failures++;
    console.log(`THREW ${label}`);
    console.log(`        ${err.constructor.name}: ${err.message}`);
  }
}
console.log(failures === 0 ? "\nALL RENDER CASES PASS" : `
${failures} case(s) failed`);
process.exit(failures === 0 ? 0 : 1);
