import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

const FOCUSABLE = 'button:not([disabled]),input,select,summary,[tabindex="0"]';

/**
 * A modal bottom sheet (or centered dialog). Traps focus, closes on Escape or a tap outside,
 * makes the rest of the app inert while open, and returns focus to where it was.
 */
export function Sheet({ title, onClose, dialog = false, children }: {
  title: string; onClose: () => void; dialog?: boolean; children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const frame = document.querySelector('.frame');
    frame?.setAttribute('inert', '');
    panel.current?.focus();

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      } else if (e.key === 'Tab' && panel.current) {
        const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hidden);
        if (items.length === 0) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === panel.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      frame?.removeAttribute('inert');
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  return createPortal(
    <div className={`overlay${dialog ? ' center' : ''}`} onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panel} className={`sheet${dialog ? ' dialog' : ''}`} role={dialog ? 'alertdialog' : 'dialog'} aria-modal="true" aria-label={title} tabIndex={-1}>
        <div className="sheet-head">
          <h2 className="sheet-title">{title}</h2>
          <button type="button" className="iconbtn" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
