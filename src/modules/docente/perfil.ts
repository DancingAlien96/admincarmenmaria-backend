import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../middleware/validate.js";
import { badRequest, forbidden, notFound } from "../../lib/http-error.js";
import { changePassword, requestEmailChangeForUser } from "../portal/portal.service.js";

// Perfil del docente: sus datos personales y su cuenta bancaria. Se guardan en
// su registro de catedrático (el que ve la administración en Catedráticos).

const PERFIL_SELECT = {
  id: true,
  fullName: true,
  dpi: true,
  phone: true,
  address: true,
  title: true,
  collegiate: true,
  specialty: true,
  bankName: true,
  bankAccountType: true,
  bankAccountNumber: true,
  bankAccountHolder: true,
} as const;

// Registro de catedrático del usuario docente: enlazado por userId; si aún no
// lo está, se busca por su correo; si no existe, se crea.
async function teacherDeUsuario(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, name: true, email: true },
  });
  if (!user) throw notFound("Cuenta no encontrada");
  if (user.role !== "DOCENTE") throw forbidden("El perfil es solo para docentes");

  const enlazado = await prisma.teacher.findUnique({ where: { userId }, select: { id: true } });
  if (enlazado) return { user, teacherId: enlazado.id };

  const porCorreo = await prisma.teacher.findFirst({
    where: { email: user.email, userId: null },
    select: { id: true },
  });
  if (porCorreo) {
    await prisma.teacher.update({ where: { id: porCorreo.id }, data: { userId } });
    return { user, teacherId: porCorreo.id };
  }
  const nuevo = await prisma.teacher.create({
    data: { fullName: user.name, email: user.email, userId },
    select: { id: true },
  });
  return { user, teacherId: nuevo.id };
}

async function perfil(userId: string) {
  const { user, teacherId } = await teacherDeUsuario(userId);
  const t = await prisma.teacher.findUnique({ where: { id: teacherId }, select: PERFIL_SELECT });
  return { email: user.email, ...t };
}

const texto = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));
const v = (x?: string) => (x === undefined ? undefined : x.trim() || null);

const datosSchema = z.object({
  fullName: z.string().trim().min(3, "Escribe tu nombre completo").max(150),
  dpi: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((d) => !d || /^\d{13}$/.test(d.replace(/\s+/g, "")), "El DPI debe tener 13 dígitos"),
  phone: texto(30),
  address: texto(250),
  title: texto(150),
  collegiate: texto(50),
  specialty: texto(150),
});

const bancoSchema = z.object({
  bankName: texto(100),
  bankAccountType: z.enum(["MONETARIA", "AHORRO"]).optional().or(z.literal("")),
  bankAccountNumber: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((n) => !n || /^[0-9-]{4,30}$/.test(n), "El número de cuenta solo lleva números y guiones"),
  bankAccountHolder: texto(150),
});

export const perfilRouter = Router();

perfilRouter.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    res.json({ perfil: await perfil(req.user!.id) });
  })
);

perfilRouter.put(
  "/datos",
  validate({ body: datosSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { teacherId } = await teacherDeUsuario(req.user!.id);
    const body = req.body as z.infer<typeof datosSchema>;
    const dpi = body.dpi ? body.dpi.replace(/\s+/g, "") : null;
    if (dpi) {
      const otro = await prisma.teacher.findUnique({ where: { dpi }, select: { id: true } });
      if (otro && otro.id !== teacherId) throw badRequest("Ese DPI ya está registrado en otro catedrático");
    }
    await prisma.$transaction([
      prisma.teacher.update({
        where: { id: teacherId },
        data: {
          fullName: body.fullName,
          dpi,
          phone: v(body.phone),
          address: v(body.address),
          title: v(body.title),
          collegiate: v(body.collegiate),
          specialty: v(body.specialty),
        },
      }),
      // El nombre también se muestra en el portal del docente
      prisma.user.update({ where: { id: req.user!.id }, data: { name: body.fullName } }),
    ]);
    res.json({ perfil: await perfil(req.user!.id) });
  })
);

perfilRouter.put(
  "/banco",
  validate({ body: bancoSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { teacherId } = await teacherDeUsuario(req.user!.id);
    const b = req.body as z.infer<typeof bancoSchema>;
    await prisma.teacher.update({
      where: { id: teacherId },
      data: {
        bankName: v(b.bankName),
        bankAccountType: b.bankAccountType || null,
        bankAccountNumber: v(b.bankAccountNumber),
        bankAccountHolder: v(b.bankAccountHolder),
      },
    });
    res.json({ perfil: await perfil(req.user!.id) });
  })
);

perfilRouter.post(
  "/password",
  validate({ body: z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(6, "La nueva contraseña debe tener al menos 6 caracteres") }) }),
  asyncHandler(async (req: Request, res: Response) => {
    await teacherDeUsuario(req.user!.id);
    res.json(await changePassword(req.user!.id, req.body.currentPassword, req.body.newPassword));
  })
);

// Cambio de correo de acceso: le llega un enlace al correo nuevo para confirmarlo
perfilRouter.post(
  "/correo",
  validate({
    body: z.object({
      email: z.string().trim().email("Correo inválido").max(190),
      password: z.string().min(1, "Escribe tu contraseña actual"),
    }),
  }),
  asyncHandler(async (req: Request, res: Response) => {
    await teacherDeUsuario(req.user!.id);
    res.json(await requestEmailChangeForUser(req.user!.id, req.body.email, req.body.password));
  })
);
