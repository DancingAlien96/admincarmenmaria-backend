import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { loginSchema } from "./auth.schemas.js";
import {
  loginController,
  meController,
  logoutController,
} from "./auth.controller.js";

export const authRouter = Router();

authRouter.post(
  "/login",
  validate({ body: loginSchema }),
  asyncHandler(loginController)
);
authRouter.get("/me", requireAuth, asyncHandler(meController));
authRouter.post("/logout", asyncHandler(logoutController));
