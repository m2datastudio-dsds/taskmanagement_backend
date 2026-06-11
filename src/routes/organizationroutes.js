// src/routes/organization.routes.ts
import { Router } from 'express';
import {
  createOrganization,
  getMyOrganizations,
  getOrganizationById,
  updateOrganization,
  deleteOrganization,
} from '../controllers/organizationcontroller.js';
import { uploadLogoMiddleware } from '../middlewares/uploadmiddleware.js';
import { authMiddleware, } from '../middlewares/authmiddleware.js'; // your JWT middleware



const router = Router();

// CREATE
router.post('/createOrganization', authMiddleware,uploadLogoMiddleware, createOrganization);

// READ - list my orgs
router.get('/getallOrganization', authMiddleware, getMyOrganizations);

// READ - single org
router.get('/getbyIdOrganization/:id', authMiddleware, getOrganizationById);

// UPDATE
router.put('/updateOrganization/:id', authMiddleware,uploadLogoMiddleware, updateOrganization);

// DELETE (soft)
router.delete('/deleteOrganization/:id', authMiddleware, deleteOrganization);

export default router;
