import { startOfWeek, endOfWeek } from "date-fns";
import { prisma } from "../config/prisma.js";
import { HttpException } from "../utils/http-exception.js";
const ALLOWED_STATUSES = ['assigned', 'in_progress', 'completed', 'closed'];
const ACTIVE_STATUSES = ['assigned', 'in_progress'];





export async function getOverview(req, res, next) {
  try {
    /* --------------------------------------------------
     * AUTH
     * -------------------------------------------------- */
    const actorId = req.user?.userId;
    if (!actorId) throw new HttpException(401, "Unauthorized");

    /* --------------------------------------------------
     * ROLE + ORGANIZATION (SCHEMA SAFE)
     * -------------------------------------------------- */
    const userRoleMap = await prisma.userRoleMap.findFirst({
      where: {
        userid: actorId,
        isactive: true,
      },
      include: {
        role: true,
        user: {
          include: {
            organizationUserMap: true, // ✅ correct
          },
        },
      },
      orderBy: {
        assignedat: "desc",
      },
    });

    const roleName = userRoleMap?.role?.name ?? null;
    const isSuperAdmin = roleName === "super_admin";
    const isAdmin = roleName === "admin";

    // Active organization comes from the selected organization in the login token.
    const orgId = Number(req.user?.orgId || 0) || null;

    if (isAdmin && !orgId) {
      throw new HttpException(400, "Organization not selected in login");
    }
    /* --------------------------------------------------
     * QUERY PARAMS
     * -------------------------------------------------- */
    const from = req.query.from ? new Date(String(req.query.from)) : undefined;
    const to = req.query.to ? new Date(String(req.query.to)) : undefined;

    const includeInactive =
      String(req.query.includeInactive ?? "false").toLowerCase() === "true";

    /* --------------------------------------------------
     * BASE SCOPE (ROLE BASED)
     * -------------------------------------------------- */
    let baseScope = {};

    if (isSuperAdmin) {
      // 🌍 All organizations
      baseScope = {};
    } else if (isAdmin) {
      // 🏢 Only admin organization
      baseScope = { orgid: orgId };
    } else {
      // 👤 Self only
      baseScope = {
        OR: [{ userid: actorId }, { createdby: actorId }],
      };
    }

    /* --------------------------------------------------
     * TASK FILTER
     * -------------------------------------------------- */
    const whereTask = {
      ...(includeInactive ? {} : { isactive: true }),
      ...(from || to
        ? {
            createdat: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
      ...baseScope,
    };

    /* --------------------------------------------------
     * DATE RANGE
     * -------------------------------------------------- */
    const now = new Date();
    const sow = startOfWeek(now, { weekStartsOn: 1 });
    const eow = endOfWeek(now, { weekStartsOn: 1 });

    /* --------------------------------------------------
     * COUNTS (PARALLEL)
     * -------------------------------------------------- */
    const [
      totalTasks,
      completed,
      inProgress,
      assigned,
      closed,
      reassign,
      revoked,
      created,
      overdue,
      dueThisWeek,
      distinctAssignees,
      grouped,
    ] = await Promise.all([
      prisma.task.count({ where: whereTask }),

      prisma.task.count({
        where: { ...whereTask, status: { name: "completed" } },
      }),

      prisma.task.count({
        where: { ...whereTask, status: { name: "in_progress" } },
      }),

      prisma.task.count({
        where: { ...whereTask, status: { name: "assigned" } },
      }),

      prisma.task.count({
        where: { ...whereTask, status: { name: "closed" } },
      }),

      prisma.task.count({
        where: { ...whereTask, status: { name: "reassign" } },
      }),

      prisma.task.count({
        where: { ...whereTask, status: { name: "revoked" } },
      }),

      prisma.task.count({
        where: { ...whereTask, status: { name: "created" } },
      }),

      // Overdue
      prisma.task.count({
        where: {
          ...whereTask,
          duedate: { lt: now },
          status: {
            name: {
              in: ["created", "assigned", "in_progress", "reassign"],
            },
          },
        },
      }),

      // Due this week
      prisma.task.count({
        where: {
          ...whereTask,
          duedate: { gte: sow, lte: eow },
        },
      }),

      // Distinct assignees
      prisma.task.findMany({
        where: { ...whereTask, userid: { not: null } },
        distinct: ["userid"],
        select: { userid: true },
      }),

      // Group by status
      prisma.task.groupBy({
        by: ["statusId"],
        _count: { _all: true },
        where: whereTask,
      }),
    ]);

    /* --------------------------------------------------
     * ACTIVE USERS (USING OrganizationUserMap)
     * -------------------------------------------------- */
    const activeUsers = await prisma.user.count({
      where: {
        isdeleted: false,
        ...(isSuperAdmin
          ? {}
          : {
              organizationUserMap: {
                some: {
                  orgid: orgId,
                  isactive: true,
                },
              },
            }),
      },
    });

    /* --------------------------------------------------
     * STATUS NAME MAP
     * -------------------------------------------------- */
    const statusIds = grouped.map((g) => g.statusId);

    const statuses = statusIds.length
      ? await prisma.status.findMany({
          where: { id: { in: statusIds } },
        })
      : [];

    const statusMap = new Map(statuses.map((s) => [s.id, s.name]));

    const tasksByStatus = grouped.reduce((acc, g) => {
      acc[statusMap.get(g.statusId) ?? `status_${g.statusId}`] =
        g._count._all;
      return acc;
    }, {});

    /* --------------------------------------------------
     * RESPONSE
     * -------------------------------------------------- */
    return res.json({
      success: true,
      data: {
        summary: {
          totalTasks,
          completed,
          inProgress,
          assigned,
          closed,
          reassign,
          revoked,
          created,
          overdue,
          dueThisWeek,
        },
        users: {
          activeUsers,
          activeAssignees: distinctAssignees.length,
        },
        tasksByStatus,
        meta: {
          role: roleName,
          scope: isSuperAdmin
            ? "global"
            : isAdmin
            ? "organization"
            : "self",
          orgid: isSuperAdmin ? null : orgId,
          generatedAt: now.toISOString(),
        },
      },
    });
  } catch (err) {
    console.error("getOverview error:", err);

    if (err instanceof HttpException) {
      return res
        .status(err.status || 400)
        .json({ status: err.status, message: err.message });
    }

    return next
      ? next(err)
      : res
          .status(500)
          .json({ status: 500, message: "Internal Server Error" });
  }
}




export const getStatusBreakdown = async (req, res) => {
  try {
    const { userId, orgId } = req.query;
    const actorRole = req.user?.role ?? null;
    const actorOrgId = Number(req.user?.orgId || 0);
    const requestedOrgId = orgId ? Number(orgId) : null;

    if (actorRole === "admin" && !actorOrgId) {
      throw new HttpException(400, "Organization not selected in login");
    }

    const scopedOrgId = actorRole === "admin" ? actorOrgId : requestedOrgId;

    const whereClause = {
      isactive: true,
      ...(userId ? { userid: Number(userId) } : {}),
      ...(scopedOrgId ? { orgid: scopedOrgId } : {}),
    };

    const grouped = await prisma.task.groupBy({
      by: ["statusId"],
      _count: { _all: true },
      where: whereClause,
    });

    if (grouped.length === 0) {
      return res.json({
        data: [],
        message: "No tasks found for the given filter",
      });
    }

    const statusIds = grouped.map((g) => g.statusId);
    const statuses = await prisma.status.findMany({
      where: { id: { in: statusIds } },
    });

    const breakdown = grouped.map((g) => {
      const status = statuses.find((s) => s.id === g.statusId);
      return {
        statusId: g.statusId,
        statusName: status?.name ?? null,
        count: g._count._all,
      };
    });

    return res.json({ data: breakdown });
  } catch (error) {
    console.error("Error in getStatusBreakdown:", error);
    return res.status(error.statusCode || error.status || 500).json({
      message: error.message || "Failed to fetch status breakdown",
    });
  }
};

export const getTaskDistributionByUser = async (req, res) => {
  try {
    const { status, orgId } = req.query;
    const actorRole = req.user?.role ?? null;
    const actorOrgId = Number(req.user?.orgId || 0);
    const requestedOrgId = orgId ? Number(orgId) : null;

    if (actorRole === "admin" && !actorOrgId) {
      throw new HttpException(400, "Organization not selected in login");
    }

    const scopedOrgId = actorRole === "admin" ? actorOrgId : requestedOrgId;

    let statusFilterNames;
    if (status) {
      const fromQuery = status
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      statusFilterNames = fromQuery.length > 0 ? fromQuery : ALLOWED_STATUSES;
    } else {
      statusFilterNames = ALLOWED_STATUSES;
    }

    const statusRows = await prisma.status.findMany({
      where: { name: { in: statusFilterNames } },
    });
    const statusIds = statusRows.map((s) => s.id);

    if (statusIds.length === 0) {
      return res.json({ data: [], message: "No matching statuses found" });
    }

    const users = await prisma.user.findMany({
      where: {
        isdeleted: false,
        ...(scopedOrgId
          ? {
              organizationUserMap: {
                some: { orgid: scopedOrgId, isactive: true },
              },
            }
          : {}),
      },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });

    if (users.length === 0) {
      return res.json({ data: [], message: "No users found" });
    }

    const userIds = users.map((u) => u.id);
    const taskScope = {
      isactive: true,
      userid: { in: userIds },
      ...(scopedOrgId ? { orgid: scopedOrgId } : {}),
    };

    const grouped = await prisma.task.groupBy({
      by: ["userid"],
      _count: { _all: true },
      where: {
        ...taskScope,
        statusId: { in: statusIds },
      },
    });

    const activeStatusRows = await prisma.status.findMany({
      where: { name: { in: ACTIVE_STATUSES } },
    });
    const activeStatusIds = activeStatusRows.map((s) => s.id);

    const activeGrouped = await prisma.task.groupBy({
      by: ["userid"],
      _count: { _all: true },
      where: {
        ...taskScope,
        statusId: { in: activeStatusIds },
      },
    });

    const distribution = users.map((user) => {
      const totalRow = grouped.find((g) => g.userid === user.id);
      const activeRow = activeGrouped.find((a) => a.userid === user.id);
      return {
        userId: user.id,
        userName: user.name,
        email: user.email,
        totalTasks: totalRow ? totalRow._count._all : 0,
        activeTasks: activeRow ? activeRow._count._all : 0,
      };
    });

    return res.json({ data: distribution });
  } catch (error) {
    console.error("Error in getTaskDistributionByUser:", error);
    return res.status(error.statusCode || error.status || 500).json({
      message: error.message || "Failed to fetch task distribution by user",
    });
  }
};
