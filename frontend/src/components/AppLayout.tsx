import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Button } from './Button';
import Sidebar from './Sidebar';

/**
 * The shared shell: the Sidebar on the left, the routed page as the content. On desktop the column
 * is always there; below 768px it hides off-canvas and the topbar's «Abrir menú» reveals it as a
 * drawer. The drawer is closed by its own button, by the overlay, or by any navigation — picking a
 * destination always ends the detour through the menu — and it never remembers being open.
 */
export default function AppLayout() {
  const location = useLocation();
  // The drawer remembers the path it was opened on: the moment navigation changes the path the
  // comparison fails and the drawer reads as closed — no effect to run, no state left behind.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const menuOpen = openFor === location.pathname;
  return <div className={'app-layout' + (menuOpen ? ' is-menu-open' : '')} data-testid="app-layout">
    <Sidebar open={menuOpen} onClose={() => setOpenFor(null)} />
    {menuOpen && <button type="button" className="sidebar-overlay" aria-label="Cerrar menú" onClick={() => setOpenFor(null)} />}
    <div className="app-content">
      <div className="app-menu-bar">
        <Button variant="secondary" icon={Menu} aria-expanded={menuOpen} aria-controls="sidebar" onClick={() => setOpenFor(location.pathname)}>Abrir menú</Button>
      </div>
      <main><Outlet /></main>
    </div>
  </div>;
}
