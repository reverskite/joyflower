'use client';

import { useEffect, useRef } from 'react';
import Script from 'next/script';
import { inquiryChallengeAction } from '../../lib/inquiry-turnstile';

type Turnstile = {
  render: (container: HTMLElement, options: {
    sitekey: string; action: string; size: 'flexible'; theme: 'light'; language: 'ko';
    callback: (token: string) => void; 'expired-callback': () => void; 'error-callback': () => void;
  }) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global { interface Window { turnstile?: Turnstile } }

export default function InquiryChallenge({ siteKey, resetCount, onToken, onError }: {
  siteKey: string; resetCount: number; onToken: (value: string) => void; onError: (value: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  function render() {
    if (!container.current || !window.turnstile || widget.current !== null) return;
    widget.current = window.turnstile.render(container.current, {
      sitekey: siteKey, action: inquiryChallengeAction, size: 'flexible', theme: 'light', language: 'ko',
      callback: token => { onToken(token); onError(''); },
      'expired-callback': () => { onToken(''); onError('자동 접수 방지 확인이 만료되었습니다. 다시 확인해주세요.'); },
      'error-callback': () => { onToken(''); onError('자동 접수 방지 확인을 불러오지 못했습니다. 잠시 후 다시 시도하거나 전화·카카오톡으로 상담해주세요.'); },
    });
  }
  useEffect(() => {
    if (widget.current !== null) window.turnstile?.reset(widget.current);
  }, [resetCount]);
  useEffect(() => () => {
    if (widget.current !== null) window.turnstile?.remove(widget.current);
    widget.current = null;
  }, []);
  return <div aria-label="자동 접수 방지 확인">
    <div ref={container} />
    <Script id="inquiry-turnstile" src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
      strategy="afterInteractive" onReady={render} onError={() => onError('자동 접수 방지 확인을 불러오지 못했습니다. 전화·카카오톡으로 상담해주세요.')} />
  </div>;
}
