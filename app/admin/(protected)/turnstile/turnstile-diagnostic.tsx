'use client';
import { useEffect, useRef, useState } from 'react';
import InquiryChallenge from '../../../inquiry/inquiry-challenge';

type Check = 'normal' | 'replay' | 'expired';
export default function TurnstileDiagnostic({ siteKey }: { siteKey: string }) {
  const sample = useRef<{ token: string; at: number } | null>(null);
  const accepted = useRef('');
  const locked = useRef(false);
  const [ready, setReady] = useState(false);
  const [canReplay, setCanReplay] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [reset, setReset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<Partial<Record<Check, string>>>({});
  useEffect(() => {
    const timer = setInterval(() => setElapsed(sample.current ? Math.floor((Date.now() - sample.current.at) / 1000) : 0), 1000);
    return () => { clearInterval(timer); sample.current = null; accepted.current = ''; };
  }, []);
  function capture(token: string) {
    // Freeze the first token for explicit replay/expiry tests; never render or persist it.
    if (token && !sample.current) { sample.current = { token, at: Date.now() }; setReady(true); }
  }
  function renew() {
    if (locked.current) return;
    sample.current = null; accepted.current = ''; setReady(false); setCanReplay(false);
    setElapsed(0); setError(''); setReset(x => x + 1);
  }
  async function check(kind: Check) {
    const token = kind === 'replay' ? accepted.current : sample.current?.token;
    if (locked.current || !token) return;
    if (kind === 'expired' && (!sample.current || Date.now() - sample.current.at < 305000 || accepted.current)) return;
    locked.current = true; setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin/turnstile', { method: 'POST', redirect: 'manual', credentials: 'same-origin',
        cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }), signal: AbortSignal.timeout(15000) });
      if (response.type === 'opaqueredirect' || response.status === 401 || response.status === 403) {
        sample.current = null; accepted.current = ''; setReady(false); setCanReplay(false);
        throw Error('관리자 로그인에서 인증을 다시 확인해주세요.');
      }
      if (!response.headers.get('content-type')?.includes('application/json')) throw Error('진단 응답을 확인하지 못했습니다.');
      const data = await response.json() as { result?: string } | null;
      if (!response.ok || !data || !['valid', 'invalid'].includes(data.result || '')) throw Error('검증 연결 또는 설정을 확인하지 못했습니다. 성공으로 기록하지 않습니다.');
      const pass = data.result === (kind === 'normal' ? 'valid' : 'invalid');
      setResults(previous => ({ ...previous, [kind]: pass ? '기대 결과 확인' : '기대 결과와 다름 · 확인 필요' }));
      if (kind === 'normal' && data.result === 'valid') { accepted.current = token; setCanReplay(true); }
    } catch (e) {
      setResults(previous => ({ ...previous, [kind]: '미확인' }));
      setError(e instanceof Error && e.message.startsWith('관리자 로그인') ? e.message : '연결 또는 설정 오류로 결과를 확인하지 못했습니다.');
    } finally { locked.current = false; setBusy(false); }
  }
  return <section className="admin-card">
    <p>서버는 실제 토큰의 hostname과 action=inquiry를 함께 확인합니다. 토큰은 화면에 표시하거나 브라우저 저장소에 보관하지 않습니다.</p>
    <p>만료 시험은 ‘새 토큰 준비’ 후 정상 검증을 누르지 않고 305초 기다리세요. 자동 갱신되어도 처음 받은 토큰으로 검사합니다.</p>
    {siteKey ? <InquiryChallenge siteKey={siteKey} resetCount={reset} onToken={capture} onError={setError}/> : <p>공개 Site Key 설정이 필요합니다.</p>}
    <p role="status">{ready ? `시험 토큰 준비됨 · 경과 ${elapsed}초` : '위젯 확인 대기'}</p>
    <div className="admin-actions">
      <button disabled={busy} onClick={renew}>새 토큰 준비</button>
      <button disabled={busy || !ready || canReplay} onClick={() => check('normal')}>정상 토큰 검증</button>
      <button disabled={busy || !canReplay} onClick={() => check('replay')}>동일 토큰 재사용 검증</button>
      <button disabled={busy || !ready || canReplay || elapsed < 305} onClick={() => check('expired')}>미사용 만료 토큰 검증</button>
    </div>
    <ul aria-live="polite"><li>정상 통과: {results.normal || '미검증'}</li><li>재사용 거절: {results.replay || '미검증'}</li><li>만료 거절: {results.expired || '미검증'}</li></ul>
    {error && <p className="admin-error" role="alert">{error}</p>}
    <p>거절만으로 원인을 단정할 수 없습니다. 정상 통과를 먼저 확인하고 각 시험의 발급·사용 순서를 지켜주세요.</p>
  </section>;
}
