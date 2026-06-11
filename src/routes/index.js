import express from "express";
import taskRoutes from "./taskroutes.js";
import authRoutes from "./authroutes.js"
import commentRoutes from "./commentsroutes.js"
import dashboardRoutes from "./dashboardroutes.js"
import organizationroutes from "./organizationroutes.js"

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/tasks", taskRoutes);
router.use("/comments",commentRoutes)
router.use("/dashboard",dashboardRoutes)
router.use('/organizations', organizationroutes);

export default router;
