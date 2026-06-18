
import { Router } from "express";
import { getOverview, getStatusBreakdown, getTaskDistributionByUser } from "../controllers/dashboardcontrollers.js";
import { authMiddleware } from "../middlewares/authmiddleware.js";

const router = Router();


router.get("/overview",authMiddleware, getOverview);
router.get('/status-breakdown', authMiddleware, getStatusBreakdown);
router.get('/task-distribution-by-user', authMiddleware, getTaskDistributionByUser);

export default router
