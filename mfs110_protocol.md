# MFS110 Raw USB Protocol

Status: **Phase 0 pending** — not yet documented.

Objective: capture raw 8-bit grayscale fingerprint frames from the Mantra MFS110
directly over USB (Android USB Host API / libusb) with no vendor driver, no RD
Service, no UIDAI encryption.

## Known device facts
- VID: `0x2C0F`, PID: `0x1204` (also recognised vendor `0x0C2E`).
- Windows RD Service host (`MantraMFS110AVDMHost`) owns the device on this PC.
- Driver DLLs (vendor, for reference only): `C:\Program Files\Mantra\RDService\L1Device\`
  - `MFS110_Core.dll` — device core (raw packet/protocol lives here)
  - `iengine_ansi_iso.dll` — template (ANSI/ISO) engine
  - `mSecureTrans.dll` — TLS/secure transport (UIDAI encryption — what we skip)
  - `mantra.mfs110.FwDeploy.dll` — firmware upload (possible init requirement; risk)
- Sensor is a plain USB optical scanner; ~500 dpi, 8-bit grayscale expected.

## Method (when Phase 0 starts)
1. Plug MFS110 into this PC, start the RD Service, capture a finger.
2. Sniff with USBPcap + Wireshark (not yet installed).
3. Document below: control endpoints, init sequence (incl. firmware load?), capture
   command + response opcodes, image frame size, pixel byte order. Confirm the image
   stream is RAW (not encrypted/compressed); if encrypted, Path B must be re-scoped.
4. Cross-check with Dev-SDK behaviour for MFS100 (PID 0x1204 differs from MFS100's
   LoadFirmware/Init split — verify what MFS110 requires at init).

Implementation target: `Mfs110RawUsb.capture()` in
`beneficiaries/android/app/src/main/kotlin/com/beingsevak/beneficiaries/Mfs110RawUsb.kt`
(bulkTransfer on the claimed interface).

## Findings
<!-- Fill in from the Phase 0 sniff:
- Endpoints: ...
- Init: ...
- Capture: ...
- Frame size: ...
- Raw confirmed: yes/no
-->