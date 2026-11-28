/* Aadhaar Scan — camera, upload, and result UI. No framework, no network calls
   except the local /api endpoints. */

(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const icon = (id) => `<svg class="icon" aria-hidden="true"><use href="#${id}"/></svg>`;
  const esc = (value) =>
    String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

  const FIELD_KEYS = ["aadhaar", "name", "dob", "gender", "address"];
  const FIELD_LABELS = {
    aadhaar: "Aadhaar number",
    name: "Name",
    dob: "Date of birth",
    gender: "Gender",
    address: "Address",
    pincode: "PIN code",
  };

  const el = {
    stage: $("#stage"),
    video: $("#video"),
    snapshot: $("#snapshot"),
    canvas: $("#canvas"),
    flash: $("#flash"),
    stageEmpty: $("#stageEmpty"),
    stageTitle: $("#stageTitle"),
    stageText: $("#stageText"),
    frame: $("#frame"),
    frameLabel: $("#frameLabel"),
    snapshotTag: $("#snapshotTag"),
    snapshotTagText: $("#snapshotTagText"),
    stageBusy: $("#stageBusy"),
    busyLabel: $("#busyLabel"),
    busyTime: $("#busyTime"),
    stageError: $("#stageError"),
    stageErrorText: $("#stageErrorText"),
    stageErrorClose: $("#stageErrorClose"),

    captureBar: $("#captureBar"),
    captureTitle: $("#captureTitle"),
    captureSub: $("#captureSub"),
    idleActions: $("#idleActions"),
    startBtn: $("#startBtn"),
    startBtnText: $("#startBtnText"),
    uploadBtn: $("#uploadBtn"),
    fileInput: $("#fileInput"),
    shutterWrap: $("#shutterWrap"),
    shutter: $("#shutter"),
    shutterLabel: $("#shutterLabel"),
    captureTools: $("#captureTools"),
    captureHint: $("#captureHint"),
    liveUploadBtn: $("#liveUploadBtn"),
    torchBtn: $("#torchBtn"),

    sideButtons: $$(".side-btn"),
    details: $("#details"),
    detailsSub: $("#detailsSub"),
    tabFields: $("#tabFields"),
    tabRaw: $("#tabRaw"),
    fieldsView: $("#fieldsView"),
    rawView: $("#rawView"),
    emptyState: $("#emptyState"),
    errorBanner: $("#errorBanner"),
    errorText: $("#errorText"),
    errorDismiss: $("#errorDismiss"),
    skeleton: $("#skeleton"),
    fieldList: $("#fieldList"),
    nextStep: $("#nextStep"),
    nextIcon: $("#nextIcon"),
    nextText: $("#nextText"),
    nextBtn: $("#nextBtn"),
    detailsFoot: $("#detailsFoot"),
    copyAllBtn: $("#copyAllBtn"),
    downloadJsonBtn: $("#downloadJsonBtn"),
    clearBtn: $("#clearBtn"),

    rawPre: $("#rawPre"),
    rawEmpty: $("#rawEmpty"),
    rawMdBtn: $("#rawMdBtn"),
    rawTextBtn: $("#rawTextBtn"),
    copyRaw: $("#copyRaw"),
    downloadMd: $("#downloadMd"),

    engineChip: $("#engineChip"),
    engineLabel: $("#engineLabel"),
    engineMeta: $("#engineMeta"),
    serverBanner: $("#serverBanner"),
    aboutBtn: $("#aboutBtn"),
    aboutDialog: $("#aboutDialog"),
    toast: $("#toast"),
  };

  const state = {
    engine: { state: "loading", detail: "", version: null, mock: false },
    camera: "idle", // idle | starting | live | captured
    busy: false,
    side: "front",
    snapshotUrl: null,
    snapshotSide: null,
    stream: null,
    fields: {},
    raw: { markdown: "", text: "" },
    rawMode: "markdown",
    tab: "fields",
    lastSide: null,
    lastMeta: null,
    error: null,
    stageError: null,
    mask: false,
    torch: false,
    busyTimer: null,
    statusTimer: null,
    toastTimer: null,
    revealTimer: null,
  };

  /* ---------------------------------------------------------------------
     Helpers
     --------------------------------------------------------------------- */

  const cap = (value) => (value ? value[0].toUpperCase() + value.slice(1) : "");
  const digits = (value) => String(value || "").replace(/\D/g, "");
  const hasValue = (key) => Boolean(state.fields[key] && state.fields[key].value);
  const countFields = () => FIELD_KEYS.filter(hasValue).length;
  const hasFront = () => hasValue("aadhaar") || hasValue("name") || hasValue("dob");
  const hasAddress = () => hasValue("address");
  const isComplete = () => FIELD_KEYS.every(hasValue);

  function formatAadhaar(value) {
    const number = digits(value);
    return number.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
  }

  function maskAadhaar(value) {
    const number = digits(value);
    return `XXXX XXXX ${number.slice(-4)}`;
  }

  function setSide(side) {
    if (side !== "front" && side !== "back") return;
    state.side = side;
    el.sideButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.side === side));
    });
    el.frameLabel.textContent = `${cap(side)} side`;
    el.shutter.setAttribute("aria-label", `Capture ${side} side`);
    el.shutterLabel.textContent = `Capture ${side}`;
    renderCaptureBar();
  }

  function toast(message) {
    el.toast.innerHTML = `${icon("i-check")}<span>${esc(message)}</span>`;
    el.toast.dataset.show = "true";
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => {
      el.toast.dataset.show = "false";
    }, 1900);
  }

  async function copyText(text, message) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
      } catch {
        area.remove();
        toast("Couldn’t copy — select the text instead");
        return;
      }
      area.remove();
    }
    toast(message);
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast("Download started");
  }

  function stopStream() {
    if (state.stream) {
      state.stream.getTracks().forEach((track) => track.stop());
      state.stream = null;
    }
    el.video.srcObject = null;
    state.torch = false;
    el.torchBtn.hidden = true;
    el.torchBtn.setAttribute("aria-pressed", "false");
  }

  function setSnapshot(url, side) {
    if (state.snapshotUrl) URL.revokeObjectURL(state.snapshotUrl);
    state.snapshotUrl = url;
    state.snapshotSide = side;
    el.snapshot.src = url;
    el.snapshotTagText.textContent = `${cap(side)} side`;
    el.snapshot.alt = `Photo of the ${side} side of the Aadhaar card`;
  }

  function clearSnapshot() {
    if (state.snapshotUrl) URL.revokeObjectURL(state.snapshotUrl);
    state.snapshotUrl = null;
    state.snapshotSide = null;
    el.snapshot.removeAttribute("src");
  }

  function clearError() {
    state.error = null;
  }

  function setScanError(message) {
    state.error = message;
    renderAll();
    el.details.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function clearStageError() {
    state.stageError = null;
    el.stageError.hidden = true;
  }

  function cameraError(message) {
    state.camera = "idle";
    state.stageError = message;
    renderAll();
  }

  function startBusyTimer() {
    const started = performance.now();
    el.busyTime.textContent = "0.0s";
    clearInterval(state.busyTimer);
    state.busyTimer = setInterval(() => {
      const seconds = (performance.now() - started) / 1000;
      el.busyTime.textContent = seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`;
    }, 100);
  }

  function stopBusyTimer() {
    clearInterval(state.busyTimer);
    state.busyTimer = null;
    el.busyTime.textContent = "";
  }

  /* ---------------------------------------------------------------------
     Engine status
     --------------------------------------------------------------------- */

  function renderEngine() {
    const engine = state.engine;
    let mode = "loading";
    let label = "Starting engine";

    if (engine.mock) {
      mode = "demo";
      label = "Demo mode";
    } else if (engine.state === "ready") {
      mode = "ready";
      label = "OCR ready";
    } else if (engine.state === "loading") {
      mode = "loading";
      label = "Loading OCR";
    } else if (engine.state === "idle") {
      mode = "idle";
      label = "Loads on first scan";
    } else if (engine.state === "error") {
      mode = "error";
      label = "Engine offline";
    } else if (engine.state === "offline") {
      mode = "offline";
      label = "Server offline";
    }

    el.engineChip.dataset.state = mode;
    el.engineLabel.textContent = label;
    el.engineChip.title = [engine.detail, engine.version ? `indra-ocr ${engine.version}` : ""].filter(Boolean).join(" · ");
    el.engineMeta.textContent = engine.mock
      ? "Demo mode"
      : engine.version
        ? `Indra OCR ${engine.version}`
        : "Indra OCR";
  }

  async function refreshStatus() {
    clearTimeout(state.statusTimer);
    try {
      const response = await fetch("/api/status", { cache: "no-store" });
      if (!response.ok) throw new Error("status");
      state.engine = await response.json();
      el.serverBanner.hidden = true;
      renderEngine();
      if (state.engine.state === "loading") {
        state.statusTimer = setTimeout(refreshStatus, 1800);
      }
    } catch {
      state.engine = { state: "offline", detail: "Could not reach the local server", version: null, mock: false };
      renderEngine();
      if (location.protocol !== "file:") el.serverBanner.hidden = false;
    }
  }

  /* ---------------------------------------------------------------------
     Stage and capture bar
     --------------------------------------------------------------------- */

  function renderStage() {
    const live = state.camera === "live";
    const showSnapshot = Boolean(state.snapshotUrl) && !live;

    el.video.hidden = !live;
    el.snapshot.hidden = !showSnapshot;
    el.stageEmpty.hidden = live || showSnapshot;
    el.frame.hidden = !live;
    el.snapshotTag.hidden = !showSnapshot;
    el.stageBusy.hidden = !state.busy;
    el.stageError.hidden = !state.stageError;
    el.stage.dataset.mode = state.busy ? "processing" : state.camera;
    if (state.busy) {
      el.busyLabel.textContent = state.engine.state === "loading" ? "Warming up the OCR engine" : "Reading the card";
    }

    if (state.stageError) el.stageErrorText.textContent = state.stageError;

    if (state.camera === "starting") {
      el.stageTitle.textContent = "Opening camera";
      el.stageText.textContent = "Allow camera access if your browser asks.";
    } else if (state.stageError) {
      el.stageTitle.textContent = "Camera unavailable";
      el.stageText.textContent = "You can still upload a photo of the card.";
    } else {
      el.stageTitle.textContent = "Camera is off";
      el.stageText.textContent = "Start the camera, or upload a photo you already have.";
    }

    if (showSnapshot && state.snapshotSide) {
      el.snapshotTagText.textContent = `${cap(state.snapshotSide)} side`;
    }
  }

  function primaryAction() {
    if (state.busy) return null;
    const found = countFields();
    if (found === 0) return { label: state.error ? "Try again" : "Start camera", action: "start" };
    if (isComplete()) return { label: "Scan another", action: "another" };
    return { label: `Scan ${state.side}`, action: "side" };
  }

  function renderCaptureBar() {
    const live = state.camera === "live";
    const starting = state.camera === "starting";
    const found = countFields();
    const primary = primaryAction();

    el.idleActions.hidden = live || state.busy;
    el.startBtn.hidden = !primary;
    el.uploadBtn.hidden = state.busy || starting;
    el.shutterWrap.hidden = !live || state.busy;
    el.captureTools.hidden = !live || state.busy;

    if (starting) {
      el.startBtnText.textContent = "Opening camera…";
      el.startBtn.disabled = true;
    } else if (primary) {
      el.startBtnText.textContent = primary.label;
      el.startBtn.disabled = false;
    }

    el.shutter.setAttribute("aria-label", `Capture ${state.side} side`);
    el.shutterLabel.textContent = `Capture ${state.side}`;
    el.frameLabel.textContent = `${cap(state.side)} side`;
    el.captureHint.textContent = "Fill the frame · avoid glare";

    if (state.busy) {
      el.captureTitle.textContent = state.engine.state === "loading" ? "Warming up the OCR engine" : "Reading the card";
      el.captureSub.textContent = "Indra OCR · on this device";
    } else if (starting) {
      el.captureTitle.textContent = "Opening camera";
      el.captureSub.textContent = "Allow access if your browser asks";
    } else if (live) {
      el.captureTitle.textContent = `${cap(state.side)} side`;
      el.captureSub.textContent = "Hold steady · fill the frame";
    } else if (state.error) {
      el.captureTitle.textContent = "Scan didn’t go through";
      el.captureSub.textContent = "Try a sharper photo or another side";
    } else if (state.camera === "captured" && found > 0) {
      el.captureTitle.textContent = isComplete() ? "Card complete" : `${cap(state.lastSide)} side captured`;
      el.captureSub.textContent = `${found} of 5 fields found`;
    } else if (state.camera === "captured") {
      el.captureTitle.textContent = "Photo captured";
      el.captureSub.textContent = "No fields found yet";
    } else {
      el.captureTitle.textContent = "Ready when you are";
      el.captureSub.textContent = `${cap(state.side)} side · camera off`;
    }
  }

  /* ---------------------------------------------------------------------
     Results
     --------------------------------------------------------------------- */

  function confidenceClass(value) {
    if (value >= 0.75) return "high";
    if (value >= 0.5) return "medium";
    return "low";
  }

  function renderField(key, index) {
    const field = state.fields[key];
    const present = Boolean(field && field.value);
    const hero = key === "aadhaar";
    const confidence = field ? Number(field.confidence || 0) : 0;
    const conf = present ? confidenceClass(confidence) : null;
    const side = field && (field.side === "front" || field.side === "back") ? field.side : null;

    let value = "Not found";
    if (present) {
      value = hero && state.mask ? maskAadhaar(field.value) : field.value;
    } else if (key === "aadhaar") {
      value = "Scan the front to read the number";
    } else if (key === "address") {
      value = "Scan the back to read the address";
    }

    const note =
      present && field.note
        ? field.note
        : present && confidence < 0.5
          ? "Low confidence — check this against the card."
          : "";

    const noteClass = present && field.note && /checksum/i.test(field.note) ? " is-error" : "";

    const actions = present
      ? `
        ${hero ? `<button type="button" class="icon-btn" data-mask="${key}" aria-label="${state.mask ? "Show" : "Hide"} Aadhaar number" title="${state.mask ? "Show number" : "Hide number"}">${icon(state.mask ? "i-eye-off" : "i-eye")}</button>` : ""}
        <button type="button" class="icon-btn" data-copy="${key}" aria-label="Copy ${FIELD_LABELS[key]}" title="Copy ${FIELD_LABELS[key]}">${icon("i-copy")}</button>
      `
      : "";

    return `
      <div class="field${hero ? " field--hero" : ""}${present ? "" : " is-empty"}" style="--i:${index}">
        <div class="field-top">
          <span class="field-label">${FIELD_LABELS[key]}</span>
          ${present && side ? `<span class="source-chip">${side}</span>` : ""}
          ${present && conf ? `<span class="conf conf--${conf}" title="${cap(conf)} confidence" aria-label="${cap(conf)} confidence"></span>` : ""}
        </div>
        <div class="field-value">${esc(value)}</div>
        ${note ? `<p class="field-note${noteClass}">${esc(note)}</p>` : ""}
        ${actions ? `<div class="field-actions">${actions}</div>` : ""}
      </div>
    `;
  }

  function renderDetailsSub() {
    if (state.busy) {
      el.detailsSub.textContent = "Reading the card…";
      return;
    }
    if (state.error) {
      el.detailsSub.textContent = "Last scan failed";
      return;
    }
    const found = countFields();
    if (found === 0) {
      el.detailsSub.textContent = state.lastMeta ? "No fields found" : "Nothing scanned yet";
      return;
    }
    if (isComplete()) {
      el.detailsSub.textContent = "Front + back · all 5 fields";
      return;
    }
    const elapsed = state.lastMeta && state.lastMeta.elapsed_ms ? ` · ${(state.lastMeta.elapsed_ms / 1000).toFixed(1)}s` : "";
    el.detailsSub.textContent = `${cap(state.lastSide || "front")} side · ${found} of 5 fields${elapsed}`;
  }

  function renderNextStep() {
    const found = countFields();
    const hasScan = Boolean(state.lastMeta) || found > 0;
    el.nextStep.hidden = state.busy || !hasScan;
    el.nextStep.classList.remove("is-done");
    el.nextBtn.hidden = false;

    if (el.nextStep.hidden) return;

    const missing = FIELD_KEYS.filter((key) => !hasValue(key));
    if (found === FIELD_KEYS.length) {
      const valid = state.fields.aadhaar ? state.fields.aadhaar.valid : null;
      if (valid === false) {
        el.nextIcon.innerHTML = icon("i-alert");
        el.nextText.textContent = "The Aadhaar checksum didn’t validate. Check the number against the card.";
        el.nextBtn.hidden = true;
      } else {
        el.nextStep.classList.add("is-done");
        el.nextIcon.innerHTML = icon("i-check");
        el.nextText.textContent =
          valid === true
            ? "Aadhaar checksum verified. Check the address before sharing."
            : "All five fields captured. Check them against the card.";
        el.nextBtn.hidden = true;
      }
      return;
    }

    if (!hasFront()) {
      el.nextIcon.innerHTML = icon("i-arrow");
      el.nextText.textContent = "Start with the front of the card.";
      el.nextBtn.innerHTML = `Scan front ${icon("i-arrow")}`;
      el.nextBtn.dataset.action = "front";
      return;
    }

    if (!hasAddress()) {
      el.nextIcon.innerHTML = icon("i-arrow");
      el.nextText.textContent = "Address is on the back of the card.";
      el.nextBtn.innerHTML = `Scan back ${icon("i-arrow")}`;
      el.nextBtn.dataset.action = "back";
      return;
    }

    el.nextIcon.innerHTML = icon("i-arrow");
    el.nextText.textContent = `Still missing ${missing.map((key) => FIELD_LABELS[key].toLowerCase()).join(", ")}.`;
    el.nextBtn.innerHTML = `Scan front ${icon("i-arrow")}`;
    el.nextBtn.dataset.action = "front";
  }

  function renderDetails() {
    const found = countFields();
    const hasScan = Boolean(state.lastMeta) || found > 0;

    el.emptyState.hidden = hasScan || state.busy || Boolean(state.error);
    el.errorBanner.hidden = !state.error || state.busy;
    el.skeleton.hidden = !state.busy;
    el.fieldList.hidden = !hasScan || state.busy;

    if (state.error) el.errorText.textContent = state.error;

    if (!el.fieldList.hidden) {
      el.fieldList.innerHTML = FIELD_KEYS.map((key, index) => renderField(key, index)).join("");
    }

    renderNextStep();
    renderDetailsSub();

    el.detailsFoot.hidden = state.tab !== "fields" || found === 0 || state.busy;
  }

  function renderRaw() {
    const content = state.raw[state.rawMode] || "";
    el.rawPre.textContent = content;
    el.rawPre.hidden = !content;
    el.rawEmpty.hidden = Boolean(content);
    el.rawMdBtn.classList.toggle("is-active", state.rawMode === "markdown");
    el.rawTextBtn.classList.toggle("is-active", state.rawMode === "text");
    el.rawMdBtn.setAttribute("aria-pressed", String(state.rawMode === "markdown"));
    el.rawTextBtn.setAttribute("aria-pressed", String(state.rawMode === "text"));
    el.copyRaw.disabled = !content;
    el.downloadMd.disabled = !content;
  }

  function setTab(tab) {
    state.tab = tab;
    const fields = tab === "fields";
    el.tabFields.setAttribute("aria-selected", String(fields));
    el.tabRaw.setAttribute("aria-selected", String(!fields));
    el.fieldsView.hidden = !fields;
    el.rawView.hidden = fields;
    if (!fields) renderRaw();
    renderDetails();
  }

  function renderAll() {
    renderStage();
    renderCaptureBar();
    renderDetails();
    renderRaw();
  }

  function revealFields() {
    clearTimeout(state.revealTimer);
    el.fieldList.classList.remove("is-revealing");
    if (countFields() === 0) return;
    requestAnimationFrame(() => {
      el.fieldList.classList.add("is-revealing");
      state.revealTimer = setTimeout(() => el.fieldList.classList.remove("is-revealing"), 900);
    });
  }

  function applyResult(data) {
    const incoming = data.fields || {};
    const incomingSide = data.side === "front" || data.side === "back" ? data.side : state.side;

    const newNumber = incoming.aadhaar && incoming.aadhaar.value ? digits(incoming.aadhaar.value) : "";
    const oldNumberField = state.fields.aadhaar;
    const oldNumber = oldNumberField && oldNumberField.value ? digits(oldNumberField.value) : "";
    // A new front with a different number is a new card. A back that disagrees
    // is just OCR noise; clear the card on purpose, not on a bad second read.
    if (newNumber && oldNumber && newNumber !== oldNumber && incomingSide === "front" && oldNumberField.side === "front") {
      state.fields = {};
    }

    FIELD_KEYS.concat("pincode").forEach((key) => {
      const field = incoming[key];
      if (!field || !field.value) return;
      const current = state.fields[key];
      const nextConfidence = Number(field.confidence || 0.5);
      const currentConfidence = current ? Number(current.confidence || 0) : -1;

      // The front owns identity, the back owns the address. A duplicate read
      // of the number on the back must not replace the front's number.
      if (current && current.value) {
        const frontOwns = ["aadhaar", "name", "dob", "gender"].includes(key);
        const backOwns = ["address", "pincode"].includes(key);
        if (incomingSide === "back" && frontOwns && current.side === "front") {
          // Let a valid read on the back repair an invalid read on the front,
          // but never let a duplicate read replace a good number.
          const corrects = key === "aadhaar" && current.valid === false && data.checks && data.checks.aadhaar_valid === true;
          if (!corrects) return;
        }
        if (incomingSide === "front" && backOwns && current.side === "back") return;
        if (nextConfidence < currentConfidence - 0.03) return;
      }

      state.fields[key] = {
        value: field.value,
        confidence: nextConfidence,
        note: field.note || null,
        side: incomingSide,
        valid: key === "aadhaar" ? (data.checks && data.checks.aadhaar_valid) ?? null : null,
      };
    });

    state.raw = {
      markdown: data.markdown || data.text || "",
      text: data.text || data.markdown || "",
    };
    state.lastSide = incomingSide;
    state.lastMeta = data.meta || null;
    state.error = null;
    state.stageError = null;

    const missing = FIELD_KEYS.filter((key) => !hasValue(key));
    if (!missing.length) state.side = incomingSide;
    else state.side = missing[0] === "address" ? "back" : "front";

    el.sideButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.side === state.side));
    });
  }

  function resetAll() {
    stopStream();
    stopBusyTimer();
    clearTimeout(state.revealTimer);
    clearSnapshot();
    state.camera = "idle";
    state.busy = false;
    state.fields = {};
    state.raw = { markdown: "", text: "" };
    state.lastSide = null;
    state.lastMeta = null;
    state.error = null;
    state.stageError = null;
    state.mask = false;
    state.side = "front";
    el.sideButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.side === "front"));
    });
    state.tab = "fields";
    el.tabFields.setAttribute("aria-selected", "true");
    el.tabRaw.setAttribute("aria-selected", "false");
    el.fieldsView.hidden = false;
    el.rawView.hidden = true;
    renderAll();
  }

  /* ---------------------------------------------------------------------
     Camera
     --------------------------------------------------------------------- */

  function cameraMessage(error) {
    switch (error && error.name) {
      case "NotAllowedError":
      case "SecurityError":
        return "Camera access is blocked. Allow it in the address bar, or upload a photo.";
      case "NotFoundError":
        return "No camera was found on this device. Upload a photo instead.";
      case "NotReadableError":
        return "The camera is busy in another app. Close it, or upload a photo.";
      case "OverconstrainedError":
        return "This camera can’t provide the requested view. Upload a photo instead.";
      default:
        return "The camera couldn’t start. Upload a photo instead.";
    }
  }

  async function startCamera(side = state.side) {
    if (state.busy) return;
    setSide(side);
    clearError();
    clearStageError();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      cameraError(
        location.protocol === "file:"
          ? "The camera needs a local server. Open http://localhost:8010."
          : "This browser can’t open the camera here. Upload a photo instead.",
      );
      return;
    }

    stopStream();
    state.camera = "starting";
    renderAll();

    let stream = null;
    try {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 2560 },
            height: { ideal: 1600 },
          },
        });
      } catch (error) {
        if (error && (error.name === "OverconstrainedError" || error.name === "NotFoundError")) {
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        } else {
          throw error;
        }
      }

      state.stream = stream;
      el.video.srcObject = stream;
      await el.video.play();

      if (state.camera !== "starting") {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      state.camera = "live";
      clearSnapshot();
      setupTorch();
      renderAll();
    } catch (error) {
      if (stream) stream.getTracks().forEach((track) => track.stop());
      state.stream = null;
      cameraError(cameraMessage(error));
      renderAll();
    }
  }

  function setupTorch() {
    el.torchBtn.hidden = true;
    if (!state.stream) return;
    const track = state.stream.getVideoTracks()[0];
    if (!track || typeof track.getCapabilities !== "function") return;
    const capabilities = track.getCapabilities() || {};
    if (!capabilities.torch) return;
    el.torchBtn.hidden = false;
    el.torchBtn.onclick = async () => {
      if (!state.stream) return;
      const current = state.stream.getVideoTracks()[0];
      if (!current) return;
      state.torch = !state.torch;
      try {
        await current.applyConstraints({ advanced: [{ torch: state.torch }] });
        el.torchBtn.setAttribute("aria-pressed", String(state.torch));
      } catch {
        state.torch = false;
        el.torchBtn.setAttribute("aria-pressed", "false");
        toast("This camera won’t change its light");
      }
    };
  }

  function flash() {
    el.flash.classList.remove("is-flashing");
    void el.flash.offsetWidth;
    el.flash.classList.add("is-flashing");
  }

  function canvasBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("empty image"))), "image/jpeg", 0.92);
    });
  }

  async function capture() {
    if (state.camera !== "live" || state.busy) return;
    const width = el.video.videoWidth;
    const height = el.video.videoHeight;
    if (!width || !height || width < 64 || height < 64) {
      toast("The camera is still warming up — try again");
      return;
    }

    const maxSide = 2200;
    const scale = Math.min(1, maxSide / Math.max(width, height));
    el.canvas.width = Math.round(width * scale);
    el.canvas.height = Math.round(height * scale);

    const context = el.canvas.getContext("2d", { alpha: false });
    context.drawImage(el.video, 0, 0, el.canvas.width, el.canvas.height);

    flash();

    let blob = null;
    try {
      blob = await canvasBlob(el.canvas);
    } catch {
      cameraError("The photo couldn’t be saved. Try again.");
      return;
    }

    stopStream();
    setSnapshot(URL.createObjectURL(blob), state.side);
    state.lastSide = state.side;
    state.camera = "captured";
    renderAll();
    await submitScan(blob);
  }

  /* ---------------------------------------------------------------------
     Upload and OCR
     --------------------------------------------------------------------- */

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("image decode"));
      image.src = url;
    });
  }

  async function prepareImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const image = await loadImage(url);
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      if (!width || !height) throw new Error("empty image");

      const maxSide = 2200;
      const scale = Math.min(1, maxSide / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const context = canvas.getContext("2d", { alpha: false });
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return await canvasBlob(canvas);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function handleFile(file) {
    if (!file || state.busy) return;
    const looksLikeImage =
      /^image\//i.test(file.type) || /\.(jpe?g|png|webp|bmp|tiff?)$/i.test(file.name || "");
    if (!looksLikeImage) {
      setScanError("That file isn’t a photo. Choose a JPG, PNG or WebP image.");
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      setScanError("That photo is larger than 30 MB. Choose a smaller one.");
      return;
    }

    clearError();
    clearStageError();
    stopStream();
    state.camera = "idle";

    try {
      const blob = await prepareImage(file);
      setSnapshot(URL.createObjectURL(blob), state.side);
      state.lastSide = state.side;
      state.camera = "captured";
      renderAll();
      await submitScan(blob);
    } catch {
      el.fileInput.value = "";
      setScanError(
        "That photo couldn’t be opened. Use a JPG or PNG. If it’s a HEIC photo from an iPhone, set the camera to “Most Compatible” or export it as JPG.",
      );
    }
  }

  function readableScanError(error) {
    if (error instanceof TypeError && /fetch/i.test(error.message)) {
      return "Couldn’t reach the local OCR server. Check that python server.py is still running.";
    }
    const message = error && error.message ? error.message : "";
    if (!message) return "The scan failed. Try a sharper photo.";
    return message;
  }

  async function submitScan(blob) {
    state.busy = true;
    state.error = null;
    state.stageError = null;
    startBusyTimer();
    renderAll();

    const body = new FormData();
    body.append("image", blob, "aadhaar-capture.jpg");
    body.append("side", state.side);

    try {
      const response = await fetch("/api/scan", { method: "POST", body });
      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }
      if (!response.ok) {
        throw new Error((data && data.detail) || `The scan failed (${response.status}).`);
      }
      if (!data || !data.ok) {
        throw new Error((data && data.detail) || "The card couldn’t be read.");
      }
      applyResult(data);
      setTab("fields");
      toast(isComplete() ? "Both sides read" : "Card read");
    } catch (error) {
      state.error = readableScanError(error);
    } finally {
      stopBusyTimer();
      state.busy = false;
      renderAll();
      revealFields();
      refreshStatus();
    }
  }

  /* ---------------------------------------------------------------------
     Actions
     --------------------------------------------------------------------- */

  function onPrimary() {
    if (state.busy) return;
    if (isComplete()) {
      resetAll();
      startCamera("front");
      return;
    }
    startCamera(state.side);
  }

  function onNext() {
    const action = el.nextBtn.dataset.action;
    if (action === "another") {
      resetAll();
      startCamera("front");
    } else if (action === "back") {
      startCamera("back");
    } else {
      startCamera("front");
    }
  }

  function clearFieldsAndStage() {
    resetAll();
  }

  function copyAll() {
    const lines = [];
    if (hasValue("name")) lines.push(`Name: ${state.fields.name.value}`);
    if (hasValue("aadhaar")) lines.push(`Aadhaar: ${formatAadhaar(state.fields.aadhaar.value)}`);
    if (hasValue("dob")) lines.push(`Date of birth: ${state.fields.dob.value}`);
    if (hasValue("gender")) lines.push(`Gender: ${state.fields.gender.value}`);
    if (hasValue("address")) lines.push(`Address: ${state.fields.address.value}`);
    if (!lines.length) return;
    copyText(lines.join("\n"), "Details copied");
  }

  function downloadJson() {
    const warnings = [];
    if (!hasValue("aadhaar")) warnings.push("Aadhaar number not found.");
    else if (state.fields.aadhaar.valid === false) warnings.push("Aadhaar checksum did not validate.");
    if (!hasValue("name")) warnings.push("Name not found.");
    if (!hasValue("dob")) warnings.push("Date of birth not found.");
    if (!hasValue("address")) warnings.push("Address not found — scan the back of the card.");

    const payload = {
      scanned_at: new Date().toISOString(),
      engine: state.lastMeta && state.lastMeta.engine ? state.lastMeta.engine : "indra-ocr",
      fields: Object.fromEntries(
        FIELD_KEYS.concat("pincode").map((key) => [key, hasValue(key) ? state.fields[key].value : null]),
      ),
      confidence: Object.fromEntries(
        FIELD_KEYS.concat("pincode")
          .filter((key) => state.fields[key])
          .map((key) => [key, state.fields[key].confidence]),
      ),
      checks: { aadhaar_valid: state.fields.aadhaar ? state.fields.aadhaar.valid ?? null : null },
      warnings,
    };
    const suffix = hasValue("aadhaar") ? digits(state.fields.aadhaar.value).slice(-4) : "scan";
    download(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `aadhaar-${suffix}.json`);
  }

  function downloadMarkdown() {
    const content = state.raw[state.rawMode];
    if (!content) return;
    const extension = state.rawMode === "markdown" ? "md" : "txt";
    const type = state.rawMode === "markdown" ? "text/markdown" : "text/plain";
    download(new Blob([content], { type: `${type};charset=utf-8` }), `aadhaar-ocr.${extension}`);
  }

  /* ---------------------------------------------------------------------
     Events
     --------------------------------------------------------------------- */

  el.startBtn.addEventListener("click", onPrimary);
  el.uploadBtn.addEventListener("click", () => el.fileInput.click());
  el.liveUploadBtn.addEventListener("click", () => el.fileInput.click());
  el.shutter.addEventListener("click", capture);
  el.fileInput.addEventListener("change", () => {
    const file = el.fileInput.files && el.fileInput.files[0];
    el.fileInput.value = "";
    if (file) handleFile(file);
  });

  el.sideButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setSide(button.dataset.side);
      renderAll();
    });
  });

  el.tabFields.addEventListener("click", () => setTab("fields"));
  el.tabRaw.addEventListener("click", () => setTab("raw"));
  [el.tabFields, el.tabRaw].forEach((button) => {
    button.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const next = state.tab === "fields" ? "raw" : "fields";
      setTab(next);
      (next === "fields" ? el.tabFields : el.tabRaw).focus();
    });
  });

  el.rawMdBtn.addEventListener("click", () => {
    state.rawMode = "markdown";
    renderRaw();
  });
  el.rawTextBtn.addEventListener("click", () => {
    state.rawMode = "text";
    renderRaw();
  });
  el.copyRaw.addEventListener("click", () => {
    const content = state.raw[state.rawMode];
    if (content) copyText(content, state.rawMode === "markdown" ? "Markdown copied" : "Text copied");
  });
  el.downloadMd.addEventListener("click", downloadMarkdown);

  el.fieldList.addEventListener("click", (event) => {
    const maskButton = event.target.closest("[data-mask]");
    if (maskButton) {
      state.mask = !state.mask;
      renderDetails();
      return;
    }
    const copyButton = event.target.closest("[data-copy]");
    if (!copyButton) return;
    const key = copyButton.dataset.copy;
    if (!hasValue(key)) return;
    const value = key === "aadhaar" ? formatAadhaar(state.fields[key].value) : state.fields[key].value;
    copyText(value, `${FIELD_LABELS[key]} copied`);
  });

  el.copyAllBtn.addEventListener("click", copyAll);
  el.downloadJsonBtn.addEventListener("click", downloadJson);
  el.clearBtn.addEventListener("click", clearFieldsAndStage);
  el.nextBtn.addEventListener("click", onNext);
  el.errorDismiss.addEventListener("click", () => {
    clearError();
    renderAll();
  });
  el.stageErrorClose.addEventListener("click", () => {
    clearStageError();
    renderAll();
  });

  el.aboutBtn.addEventListener("click", () => el.aboutDialog.showModal());
  el.engineChip.addEventListener("click", () => el.aboutDialog.showModal());
  el.aboutDialog.addEventListener("click", (event) => {
    if (event.target !== el.aboutDialog) return;
    const rect = el.aboutDialog.getBoundingClientRect();
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    if (!inside) el.aboutDialog.close();
  });

  // Drag a photo onto the stage.
  ["dragenter", "dragover"].forEach((type) => {
    el.stage.addEventListener(type, (event) => {
      event.preventDefault();
      el.stage.classList.add("is-dragover");
    });
  });
  ["dragleave", "drop"].forEach((type) => {
    el.stage.addEventListener(type, (event) => {
      event.preventDefault();
      el.stage.classList.remove("is-dragover");
    });
  });
  el.stage.addEventListener("drop", (event) => {
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  window.addEventListener("pagehide", () => {
    stopStream();
    if (state.snapshotUrl) URL.revokeObjectURL(state.snapshotUrl);
  });

  /* ---------------------------------------------------------------------
     Start
     --------------------------------------------------------------------- */

  if (location.protocol === "file:") {
    el.serverBanner.hidden = false;
    state.engine = { state: "offline", detail: "Open this page through the local server", version: null, mock: false };
    renderEngine();
  }

  renderAll();
  setSide("front");
  refreshStatus();
})();
