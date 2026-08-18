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
  mergeStudentsSchema,
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
  syncController,
  duplicatesController,
  mergeController,
  portalAccountController,
} from "./students.controller.js";

export const studentsRouter = Router();

// Modulo 1 - Expediente del Estudiante (seccion STUDENTS)
const canRead = requireSection("STUDENTS", "READER");
const canEdit = requireSection("STUDENTS", "EDITOR");

studentsRouter.use(requireAuth);

// Sincroniza expedientes desde los pagos (crea estudiantes de inscripciones)
studentsRouter.post("/sync", canEdit, asyncHandler(syncController));

// Integridad: posibles duplicados y fusion (rutas fijas antes de "/:id")
studentsRouter.get("/duplicates", canRead, asyncHandler(duplicatesController));
studentsRouter.post(
  "/merge",
  canEdit,
  validate({ body: mergeStudentsSchema }),
  asyncHandler(mergeController)
);

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
// Crear cuenta del portal del alumno (contraseña por defecto = su DPI)
studentsRouter.post(
  "/:id/portal-account",
  canEdit,
  validate({ params: studentIdParam }),
  asyncHandler(portalAccountController)
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
