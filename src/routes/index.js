import express from "express";
import taskRoutes from "./taskroutes.js";
import authRoutes from "./authroutes.js"
import commentRoutes from "./commentsroutes.js"
import dashboardRoutes from "./dashboardroutes.js"
import organizationroutes from "./organizationroutes.js"
import bankRoutes from "./bankroutes.js";
import subActivityRoutes from "./subactivityroutes.js";

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/tasks", taskRoutes);
router.use("/comments",commentRoutes)
router.use("/dashboard",dashboardRoutes)
router.use('/organizations', organizationroutes);
router.use('/banks', bankRoutes);
router.use('/sub-activities', subActivityRoutes);

export default router;
