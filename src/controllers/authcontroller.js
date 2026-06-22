import bcrypt from "bcryptjs";
import { prisma } from "../config/prisma.js";
import { HttpException } from "../utils/http-exception.js";
import { generateToken } from "../utils/jwt.js";


// Register new user
export const register = async (req, res, next) => {
  try {
    const { name, email, password, roleName } = req.body;

    if (!name?.trim()) throw new HttpException(400, "Name is required");
    if (!email?.trim()) throw new HttpException(400, "Email is required");
    if (!password) throw new HttpException(400, "Password is required");
    if (!roleName?.trim()) throw new HttpException(400, "Role name is required");

    const actorId = req.user?.userId || null;          // ✅ admin id from token
    const orgIdFromToken = req.user?.orgId || null;    // ✅ org id from token

    const actorRole = req.user?.role || null;
    const requestedRole = roleName.trim();

    if (actorRole === "admin" && !["employee", "intern"].includes(requestedRole)) {
      throw new HttpException(403, "Admin can create only employee or intern users");
    }

    if (actorRole === "super_admin" && requestedRole !== "admin") {
      throw new HttpException(403, "Super admin can create only admin users");
    }

    if (requestedRole === "super_admin" && actorRole !== "super_admin") {
      throw new HttpException(403, "Only super_admin can create super_admin users");
    }

    // If admin is not super_admin, orgId must exist in token
    if (actorRole !== "super_admin" && !orgIdFromToken) {
      throw new HttpException(400, "Organization not selected in login");
    }

    const cleanEmail = email.trim().toLowerCase();

    const existingUser = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existingUser) throw new HttpException(400, "Email already registered");

    const roleRow = await prisma.role.findFirst({
      where: { name: requestedRole }, // RoleName enum → must match exactly
    });
    if (!roleRow) throw new HttpException(400, `Role '${requestedRole}' not found`);

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name: name.trim(), email: cleanEmail, password: hashedPassword },
      });

      await tx.userRoleMap.create({
        data: {
          userid: user.id,
          roleId: roleRow.id,
          isactive: true,
          assignedby: actorId ?? user.id, // ✅ admin if logged in else self
        },
      });

      // ✅ Auto-map to admin’s logged-in org
      if (orgIdFromToken) {
        await tx.organizationUserMap.create({
          data: {
            orgid: orgIdFromToken,
            userid: user.id,
            isactive: true,
            role: roleRow.name,            // RoleName enum fits
            assignedby: actorId ?? user.id,
          },
        });
      }

      return user;
    });

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: { id: result.id, name: result.name, email: result.email, role: roleRow.name },
    });
  } catch (err) {
    if (err instanceof HttpException) return next(err);
    return next(new HttpException(500, "Internal Server Error"));
  }
};





export const login = async (req, res, next) => {
  try {
    const { email, password, organizationName } = req.body;

    if (!email?.trim()) throw new HttpException(400, "Email is required");
    if (!password) throw new HttpException(400, "Password is required");

    // 1️⃣ Find user
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        userrolemap: {
          where: { isactive: true },
          include: { role: true }
        }
      }
    });

    if (!user) throw new HttpException(400, "Invalid email or password");

    // Determine role
    const roleName = user.userrolemap?.[0]?.role?.name || null;

    // 2️⃣ Validate password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) throw new HttpException(400, "Invalid email or password");

    // Helper: convert stored logo path into full URL
    const toFullLogoUrl = (logoValue) => {
      if (!logoValue) return null;

      // If already full URL, return as-is
      if (typeof logoValue === "string" && /^https?:\/\//i.test(logoValue)) {
        return logoValue;
      }

      // If stored as "/uploads/...." or "uploads/...."
      const normalized = logoValue.startsWith("/") ? logoValue : `/${logoValue}`;
      return `${req.protocol}://${req.get("host")}${normalized}`;
    };

    // 3️⃣ For super_admin → organization is optional
    if (roleName === "super_admin") {
      const token = generateToken({
        userId: user.id,
        role: roleName,
        orgId: null
      });

      return res.json({
        success: true,
        message: "Login successful",
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: roleName,
          createdat: user.createdat,
          isdeleted: user.isdeleted,
        },
        organization: null
      });
    }

    // 4) For non-super admins, ask mobile app to select one mapped organization
    if (!organizationName?.trim()) {
      const orgMappings = await prisma.organizationUserMap.findMany({
        where: {
          userid: user.id,
          isactive: true,
          organization: { is: { isactive: true } },
        },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              code: true,
              description: true,
              logo: true,
            },
          },
        },
        orderBy: { assignedat: "desc" },
      });

      const organizations = orgMappings
        .filter((mapping) => mapping.organization)
        .map((mapping) => ({
          id: mapping.organization.id,
          name: mapping.organization.name,
          code: mapping.organization.code,
          description: mapping.organization.description,
          logo: toFullLogoUrl(mapping.organization.logo),
          role: mapping.role,
        }));

      if (!organizations.length) {
        throw new HttpException(403, "User is not assigned to any active organization");
      }

      if (organizations.length === 1) {
        const organization = organizations[0];
        const finalRole = organization.role || roleName;
        const token = generateToken({
          userId: user.id,
          role: finalRole,
          orgId: organization.id,
        });

        return res.json({
          success: true,
          message: "Login successful",
          token,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: finalRole,
            createdat: user.createdat,
            isdeleted: user.isdeleted,
          },
          organization: {
            id: organization.id,
            name: organization.name,
            code: organization.code,
            description: organization.description,
            logo: organization.logo,
          },
        });
      }

      return res.json({
        success: true,
        organizationRequired: true,
        message: "Select organization to continue",
        organizations,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: roleName,
          createdat: user.createdat,
          isdeleted: user.isdeleted,
        },
      });
    }


    const organization = await prisma.organization.findFirst({
      where: { name: organizationName, isactive: true },
      select: {
        id: true,
        name: true,
        code: true,
        description: true,
        logo: true, // ✅ important
      },
    });

    if (!organization)
      throw new HttpException(400, "Organization not found");

    // 5️⃣ Verify user belongs to this organization
    const orgMap = await prisma.organizationUserMap.findFirst({
      where: {
        orgid: organization.id,
        userid: user.id,
        isactive: true,
      },
      select: {
        role: true,
        userid: true,
        orgid: true
      }
    });

    if (!orgMap) {
      throw new HttpException(
        403,
        "User does not belong to this organization"
      );
    }

    const finalRole = orgMap.role;

    // 6️⃣ Generate token
    const token = generateToken({
      userId: user.id,
      role: finalRole,
      orgId: organization.id,
    });

    // 7️⃣ Success Response
    return res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: finalRole,
        createdat: user.createdat,
        isdeleted: user.isdeleted,
      },
      organization: {
        id: organization.id,
        name: organization.name,
        code: organization.code,
        description: organization.description,
        logo: toFullLogoUrl(organization.logo), 
      },
    });

  } catch (err) {
    next(err);
  }
};




export const getAllAdmins = async (req, res, next) => {
  try {
    const admins = await prisma.user.findMany({
      where: {
        userrolemap: {
          some: {
            isactive: true,
            role: {
              name: "admin"
            }
          }
        }
      },
      select: {
        id: true,
        name: true,
        email: true
      }
    });

    return res.json({
      success: true,
      count: admins.length,
      admins
    });

  } catch (err) {
    console.error("Get admins error:", err);
    next(new HttpException(500, "Failed to fetch admin users"));
  }
};








