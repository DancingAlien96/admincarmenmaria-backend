import type { Request, Response } from "express";
import * as service from "./users.service.js";
import { unauthorized } from "../../lib/http-error.js";

export async function listUsersController(_req: Request, res: Response) {
  res.json({ users: await service.listUsers() });
}

export async function getUserController(req: Request, res: Response) {
  res.json({ user: await service.getUser(req.params.id) });
}

export async function createUserController(req: Request, res: Response) {
  const user = await service.createUser(req.body);
  res.status(201).json({ user });
}

export async function updateUserController(req: Request, res: Response) {
  const user = await service.updateUser(req.params.id, req.body);
  res.json({ user });
}

export async function deactivateUserController(req: Request, res: Response) {
  if (!req.user) throw unauthorized();
  const user = await service.deactivateUser(req.params.id, req.user.id);
  res.json({ user });
}
