import { Router } from "express";
import { authMiddleware } from "../middlewares/authmiddleware.js";
import {
  createSubActivity,
  deleteSubActivity,
  listSubActivities,
  updateSubActivity,
} from "../controllers/subactivitycontroller.js";

const router = Router();

router.get("/task/:taskId", authMiddleware, listSubActivities);
router.post("/task/:taskId", authMiddleware, createSubActivity);
router.put("/:id", authMiddleware, updateSubActivity);
router.delete("/:id", authMiddleware, deleteSubActivity);

export default router;
