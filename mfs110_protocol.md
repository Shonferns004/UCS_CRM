# MFS110 Raw USB Protocol

Status: **Phase 0 complete for the RD path** — USB traffic captured and analyzed.

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

## Method
1. Plug MFS110 into this PC, start the RD Service, capture a finger.
2. Sniff with USBPcap + Wireshark.
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

### Captured RD trace

- Capture date: 2026-09-15.
- USBPcap root hub: `USBPcap2`; MFS110 USB address: `2`.
- Device descriptor: VID `0x2C0F`, PID `0x1204`, one vendor-specific interface with
  four endpoints.
- RD capture traffic uses vendor-specific control transfers and interrupt endpoint
  `0x81` (the capture response is one large interrupt transfer).
- The capture response contained a `153635` byte transfer. It begins with a 19-byte
  ASCII timestamp, followed by high-entropy bytes. The size is consistent with a
  `320 x 480` image plus a 16-byte block-cipher boundary, but the pixel bytes are
  encrypted and are not a grayscale frame.
- A subsequent `1765` byte response begins with the marker `MFSKEY` and contains
  `HMAC` and `DATA` material matching the encrypted RD payload returned as `PidData`.
- The RD response reported `MFS110`, serial `10863374`, `qScore=38`, and `errCode=0`.
- Raw confirmed: **no**. The RD/secure-device path does not expose plaintext pixels
  on USB. The captured bytes cannot be passed to SourceAFIS without secure
  transport/device key material.

### Static analysis lead

- `MFS110_Core.dll` contains the native entry point
  `MIDFinger_L1_AutoCapture` and an internal `153600`-byte MFS110 image-processing
  path (`320 x 480`). This confirms that the sensor image exists internally before
  secure packaging.
- The same native library contains `MIDFinger_L1_mSecure_Init`,
  `MIDFinger_L1_mSecureSetConfig`, `GenerateDeviceKeyPair`, `SendChallengeKey`,
  `GetVectorData_EncryptedKey`, `SetEncryptionKey`, and AES/GCM routines.
- The managed RD wrapper P/Invokes `MIDFinger_L1_AutoCapture` directly, but its
  result is passed through the secure-device pipeline before the RD response. The
  wrapper and native method use private/obfuscated structures and callbacks; no
  documented raw-image API was found.
- Firmware deployment functions are present (`MIDFinger_L1_DeployFirmWare`,
  `WriteFirmwareData`, `SetBootLoaderMode`). These were not invoked because an
  incorrect firmware or bootloader command could permanently affect the device.
- Static disassembly places `MIDFinger_L1_AutoCapture` at RVA `0x42400` in the
  installed native image. Its device operation is dispatched through a global
  device-handler vtable at slot `0x54`; this is the native implementation of the
  capture operation, not a USB command that is directly exposed by the wrapper.
- The managed P/Invoke signature includes an `IntPtr` result buffer and a `ref Int32`
  result length, alongside the capture options and callback structures. This is
  consistent with the native image/result buffer being returned before XML
  packaging.
- The function allocates and validates a large capture/result buffer, then calls
  `GetPIDData`. `GetPIDData` constructs `SKEY`, `CI`, and the encrypted PID block;
  the raw capture buffer is consumed before the public RD response is formed.
- This gives us a precise reverse-engineering boundary: intercepting the native
  buffer before `GetPIDData` may reveal the image, while reproducing the USB
  traffic after that point cannot.

### Managed dispatch finding

- `mantra.mfs110.device.reg.aadhaar.dll` contains an obfuscated
  `DeviceHandler` method with the signature `PidOptions -> String` and an IL body
  of approximately `11728` bytes. This is the strongest static candidate for the
  RD `CAPTURE` request handler.
- The method does not contain a simple direct metadata reference to the
  `MIDFinger_L1_AutoCapture` P/Invoke. The native call is likely reached through
  obfuscated helper dispatch, a delegate, or another indirect mechanism.
- This method should be analyzed next; live attachment to the production RD host
  is not required and should remain avoided.

### Resolved managed capture chain

- The `DeviceHandler(PidOptions) -> String` method calls an obfuscated wrapper
  method with metadata token `0x06000155` (`100663637`).
- That wrapper has a capture-shaped signature with the same options/callback
  arguments and a `Byte[]&` output parameter.
- Its IL directly calls the AutoCapture wrapper at token `0x06000183`
  (`100663683`), which is the managed P/Invoke bridge to
  `MIDFinger_L1_AutoCapture`.
- The wrapper uses `Marshal.Copy` and `Marshal.FreeHGlobal` around the native
  operation, confirming that native output is copied into managed byte-array
  storage before the RD response is assembled.
- The wrapper's IL shows the output flow explicitly: it passes a native `IntPtr`
  local and a length value through the P/Invoke bridge, allocates a managed byte
  array from the returned length, then calls `Marshal.Copy(nativePtr, byteArray,
  0, length)`. The managed byte array is the immediate post-native result handed
  to the RD pipeline.
- Token chain:
  `0x06000155` (capture wrapper) -> `0x06000183` (P/Invoke bridge) ->
  `0x06000122` (`MIDFinger_L1_AutoCapture` import).
- This resolves the earlier apparent absence of a direct AutoCapture caller:
  the call is indirect through the obfuscated capture wrapper, not reflection.
- The bytes copied into this managed result remain part of the protected RD
  pipeline; this finding does not establish that they are plaintext pixels or
  that they may be extracted for application use.
- A separate obfuscated native wrapper method (`0x06000156`, `100663638`) takes
  a `Byte[]&` and calls the `MIDFinger_L1_GetModelResultData` bridge. A simple
  metadata-token scan found the bridge inside this wrapper but no direct caller
  from the main `DeviceHandler(PidOptions)` method. Its output should therefore
  not be treated as the registration template without resolving its call path and
  format.

### ANSI/ISO engine finding

- `iengine_ansi_iso.dll` is a separate 32-bit native library identified as
  `ANSI_ISO_SDK_2.4.6.374` and contains a substantial legitimate template API.
- Exported operations include `ANSI_CreateTemplate*`, `ISO_CreateTemplate*`,
  `ANSI_SaveTemplate`, `ISO_SaveTemplate`, `ANSI_LoadTemplate`,
  `ISO_LoadTemplate`, `ANSI_VerifyMatch*`, `ISO_VerifyMatch*`,
  `IEngine_ConvertRawToIso19794_4`, `IEngine_ConvertIso19794_4ToRaw`,
  `IEngine_ConvertToRaw`, `IEngine_ConvertTemplate`, `IEngine_GetImageQuality`,
  `IEngine_GetTemplateDimensions`, and `IEngine_GetMinutiae`.
- The engine contains raw-image and template-processing code, but no installed RD
  executable or native MFS110 binary was found to import `iengine_ansi_iso.dll`
  directly. It is therefore evidence of a separate vendor/template SDK, not
  evidence that the RD service exposes a reusable template.
- The file is a Windows x86 DLL. Android availability, licensing, ABI, and whether
  it accepts an MFS110 capture are unresolved. It must not be assumed usable in the
  Flutter Android product.
- `MIDFinger_L1_GetModelResultData` remains unresolved, but the surrounding native
  names (`GetMatModelResult`, model initialization, spoof/quality strings) do not
  establish that it returns an ANSI/ISO fingerprint template. Treat it as model or
  quality-result data until its exact contract is proven.
- No Android AAR, Java wrapper, or Android-native build of this ANSI/ISO engine was
  found in the project or installed MFS110 RD package.

### Official product documentation check

- Mantra's current MFS110 product documentation advertises Windows, Linux, and
  Android support, but describes the ISO 19794-2 minutiae and ISO 19794-4 image
  output as being inside encrypted PID data blocks.
- The same documentation specifies a `276 x 336`, 8-bit grayscale sensor image.
  Therefore the internal `153600`-byte path found in native code must not be
  treated as the final image dimensions or as proof of a raw image API.
- Mantra's public MFS110 materials reviewed so far do not publish a standalone
  Android raw-image/template API. The publicly discoverable MFS100 SDK is for a
  different device family and cannot be assumed compatible with MFS110.
- Current feasibility conclusion: the public RD interface is not sufficient for
  the required application-level registration and 1:N matching workflow. An
  authorized MFS110 development SDK/API, if available through Mantra's gated
  technical-resource or SDK-inquiry process, must be obtained and verified before
  further Android implementation.

## Consequence

The documented RD protocol cannot be used to implement `Mfs110RawUsb.capture()` as
a plaintext capture using only USB transfers. The next viable paths are an
undocumented non-RD device mode/firmware interface, or a vendor development
interface. We should not ship an implementation based on this trace because it
would only reproduce encrypted RD data, not a usable fingerprint image.
