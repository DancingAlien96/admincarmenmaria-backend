import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireAdmin } from "../../middleware/authorize.js";
import {
  createUserSchema,
  updateUserSchema,
  userIdParam,
} from "./users.schemas.js";
import {
  listUsersController,
  getUserController,
  createUserController,
  updateUserController,
  deactivateUserController,
} from "./users.controller.js";

export const usersRouter = Router();

// Solo el administrador gestiona usuarios
usersRouter.use(requireAuth, requireAdmin);

usersRouter.get("/", asyncHandler(listUsersController));
usersRouter.post(
  "/",
  validate({ body: createUserSchema }),
  asyncHandler(createUserController)
);
usersRouter.get(
  "/:id",
  validate({ params: userIdParam }),
  asyncHandler(getUserController)
);
usersRouter.patch(
  "/:id",
  validate({ params: userIdParam, body: updateUserSchema }),
  asyncHandler(updateUserController)
);
usersRouter.delete(
  "/:id",
  validate({ params: userIdParam }),
  asyncHandler(deactivateUserController)
);
