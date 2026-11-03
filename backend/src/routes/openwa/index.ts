import { Router, Request, Response } from 'express';
import { authenticate, requireWhatsAppAdmin } from '../middleware/authMiddleware.js';
import { EngineRegistry } from '../../engine/engine-registry.service.js';
import { createLogger } from '../common/services/logger.service';

const router = Router();
const logger = createLogger('OpenWARoutes');

// GET /openwa/status - Check OpenWA engine status
router.get('/status', authenticate, requireWhatsAppAdmin, async (req: Request, res: Response) => {
  try {
    const engineRegistry = EngineRegistry.getInstance();
    const status = engineRegistry.getEngineStatus('openwa');
    return res.json({ success: true, status });
  } catch (error) {
    logger.error('Failed to get OpenWA engine status:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// GET /openwa/qr - Get QR code for WhatsApp pairing
router.get('/qr', authenticate, requireWhatsAppAdmin, async (req: Request, res: Response) => {
  try {
    const engineRegistry = EngineRegistry.getInstance();
    const qrCode = engineRegistry.getEngineQRCode('openwa');
    return res.json({ success: true, qrCode });
  } catch (error) {
    logger.error('Failed to get OpenWA QR code:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST /openwa/connect - Connect to WhatsApp
router.post('/connect', authenticate, requireWhatsAppAdmin, async (req: Request, res: Response) => {
  try {
    const engineRegistry = EngineRegistry.getInstance();
    await engineRegistry.engineConnect('openwa');
    return res.json({ success: true, message: 'Connecting to WhatsApp...' });
  } catch (error) {
    logger.error('Failed to connect OpenWA engine:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST /openwa/disconnect - Disconnect from WhatsApp
router.post('/disconnect', authenticate, requireWhatsAppAdmin, async (req: Request, res: Response) => {
  try {
    const engineRegistry = EngineRegistry.getInstance();
    await engineRegistry.engineDisconnect('openwa');
    return res.json({ success: true, message: 'Disconnected from WhatsApp' });
  } catch (error) {
    logger.error('Failed to disconnect OpenWA engine:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// GET /openwa/sessions - List WhatsApp sessions
router.get('/sessions', authenticate, requireWhatsAppAdmin, async (req: Request, res: Response) => {
  try {
    const engineRegistry = EngineRegistry.getInstance();
    const sessions = engineRegistry.getEngineSessions('openwa');
    return res.json({ success: true, sessions });
  } catch (error) {
    logger.error('Failed to get OpenWA sessions:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST /openwa/sessions/:id/start - Start a session
router.post('/sessions/:id/start', authenticate, requireWhatsAppAdmin, async (req: Request, res: Response) => {
  try {
    const engineRegistry = EngineRegistry.getInstance();
    const result = await engineRegistry.engineStartSession('openwa', req.params.id);
    return res.json({ success: true, result });
  } catch (error) {
    logger.error('Failed to start OpenWA session:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST /openwa/sessions/:id/stop - Stop a session
router.post('/sessions/:id/stop', authenticate, requireWhatsAppAdmin, async (req: Request, res: Response) => {
  try {
    const engineRegistry = EngineRegistry.getInstance();
    const result = await engineRegistry.engineStopSession('openwa', req.params.id);
    return res.json({ success: true, result });
  } catch (error) {
    logger.error('Failed to stop OpenWA session:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;