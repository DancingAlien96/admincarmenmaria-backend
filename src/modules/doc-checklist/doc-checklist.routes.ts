import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireSection } from "../../middleware/authorize.js";
import {
  createRequirementSchema,
  updateRequirementSchema,
  setDocStatusSchema,
  requirementIdParam,
  studentReqParams,
  studentIdParam,
} from "./doc-checklist.schemas.js";
import {
  listRequirementsController,
  createRequirementController,
  updateRequirementController,
  deleteRequirementController,
  studentChecklistController,
  setStudentDocStatusController,
} from "./doc-checklist.controller.js";

export const docChecklistRouter = Router();

// El checklist es parte del expediente del estudiante (sección STUDENTS)
const canRead = requireSection("STUDENTS", "READER");
const canEdit = requireSection("STUDENTS", "EDITOR");

docChecklistRouter.use(requireAuth);

// Catálogo de documentos requeridos
docChecklistRouter.get(
  "/requirements",
  canRead,
  asyncHandler(listRequirementsController)
);
docChecklistRouter.post(
  "/requirements",
  canEdit,
  validate({ body: createRequirementSchema }),
  asyncHandler(createRequirementController)
);
docChecklistRouter.patch(
  "/requirements/:id",
  canEdit,
  validate({ params: requirementIdParam, body: updateRequirementSchema }),
  asyncHandler(updateRequirementController)
);
docChecklistRouter.delete(
  "/requirements/:id",
  canEdit,
  validate({ params: requirementIdParam }),
  asyncHandler(deleteRequirementController)
);

// Checklist de un estudiante
docChecklistRouter.get(
  "/student/:studentId",
  canRead,
  validate({ params: studentIdParam }),
  asyncHandler(studentChecklistController)
);
docChecklistRouter.put(
  "/student/:studentId/:requirementId",
  canEdit,
  validate({ params: studentReqParams, body: setDocStatusSchema }),
  asyncHandler(setStudentDocStatusController)
);
