'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { AlertCircle, Check, LoaderCircle, MapPin, X } from 'lucide-react';

export function Brand({ light = false, href = "/" }: { light?: boolean; href?: string }) {
 return <a className={`brand${light ? ' brand-light' : ''}`} href={href} aria-label="เข้าห้อง หน้าหลัก">
  <span className="brand-mark"><MapPin size={23} strokeWidth={1.7} aria-hidden="true" /></span>
  <span>เข้าห้อง<span className="brand-sub">ระบบเช็คชื่อเข้าเรียน</span></span>
 </a>;
}

export function Spinner({ size = 18 }: { size?: number }) {
 return <LoaderCircle className="spinner" size={size} aria-hidden="true" />;
}

export function Notice({ children, success = false }: { children: ReactNode; success?: boolean }) {
 return <div className={`notice${success ? ' notice-success' : ''}`} role={success ? 'status' : 'alert'}>
  {success ? <Check size={18} aria-hidden="true" /> : <AlertCircle size={18} aria-hidden="true" />}
  <div>{children}</div>
 </div>;
}

export function Dialog({ children, title, onClose, className = '' }: { children: ReactNode; title: string; onClose: () => void; className?: string }) {
 const panel = useRef<HTMLElement>(null);
 const close = useRef(onClose);
 close.current = onClose;
 useEffect(() => {
  const previous = document.activeElement as HTMLElement | null;
  const overflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  panel.current?.focus();
  function keydown(event: KeyboardEvent) {
   if (event.key === 'Escape') close.current();
   if (event.key !== 'Tab' || !panel.current) return;
   const elements = Array.from(panel.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]')).filter(el => el.getClientRects().length);
   const first = elements[0], last = elements[elements.length - 1];
   if (!first) { event.preventDefault(); return; }
   if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
   else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first.focus(); }
  }
  document.addEventListener('keydown', keydown);
  return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown); previous?.focus(); };
 }, []);
 return <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
  <section className={`panel modal ${className}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={panel}>
   <button className="close-button" aria-label="ปิดหน้าต่าง" onClick={onClose}><X size={20} /></button>
   {children}
  </section>
 </div>;
}
