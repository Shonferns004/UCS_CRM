import { Router } from "express";
import { authenticateRole } from "../middleware/authMiddleware.js";
import { searchOsmPlaces } from "../controllers/osmPlacesController.js";

const router = Router();
router.get("/search", authenticateRole("accounts", "super_admin"), searchOsmPlaces);
export default router;

