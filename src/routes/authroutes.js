import express from "express";
import { register, login, getAllAdmins } from "../controllers/authcontroller.js";
import { authMiddleware } from "../middlewares/authmiddleware.js";

const router = express.Router();

router.post("/register", authMiddleware, register);
router.post("/login", login);
router.get("/admins", authMiddleware, getAllAdmins);

export default router;
