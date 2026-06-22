// src/controllers/organization.controller.js
import { PrismaClient } from '@prisma/client';
import { isSuperAdmin, isOrgAdmin } from '../utils/orgPermissions.js';

const prisma = new PrismaClient();

// -----------------------
// Create Organization
// -----------------------
export const createOrganization = async (req, res) => {
  try {
    const currentUserId = Number(req.user?.userId);
    if (!currentUserId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Only super admin can create
    const superAdmin = await isSuperAdmin(currentUserId);
    if (!superAdmin) {
      return res.status(403).json({ message: 'Only super_admin can create organizations' });
    }

    const {
      name,
      code,
      description,
      email,
      phone,
      website,
      addressLine1,
      addressLine2,
      city,
      state,
      country,
      postalCode,
      logo,
      adminNames,
    } = req.body;

    if (!name || !code) {
      return res.status(400).json({ message: 'name and code are required' });
    }


    let adminIds = [];
    let invalidUsers = [];

    if (Array.isArray(adminNames) && adminNames.length > 0) {
      // Get full user data
      const users = await prisma.user.findMany({
        where: { name: { in: adminNames } },
        select: {
          id: true,
          name: true,
          userrolemap: {
            where: { isactive: true },
            select: {
              role: {
                select: { name: true }
              }
            }
          }
        }
      });

      // Find which names existv
      const foundNames = users.map(u => u.name);

      // Missing names
      const missingNames = adminNames.filter(n => !foundNames.includes(n));

      // Check role = admin only
      for (const u of users) {
        const roleName = u.userrolemap?.[0]?.role?.name;

        if (roleName !== "admin") {
          invalidUsers.push(u.name);
        } else {
          adminIds.push(u.id);
        }
      }

      // If any name invalid → block
      if (missingNames.length > 0 || invalidUsers.length > 0) {
        return res.status(400).json({
          message: "Invalid admin assignment",
          missingUsers: missingNames,
          notAdminUsers: invalidUsers,
        });
      }
    }

    let logoUrl = null;

    if (req.file) {
      logoUrl = `${req.protocol}://${req.get("host")}/uploads/org_logos/${req.file.filename}`;
    }
    const result = await prisma.$transaction(async (tx) => {
      // Create organization
      const org = await tx.organization.create({
        data: {
          name,
          code,
          description,
          email,
          phone,
          website,
          addressLine1,
          addressLine2,
          city,
          state,
          country,
          postalCode,
          logo: logoUrl,
          createdby: currentUserId, // Only here
        },
      });

      // Insert ONLY admins into mapping table
      for (const adminId of adminIds) {
        await tx.organizationUserMap.create({
          data: {
            orgid: org.id,
            userid: adminId,
            role: "admin",
            assignedby: currentUserId
          }
        });
      }

      return tx.organization.findUnique({
        where: { id: org.id },
        include: {
          organizationUserMap: {
            include: { user: true }
          }
        }
      });
    });

    return res.status(201).json(result);

  } catch (error) {
    console.error("createOrganization error:", error);
    return res.status(500).json({ message: error.message ?? "Internal Server Error" });
  }
};



// -----------------------
// Get ALL organizations for logged-in user
// -----------------------
export const getMyOrganizations = async (req, res) => {
  try {
    const currentUserId = Number(req.user?.userId);

    if (!currentUserId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const superAdmin = await isSuperAdmin(currentUserId);

    if (superAdmin) {
      // super_admin sees all active organizations
      const orgs = await prisma.organization.findMany({
        where: { isactive: true },
        include: {
          organizationUserMap: {
            where: { isactive: true },
            select: {
              userid: true,
              role: true,
              user: {
                select: { id: true, name: true, email: true },
              },
            },
          },
        },
        orderBy: { createdat: 'desc' },
      });
      return res.json(orgs);
    }

    // non super_admin: only their mapped orgs
    const mappings = await prisma.organizationUserMap.findMany({
      where: {
        userid: currentUserId,
        isactive: true,
      },
      include: {
        organization: true,
      },
      orderBy: { assignedat: 'desc' },
    });

    const orgs = mappings.map((m) => m.organization);
    return res.json(orgs);
  } catch (error) {
    console.error('getMyOrganizations error:', error);
    return res.status(500).json({ message: error.message ?? 'Internal Server Error' });
  }
};

// -----------------------
// Get single organization by id
// -----------------------
export const getOrganizationById = async (req, res) => {
  try {
    const currentUserId = Number(req.user?.userId);
    const orgId = Number(req.params.id);

    if (!currentUserId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (Number.isNaN(orgId)) {
      return res.status(400).json({ message: 'Invalid organization id' });
    }

    const superAdmin = await isSuperAdmin(currentUserId);
    let hasAccess = superAdmin;

    if (!hasAccess) {
      const mapping = await prisma.organizationUserMap.findFirst({
        where: { orgid: orgId, userid: currentUserId, isactive: true },
      });
      hasAccess = !!mapping;
    }

    if (!hasAccess) {
      return res.status(403).json({ message: 'No access to this organization' });
    }

    const org = await prisma.organization.findFirst({
      where: { id: orgId, isactive: true },
      include: {
        organizationUserMap: {
          where: { isactive: true },
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        createdByUser: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!org) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    return res.json(org);
  } catch (error) {
    console.error('getOrganizationById error:', error);
    return res.status(500).json({ message: error.message ?? 'Internal Server Error' });
  }
};

// -----------------------
// Update organization
// (super_admin or org admin)
// -----------------------
export const updateOrganization = async (req, res) => {
  try {
    const currentUserId = Number(req.user?.userId);
    const orgId = Number(req.params.id);

    if (!currentUserId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (Number.isNaN(orgId)) {
      return res.status(400).json({ message: 'Invalid organization id' });
    }

    const [superAdmin, orgAdmin] = await Promise.all([
      isSuperAdmin(currentUserId),
      isOrgAdmin(currentUserId, orgId),
    ]);

    if (!superAdmin && !orgAdmin) {
      return res.status(403).json({ message: 'No permission to update this organization' });
    }

    const {
      name,
      code,
      description,
      email,
      phone,
      website,
      addressLine1,
      addressLine2,
      city,
      state,
      country,
      postalCode,
      logo,
    } = req.body;

   const data = {
  name,
  code,
  description,
  email,
  phone,
  website,
  addressLine1,
  addressLine2,
  city,
  state,
  country,
  postalCode,
  updatedby: currentUserId,
};

// ✅ Logo update (from multer)
 if (req.file) {
      data.logo = `${req.protocol}://${req.get("host")}/uploads/org_logos/${req.file.filename}`;
    }

    // optional: allow clearing logo if you send logo="" from frontend
    if (req.body?.logo === "" || req.body?.logo === null) {
      data.logo = null;
    }

    console.log("req.file:", req.file);

const org = await prisma.organization.update({
  where: { id: orgId },
  data,
});


    return res.json(org);
  } catch (error) {
    console.error('updateOrganization error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Organization not found' });
    }
    return res.status(500).json({ message: error.message ?? 'Internal Server Error' });
  }
};

// -----------------------
// Delete (soft delete) organization
// (super_admin only)
// -----------------------
export const deleteOrganization = async (req, res) => {
  try {
    const currentUserId = Number(req.user?.userId);
    const orgId = Number(req.params.id);

    if (!currentUserId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (Number.isNaN(orgId)) {
      return res.status(400).json({ message: 'Invalid organization id' });
    }

    const superAdmin = await isSuperAdmin(currentUserId);
    if (!superAdmin) {
      return res.status(403).json({ message: 'Only super_admin can delete organizations' });
    }

    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      // soft delete org
      const org = await tx.organization.update({
        where: { id: orgId },
        data: {
          isactive: false,
          removedat: now,
          updatedby: currentUserId,
        },
      });

      // deactivate all org-user mappings
      await tx.organizationUserMap.updateMany({
        where: { orgid: orgId, isactive: true },
        data: {
          isactive: false,
          removedat: now,
          updatedby: currentUserId,
        },
      });

      return org;
    });

    return res.json({
      message: 'Organization deleted (soft)',
      organization: result,
    });
  } catch (error) {
    console.error('deleteOrganization error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Organization not found' });
    }
    return res.status(500).json({ message: error.message ?? 'Internal Server Error' });
  }
};

