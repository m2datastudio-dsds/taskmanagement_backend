import { Router } from "express";
import { authMiddleware } from "../middlewares/authmiddleware.js";
import { createBank, deleteBank, listBanks, updateBank } from "../controllers/bankcontroller.js";

const router = Router();

router.get("/", authMiddleware, listBanks);
router.post("/", authMiddleware, createBank);
router.put("/:id", authMiddleware, updateBank);
router.delete("/:id", authMiddleware, deleteBank);

export default router;
