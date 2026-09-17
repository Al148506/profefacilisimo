import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('./auth', () => ({
  useAuth: () => ({ user: null, loading: false, error: null }),
  initializeAuth: vi.fn(), retryInitialization: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn(), getCurrentUser: vi.fn(),
}));
import App from './App';
import { login } from './auth';
beforeEach(() => vi.clearAllMocks());
function page(path: string) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></QueryClientProvider>);
}
it('redirects unauthenticated users to login', () => {
  page('/');
  expect(screen.getByRole('heading', { name: 'Qué bueno verte de nuevo' })).toBeInTheDocument();
});
it('shows validation before sending a registration', async () => {
  page('/register');
  await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
  expect(await screen.findByText('Introduce un correo válido.')).toBeInTheDocument();
  expect(screen.getByText('Usa al menos 12 caracteres.')).toBeInTheDocument();
});
it('submits login and shows server errors accessibly', async () => {
  vi.mocked(login).mockRejectedValueOnce(new Error('Credenciales incorrectas'));
  page('/login');
  await userEvent.type(screen.getByLabelText('Correo electrónico'), 'profe@example.com');
  await userEvent.type(screen.getByLabelText('Contraseña'), 'Password12345');
  await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Credenciales incorrectas');
});

