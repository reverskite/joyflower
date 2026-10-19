'use client';

import Link from 'next/link';

import { useEffect, useRef, useState } from 'react';

export default function MobileMenu() {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    }
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return <div className="mobile-menu" ref={container} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <button ref={button} type="button" className="mobile-menu-toggle" aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpen(!open)}>
      <span aria-hidden="true">{open ? '✕' : '☰'}</span><span>{open ? '닫기' : '메뉴'}</span>
    </button>
    <nav id="mobile-navigation" className="mobile-navigation" aria-label="모바일 주요 메뉴" hidden={!open} onClick={() => setOpen(false)}>
      <Link prefetch={false} href="/#service">서비스 소개</Link>
      <a href="/christmas">크리스마스 트리 대여</a>
      <a href="/planterior">조화 플랜테리어</a>
      <a href="/landscape">조경관리</a>
      <Link prefetch={false} href="/portfolio">포트폴리오</Link>
      <a href="/inquiry">견적문의</a>
    </nav>
  </div>;
}
