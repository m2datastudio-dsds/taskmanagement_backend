import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const allowedStatuses = new Set(["pending", "in_progress", "completed"]);

async function actorContext(req, taskId) {
  const userId = Number(req.user?.userId || 0);
  if (!userId) return { error: "Unauthorized", status: 401 };

  const [roleMap, task] = await Promise.all([
    prisma.userRoleMap.findFirst({
      where: { userid: userId, isactive: true },
      include: { role: true },
      orderBy: { assignedat: "desc" },
    }),
    prisma.task.findFirst({
      where: { id: taskId, isactive: true },
      select: { id: true, orgid: true, userid: true, status: { select: { name: true } } },
    }),
  ]);

  if (!task) return { error: "Task not found", status: 404 };
  const role = roleMap?.role?.name;
  const tokenOrgId = Number(req.user?.orgId || 0);
  const isSuperAdmin = role === "super_admin";
  const isAdmin = role === "admin" && tokenOrgId === task.orgid;
  const isAssignedStaff = ["employee", "intern"].includes(role) && task.userid === userId;
  if (!isSuperAdmin && !isAdmin && !isAssignedStaff) {
    return { error: "No access to this task", status: 403 };
  }
  return { userId, role, task, isSuperAdmin, isAdmin, isAssignedStaff };
}

export const listSubActivities = async (req, res) => {
  try {
    const taskId = Number(req.params.taskId || 0);
    const actor = await actorContext(req, taskId);
    if (actor.error) return res.status(actor.status).json({ message: actor.error });

    const activities = await prisma.subActivity.findMany({
      where: { taskid: taskId, isactive: true },
      orderBy: { createdat: "asc" },
    });
    return res.json(activities);
  } catch (error) {
    console.error("listSubActivities error:", error);
    return res.status(500).json({ message: error.message || "Internal Server Error" });
  }
};

export const createSubActivity = async (req, res) => {
  try {
    const taskId = Number(req.params.taskId || 0);
    const actor = await actorContext(req, taskId);
    if (actor.error) return res.status(actor.status).json({ message: actor.error });
    if (actor.isSuperAdmin) return res.status(403).json({ message: "Super Admin cannot modify task work" });
    if (["completed", "closed"].includes(actor.task.status.name)) {
      return res.status(400).json({ message: "Completed tasks cannot be changed" });
    }

    const title = String(req.body.title || "").trim();
    const remarks = String(req.body.remarks || "").trim();
    if (!title) return res.status(400).json({ message: "Activity name is required" });

    const activity = await prisma.subActivity.create({
      data: {
        taskid: taskId,
        title,
        remarks: remarks || null,
        createdby: actor.userId,
      },
    });
    return res.status(201).json(activity);
  } catch (error) {
    console.error("createSubActivity error:", error);
    return res.status(500).json({ message: error.message || "Internal Server Error" });
  }
};

export const updateSubActivity = async (req, res) => {
  try {
    const activityId = Number(req.params.id || 0);
    const existing = await prisma.subActivity.findFirst({
      where: { id: activityId, isactive: true },
    });
    if (!existing) return res.status(404).json({ message: "Sub-activity not found" });
    const actor = await actorContext(req, existing.taskid);
    if (actor.error) return res.status(actor.status).json({ message: actor.error });
    if (actor.isSuperAdmin) return res.status(403).json({ message: "Super Admin cannot modify task work" });
    if (["completed", "closed"].includes(actor.task.status.name)) {
      return res.status(400).json({ message: "Completed tasks cannot be changed" });
    }

    const status = actor.isAdmin || req.body.status == null
      ? existing.status
      : String(req.body.status).trim().toLowerCase();
    if (!allowedStatuses.has(status)) {
      return res.status(400).json({ message: "Status must be pending, in_progress, or completed" });
    }
    const data = {
      status,
      remarks: req.body.remarks == null ? existing.remarks : String(req.body.remarks).trim() || null,
      updatedby: actor.userId,
    };
    if (actor.isAdmin && req.body.title != null) {
      const title = String(req.body.title).trim();
      if (!title) return res.status(400).json({ message: "Activity name is required" });
      data.title = title;
    }

    const activity = await prisma.subActivity.update({ where: { id: activityId }, data });
    return res.json(activity);
  } catch (error) {
    console.error("updateSubActivity error:", error);
    return res.status(500).json({ message: error.message || "Internal Server Error" });
  }
};

export const deleteSubActivity = async (req, res) => {
  try {
    const activityId = Number(req.params.id || 0);
    const existing = await prisma.subActivity.findFirst({
      where: { id: activityId, isactive: true },
    });
    if (!existing) return res.status(404).json({ message: "Sub-activity not found" });
    const actor = await actorContext(req, existing.taskid);
    if (actor.error) return res.status(actor.status).json({ message: actor.error });
    if (actor.isSuperAdmin) return res.status(403).json({ message: "Super Admin cannot modify task work" });
    if (["completed", "closed"].includes(actor.task.status.name)) {
      return res.status(400).json({ message: "Completed tasks cannot be changed" });
    }
    if (!actor.isAdmin && existing.createdby !== actor.userId) {
      return res.status(403).json({ message: "Staff cannot delete an Admin-created activity" });
    }

    await prisma.subActivity.update({
      where: { id: activityId },
      data: { isactive: false, removedat: new Date(), updatedby: actor.userId },
    });
    return res.json({ message: "Sub-activity deleted successfully" });
  } catch (error) {
    console.error("deleteSubActivity error:", error);
    return res.status(500).json({ message: error.message || "Internal Server Error" });
  }
};
