import express from "express";
import {
  createTask,
  changeTaskStatus,
  adminTaskAction,
  getAllTasks,
  getAllUsers,
  getTasksByUserId,
  deactivateTask,
  deactivateUser,
  assignTask,
} from "../controllers/taskcontroller.js";
import { authMiddleware } from "../middlewares/authmiddleware.js";


const router = express.Router();

router.post("/create", authMiddleware, createTask);
router.post("/change-status", changeTaskStatus);
router.post("/admin-action", authMiddleware, adminTaskAction);
router.get("/getAlltask",authMiddleware,getAllTasks)
router.get("/getAllUser",authMiddleware,getAllUsers)
router.get("/tasksByuser/:userId", authMiddleware, getTasksByUserId);
router.put("/:taskId/deactivate", authMiddleware, deactivateTask);
router.put("/:userId/deactivateUser", authMiddleware, deactivateUser);
router.put("/:taskId/assign", authMiddleware, assignTask);






export default router;
