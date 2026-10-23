import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import AppLayout from './AppLayout';
vi.mock('../auth', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'profe@example.com' } }),
  logout: vi.fn(async () => {}),
}));

function shell(path = '/') {
  const router = createMemoryRouter([{
    element: <AppLayout />,
    children: [
      { path: '/', element: <h1>Contenido de clases</h1> },
      { path: '/students', element: <h1>Contenido de estudiantes</h1> },
    ],
  }], { initialEntries: [path] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
}

it('wraps the routed page between the sidebar and its content column', () => {
  shell();
  expect(screen.getByTestId('sidebar')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Contenido de clases' })).toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument();
});

it('opens the drawer with «Abrir menú», and the overlay closes it again', async () => {
  shell();
  const layout = document.querySelector('.app-layout');
  expect(layout).not.toHaveClass('is-menu-open');
  await userEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
  expect(layout).toHaveClass('is-menu-open');
  expect(screen.getByRole('button', { name: 'Abrir menú' })).toHaveAttribute('aria-expanded', 'true');
  // Both the overlay and the drawer's own button answer to «Cerrar menú» while the drawer is open.
  expect(screen.getAllByRole('button', { name: 'Cerrar menú' })).toHaveLength(2);
  await userEvent.click(document.querySelector('.sidebar-overlay') as HTMLElement);
  expect(layout).not.toHaveClass('is-menu-open');
});

it('closes the drawer as soon as a destination is chosen, after navigating', async () => {
  shell();
  await userEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
  await userEvent.click(screen.getByRole('link', { name: 'Estudiantes' }));
  expect(await screen.findByRole('heading', { name: 'Contenido de estudiantes' })).toBeInTheDocument();
  expect(document.querySelector('.app-layout')).not.toHaveClass('is-menu-open');
});

it('never leaves the drawer state behind a reload-like remount', async () => {
  const view = shell();
  await userEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
  expect(document.querySelector('.app-layout')).toHaveClass('is-menu-open');
  view.unmount();
  // The drawer is intentionally not persisted: a fresh mount starts closed, no matter the last view.
  shell();
  expect(screen.getByTestId('sidebar')).toBeInTheDocument();
  expect(document.querySelector('.app-layout')).not.toHaveClass('is-menu-open');
});
