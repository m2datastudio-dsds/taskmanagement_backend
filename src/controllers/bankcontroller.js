import { PrismaClient } from "@prisma/client";
import { isOrgAdmin, isSuperAdmin } from "../utils/orgPermissions.js";

const prisma = new PrismaClient();

const resolveOrganization = (req) =>
  Number(req.user?.orgId || req.body?.organizationId || req.query?.organizationId || 0);

async function canManage(userId, orgId) {
  const [superAdmin, orgAdmin] = await Promise.all([
    isSuperAdmin(userId),
    isOrgAdmin(userId, orgId),
  ]);
  return superAdmin || orgAdmin;
}

async function canView(userId, orgId) {
  if (await isSuperAdmin(userId)) return true;
  const membership = await prisma.organizationUserMap.findFirst({
    where: { userid: userId, orgid: orgId, isactive: true },
    select: { id: true },
  });
  return Boolean(membership);
}

export const listBanks = async (req, res) => {
  try {
    const userId = Number(req.user?.userId || 0);
    const orgId = resolveOrganization(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!orgId) return res.status(400).json({ message: "Organization is required" });
    if (!(await canView(userId, orgId))) {
      return res.status(403).json({ message: "No access to banks in this organization" });
    }

    const banks = await prisma.bank.findMany({
      where: { orgid: orgId, isactive: true },
      orderBy: [{ name: "asc" }, { branchName: "asc" }],
    });
    return res.json(banks);
  } catch (error) {
    console.error("listBanks error:", error);
    return res.status(500).json({ message: error.message || "Internal Server Error" });
  }
};

export const createBank = async (req, res) => {
  try {
    const userId = Number(req.user?.userId || 0);
    const orgId = resolveOrganization(req);
    const { name, branchName, branchCode, address, contactNumber } = req.body;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!orgId) return res.status(400).json({ message: "Organization is required" });
    if (!(await canManage(userId, orgId))) {
      return res.status(403).json({ message: "Only an organization admin can create banks" });
    }
    if (!name?.trim() || !branchName?.trim() || !branchCode?.trim()) {
      return res.status(400).json({ message: "Bank name, branch name and branch code are required" });
    }

    const bank = await prisma.bank.create({
      data: {
        orgid: orgId,
        name: name.trim(),
        branchName: branchName.trim(),
        branchCode: branchCode.trim().toUpperCase(),
        address: address?.trim() || null,
        contactNumber: contactNumber?.trim() || null,
        createdby: userId,
      },
    });
    return res.status(201).json(bank);
  } catch (error) {
    console.error("createBank error:", error);
    if (error.code === "P2002") {
      return res.status(409).json({ message: "This branch code already exists" });
    }
    return res.status(500).json({ message: error.message || "Internal Server Error" });
  }
};

export const updateBank = async (req, res) => {
  try {
    const userId = Number(req.user?.userId || 0);
    const bankId = Number(req.params.id || 0);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const existing = await prisma.bank.findUnique({ where: { id: bankId } });
    if (!existing || !existing.isactive) return res.status(404).json({ message: "Bank not found" });
    if (!(await canManage(userId, existing.orgid))) {
      return res.status(403).json({ message: "No permission to update this bank" });
    }

    const { name, branchName, branchCode, address, contactNumber } = req.body;
    if (!name?.trim() || !branchName?.trim() || !branchCode?.trim()) {
      return res.status(400).json({ message: "Bank name, branch name and branch code are required" });
    }
    const bank = await prisma.bank.update({
      where: { id: bankId },
      data: {
        name: name.trim(),
        branchName: branchName.trim(),
        branchCode: branchCode.trim().toUpperCase(),
        address: address?.trim() || null,
        contactNumber: contactNumber?.trim() || null,
        updatedby: userId,
      },
    });
    return res.json(bank);
  } catch (error) {
    console.error("updateBank error:", error);
    if (error.code === "P2002") {
      return res.status(409).json({ message: "This branch code already exists" });
    }
    return res.status(500).json({ message: error.message || "Internal Server Error" });
  }
};

export const deleteBank = async (req, res) => {
  try {
    const userId = Number(req.user?.userId || 0);
    const bankId = Number(req.params.id || 0);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const existing = await prisma.bank.findUnique({ where: { id: bankId } });
    if (!existing || !existing.isactive) return res.status(404).json({ message: "Bank not found" });
    if (!(await canManage(userId, existing.orgid))) {
      return res.status(403).json({ message: "No permission to deactivate this bank" });
    }

    await prisma.bank.update({
      where: { id: bankId },
      data: { isactive: false, removedat: new Date(), updatedby: userId },
    });
    return res.json({ message: "Bank deactivated successfully" });
  } catch (error) {
    console.error("deleteBank error:", error);
    return res.status(500).json({ message: error.message || "Internal Server Error" });
  }
};
