import { BookOpen, Trash2, Users, type LucideIcon } from 'lucide-react';

/**
 * One destination of the shell. `active` owns the matching rule because the trash of a section
 * belongs to that section's subtree yet names its own entry: exact match for the papeleras,
 * prefix — without their exact path — for the sections. Documentos and Configuración, when they
 * land, are one more entry here; nothing else about this list needs to change.
 */
export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  group: 'main' | 'trash';
  active: (pathname: string) => boolean;
};

const inSection = (pathname: string, section: string, trash: string) =>
  (pathname === section || pathname.startsWith(section + '/')) && pathname !== trash;

export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Clases', icon: BookOpen, group: 'main', active: (p) => p === '/' || inSection(p, '/lessons', '/lessons/trash') },
  { to: '/students', label: 'Estudiantes', icon: Users, group: 'main', active: (p) => inSection(p, '/students', '/students/trash') },
  { to: '/lessons/trash', label: 'Papelera de clases', icon: Trash2, group: 'trash', active: (p) => p === '/lessons/trash' },
  { to: '/students/trash', label: 'Papelera de estudiantes', icon: Trash2, group: 'trash', active: (p) => p === '/students/trash' },
];
