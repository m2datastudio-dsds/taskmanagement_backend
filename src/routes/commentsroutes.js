import { Router } from "express";
import { authMiddleware } from "../middlewares/authmiddleware.js";
import { create, deleteComment, editComment, getAllComments, getCommentsByTaskId } from "../controllers/comments.js";

const router = Router();

// Create a new daily update
router.post("/createcomments", authMiddleware, create);
router.get("/getAll", authMiddleware, getAllComments);
router.get("/getByTask/:taskid", authMiddleware, getCommentsByTaskId);
router.put("/editComments/:commentId",authMiddleware,editComment)
router.delete("/deleteComments/:commentId",authMiddleware,deleteComment)


export default router;
