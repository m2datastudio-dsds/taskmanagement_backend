// src/utils/orgPermissions.js
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Check if user has global super_admin role
export async function isSuperAdmin(userId) {
  const superAdminRole = await prisma.role.findFirst({
    where: { name: "super_admin" },
  });

  if (!superAdminRole) return false;

  const mapping = await prisma.userRoleMap.findFirst({
    where: {
      userid: userId,
      roleId: superAdminRole.id,
      isactive: true,
    },
  });

  return !!mapping;
}

// Check if user is admin for a specific organization
export async function isOrgAdmin(userId, orgId) {
  const mapping = await prisma.organizationUserMap.findFirst({
    where: {
      userid: userId,
      orgid: orgId,
      isactive: true,
      role: "admin",
    },
  });

  return !!mapping;
}

