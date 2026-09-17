import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email('Introduce un correo válido.').max(254),
  password: z.string().min(1, 'Introduce tu contraseña.').max(128),
});
export const registerSchema = loginSchema.extend({
  password: z.string().min(12, 'Usa al menos 12 caracteres.').max(128)
    .regex(/[A-Z]/, 'Incluye una mayúscula.').regex(/[a-z]/, 'Incluye una minúscula.').regex(/[0-9]/, 'Incluye un número.'),
});
export type Credentials = z.infer<typeof loginSchema>;
