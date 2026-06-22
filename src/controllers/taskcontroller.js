import { prisma } from "../config/prisma.js";
import { HttpException } from "../utils/http-exception.js";

const STATUS_NAMES = [
  "created",
  "assigned",
  "in_progress",
  "completed",
  "closed",
  "reassign",
  "revoked",
  "on_hold",
];


// Controller: create task (only admin)

//   try {
//     const { title, description, assignedToId, statusName, statusId, dueDate } = req.body;

//     // Actor (must be authenticated)
//     const actorId = req.user?.userId;
//     if (!actorId) throw new HttpException(401, 'Unauthorized');
//      const actorOrgId = req.user?.orgId ?? null;

//     // Ensure actor is admin or super_admin
//     const userRoleMap = await prisma.userRoleMap.findFirst({
//       where: { userid: actorId, isactive: true },
//       include: { role: true },
//       orderBy: { assignedat: 'desc' },
//     });

//     const roleName = userRoleMap?.role?.name ?? null; // Role.name is RoleName enum
//     if (roleName !== 'admin' && roleName !== 'super_admin') {
//       throw new HttpException(403, 'Only admins can create tasks');
//     }

//     if (roleName === "admin" && !actorOrgId) {
//       throw new HttpException(400, "Organization not selected in login");
//     }

//     // Resolve status (by id or name; default 'created')
//     let resolvedStatusId = statusId;
//     if (!resolvedStatusId) {
//       const lookup = (statusName ?? 'created').toString().trim();
//       const statusRow = await prisma.status.findFirst({ where: { name: lookup } });
//       if (!statusRow) throw new HttpException(400, `Status '${lookup}' not found`);
//       resolvedStatusId = statusRow.id;
//     }

//     // Resolve assignee (id / name / email). Default to creator if none provided.
//     let assignedUserId;
//     const assignedRaw = assignedToId?.toString?.().trim?.();

//     if (!assignedRaw) {
//       assignedUserId = actorId;
//     } else {
//       let assignedUser = null;

//       // Try numeric id
//       if (/^\d+$/.test(assignedRaw)) {
//         assignedUser = await prisma.user.findUnique({ where: { id: parseInt(assignedRaw, 10) } });
//       }
//       // Try name (case-insensitive)
//       if (!assignedUser) {
//         assignedUser = await prisma.user.findFirst({
//           where: { name: { equals: assignedRaw, mode: 'insensitive' } },
//         });
//       }
//       // Try email (case-insensitive)
//       if (!assignedUser) {
//         assignedUser = await prisma.user.findFirst({
//           where: { email: { equals: assignedRaw, mode: 'insensitive' } },
//         });
//       }

//       if (!assignedUser) throw new HttpException(400, `User '${assignedRaw}' not found`);
//       assignedUserId = assignedUser.id;
//     }

//     // Parse due date (ISO string). Allow null to explicitly clear.
//     let due = null;
//     if (dueDate === null) {
//       due = null;
//     } else if (typeof dueDate === 'string' && dueDate.trim() !== '') {
//       const d = new Date(dueDate);
//       if (isNaN(d.getTime())) throw new HttpException(400, 'Invalid dueDate format. Use ISO string.');
//       due = d;
//     }

//     const now = new Date();

//     // Create Task + TaskUserMap atomically
//     const result = await prisma.$transaction(async (tx) => {
//       const task = await tx.task.create({
//         data: {
//           title: title || null,
//           description: description || null,
//           userid: assignedUserId,
//           statusId: resolvedStatusId,
//           createdby: actorId,
//           isactive: true,
//           duedate: due, // ← store due date
//            orgid: actorOrgId,
//         },
//       });

//       const map = await tx.taskUserMap.create({
//         data: {
//           taskid: task.id,
//           userid: assignedUserId,
//           statusId: resolvedStatusId,
//           createdby: actorId,
//           createdat: now,
//           isactive: true,
//         },
//       });

//       return { task, map };
//     });

//     // Fetch small projections for response
//     const [assignedUser, status] = await Promise.all([
//       prisma.user.findUnique({
//         where: { id: result.task.userid },
//         select: { id: true, name: true, email: true },
//       }),
//       prisma.status.findUnique({
//         where: { id: result.task.statusId },
//         select: { id: true, name: true },
//       }),
//     ]);

//     return res.status(201).json({
//       success: true,
//       message: 'Task created successfully',
//       task: {
//         ...result.task,
//         assignedUser,
//         status,
//       },
//       taskUserMap: result.map,
//     });
//   } catch (err) {
//     console.error('createTask error:', err);
//     if (err instanceof HttpException) {
//       return res.status(err.status || 400).json({ status: err.status, message: err.message });
//     }
//     return next?.(err) ?? res.status(500).json({ status: 500, message: 'Internal Server Error' });
//   }
// };



const taskImageUrl = (req) => {
  if (!req.file) return null;
  return `${req.protocol}://${req.get("host")}/uploads/task_images/${req.file.filename}`;
};

export const createTask = async (req, res, next) => {
  try {
    const actorId = req.user?.userId;
    const orgId = req.user?.orgId;

    if (!actorId || !orgId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const {
      title,
      description,
      assignedToId,
      assignedToName,
      statusName,
      dueDate,
      priority,

      // 🔁 Recurring schedule
      period,        // daily | weekly | monthly | yearly
      timeOfDay,     // HH:mm
    dayOfWeek,
      monthDay,
      yearSelect,
      yearMonth,
      yearDay,

      endDate,
      neverEnd,
    } = req.body;

    /* ------------------------------
       BASIC VALIDATION
    ------------------------------ */
    if (!title || !statusName) {
      throw new HttpException(400, "Title and status are required");
    }

    /* ------------------------------
       STATUS VALIDATION
    ------------------------------ */
    const status = await prisma.status.findFirst({
      where: { name: statusName.toLowerCase() },
    });

    if (!status) {
      throw new HttpException(400, "Invalid status");
    }


    if (statusName.toLowerCase() !== "assigned") {
      throw new HttpException(400, "Task must be assigned to an employee or intern");
    }
    /* ------------------------------
       ASSIGNED USER RESOLVE
       Only employee/intern users in the actor organization can be mapped.
    ------------------------------ */
    let assignedUserId = null;

    const employeeInternOrgFilter = {
      isdeleted: false,
      organizationUserMap: {
        some: {
          orgid: orgId,
          isactive: true,
          role: { in: ["employee", "intern"] },
        },
      },
    };

    if (assignedToId) {
      const parsedAssignedToId = Number(assignedToId);
      if (!Number.isInteger(parsedAssignedToId) || parsedAssignedToId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid assignedToId",
        });
      }

      const user = await prisma.user.findFirst({
        where: {
          id: parsedAssignedToId,
          ...employeeInternOrgFilter,
        },
        select: { id: true },
      });

      if (!user) {
        return res.status(400).json({
          success: false,
          message: "Assigned user must be an active employee or intern in this organization",
        });
      }

      assignedUserId = user.id;
    } else if (assignedToName) {
      const assignedName = String(assignedToName).trim();
      const user = await prisma.user.findFirst({
        where: {
          ...employeeInternOrgFilter,
          OR: [{ name: assignedName }, { email: assignedName }],
        },
        select: { id: true },
      });

      if (!user) {
        return res.status(400).json({
          success: false,
          message: "Assigned user must be an active employee or intern in this organization",
        });
      }

      assignedUserId = user.id;
    }

    if (!assignedUserId) {
      throw new HttpException(400, "Please assign task to an active employee or intern");
    }


      // 🔐 VALIDATION: schedule fields per period
    if (period === "weekly" && (dayOfWeek === undefined || dayOfWeek === null)) {
      throw new HttpException(400, "dayOfWeek is required for weekly tasks");
    }
    if (period === "monthly" && (monthDay === undefined || monthDay === null || monthDay === "")) {
      throw new HttpException(400, "monthDay (1-31) is required for monthly tasks");
    }
    if (period === "yearly") {
      if (yearMonth === undefined || yearMonth === null || yearMonth === "") {
        throw new HttpException(400, "yearMonth (0-11) is required for yearly tasks");
      }
      if (yearDay === undefined || yearDay === null || yearDay === "") {
        throw new HttpException(400, "yearDay (1-31) is required for yearly tasks");
      }
    }

    /* ------------------------------
       PERIOD SCHEDULE (NO startDate)
    ------------------------------ */
    let periodSchedule = null;

    if (period) {
      if (!timeOfDay) {
        throw new HttpException(
          400,
          "timeOfDay is required for recurring tasks"
        );
      }

      

      periodSchedule = JSON.stringify({
        period,
        timeOfDay,
    dayOfWeek: period === "weekly" ? Number(dayOfWeek) : null,
        monthDay,
        yearSelect,
        yearMonth,
        yearDay,
        endDate: neverEnd ? null : endDate,
        neverEnd: !!neverEnd,
      });
    }

    let parsedDueDate = null;
    if (dueDate !== undefined && dueDate !== null && String(dueDate).trim() !== "") {
      parsedDueDate = new Date(dueDate);
      if (isNaN(parsedDueDate.getTime())) {
        throw new HttpException(400, "Invalid dueDate format. Use ISO string.");
      }
    }

    const allowedPriorities = new Set(["low", "medium", "high", "urgent", "normal"]);
    const normalizedPriority = String(priority || "normal").trim().toLowerCase();
    if (!allowedPriorities.has(normalizedPriority)) {
      throw new HttpException(400, "Invalid priority. Use low/medium/high/urgent");
    }
    const taskOwnerUserId = assignedUserId;
    const uploadedImageUrl = taskImageUrl(req);

    /* ------------------------------
       CREATE TASK
    ------------------------------ */
    const task = await prisma.task.create({
      data: {
        title,
        description,
        userid: taskOwnerUserId,
        statusId: status.id,
        createdby: actorId,
        orgid: orgId,
        isactive: true,
        periodSchedule,
        duedate: parsedDueDate,
        priority: normalizedPriority,
        ...(uploadedImageUrl ? { imageUrl: uploadedImageUrl } : {}),
      },
    });

    /* ------------------------------
       MAP USER TO TASK
       Assigned task -> employee/intern userid
       Task owner -> assigned employee/intern userid
    ------------------------------ */
    await prisma.taskUserMap.create({
      data: {
        taskid: task.id,
        userid: taskOwnerUserId,
        statusId: status.id,
        createdby: actorId,
        isactive: true,
      },
    });

    return res.status(201).json({
      success: true,
      task,
    });
  } catch (error) {
    console.error(error);

    if (error instanceof HttpException) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};






export const changeTaskStatus = async (req, res, next) => {
  try {
    const { taskId, statusName, statusId } = req.body;
    const parsedTaskId = Number(taskId);
    if (!Number.isInteger(parsedTaskId) || parsedTaskId <= 0) {
      throw new HttpException(400, "Valid taskId is required");
    }

    // 1) Find task
    const task = await prisma.task.findUnique({
      where: { id: parsedTaskId },
      include: { assignedUser: true },
    });
    if (!task) throw new HttpException(404, "Task not found");

    // 2) Actor. Employees/interns may update only their current active assignment.
    const actorId = req.user?.userId;
    if (!actorId) throw new HttpException(401, "Unauthorized");

    const actorRoleMap = await prisma.userRoleMap.findFirst({
      where: { userid: actorId, isactive: true },
      include: { role: true },
      orderBy: { assignedat: "desc" },
    });
    const actorRole = actorRoleMap?.role?.name ?? req.user?.role ?? null;
    const isAdminLike = ["admin", "super_admin"].includes(
      String(actorRole || "").toLowerCase()
    );

    if (!isAdminLike) {
      const activeAssignment = await prisma.taskUserMap.findFirst({
        where: {
          taskid: parsedTaskId,
          userid: actorId,
          isactive: true,
        },
        select: { id: true },
      });

      if (!activeAssignment || task.userid !== actorId) {
        throw new HttpException(403, "You are no longer assigned to this task");
      }
    }

    // 3) Resolve statusId/name
    let resolvedStatusId = statusId;
    let statusNameResolved = statusName;

    if (!resolvedStatusId) {
      const input = (statusName ?? "").toString().trim();
      if (!input) throw new HttpException(400, "statusName or statusId is required");

      const enumValues = STATUS_NAMES;
      const matched = enumValues.find(v => v.toLowerCase() === input.toLowerCase());
      if (!matched) throw new HttpException(400, `Invalid status '${statusName}'. Valid: ${enumValues.join(", ")}`);

      const row = await prisma.status.findFirst({ where: { name: matched } });
      if (!row) throw new HttpException(400, `Status '${matched}' not found in database`);
      resolvedStatusId = row.id;
      statusNameResolved = row.name;
    } else {
      const row = await prisma.status.findUnique({ where: { id: resolvedStatusId } });
      if (!row) throw new HttpException(400, `Status with id ${resolvedStatusId} not found`);
      statusNameResolved = row.name;
    }

    // 4) Skip if unchanged
    if (task.statusId === resolvedStatusId) {
      return res.json({ success: true, message: "Status unchanged (same as current)", task });
    }

    // 5) Transaction: update Task, set-once timestamps, ALWAYS mirror statusId on all active maps
    const now = new Date();
    const statusLower = statusNameResolved.toLowerCase();

    const result = await prisma.$transaction(async (tx) => {
      // a) Update Task
      const updatedTask = await tx.task.update({
        where: { id: parsedTaskId },
        data: {
          statusId: resolvedStatusId,
          updatedby: actorId,
          updatedat: now,
        },
      });

      // b) Set-once timestamps
      let setPickup = 0;
      let setCompleted = 0;

      if (statusLower === "in_progress") {
        const r = await tx.taskUserMap.updateMany({
          where: { taskid: parsedTaskId, isactive: true, pickedupat: null },
          data: { pickedupat: now, updatedby: actorId, updatedat: now },
        });
        setPickup = r.count;
      } else if (statusLower === "completed") {
        // ensure pickedupat exists for rows that never picked up
        const p = await tx.taskUserMap.updateMany({
          where: { taskid: parsedTaskId, isactive: true, pickedupat: null },
          data: { pickedupat: now, updatedby: actorId, updatedat: now },
        });
        setPickup = p.count;

        // set completedat once
        const c = await tx.taskUserMap.updateMany({
          where: { taskid: parsedTaskId, isactive: true, completedat: null },
          data: { completedat: now, updatedby: actorId, updatedat: now },
        });
        setCompleted = c.count;
      }

      // c) ✅ ALWAYS mirror final statusId to ALL active mappings (critical fix)
      const mirror = await tx.taskUserMap.updateMany({
        where: { taskid: parsedTaskId, isactive: true },
        data: { statusId: resolvedStatusId, updatedby: actorId, updatedat: now },
      });

      return {
        updatedTask,
        counts: { setPickup, setCompleted, mirrorAll: mirror.count },
      };
    });

    // 6) Response
    return res.json({
      success: true,
      message: `Task moved to '${statusNameResolved}' successfully`,
      task: result.updatedTask,
      taskUserMapUpdates: result.counts,
    });
  } catch (err) {
    console.error("changeTaskStatus error:", err);
    if (err instanceof HttpException) return next(err);
    return next(new HttpException(500, "Internal Server Error"));
  }
};



// 🔹 Resolve statusId dynamically
const resolveStatusIdByName = async (statusName) => {
  const status = await prisma.status.findFirst({
    where: { name: statusName },
    select: { id: true },
  });
  return status?.id || null;
};

export const adminTaskAction = async (req, res, next) => {
  try {
    const actorId = req.user?.userId;
    if (!actorId) throw new HttpException(401, "Unauthorized");

    // 🔍 Verify admin
    const userRoleMap = await prisma.userRoleMap.findFirst({
      where: { userid: actorId, isactive: true },
      include: { role: true },
    });
    const actorRole = userRoleMap?.role?.name ?? null;
    if (actorRole !== "admin")
      throw new HttpException(403, "Only admins can perform this action");

    // 🔸 Extract input
    const { actionType, taskId, newUserId, reason } = req.body;
    if (!actionType || !taskId)
      throw new HttpException(400, "actionType and taskId are required");

    const validActions = ["reassign", "revoked", "closed"];
    if (!validActions.includes(actionType.toLowerCase()))
      throw new HttpException(
        400,
        `Invalid actionType. Use one of: ${validActions.join(", ")}`
      );

    // 🔹 Get task
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new HttpException(404, "Task not found");

    const now = new Date();

    // 1️⃣ REASSIGN
    if (actionType === "reassign") {
      if (!newUserId)
        throw new HttpException(400, "newUserId is required for reassign");
      if (task.userid === newUserId)
        return res.json({
          success: true,
          message: "Task already assigned to this user",
          task,
        });

      const newUser = await prisma.user.findUnique({
        where: { id: newUserId },
      });
      if (!newUser) throw new HttpException(404, "New user not found");

      const assignedStatusId = await resolveStatusIdByName("assigned");
      if (!assignedStatusId) throw new HttpException(500, "assigned status not found");

      const result = await prisma.$transaction(async (tx) => {
        // Close old active assignment records. Old assignee can no longer act on this task.
        await tx.taskUserMap.updateMany({
          where: { taskid: taskId, isactive: true },
          data: {
            isactive: false,
            removedat: now,
            updatedby: actorId,
            updatedat: now,
          },
        });

        // Update task with the new owner. Reassigned work waits for the new owner to start it.
        const updatedTask = await tx.task.update({
          where: { id: taskId },
          data: {
            userid: newUserId,
            statusId: assignedStatusId,
            updatedby: actorId,
            updatedat: now,
          },
        });

        await tx.taskUserMap.create({
          data: {
            taskid: taskId,
            userid: newUserId,
            statusId: assignedStatusId,
            isactive: true,
            createdby: actorId,
            createdat: now,
          },
        });

        return updatedTask;
      });

      return res.json({
        success: true,
        action: "reassign",
        message: `Task reassigned to ${newUserId}`,
        task: result,
      });
    }

    // 2️⃣ REVOKED → Move to “in_progress”
    if (actionType === "revoked") {
      const inProgressStatusId = await resolveStatusIdByName("in_progress");
      if (!inProgressStatusId)
        throw new HttpException(500, "in_progress status not found");

      const [updatedTask, updatedTaskUserMap] = await prisma.$transaction([
        // Update task status
        prisma.task.update({
          where: { id: taskId },
          data: {
            statusId: inProgressStatusId,
            updatedby: actorId,
            updatedat: now,
          },
        }),

        // ✅ Update the existing task-user map instead of creating new
        prisma.taskUserMap.updateMany({
          where: {
            taskid: taskId,
            isactive: true, // or adjust based on your logic
          },
          data: {
            statusId: inProgressStatusId,
            updatedby: actorId,
            updatedat: now,
            pickedupat: now, // reset pickup time if needed
            // remarks: reason || "Revoked by admin",
          },
        }),
      ]);

      return res.json({
        success: true,
        action: "revoked",
        message: "Task moved back to in_progress",
        task: updatedTask,
        taskUserMap: updatedTaskUserMap,
      });
    }


    // 3️⃣ CLOSED → Only after completed & created by same admin
    if (actionType === "closed") {
      const completedStatusId = await resolveStatusIdByName("completed");
      const closedStatusId = await resolveStatusIdByName("closed");

      if (!completedStatusId || !closedStatusId)
        throw new HttpException(500, "Required statuses not seeded in DB");

      // Only the admin who created this task can close it
      if (task.createdby !== actorId) {
        throw new HttpException(
          403,
          "Only the admin who created this task can close it"
        );
      }

      if (task.statusId !== completedStatusId) {
        throw new HttpException(
          400,
          "Task must be marked 'completed' before admin can close it"
        );
      }

      const [updatedTask, taskUserMapUpdateResult] = await prisma.$transaction([
        // Update task status (do NOT change isactive)
        prisma.task.update({
          where: { id: taskId },
          data: {
            statusId: closedStatusId,
            updatedby: actorId,
            updatedat: now,
          },
        }),

        // Update existing taskUserMap rows' status to closed (do NOT change isactive)
        prisma.taskUserMap.updateMany({
          where: {
            taskid: taskId,
            // you can restrict to isactive: true if desired, otherwise it updates matching rows regardless of isactive
          },
          data: {
            statusId: closedStatusId,
            updatedby: actorId,
            updatedat: now,
          },
        }),
      ]);

      return res.json({
        success: true,
        action: "closed",
        message: "Task closed successfully",
        task: updatedTask,
        taskUserMapUpdatedCount: taskUserMapUpdateResult.count ?? taskUserMapUpdateResult,
      });
    }


  } catch (err) {
    console.error("adminTaskAction error:", err);
    if (err instanceof HttpException) return next(err);
    return next(new HttpException(500, "Internal Server Error"));
  }
};



// ✅ Get All Tasks (Admin Only)
export const getAllTasks = async (req, res, next) => {
  try {
    const actorId = req.user?.userId;
    if (!actorId) throw new HttpException(401, "Unauthorized");

    const actorOrgId = Number(req.user?.orgId || 0);

    // Check role
    const userRoleMap = await prisma.userRoleMap.findFirst({
      where: { userid: actorId, isactive: true },
      include: { role: true },
    });
    const actorRole = userRoleMap?.role?.name ?? null;

    if (!["admin", "super_admin"].includes(actorRole?.toLowerCase())) {
      throw new HttpException(403, "Only admins and super admins can view all tasks");
    }

     if (actorRole === "admin" && !actorOrgId) {
      throw new HttpException(400, "Organization not selected in login");
    }

    // Pagination & Filters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";
    const statusId = req.query.statusId ? parseInt(req.query.statusId) : null;
    const isActive =
      req.query.isactive !== undefined ? req.query.isactive === "true" : true;

    // Where clause
    const whereClause = {
      isactive: isActive,
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ],
      ...(statusId ? { statusId } : {}),
      ...(actorRole === "admin" ? { orgid: actorOrgId } : {}),
    };

    

    // Fetch tasks
    const [tasks, totalCount] = await Promise.all([
      prisma.task.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { createdat: "desc" },
        include: {
          status: { select: { id: true, name: true } },
          assignedUser: { select: { id: true, name: true, email: true } }, // ✅ assigned user
          createdByUser: { select: { id: true, name: true, email: true } }, // ✅ creator
          organization: { select: { id: true, name: true, code: true } },
          taskusermap: true, // optional if you need mapping info
          
        },
      }),
      prisma.task.count({ where: whereClause }),
    ]);

    return res.json({
      success: true,
      total: totalCount,
      page,
      limit,
      data: tasks,
    });
  } catch (err) {
    console.error("getAllTasks error:", err);
    if (err instanceof HttpException) return next(err);
    return next(new HttpException(500, "Internal Server Error"));
  }
};


export const getAllUsers = async (req, res, next) => {
  try {
    const actorId = Number(req.user?.userId);
    if (!actorId) throw new HttpException(401, "Unauthorized");

    // Get actor role
    const actorRoleMap = await prisma.userRoleMap.findFirst({
      where: { userid: actorId, isactive: true },
      include: { role: true },
    });

    const actorRole = actorRoleMap?.role?.name ?? null; // RoleName enum
    if (!actorRole) throw new HttpException(403, "Role not assigned");

    if (!["admin", "super_admin"].includes(String(actorRole))) {
      throw new HttpException(403, "Only admins and super admins can view users");
    }

    const actorOrgId = Number(req.user?.orgId || 0);

    // If admin, orgId must be present in token
    if (actorRole === "admin" && !actorOrgId) {
      throw new HttpException(400, "Organization not selected in login");
    }

    // Pagination and filters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = (req.query.search || "").toString().trim();
    const includeDeleted = req.query.includeDeleted === "true";

    // Base where
    const whereClause = {
      ...(includeDeleted ? {} : { isdeleted: false }),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
      // ✅ Admin sees only users under their org
      ...(actorRole === "admin"
        ? {
            organizationUserMap: {
              some: { orgid: actorOrgId, isactive: true },
            },
          }
        : {}),
    };

    const [users, totalCount] = await Promise.all([
      prisma.user.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { createdat: "desc" },
        include: {
          userrolemap: {
            where: { isactive: true },
            include: { role: { select: { id: true, name: true } } },
          },
          organizationUserMap: {
            where: { isactive: true },
            include: {
              organization: { select: { id: true, name: true, code: true } },
            },
          },
        },
      }),
      prisma.user.count({ where: whereClause }),
    ]);

    const formatted = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      createdat: u.createdat,
      isdeleted: u.isdeleted,
      role: u.userrolemap?.[0]?.role?.name || null,
      organizations: u.organizationUserMap.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        code: m.organization.code,
        role: m.role,
      })),
    }));

    return res.json({
      success: true,
      total: totalCount,
      page,
      limit,
      data: formatted,
    });
  } catch (err) {
    console.error("getAllUsers error:", err);
    if (err instanceof HttpException) return next(err);
    return next(new HttpException(500, "Internal Server Error"));
  }
};


export const getTasksByUserId = async (req, res, next) => {
  try {
    const actorId = req.user?.userId;
    if (!actorId) throw new HttpException(401, "Unauthorized");

    const { userId: rawUserId } = req.params; // always a string
    if (!rawUserId) throw new HttpException(400, "userId is required");

    const userId = parseInt(rawUserId, 10);
    if (isNaN(userId)) throw new HttpException(400, "Invalid userId (must be a number)");

    // Pagination and filters
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const statusId = req.query.statusId ? parseInt(req.query.statusId, 10) : null;
    const isActive =
      req.query.isactive !== undefined ? req.query.isactive === "true" : true;

    // Where clause
    const whereClause = {
      userid: userId, // now integer
      isactive: isActive,
      ...(statusId ? { statusId } : {}),
    };

    // Fetch tasks + total count
    const [tasks, totalCount] = await Promise.all([
      prisma.task.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { createdat: "desc" },
        include: {
          status: { select: { id: true, name: true } },
          assignedUser: { select: { id: true, name: true, email: true } },
          createdByUser: { select: { id: true, name: true, email: true } },
          taskusermap: true,
        },
      }),
      prisma.task.count({ where: whereClause }),
    ]);

    return res.json({
      success: true,
      total: totalCount,
      page,
      limit,
      userId,
      data: tasks,
    });
  } catch (err) {
    console.error("getTasksByUserId error:", err);
    if (err instanceof HttpException) return next(err);
    return next(new HttpException(500, "Internal Server Error"));
  }
};


// PUT /tasks/:taskId/deactivate
export const deactivateTask = async (req, res, next) => {
  try {
    const actorId = req.user?.userId; // set by auth middleware
    const actorRole = req.user?.role; // e.g. 'super_admin' | 'admin' | 'employee'
    const { taskId } = req.params;

    if (!actorId) throw new HttpException(401, "Unauthorized");
    if (!taskId) throw new HttpException(400, "taskId is required");

    // fetch task
    const task = await prisma.task.findUnique({
      where: { id: parseInt(taskId, 10) },
      select: { id: true, title: true, isactive: true, createdby: true },
    });

    if (!task) throw new HttpException(404, "Task not found");

    if (task.isactive === false) {
      throw new HttpException(400, "Task is already inactive");
    }

    // Permission: only creator or admin/super-admin can deactivate
    const isCreator = task.createdby === actorId;
    const isAdmin = actorRole === "super_admin" || actorRole === "admin";
    if (!isCreator && !isAdmin) {
      throw new HttpException(403, "You are not allowed to deactivate this task");
    }

    const now = new Date();

    // Soft-deactivate: update both Task and TaskUserMap atomically
    const [updatedTask, updatedMapsResult] = await prisma.$transaction([
      prisma.task.update({
        where: { id: task.id },
        data: {
          isactive: false,
          updatedby: actorId,
          updatedat: now,
        },
        select: {
          id: true,
          title: true,
          isactive: true,
          updatedby: true,
          updatedat: true,
        },
      }),
      // change to `where: { taskid: task.id, isactive: true }` if you want only active maps affected
      prisma.taskUserMap.updateMany({
        where: { taskid: task.id },
        data: {
          isactive: false,
          updatedby: actorId,
          updatedat: now,
          removedat: now, // optional: mark when map was deactivated
        },
      }),
    ]);

    return res.status(200).json({
      success: true,
      action: "deactivated",
      message: `Task '${updatedTask.title || ("#" + updatedTask.id)}' and related mappings have been deactivated successfully.`,
      task: {
        id: updatedTask.id,
        isactive: updatedTask.isactive,
        updatedby: updatedTask.updatedby,
        updatedat: updatedTask.updatedat ? new Date(updatedTask.updatedat).toISOString() : null,
      },
      taskUserMapsUpdated: updatedMapsResult.count ?? updatedMapsResult,
      performedBy: actorId,
      performedAt: now.toISOString(),
    });
  } catch (err) {
    next(err);
  }
};

// PUT /users/:userId/deactivate
export const deactivateUser = async (req, res, next) => {
  try {
    const actorId = req.user?.userId; // logged-in user's ID (from auth middleware)
    const actorRole = req.user?.role; // e.g., 'super_admin' | 'admin' | 'employee'
    const { userId } = req.params;

    if (!actorId) throw new HttpException(401, "Unauthorized");
    if (!userId) throw new HttpException(400, "userId is required");

    const targetUserId = parseInt(userId, 10);

    // Fetch user
    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, name: true, isdeleted: true, email: true },
    });

    if (!user) throw new HttpException(404, "User not found");
    if (user.isdeleted === true)
      throw new HttpException(400, "User is already deactivated");

    // Permission: only super_admin can deactivate admins/employees
    // Admins can deactivate only interns
    const isSelf = actorId === user.id;
    const isSuperAdmin = actorRole === "super_admin";
    const isAdmin = actorRole === "admin";

    if (!isSuperAdmin && !isAdmin)
      throw new HttpException(403, "You are not allowed to deactivate users");

    // Prevent non-super_admins from deactivating super_admin accounts
    const targetRoles = await prisma.userRoleMap.findMany({
      where: { userid: targetUserId, isactive: true },
      include: { role: true },
    });

    const targetIsSuperAdmin = targetRoles.some(
      (r) => r.role?.name === "super_admin"
    );

    if (targetIsSuperAdmin && !isSuperAdmin) {
      throw new HttpException(
        403,
        "You cannot deactivate a super_admin account"
      );
    }

    const now = new Date();

    // Transaction: soft deactivate User and related UserRoleMap + TaskUserMap
    const [updatedUser, roleMapsResult, taskMapsResult] =
      await prisma.$transaction([
        prisma.user.update({
          where: { id: targetUserId },
          data: {
            isdeleted: true,
            updatedat: now,
          },
          select: {
            id: true,
            name: true,
            email: true,
            isdeleted: true,
            updatedat: true,
          },
        }),
        prisma.userRoleMap.updateMany({
          where: { userid: targetUserId, isactive: true },
          data: {
            isactive: false,
            updatedat: now,
            updatedby: actorId,
            removedat: now,
          },
        }),
        prisma.taskUserMap.updateMany({
          where: { userid: targetUserId, isactive: true },
          data: {
            isactive: false,
            updatedby: actorId,
            updatedat: now,
            removedat: now,
          },
        }),
      ]);

    return res.status(200).json({
      success: true,
      action: "deactivated",
      message: `User '${updatedUser.name}' (${updatedUser.email}) and all related mappings have been deactivated successfully.`,
      user: updatedUser,
      userRoleMapsUpdated: roleMapsResult.count ?? roleMapsResult,
      taskUserMapsUpdated: taskMapsResult.count ?? taskMapsResult,
      performedBy: actorId,
      performedAt: now.toISOString(),
    });
  } catch (err) {
    next(err);
  }
};


export const assignTask = async (req, res, next) => {
  try {
    const taskId = parseInt(req.params.taskId, 10);
    if (!Number.isFinite(taskId)) throw new HttpException(400, "Invalid taskId");

    const {
      assignedToId, // required

      // ✅ OPTIONAL (can be omitted)
      dueDate, // null | ISO string | "" (ignore)
      period, // daily | weekly | monthly | yearly | "" (ignore)
      timeOfDay, // "HH:mm"
      weeklyDate, // "YYYY-MM-DD"
      monthDay, // "1"-"31"
      yearSelect, // "2026"
      yearMonth, // "0"-"11"
      yearDay, // "1"-"31"
    } = req.body;

    const actorId = req.user?.userId;
    if (!actorId) throw new HttpException(401, "Unauthorized");
    const actorOrgId = req.user?.orgId ?? null;

    const userRoleMap = await prisma.userRoleMap.findFirst({
      where: { userid: actorId, isactive: true },
      include: { role: true },
      orderBy: { assignedat: "desc" },
    });

    const roleName = userRoleMap?.role?.name ?? null;
    if (roleName !== "admin" && roleName !== "super_admin") {
      throw new HttpException(403, "Only admins can assign tasks");
    }

    if (roleName === "admin" && !actorOrgId) {
      throw new HttpException(400, "Organization not selected in login");
    }

    // -----------------------------
    // ✅ assignedToId required
    // -----------------------------
    const assignedRaw = assignedToId?.toString?.().trim?.();
    if (!assignedRaw) throw new HttpException(400, "assignedToId required");

    // ✅ find user (id / name / email)
    let assignedUser = null;

    if (/^\d+$/.test(assignedRaw)) {
      assignedUser = await prisma.user.findUnique({
        where: { id: parseInt(assignedRaw, 10) },
      });
    }
    if (!assignedUser) assignedUser = await prisma.user.findFirst({ where: { name: assignedRaw } });
    if (!assignedUser) assignedUser = await prisma.user.findFirst({ where: { email: assignedRaw } });

    if (!assignedUser) throw new HttpException(400, `User '${assignedRaw}' not found`);

    // ✅ get "assigned" statusId
    const assignedStatus = await prisma.status.findFirst({
      where: { name: "assigned" },
      select: { id: true, name: true },
    });
    if (!assignedStatus) throw new HttpException(400, "Status 'assigned' not found");

    // -----------------------------
    // ✅ OPTIONAL: dueDate parsing
    // -----------------------------
    const hasDueDateKey = Object.prototype.hasOwnProperty.call(req.body, "dueDate");
    let due = undefined; // undefined => do not update
    if (hasDueDateKey) {
      if (dueDate === null) {
        due = null; // clear due date
      } else if (typeof dueDate === "string") {
        const s = dueDate.trim();
        if (s === "") {
          due = undefined; // ignore empty
        } else {
          const d = new Date(s);
          if (isNaN(d.getTime())) throw new HttpException(400, "Invalid dueDate format. Use ISO string.");
          due = d;
        }
      }
    }

    // -----------------------------
    // ✅ OPTIONAL: periodSchedule parsing
    // -----------------------------
    const hasPeriodKey = Object.prototype.hasOwnProperty.call(req.body, "period");
    let periodSchedule = undefined; // undefined => do not update

    const isHHMM = (s) => typeof s === "string" && /^([01]\d|2[0-3]):([0-5]\d)$/.test(s.trim());
    const toInt = (v) => {
      const n = parseInt(String(v), 10);
      return Number.isFinite(n) ? n : null;
    };

    if (hasPeriodKey) {
      // allow clearing schedule by sending null
      if (period === null) {
        periodSchedule = null;
      } else {
        const p = (period ?? "").toString().trim().toLowerCase();

        // if frontend sends "" => ignore
        if (p !== "") {
          const allowedPeriods = new Set(["daily", "weekly", "monthly", "yearly"]);
          if (!allowedPeriods.has(p)) {
            throw new HttpException(400, "Invalid period. Use daily/weekly/monthly/yearly");
          }

          if (p === "daily") {
            periodSchedule = "daily";
          } else {
            if (!isHHMM(timeOfDay)) throw new HttpException(400, "timeOfDay required (HH:mm)");
            const t = timeOfDay.trim();

            if (p === "weekly") {
              const d = (weeklyDate ?? "").toString().trim();
              if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
                throw new HttpException(400, "weeklyDate required in YYYY-MM-DD format");
              }
              periodSchedule = `weekly|date=${d}|time=${t}`;
            }

            if (p === "monthly") {
              const md = toInt(monthDay);
              if (md === null || md < 1 || md > 31) {
                throw new HttpException(400, "monthDay must be 1-31");
              }
              periodSchedule = `monthly|date=${md}|time=${t}`;
            }

            if (p === "yearly") {
              const y = toInt(yearSelect);
              const m = toInt(yearMonth);
              const d = toInt(yearDay);

              if (y === null || y < 1900 || y > 3000) throw new HttpException(400, "yearSelect invalid");
              if (m === null || m < 0 || m > 11) throw new HttpException(400, "yearMonth must be 0-11");
              if (d === null || d < 1 || d > 31) throw new HttpException(400, "yearDay must be 1-31");

              periodSchedule = `yearly|year=${y}|month=${m}|date=${d}|time=${t}`;
            }
          }
        }
      }
    }

    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const existingTask = await tx.task.findUnique({ where: { id: taskId } });
      if (!existingTask) throw new HttpException(404, "Task not found");

      if (roleName === "admin" && existingTask.orgid !== actorOrgId) {
        throw new HttpException(403, "You cannot assign tasks outside your organization");
      }

      // ✅ Build update payload (only update optional fields if provided)
      const updateData = {
        userid: assignedUser.id,
        statusId: assignedStatus.id, // ✅ status becomes assigned
      };

      if (due !== undefined) updateData.duedate = due; // null or Date
      if (periodSchedule !== undefined) updateData.periodSchedule = periodSchedule; // null or string

      const task = await tx.task.update({
        where: { id: taskId },
        data: updateData,
      });

      // Reassignment must close the old active assignee record and create/update only the new owner record.
      await tx.taskUserMap.updateMany({
        where: {
          taskid: taskId,
          isactive: true,
          NOT: { userid: assignedUser.id },
        },
        data: {
          isactive: false,
          removedat: now,
          updatedby: actorId,
          updatedat: now,
        },
      });

      let map = await tx.taskUserMap.findFirst({
        where: { taskid: taskId, userid: assignedUser.id, isactive: true },
      });

      if (map) {
        map = await tx.taskUserMap.update({
          where: { id: map.id },
          data: {
            statusId: assignedStatus.id,
            updatedby: actorId,
            updatedat: now,
            removedat: null,
            pickedupat: null,
            completedat: null,
          },
        });
      } else {
        map = await tx.taskUserMap.create({
          data: {
            taskid: taskId,
            userid: assignedUser.id,
            statusId: assignedStatus.id,
            createdby: actorId,
            createdat: now,
            isactive: true,
          },
        });
      }

      return { task, map };
    });

    const status = await prisma.status.findUnique({
      where: { id: updated.task.statusId },
      select: { id: true, name: true },
    });

    const assignedUserFull = await prisma.user.findUnique({
      where: { id: updated.task.userid },
      select: { id: true, name: true, email: true },
    });

    return res.status(200).json({
      success: true,
      message: "Task assigned successfully",
      task: {
        ...updated.task,
        assignedUser: assignedUserFull,
        status,
      },
      taskUserMap: updated.map,
    });
  } catch (err) {
    console.error("assignTask error:", err);

    if (err instanceof HttpException) {
      return res.status(err.status || 400).json({ status: err.status, message: err.message });
    }
    if (typeof next === "function") return next(err);
    return res.status(500).json({ status: 500, message: "Internal Server Error" });
  }
};
export const updateTaskImage = async (req, res, next) => {
  try {
    const actorId = req.user?.userId;
    const actorRole = req.user?.role;
    const taskId = Number(req.params.taskId);

    if (!actorId) throw new HttpException(401, "Unauthorized");
    if (!Number.isInteger(taskId) || taskId <= 0) {
      throw new HttpException(400, "Valid taskId is required");
    }
    if (!req.file) throw new HttpException(400, "Task image is required");

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, userid: true, orgid: true, isactive: true },
    });
    if (!task || !task.isactive) throw new HttpException(404, "Task not found");

    const roleMap = await prisma.userRoleMap.findFirst({
      where: { userid: actorId, isactive: true },
      include: { role: true },
      orderBy: { assignedat: "desc" },
    });
    const roleName = roleMap?.role?.name ?? actorRole ?? null;
    const isAdminLike = ["admin", "super_admin"].includes(
      String(roleName || "").toLowerCase()
    );

    if (!isAdminLike) {
      const activeAssignment = await prisma.taskUserMap.findFirst({
        where: { taskid: taskId, userid: actorId, isactive: true },
        select: { id: true },
      });
      if (!activeAssignment || task.userid !== actorId) {
        throw new HttpException(403, "You are no longer assigned to this task");
      }
    }

    const imageUrl = taskImageUrl(req);
    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        imageUrl,
        updatedby: actorId,
        updatedat: new Date(),
      },
    });

    return res.json({
      success: true,
      message: "Task image uploaded successfully",
      task: updatedTask,
    });
  } catch (err) {
    console.error("updateTaskImage error:", err);
    if (err instanceof HttpException) return next(err);
    return next(new HttpException(500, "Internal Server Error"));
  }
};





