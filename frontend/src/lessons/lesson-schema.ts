import { z } from 'zod';
const text = (max: number) => z.string().trim().min(1, 'Este campo es obligatorio.').max(max, 'Máximo ' + max + ' caracteres.');
export const lessonSchema = z.object({
  title: text(200), level: z.enum(['A2', 'B1', 'B2'], { error: 'Selecciona A2, B1 o B2.' }),
  topic: text(200), objective: text(2000),
});
export type LessonValues = z.infer<typeof lessonSchema>;
