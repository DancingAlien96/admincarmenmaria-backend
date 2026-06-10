import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireAdmin } from "../../middleware/authorize.js";
import {
  createTeacherSchema,
  updateTeacherSchema,
  listTeachersQuery,
  addDocumentSchema,
  teacherIdParam,
  docParam,
} from "./teachers.schemas.js";
import {
  listController,
  getController,
  createController,
  updateController,
  deactivateController,
  addDocumentController,
  deleteDocumentController,
} from "./teachers.controller.js";

export const teachersRouter = Router();

// Solo el administrador gestiona catedráticos
teachersRouter.use(requireAuth, requireAdmin);

teachersRouter.get(
  "/",
  validate({ query: listTeachersQuery }),
  asyncHandler(listController)
);
teachersRouter.post(
  "/",
  validate({ body: createTeacherSchema }),
  asyncHandler(createController)
);
teachersRouter.get(
  "/:id",
  validate({ params: teacherIdParam }),
  asyncHandler(getController)
);
teachersRouter.patch(
  "/:id",
  validate({ params: teacherIdParam, body: updateTeacherSchema }),
  asyncHandler(updateController)
);
teachersRouter.delete(
  "/:id",
  validate({ params: teacherIdParam }),
  asyncHandler(deactivateController)
);
teachersRouter.post(
  "/:id/documents",
  validate({ params: teacherIdParam, body: addDocumentSchema }),
  asyncHandler(addDocumentController)
);
teachersRouter.delete(
  "/:id/documents/:docId",
  validate({ params: docParam }),
  asyncHandler(deleteDocumentController)
);
