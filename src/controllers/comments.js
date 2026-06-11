// controllers/comments.controller.ts
import { prisma } from "../config/prisma.js";
import { HttpException } from "../utils/http-exception.js";


export const create = async (req, res, next) => {
  try {
    const { taskid, comments } = req.body;
    const userId = req.user?.userId;

    if (!userId) throw new HttpException(401, "Unauthorized");
    if (!taskid || !String(comments || "").trim())
      throw new HttpException(400, "taskid and comments are required");

    // Ensure task exists
    const task = await prisma.task.findUnique({
      where: { id: taskid },
      select: { id: true, isactive: true, statusId: true },
    });
    if (!task) throw new HttpException(404, "Task not found");

    // Block commenting on inactive/closed tasks
    if (!task.isactive) {
      throw new HttpException(400, "Cannot add comment to an inactive or closed task");
    }

    const now = new Date();

    // Create new comment (id will be auto-generated: 1,2,3,...)
    const newComment = await prisma.comment.create({
      data: {
        taskid,
        userid: userId,                
        comments: String(comments).trim(),
        updatedat: now,
        isEdited: false,
        isDeleted: false,
      },
    });

    // Deactivate old active logs for this user on the same task
    await prisma.taskCommentMap.updateMany({
      where: { taskid, createdby: userId, isactive: true }, 
      data: { isactive: false },
    });

    // Create mapping entry (link comment -> task)
    const newMap = await prisma.taskCommentMap.create({
      data: {
        taskid,
        commentid: newComment.id,
        updatedat: now,
        createdby: userId,    
        createdat: now,       
        isactive: true,
      },
    });

    return res.json({
      success: true,
      message: "Comment added successfully",
      comment: newComment,
      log: newMap,
    });
  } catch (err) {
    console.error("create comment error:", err);
    if (err instanceof HttpException) return next(err);
    return next(new HttpException(500, "Internal Server Error"));
  }
};



// ✅ Get All Comments (Admin View)
export const getAllComments = async (req, res, next) => {
  try {
    const comments = await prisma.comment.findMany({
      where: { isDeleted: false },
      // orderBy: { createdat: "desc" },
      include: {
        user: {
          select: { id: true, name: true, email: true},
        },
        task: {
          select: { id: true, title: true, status: true },
        },
      },
    });

    return res.json({
      success: true,
      total: comments.length,
      data: comments.map((c) => ({
        id: c.id,
        comments: c.comments,
        taskTitle: c.task?.title,
        userName: c.user?.name,
        userEmail: c.user?.email,
        role: c.user?.role,
        createdAt: c.createdat,
        isEdited: c.isEdited,
      })),
    });
  } catch (err) {
    console.error("getAllComments error:", err);
    if (err instanceof HttpException) return next(err);
    return next(new HttpException(500, "Internal Server Error"));
  }
};



// export const getCommentsByTaskId = async (req, res, next) => {
//   try {
//     const userId = req.user?.userId;
//     if (!userId) throw new HttpException(401, "Unauthorized");

//     const { taskid } = req.params;
//     if (!taskid) throw new HttpException(400, "taskid is required");

//     const comments = await prisma.comment.findMany({
//       where: {
//         taskid: Number(taskid),
//         isDeleted: false,
//         userid: Number(userId),          // <-- filter by logged-in user
//       },
//       // orderBy: { createdat: "asc" },
//       include: {
//         user: { select: { id: true, name: true, email: true } },
//       },
//     });

//     return res.json({
//       success: true,
//       taskid: Number(taskid),
//       total: comments.length,
//       data: comments.map((c) => ({
//         id: c.id,
//         comments: c.comments,
//         userName: c.user?.name,
//         userEmail: c.user?.email,
//         createdAt: c.updatedat,
//         isEdited: c.isEdited,
//       })),
//     });
//   } catch (err) {
//     console.error("getCommentsByTaskId error:", err);
//     if (err instanceof HttpException) return next(err);
//     return next(new HttpException(500, "Internal Server Error"));
//   }
// };



// GET /comments/task/:taskid

export const getCommentsByTaskId = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new HttpException(401, "Unauthorized");

    const { taskid } = req.params;
    if (!taskid) throw new HttpException(400, "taskid is required");

    // Return all non-deleted comments for the given task (same for admins and users)
    const comments = await prisma.comment.findMany({
      where: {
        taskid: Number(taskid),
        isDeleted: false,
      },
      orderBy: { updatedat: "asc" },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return res.json({
      success: true,
      taskid: Number(taskid),
      total: comments.length,
      data: comments.map((c) => ({
        id: c.id,
        comments: c.comments,
        userId: c.userid,
        userName: c.user?.name,
        userEmail: c.user?.email,
        createdAt: c.updatedat,
        isEdited: c.isEdited,
      })),
    });
  } catch (err) {
    console.error("getCommentsByTaskId error:", err);
    if (err instanceof HttpException) return next(err);
    return next(new HttpException(500, "Internal Server Error"));
  }
};






const isAdminUser = async (userId) => {
  if (!userId) return false;
  const m = await prisma.userRoleMap.findFirst({
    where: { userid: userId, isactive: true },
    include: { role: true },
  });
  return m?.role?.name === "admin" || m?.role?.name === "super_admin";
};

/**
 * Edit a comment text.
 * - Only comment owner (userid) or admin can edit.
 * - Marks isEdited = true and updates updatedat.
 */
export const editComment = async (req, res, next) => {
  try {
    const { commentId } = req.params;         // e.g. /comments/:commentId
    const { comments } = req.body;
    const userId = req.user?.userId;

    if (!userId) throw new HttpException(401, "Unauthorized");
    if (!commentId) throw new HttpException(400, "commentId is required");
    if (!String(comments || "").trim()) throw new HttpException(400, "comments is required");

    // Find comment
    const existing = await prisma.comment.findUnique({ where: { id: Number(commentId) } });
    if (!existing) throw new HttpException(404, "Comment not found");

    // Authorization: owner or admin
    const allowed = existing.userid === userId || await isAdminUser(userId);
    if (!allowed) throw new HttpException(403, "Forbidden: cannot edit this comment");

    const now = new Date();

    // Update comment
    const updatedComment = await prisma.comment.update({
      where: { id: Number(commentId) },
      data: {
        comments: String(comments).trim(),
        isEdited: true,
        updatedat: now,
      },
    });

    // Update mapping rows' updatedat if any (optional)
    await prisma.taskCommentMap.updateMany({
      where: { commentid: Number(commentId), isactive: true },
      data: { updatedat: now },
    });

    return res.json({
      success: true,
      message: "Comment updated successfully",
      comment: updatedComment,
    });
  } catch (err) {
    console.error("editComment error:", err);
    if (err instanceof HttpException) return next(err);
    return next(new HttpException(500, "Internal Server Error"));
  }
};

export const deleteComment = async (req, res, next) => {
  try {
    const { commentId } = req.params; // DELETE /comments/:commentId
    const userId = req.user?.userId;

    if (!userId) throw new HttpException(401, "Unauthorized");
    if (!commentId) throw new HttpException(400, "commentId is required");

    // Find comment
    const existing = await prisma.comment.findUnique({
      where: { id: Number(commentId) },
    });
    if (!existing) throw new HttpException(404, "Comment not found");

    // Authorization: only owner or admin can delete
    const allowed = existing.userid === userId || await isAdminUser(userId);
    if (!allowed) throw new HttpException(403, "Forbidden: cannot delete this comment");

    if (existing.isDeleted)
      return res.status(400).json({ success: false, message: "Comment already deleted" });

    const now = new Date();

    // Soft delete both comment and related task mappings in one transaction
    const [deletedComment, updatedMaps] = await prisma.$transaction([
      prisma.comment.update({
        where: { id: Number(commentId) },
        data: {
          isDeleted: true,
          updatedat: now,
        },
      }),
      prisma.taskCommentMap.updateMany({
        where: { commentid: Number(commentId), isactive: true },
        data: {
          isactive: false,
          isDeleted: true,
          updatedat: now,
        },
      }),
    ]);

    return res.json({
      success: true,
      message: "Comment soft-deleted successfully",
      comment: deletedComment,
      deactivatedMappings: updatedMaps.count,
    });
  } catch (err) {
    console.error("deleteComment error:", err);
    if (err instanceof HttpException) return next(err);
    return next(new HttpException(500, "Internal Server Error"));
  }
};



