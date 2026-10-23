import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, LogOut, X } from 'lucide-react';
import { logout, useAuth } from '../auth';
import { Button } from './Button';
import { NAV_ITEMS, type NavItem } from './sidebar-nav';

/**
 * The collapse survives reloads through localStorage, and only the toggle ever writes: a session
 * that never collapses leaves the storage as empty as it found it. A private-mode refusal only
 * costs the persistence, never the page.
 */
const COLLAPSED_KEY = 'pf.sidebar-collapsed';

function readCollapsed(): boolean {
  try { return localStorage.getItem(COLLAPSED_KEY) === 'true'; }
  catch { return false; }
}

export type SidebarProps = {
  /** Mobile drawer state, owned by the layout so any navigation can close it. */
  open: boolean;
  onClose: () => void;
};

/**
 * The shell's left navigation: brand on top, the section links in the middle — the papeleras are
 * split off by a visual separator — and the session at the foot. Desktop is expandable and this
 * column is sticky; below 768px it becomes the off-canvas drawer that `open` reveals.
 */
export default function Sidebar({ open, onClose }: SidebarProps) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      try { localStorage.setItem(COLLAPSED_KEY, String(next)); } catch { /* the preference simply will not stick */ }
      return next;
    });
  }

  function link(item: NavItem) {
    // `onClose` also fires on a plain click: the route to the current section never changes the
    // path, and yet the mobile drawer must still close after a destination is chosen.
    return <li key={item.to}>
      <Link to={item.to} className="sidebar-link" aria-current={item.active(location.pathname) ? 'page' : undefined} onClick={onClose}>
        <item.icon aria-hidden="true" size={19} />
        <span className="sidebar-label">{item.label}</span>
      </Link>
    </li>;
  }

  return <aside id="sidebar" className={'sidebar' + (collapsed ? ' is-collapsed' : '') + (open ? ' is-open' : '')} data-testid="sidebar">
    <div className="sidebar-head">
      <Link to="/" className="brand"><span className="brand-mark" aria-hidden="true">pf.</span><span className="sidebar-label">Profe Facilísimo</span></Link>
      <Button variant="secondary" className="sidebar-collapse" icon={ChevronLeft}
        aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'} aria-expanded={!collapsed} onClick={toggleCollapsed} />
      <Button variant="secondary" className="sidebar-close" icon={X} aria-label="Cerrar menú" onClick={onClose} />
    </div>
    <nav aria-label="Navegación principal">
      <ul className="sidebar-links">{NAV_ITEMS.filter((item) => item.group === 'main').map(link)}</ul>
      <hr className="sidebar-separator" />
      <ul className="sidebar-links">{NAV_ITEMS.filter((item) => item.group === 'trash').map(link)}</ul>
    </nav>
    <SidebarSession />
  </aside>;
}

/** The absorbed `SessionBar`: the email and the sign-out, living now at the foot of the Sidebar. */
function SidebarSession() {
  const { user } = useAuth();
  const client = useQueryClient();
  const signOut = useMutation({ mutationFn: logout, retry: false, onSuccess: () => client.clear() });
  if (!user) return null;
  return <div className="sidebar-session">
    <p className="sidebar-email sidebar-label">Sesión iniciada como <strong>{user.email}</strong>.</p>
    {signOut.isError && <p role="alert" className="error">No se pudo cerrar la sesión en el servidor. Vuelve a intentarlo.</p>}
    <Button variant="secondary" icon={LogOut} aria-label="Cerrar sesión" disabled={signOut.isPending} onClick={() => signOut.mutate()}>
      <span className="sidebar-label">{signOut.isPending ? 'Cerrando…' : 'Cerrar sesión'}</span>
    </Button>
  </div>;
}
