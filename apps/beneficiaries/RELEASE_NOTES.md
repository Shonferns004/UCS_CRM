# Release Notes — JOD (Beneficiaries)

**App:** JOD (Beneficiaries)
**Publisher:** Being Sevak Charitable Trust
**Package:** `com.beingsevak.beneficiaries`
**Version:** 1.0.0 (build 1)
**Release date:** 14 October 2026
**Platforms:** Android, iOS

---

## Highlights

First public release of **JOD (Beneficiaries)** — a field app that lets Being Sevak volunteers register persons with disabilities, capture identity and disability documents, record fingerprints, and deliver welfare kits and programmes on the ground.

---

## What's new in 1.0.0

### Operator onboarding & sign-in
- Secure operator login with OTP verification.
- Operator setup screen to record the assigned **event, city, and state**.
- Biometric (fingerprint / face) unlock for quick, secure device sign-in.
- Offline-ready **searchable state / city dropdowns**.
- Animated branded splash screen ("JOD").

### Beneficiary registration
- Complete beneficiary form — name, gender, date of birth, mobile, occupation, address, city, state, and PIN code.
- **Aadhaar OCR** (front / back) that auto-fills name, DOB, gender, address, and Aadhaar number from a photo — the image is sent once and never stored on the device.
- Disability details — type, percentage, certificate number, and UDID number.
- Attach supporting documents: Aadhaar (front & back), UDID card, and disability certificate.
- Beneficiary photograph captured with the in-app camera.

### Biometrics
- Enroll fingerprints (3 fingers) using a supported **external USB fingerprint scanner** (e.g. SecuGen Hamster Pro).
- Dedicated **fingerprint lookup** to identify and de-duplicate beneficiaries.
- Biometric status shown on the register list.

### Distribution & kits
- Record kit distribution with **6-digit collection OTP** verification and 15-minute expiry.
- Re-issue flow with OTP confirmation to prevent duplicate handovers.
- Home dashboard with **NGO cards (BSCT / AFLF / MANN)**, member counts, total donated, kit-given cards, and a kit-collectors list.

### Beneficiary management
- Register list that loads on a **10-digit search** with pull-to-refresh.
- Search members by **name, Aadhaar, or UDID**.
- Detailed beneficiary view and edit screen showing last event and last visit.

### QR, tasks & profile
- In-app **QR scanner** for quick beneficiary look-ups.
- Tasks and Programs screens for daily field work.
- Operator profile with area and assignment details.

### Permissions
- Camera, location, storage, notifications, USB host, and biometric — each used only for the purposes described in the [Privacy Policy](PRIVACY_POLICY.md).

---

## Store listing — short description (≤ 80 chars)

> JOD — register beneficiaries, capture documents & deliver welfare kits.

## Store listing — release notes (≤ 500 chars)

> Welcome to JOD (Beneficiaries) 1.0.0!
> • Register persons with disabilities with Aadhaar OCR auto-fill
> • Capture Aadhaar, UDID & disability documents
> • Enroll & look up fingerprints with a USB scanner
> • Distribute kits with collection-OTP verification
> • Search members by name, Aadhaar or UDID
> • Offline state/city selection and secure operator login

---

## Notes

- Supported on Android 5.0 (API 21) and above.
- A supported external USB fingerprint scanner is required for biometric capture.
- Data is transmitted over encrypted HTTPS to `api.beingsevak.org`.
- See the [Privacy Policy](PRIVACY_POLICY.md) for details on data collection and use.

---

*© 2026 Being Sevak Charitable Trust. All rights reserved.*
