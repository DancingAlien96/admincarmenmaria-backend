import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireSection } from "../../middleware/authorize.js";
import {
  createStudentSchema,
  updateStudentSchema,
  listStudentsQuery,
  changeStatusSchema,
  addDocumentSchema,
  studentIdParam,
  docParams,
} from "./students.schemas.js";
import {
  listController,
  getController,
  createController,
  updateController,
  changeStatusController,
  addDocumentController,
  deleteDocumentController,
} from "./students.controller.js";

export const studentsRouter = Router();

// Modulo 1 - Expediente del Estudiante (seccion STUDENTS)
const canRead = requireSection("STUDENTS", "READER");
const canEdit = requireSection("STUDENTS", "EDITOR");

studentsRouter.use(requireAuth);

studentsRouter.get(
  "/",
  canRead,
  validate({ query: listStudentsQuery }),
  asyncHandler(listController)
);
studentsRouter.post(
  "/",
  canEdit,
  validate({ body: createStudentSchema }),
  asyncHandler(createController)
);
studentsRouter.get(
  "/:id",
  canRead,
  validate({ params: studentIdParam }),
  asyncHandler(getController)
);
studentsRouter.patch(
  "/:id",
  canEdit,
  validate({ params: studentIdParam, body: updateStudentSchema }),
  asyncHandler(updateController)
);
studentsRouter.post(
  "/:id/status",
  canEdit,
  validate({ params: studentIdParam, body: changeStatusSchema }),
  asyncHandler(changeStatusController)
);
studentsRouter.post(
  "/:id/documents",
  canEdit,
  validate({ params: studentIdParam, body: addDocumentSchema }),
  asyncHandler(addDocumentController)
);
studentsRouter.delete(
  "/:id/documents/:docId",
  canEdit,
  validate({ params: docParams }),
  asyncHandler(deleteDocumentController)
);
