'use client';
/* eslint-disable @next/next/no-html-link-for-pages -- Full navigations re-run server authentication and avoid retaining admin RSC navigation state. */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { serviceGuides, services, type Service } from '../inquiry/service-fields';
import { portfolioItems } from '../portfolio-data';
import { readAdminResponse } from '../../lib/admin-response';
type Status = 'new' | 'reviewing' | 'completed';
const statuses: Record<Status, string> = { new: '신규 접수', reviewing: '확인 중', completed: '상담 완료' };
type Row = { receipt_id: string; service: Service; region: string; budget: string; created_at: number; status: Status; status_version: number; status_updated_at: number | null };
type Detail = Row & { customer_name: string; phone: string; requests_json: string; reference_slug: string | null; consent: number; consent_version: string; consent_notice_json: string };
type History = { previous_status: Status; next_status: Status; changed_at: number; actor: string };
type List = { items: Row[]; total: number; page: number; pageSize: number };
function date(value: number | null) { return value ? new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '변경 없음'; }
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...init, credentials: 'same-origin', cache: 'no-store', redirect: 'manual', signal: init.signal || AbortSignal.timeout(15_000) });
  return readAdminResponse<T>(response);
}
function useAdminData<T>(path: string, revision = 0) {
  const requestKey = revision + ':' + path;
  const [result, setResult] = useState<{ key: string; data: T | null; error: string }>({ key: '', data: null, error: '' });
  useEffect(() => {
    const controller = new AbortController();
    api<T>(path, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) })
      .then(data => { if (!controller.signal.aborted) setResult({ key: requestKey, data, error: '' }); })
      .catch(e => { if (!controller.signal.aborted) setResult({ key: requestKey, data: null, error: e.message }); });
    return () => controller.abort();
  }, [path, requestKey]);
  // Never restore an authenticated detail from a browser back/forward cache after logout.
  useEffect(() => { const refresh = (e: PageTransitionEvent) => { if (e.persisted) window.location.reload(); }; window.addEventListener('pageshow', refresh); return () => window.removeEventListener('pageshow', refresh); }, []);
  return result.key === requestKey ? result : { data: null, error: '' };
}
function ErrorNotice({ message }: { message: string }) { return <div className="admin-error" role="alert">{message} <a href="/admin/login">관리자 로그인</a></div>; }
function Badge({ status }: { status: Status }) { return <span className={'admin-badge admin-' + status}>{statuses[status]}</span>; }

type NotificationRow = {
  receipt_id: string; channel: 'EMAIL' | 'KAKAO_ALIMTALK' | 'SMS';
  status: 'pending' | 'processing' | 'mock_sent' | 'sent' | 'accepted' | 'delivered' | 'failed' | 'unknown';
  attempts: number; created_at: number;
};
const notificationStatuses: Record<NotificationRow['status'], string> = {
  pending: '발송 대기', processing: '처리 중', mock_sent: '모의 발송 완료',
  sent: '요청 접수 · 전달 미확인', accepted: '요청 접수 · 전달 미확인',
  delivered: '전달 완료', failed: '발송 실패', unknown: '최종 상태 미확인',
};
const notificationChannels: Record<NotificationRow['channel'], string> = {
  EMAIL: '이메일', KAKAO_ALIMTALK: '카카오 알림톡', SMS: 'SMS',
};
export function AdminNotifications() {
  const [revision, setRevision] = useState(0);
  const { data, error } = useAdminData<{ items: NotificationRow[] }>('/api/admin/notifications', revision);
  return <><p className="admin-eyebrow">NOTIFICATIONS</p><h1>알림 상태</h1>
    <p className="admin-muted">최근 100건 · 실제 이메일·카카오 알림톡·SMS 발송은 연결되지 않았습니다. 견적 저장 성공과 알림 전달은 별개이며, 신규 접수는 견적 목록에서 직접 확인해주세요.</p>
    <p className="admin-muted">‘발송 대기’는 저장된 알림 작업의 상태입니다. 현재 자동 발송되지 않으며 ‘모의 발송 완료’도 실제 전달을 뜻하지 않습니다.</p>
    <p className="admin-muted">요청 접수는 최종 전달 성공을 의미하지 않습니다. 최종 상태 미확인 작업은 자동 재발송하지 않습니다.</p>
    <button onClick={() => setRevision(x => x + 1)}>새로고침</button>
    {error ? <ErrorNotice message={error}/> : !data ? <p role="status">불러오는 중…</p> :
      <section className="admin-card">{!data.items.length ? <div className="admin-empty">등록된 알림 작업이 없습니다.</div> :
        <div className="admin-table-wrap"><table><thead><tr><th>접수번호</th><th>채널</th><th>상태</th><th>시도 횟수</th><th>접수일</th></tr></thead>
          <tbody>{data.items.map(row => <tr key={row.receipt_id + ':' + row.channel}>
            <td><a className="admin-receipt" href={'/admin/inquiries/' + row.receipt_id}>{row.receipt_id}</a></td>
            <td>{notificationChannels[row.channel]}</td>
            <td>{notificationStatuses[row.status]}</td><td>{row.attempts} / 5</td><td>{date(row.created_at)}</td>
          </tr>)}</tbody></table></div>}</section>}
  </>;
}
function Rows({ items }: { items: Row[] }) {
  if (!items.length) return <div className="admin-empty">조건에 맞는 견적이 없습니다.</div>;
  return <div className="admin-table-wrap"><table><thead><tr><th>접수번호 / 서비스</th><th>설치 지역</th><th>접수일 (한국 시간)</th><th>상태</th></tr></thead><tbody>{items.map(row => <tr key={row.receipt_id}><td><a className="admin-receipt" href={'/admin/inquiries/' + row.receipt_id}>{row.receipt_id}</a><small>{services[row.service]}</small></td><td>{row.region}</td><td>{date(row.created_at)}</td><td><Badge status={row.status}/></td></tr>)}</tbody></table></div>;
}
export function AdminSession({ mode }: { mode: 'access' | 'local' }) {
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function logout() { setBusy(true); try { await api('/api/admin/session', { method: 'DELETE' }); window.location.replace('/admin/login'); } catch { setError('세션 종료에 실패했습니다. 다시 시도해주세요.'); setBusy(false); } }
  return <div className="admin-session">{mode === 'local' ? <><span>로컬 테스트 · 1시간 세션</span><button onClick={logout} disabled={busy}>로그아웃</button></> : <><span>Cloudflare Access 인증</span><a href="/cdn-cgi/access/logout">세션 종료</a></>}{error && <span role="alert">{error}</span>}</div>;
}
export function AdminLogin({ local, accessReady }: { local: boolean; accessReady: boolean }) {
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const secret = useRef<HTMLInputElement>(null);
  async function login(e: FormEvent) {
    e.preventDefault(); if (busy) return; setBusy(true); setError('');
    try { await api('/api/admin/session', { method: 'POST', headers: { 'X-Local-Admin-Secret': secret.current?.value || '' } }); if (secret.current) secret.current.value = ''; window.location.replace('/admin'); }
    catch (e) { setError(e instanceof Error ? e.message : '로그인 실패'); if (secret.current) secret.current.value = ''; setBusy(false); }
  }
  return <section className="admin-card">{local ? <><p>개발 서버 전용 로그인입니다. 실제 고객 정보를 사용하지 마세요. 운영 빌드에서는 이 인증을 사용할 수 없습니다.</p><form onSubmit={login}><label>로컬 인증키<input ref={secret} name="local-secret" type="password" autoComplete="off" required maxLength={256} disabled={busy}/></label><button className="admin-primary" disabled={busy}>{busy ? '인증 중…' : '로컬 로그인'}</button></form></> : <><p>{accessReady ? 'Cloudflare Access에서 허용된 관리자 계정으로 인증해주세요. 인증이 반복되면 Access 정책과 관리자 허용 목록을 확인해주세요.' : '운영 관리자 인증 설정이 완료되지 않아 접근이 차단되어 있습니다.'}</p>{accessReady && <a className="admin-primary" href="/admin">Access 인증 후 관리 화면 열기</a>}</>}{error && <ErrorNotice message={error}/>}<p className="admin-muted">관리 내용은 공개하지 않습니다. 브라우저 저장소에 인증키나 접수 내용을 저장하지 않습니다.</p></section>;
}
export function AdminDashboard() {
  const counts = useAdminData<{ total: number; new: number; reviewing: number; completed: number }>('/api/admin/summary');
  const recent = useAdminData<List>('/api/admin/inquiries?pageSize=20');
  return <><p className="admin-eyebrow">INQUIRY OVERVIEW</p><h1>견적 관리 대시보드</h1><p className="admin-muted">고객의 요청을 확인하고 상담 진행 상태를 관리하세요.</p>{counts.error && <ErrorNotice message={counts.error}/>}<div className="admin-stats">{(['total', 'new', 'reviewing', 'completed'] as const).map(key => <div className="admin-card" key={key}><span>{key === 'total' ? '전체 문의' : statuses[key]}</span><strong>{counts.data ? counts.data[key] : '—'}</strong></div>)}</div><section className="admin-card"><div className="admin-section-title"><h2>최근 접수</h2><a href="/admin/inquiries">전체 목록 →</a></div>{recent.error ? <ErrorNotice message={recent.error}/> : recent.data ? <Rows items={recent.data.items.slice(0, 5)}/> : <p role="status">불러오는 중…</p>}</section></>;
}
export function AdminList() {
  const [query, setQuery] = useState('page=1'); const [page, setPage] = useState(1); const [revision, setRevision] = useState(0);
  const { data, error } = useAdminData<List>('/api/admin/inquiries?' + query, revision);
  function filter(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const params = new URLSearchParams(); new FormData(e.currentTarget).forEach((v, k) => { if (String(v)) params.set(k, String(v)); }); params.set('page', '1'); setPage(1); setQuery(params.toString()); setRevision(x => x + 1); }
  function go(next: number) { const params = new URLSearchParams(query); params.set('page', String(next)); setPage(next); setQuery(params.toString()); }
  return <><p className="admin-eyebrow">INQUIRIES</p><h1>견적 목록</h1><p className="admin-muted">최신 접수순 · 목록에는 이름과 전화번호를 표시하지 않습니다.</p><form className="admin-card admin-filters" onSubmit={filter}><label>서비스<select name="service"><option value="">전체 서비스</option>{Object.entries(services).map(([v, name]) => <option key={v} value={v}>{name}</option>)}</select></label><label>상태<select name="status"><option value="">전체 상태</option>{Object.entries(statuses).map(([v, name]) => <option key={v} value={v}>{name}</option>)}</select></label><label>접수 시작일 (한국 시간)<input type="date" name="from"/></label><label>접수 종료일 (한국 시간)<input type="date" name="to"/></label><label>접수번호 검색<input name="receipt" maxLength={39} placeholder="JF- 접수번호 앞부분"/></label><label>페이지 크기<select name="pageSize"><option>20</option><option>50</option><option>100</option></select></label><button className="admin-primary">필터 적용</button></form><section className="admin-card">{error ? <ErrorNotice message={error}/> : !data ? <p role="status">불러오는 중…</p> : <><p>총 {data.total}건</p><Rows items={data.items}/><div className="admin-pagination"><button disabled={page <= 1} onClick={() => go(page - 1)}>이전</button><span>{page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}</span><button disabled={page * data.pageSize >= data.total} onClick={() => go(page + 1)}>다음</button></div></>}</section></>;
}
export function AdminDetail({ id }: { id: string }) {
  const [revision, setRevision] = useState(0); const { data, error } = useAdminData<{ inquiry: Detail; history: History[] }>('/api/admin/inquiries/' + encodeURIComponent(id), revision);
  const [busy, setBusy] = useState(false); const lock = useRef(false); const [message, setMessage] = useState(''); const [failed, setFailed] = useState(false);
  async function change(status: Status) {
    if (!data || lock.current) return;
    if (status === 'completed' && !window.confirm('실제 상담이 종료되었나요? 종료일부터 3개월 보유기간을 계산합니다.')) return;
    if (data.inquiry.status === 'completed' && status !== 'completed' &&
      !window.confirm('실제로 상담을 재개하나요? 다시 상담 완료로 기록한 날부터 3개월을 계산합니다. 단순 조회·정보 수정으로는 기간을 연장하지 마세요.')) return;
    lock.current = true; setBusy(true); setMessage('');
    try { await api('/api/admin/inquiries/' + encodeURIComponent(id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, version: data.inquiry.status_version }) }); setFailed(false); setMessage('상태 변경이 저장되었습니다.'); setRevision(v => v + 1); }
    catch (e) { setFailed(true); setMessage(e instanceof Error ? e.message : '변경 실패'); }
    finally { lock.current = false; setBusy(false); }
  }
  if (error) return <ErrorNotice message={error}/>;
  if (!data) return <p role="status">상세 내용을 불러오는 중…</p>;
  const row = data.inquiry; const requests: Record<string, string> = JSON.parse(row.requests_json); const notice: Record<string, string> = JSON.parse(row.consent_notice_json);
  const reference = portfolioItems.find(x => x.slug === row.reference_slug);
  return <><a href="/admin/inquiries">← 견적 목록</a><p className="admin-eyebrow">INQUIRY DETAIL</p><h1>접수 상세</h1><p className="admin-receipt">{row.receipt_id}</p><section className="admin-card"><div className="admin-section-title"><h2>상담 상태</h2><Badge status={row.status}/></div><p className="admin-muted">접수: {date(row.created_at)} · 상태 변경: {date(row.status_updated_at)}</p><div className="admin-actions">{(Object.keys(statuses) as Status[]).map(status => <button key={status} className={row.status === status ? 'admin-primary' : ''} disabled={busy || row.status === status} onClick={() => change(status)}>{statuses[status]}</button>)}<button disabled={busy} onClick={() => setRevision(v => v + 1)}>새로 조회</button></div>{busy && <p role="status">저장 중…</p>}{message && <p className={failed ? 'admin-error' : 'admin-success'} role={failed ? 'alert' : 'status'}>{message}</p>}</section><div className="admin-detail-grid"><section className="admin-card"><h2>요청 내용</h2><dl><dt>서비스</dt><dd>{services[row.service]}</dd><dt>설치 지역</dt><dd>{row.region}</dd><dt>예산</dt><dd>{row.budget || '미정'}</dd>{serviceGuides[row.service].fields.map(field => <div key={field.key}><dt>{field.label}</dt><dd>{requests[field.key] || '미입력'}</dd></div>)}<dt>{serviceGuides[row.service].detailsLabel}</dt><dd>{requests.details || '미입력'}</dd><dt>참고 사례</dt><dd>{reference ? <a href={'/portfolio/' + reference.slug} target="_blank" rel="noreferrer">{reference.title} ↗</a> : row.reference_slug || '선택 없음'}</dd></dl></section><section className="admin-card"><h2>고객 연락처</h2><dl><dt>이름 / 담당자</dt><dd>{row.customer_name}</dd><dt>전화번호</dt><dd>{row.phone}</dd></dl><p className="admin-muted">상담 목적으로만 이용하고 외부 공유·화면 캡처에 주의하세요.</p><h2>개인정보 동의 기록</h2><dl><dt>필수 동의</dt><dd>{row.consent === 1 ? '동의함' : '확인 필요'}</dd><dt>문구 버전</dt><dd>{row.consent_version}</dd><dt>동의 접수 시각</dt><dd>{date(row.created_at)}</dd>{Object.entries({ purpose: '목적', items: '항목', retention: '보유 기간', contact: '문의처' }).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{notice[key] || '기록 없음'}</dd></div>)}</dl></section></div><section className="admin-card"><h2>최근 상태 변경 이력</h2>{data.history.length ? <ul className="admin-history">{data.history.map((h, i) => <li key={i}>{statuses[h.previous_status]} → {statuses[h.next_status]}<small>{date(h.changed_at)} · {h.actor}</small></li>)}</ul> : <p className="admin-muted">변경 이력이 없습니다.</p>}</section></>;
}
