export const COMMON_TOPICS = [
  'Viajes y turismo',
  'Gastronomía y restaurantes',
  'Vida cotidiana y rutina',
  'Relaciones personales y descripciones',
  'Vivienda y ciudad',
  'Trabajo y profesiones',
  'Salud y bienestar',
  'Cultura, ocio y celebraciones',
  'Medio ambiente y naturaleza',
  'Foco gramatical y lingüístico',
] as const;

export type CommonTopic = (typeof COMMON_TOPICS)[number];
