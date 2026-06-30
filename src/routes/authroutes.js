import express from "express";
import { register, login, getAllAdmins, updateUserMobile } from "../controllers/authcontroller.js";
import { authMiddleware } from "../middlewares/authmiddleware.js";

const router = express.Router();

router.post("/register", authMiddleware, register);
router.post("/login", login);
router.get("/admins", authMiddleware, getAllAdmins);
router.put("/users/:userId/mobile", authMiddleware, updateUserMobile);

export default router;
