import type { Request, Response } from "express";
import { isProd } from "../../config/env.js";
import { login, getUserProfile } from "./auth.service.js";
import { unauthorized } from "../../lib/http-error.js";

const COOKIE_NAME = "token";
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

export async function loginController(req: Request, res: Response) {
  const { token, user } = await login(req.body);

  // Cookie httpOnly para uso desde el navegador
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: SEVEN_DAYS,
    path: "/",
  });

  // Tambien devolvemos el token por si el frontend prefiere usar Authorization
  res.json({ token, user });
}

export async function meController(req: Request, res: Response) {
  if (!req.user) throw unauthorized();
  const user = await getUserProfile(req.user.id);
  if (!user) throw unauthorized("Usuario no encontrado");
  res.json({ user });
}

export async function logoutController(_req: Request, res: Response) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ ok: true });
}
