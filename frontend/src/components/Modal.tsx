import { X } from 'lucide-react';
import { useEffect, useId, useRef, type AnimationEvent, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';

type ModalProps = {
  /** The dialog label, shown in the header and wired through `aria-labelledby`. */
  title: string;
  /** The parent flips it to true to start the exit animation; `onClosed` finalizes the unmount. */
  closing: boolean;
  /** True while an operation runs: Escape, the header button and the parent handlers must stand down. */
  busy?: boolean;
  /** Escape or the header button. The parent owns any discard confirmation before honoring it. */
  onRequestClose: () => void;
  /** Fires once the exit is done; the parent must drop the modal state here. */
  onClosed: () => void;
  /** The fixed footer actions, rendered outside the scrolling body. */
  footer: ReactNode;
  children: ReactNode;
};

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]';

/**
 * A centered dialog over the live page: portal to the body, dimmed backdrop that never closes on
 * click, fixed header and footer around a scrolling body. The page behind is inert while it lasts:
 * the scroll is locked and Tab cycles inside the panel. Escape and the header button only *ask*
 * to close, so the owner can confirm a discard first, and the panel only unmounts after the exit
 * animation (`onClosed`), which is skipped under reduced motion or where no animation runs.
 */
export default function Modal({ title, closing, busy = false, onRequestClose, onClosed, footer, children }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();

  // The lock, the remembered opener and the initial focus live and die with the mount.
  useEffect(() => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onRequestClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onRequestClose]);

  // Closing returns the focus where the dialog was opened, then reports the unmount as soon as
  // the exit animation is over — or right away when nothing is animating (reduced motion, jsdom).
  useEffect(() => {
    if (!closing) return;
    opener.current?.focus();
    const running = panel.current?.getAnimations ? panel.current.getAnimations() : [];
    if (running.length === 0) { onClosed(); return; }
    const timer = window.setTimeout(onClosed, 400);
    return () => window.clearTimeout(timer);
  }, [closing, onClosed]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab' || !panel.current) return;
    const focusables = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (focusables.length === 0) { event.preventDefault(); return; }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const current = document.activeElement;
    if (event.shiftKey && (current === first || current === panel.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && current === last) { event.preventDefault(); first.focus(); }
  }

  function onAnimationEnd(event: AnimationEvent<HTMLDivElement>) {
    if (closing && event.target === panel.current) onClosed();
  }

  return createPortal(<div className={closing ? 'pf-modal-overlay is-closing' : 'pf-modal-overlay'}>
    <div ref={panel} className={closing ? 'pf-modal is-closing' : 'pf-modal'} role="dialog" aria-modal="true"
      aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown} onAnimationEnd={onAnimationEnd}>
      <header className="pf-modal-header">
        <h2 id={titleId} className="pf-modal-title">{title}</h2>
        <Button variant="secondary" type="button" className="pf-modal-close" icon={X} disabled={busy}
          aria-label="Cerrar" onClick={onRequestClose} />
      </header>
      <div className="pf-modal-body">{children}</div>
      <footer className="pf-modal-footer">{footer}</footer>
    </div>
  </div>, document.body);
}
