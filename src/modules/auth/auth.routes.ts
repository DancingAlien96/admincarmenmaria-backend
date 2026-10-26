import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { loginSchema } from "./auth.schemas.js";
import { z } from "zod";
import { confirmEmailChange } from "../portal/portal.service.js";
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

// Confirma el cambio de correo con el enlace que recibió el alumno (público)
authRouter.post(
  "/confirmar-correo",
  validate({ body: z.object({ token: z.string().min(20).max(2000) }) }),
  asyncHandler(async (req, res) => {
    res.json(await confirmEmailChange(req.body.token));
  })
);
