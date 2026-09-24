import { Router } from 'express';
import { authenticateRole } from '../middleware/authMiddleware.js';
import { decodeAadhaarQr, AadhaarDecodeError } from './decoder.js';

const router = Router();

// POST /api/aadhaar/decode-qr
// Body: { "qrData": "<raw QR payload>" }
// Decodes an Aadhaar QR (SecureQR via @xone-labs/aadharjs, legacy XML via the
// existing XML decoder) and returns the fields needed to auto-fill the
// beneficiary registration form. Raw QR values / decoded data are never
// logged or persisted here.
router.post(
  '/decode-qr',
  authenticateRole('super_admin', 'admin', 'ngo', 'accounts', 'event_head', 'worker'),
  (req, res) => {
    const qrData = req.body?.qrData;
    if (qrData == null || String(qrData).trim() === '') {
      return res.status(400).json({ success: false, message: 'QR data is required' });
    }

    try {
      const data = decodeAadhaarQr(qrData);
      return res.json({ success: true, data });
    } catch (error) {
      if (error instanceof AadhaarDecodeError) {
        if (error.kind === 'unsupported') {
          return res.status(400).json({ success: false, message: 'Unsupported Aadhaar QR format' });
        }
        return res.status(400).json({ success: false, message: 'Invalid Aadhaar QR' });
      }
      // Never leak internal exceptions to the client.
      return res.status(500).json({ success: false, message: 'Unable to decode Aadhaar QR' });
    }
  },
);

export default router;