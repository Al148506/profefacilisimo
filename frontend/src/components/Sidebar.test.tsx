import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Sidebar from './Sidebar';
vi.mock('../auth', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'profe@example.com' } }),
  logout: vi.fn(async () => {}),
}));
// The collapse preference is the only thing this component may store; the suite owns the key.
beforeEach(() => { localStorage.clear(); });
afterEach(() => { localStorage.clear(); });
function at(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>
    <Sidebar open={false} onClose={vi.fn()} />
    <Routes><Route path="*" element={<p>contenido</p>} /></Routes>
  </MemoryRouter></QueryClientProvider>);
}

it('shows the four destinations, the brand and the session at the foot', () => {
  at('/');
  expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument();
  for (const label of ['Clases', 'Estudiantes', 'Papelera de clases', 'Papelera de estudiantes']) {
    expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
  }
  expect(screen.getByRole('link', { name: 'Papelera de clases' })).toHaveAttribute('href', '/lessons/trash');
  expect(screen.getByRole('link', { name: 'Papelera de estudiantes' })).toHaveAttribute('href', '/students/trash');
  expect(screen.getByRole('link', { name: 'Profe Facilísimo' })).toHaveAttribute('href', '/');
  expect(screen.getByText('profe@example.com')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
});

it('separates the papeleras from the main sections', () => {
  at('/');
  expect(screen.getByRole('separator')).toBeInTheDocument();
});

it.each([
  ['/', 'Clases'],
  ['/lessons/new', 'Clases'],
  ['/lessons/l1/edit', 'Clases'],
  ['/lessons/l1/play', 'Clases'],
  ['/students', 'Estudiantes'],
  ['/students/s1', 'Estudiantes'],
  ['/students/new', 'Estudiantes'],
  ['/students/s1/edit', 'Estudiantes'],
  ['/lessons/trash', 'Papelera de clases'],
  ['/students/trash', 'Papelera de estudiantes'],
])('marks only the owning entry current at %s', async (path, label) => {
  at(path);
  await screen.findByRole('link', { name: label });
  const current = screen.getAllByRole('link').filter((link) => link.getAttribute('aria-current') === 'page');
  expect(current).toHaveLength(1);
  expect(current[0]).toHaveAccessibleName(label);
});

it('collapses and expands from the toolbar, remembering only a deliberate choice', async () => {
  const view = at('/');
  // The key is never written on its own: a session that does not toggle leaves storage empty.
  expect(localStorage.getItem('pf.sidebar-collapsed')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Contraer menú' }));
  expect(screen.getByRole('button', { name: 'Expandir menú' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Expandir menú' })).toHaveAttribute('aria-expanded', 'false');
  expect(localStorage.getItem('pf.sidebar-collapsed')).toBe('true');
  expect(document.querySelector('.sidebar')).toHaveClass('is-collapsed');
  // A later mount reads the stored preference back: collapsed from the start, labels gone visually.
  view.unmount();
  at('/');
  expect(await screen.findByRole('button', { name: 'Expandir menú' })).toHaveAttribute('aria-expanded', 'false');
  expect(document.querySelector('.sidebar')).toHaveClass('is-collapsed');
  await userEvent.click(screen.getByRole('button', { name: 'Expandir menú' }));
  expect(screen.getByRole('button', { name: 'Contraer menú' })).toHaveAttribute('aria-expanded', 'true');
  expect(localStorage.getItem('pf.sidebar-collapsed')).toBe('false');
});

it('keeps the accessible names of links alive with nothing but a collapsed label', async () => {
  at('/');
  await userEvent.click(screen.getByRole('button', { name: 'Contraer menú' }));
  // Labels are hidden by CSS, never removed from the DOM: every name survives the collapse.
  for (const label of ['Clases', 'Estudiantes', 'Papelera de clases', 'Papelera de estudiantes']) {
    expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
  }
  expect(document.querySelectorAll('.sidebar.is-collapsed .sidebar-label').length).toBeGreaterThan(0);
});

it('hands the mobile drawer state to the layout: open shows it, the close button asks to hide', async () => {
  const onClose = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/']}>
    <Sidebar open onClose={onClose} />
  </MemoryRouter></QueryClientProvider>);
  expect(document.querySelector('.sidebar')).toHaveClass('is-open');
  await userEvent.click(screen.getByRole('button', { name: 'Cerrar menú' }));
  expect(onClose).toHaveBeenCalledTimes(1);
});
