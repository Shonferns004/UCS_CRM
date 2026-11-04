import { Router } from "express";
import { authenticateRole } from "../middleware/authMiddleware.js";
import { searchPlaces } from "../controllers/googlePlacesController.js";

const router = Router();

router.get("/search", authenticateRole("accounts", "super_admin"), searchPlaces);

export default router;

