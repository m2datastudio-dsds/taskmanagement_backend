import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();

const prisma = new PrismaClient();
const [, , mobileArg, emailArg] = process.argv;
const mobile = String(mobileArg || "").trim();
const email = emailArg ? String(emailArg).trim().toLowerCase() : null;

if (!/^\+?[0-9]{7,15}$/.test(mobile)) {
  console.error("Usage: npm run user:update-superadmin-mobile -- <mobile> [email]");
  console.error("Example: npm run user:update-superadmin-mobile -- 9876543210 superadmin@example.com");
  process.exit(1);
}

try {
  const existingMobile = await prisma.user.findUnique({ where: { mobile } });
  if (existingMobile) {
    throw new Error(`Mobile number is already assigned to user id ${existingMobile.id}`);
  }

  const superAdmin = await prisma.user.findFirst({
    where: {
      ...(email ? { email } : {}),
      userrolemap: {
        some: {
          isactive: true,
          role: { name: "super_admin" },
        },
      },
    },
    orderBy: { id: "asc" },
  });

  if (!superAdmin) {
    throw new Error(email ? `No super admin found for ${email}` : "No super admin user found");
  }

  const updated = await prisma.user.update({
    where: { id: superAdmin.id },
    data: { mobile },
    select: { id: true, name: true, email: true, mobile: true },
  });

  console.log("Super admin mobile updated:");
  console.log(`id=${updated.id}`);
  console.log(`name=${updated.name}`);
  console.log(`email=${updated.email}`);
  console.log(`mobile=${updated.mobile}`);
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
