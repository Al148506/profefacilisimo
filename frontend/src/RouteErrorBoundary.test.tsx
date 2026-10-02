import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import RouteErrorBoundary from './RouteErrorBoundary';

function Crasher(): never {
  throw new Error('Tipo de actividad desconocido.');
}

it('renders children untouched when nothing throws', () => {
  render(<MemoryRouter><RouteErrorBoundary><p className="ok">Contenido</p></RouteErrorBoundary></MemoryRouter>);
  expect(screen.getByText('Contenido')).toBeInTheDocument();
});

it('shows the standard error block and the exit link when a route crashes', () => {
  // The boundary logs the crash on purpose: keep the expected noise out of the test output.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  render(<MemoryRouter><RouteErrorBoundary><Crasher /></RouteErrorBoundary></MemoryRouter>);
  expect(screen.getByRole('alert')).toHaveTextContent('Tipo de actividad desconocido.');
  expect(screen.getByRole('link', { name: 'Volver a Mis clases' })).toHaveAttribute('href', '/');
});
