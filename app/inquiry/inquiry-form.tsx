'use client';

import { useRef, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { isService, serviceGuides, services, type Service } from './service-fields';
import type { InquirySettings } from '../../lib/inquiry-settings';
import { company } from '../../lib/company';
import { inquiryPrivacy } from '../../lib/inquiry-privacy.mjs';
import InquiryChallenge from './inquiry-challenge';

type Reference = { name: string; service: string; slug: string } | null;
export default function InquiryForm({ settings, initialService, initialReference }: { settings: InquirySettings; initialService: Service; initialReference: Reference }) {
  const [service, setService] = useState<Service>(initialService);
  const reference = initialReference;
  const [common, setCommon] = useState({ region: '', budget: '' });
  const [drafts, setDrafts] = useState<Record<Service, Record<string, string>>>({
    christmas: {}, planterior: {}, landscape: {},
  });
  const [copied, setCopied] = useState('');
  const [prepared, setPrepared] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [receiptId, setReceiptId] = useState('');
  const [error, setError] = useState('');
  const [challengeToken, setChallengeToken] = useState('');
  const [challengeError, setChallengeError] = useState('');
  const [challengeReset, setChallengeReset] = useState(0);
  const locked = useRef(false);
  const sent = useRef(false);
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  const disabled = submitting || !!receiptId;

  const guide = serviceGuides[service];
  const fields = drafts[service];
  const activeReference = reference?.service === service ? reference.name : '';
  const text = [
    '[조이플라워 견적 문의]',
    '서비스: ' + services[service],
    '지역: ' + (common.region.trim() || '상담 시 전달'),
    ...guide.fields.map(field => field.label + ': ' + (fields[field.key]?.trim() || '상담 희망')),
    '예산: ' + (common.budget.trim() || '상담 희망'),
    activeReference ? '참고 포트폴리오: ' + activeReference : '',
    guide.detailsLabel + ': ' + (fields.details?.trim() || '상담 희망'),
    '현장 사진: 상담 채널에서 별도 전달 예정',
  ].filter(Boolean).join('\n');

  function resetResult() {
    setPrepared(false);
    setCopied('');
  }

  function update(key: string, value: string) {
    setDrafts(previous => ({ ...previous, [service]: { ...previous[service], [key]: value } }));
    resetResult();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied('문의 내용을 복사했습니다. 상담 채널에 붙여넣어 전달해주세요.');
    } catch {
      setCopied('자동 복사가 어려워요. 아래 문의 내용을 선택해 직접 복사해주세요.');
    }
  }

  async function submit() {
    if (locked.current || sent.current || !settings.enabled) return;
    if (settings.turnstileSiteKey && !challengeToken) {
      setChallengeError('자동 접수 방지 확인을 완료해주세요.');
      return;
    }
    locked.current = true;
    setSubmitting(true);
    setError('');
    try {
      const payload = JSON.stringify({ service, region: common.region, budget: common.budget,
        requests: fields, reference: activeReference ? reference?.slug : undefined,
        customerName, phone, consent, consentVersion: settings.version, website });
      if (attempt.current?.payload !== payload) attempt.current = { payload, key: crypto.randomUUID() };
      const response = await fetch('/api/inquiries', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': attempt.current.key },
        // The short-lived challenge is excluded from the business idempotency key.
        body: JSON.stringify({ ...JSON.parse(payload), ...(settings.turnstileSiteKey ? { turnstileToken: challengeToken } : {}) }),
        signal: AbortSignal.timeout(20_000),
      });
      const result = await response.json();
      if (!response.ok || !result || typeof result !== 'object' || !('receiptId' in result) || typeof result.receiptId !== 'string') {
        setError(result && typeof result === 'object' && 'error' in result && typeof result.error === 'string' ? result.error : '접수를 완료하지 못했습니다. 다시 시도해주세요.');
        return;
      }
      sent.current = true;
      setReceiptId(result.receiptId);
    } catch {
      setError('접수 결과를 확인하지 못했습니다. 입력 내용은 유지됩니다. 다시 제출하면 중복 접수를 확인합니다.');
    } finally {
      if (settings.turnstileSiteKey) { setChallengeToken(''); setChallengeReset(value => value + 1); }
      locked.current = false;
      setSubmitting(false);
    }
  }

  return <form className="inquiry-form" onSubmit={event => {
    event.preventDefault();
    void submit();
  }}>
    <label id="service-label">희망 서비스</label>
    <Select disabled={disabled} value={service} onValueChange={value => {
      if (!isService(value)) return;
      setService(value);
      resetResult();
    }}>
      <SelectTrigger aria-labelledby="service-label" className="service-select"><SelectValue /></SelectTrigger>
      <SelectContent className="select-panel">{Object.entries(services).map(([id, title]) => <SelectItem key={id} value={id}>{title}</SelectItem>)}</SelectContent>
    </Select>
    <p className="inquiry-help">지역과 연락처를 입력해주세요. 문의 내용과 상세 조건은 아는 만큼만 적으셔도 됩니다.</p>
    <div className="form-grid">
      <label>현장 지역 <span>(필수)</span><input disabled={disabled} required pattern={'.*\\S.*'} title="현장 지역을 입력해주세요." maxLength={100} value={common.region} onChange={event => {
        setCommon(previous => ({ ...previous, region: event.target.value }));
        resetResult();
      }} placeholder="예: 대전 유성구" autoComplete="address-level2" /></label>
    </div>
    <div className="form-grid inquiry-customer-fields">
      <label>이름 또는 담당자명 <span>(필수)</span><input disabled={disabled} required maxLength={60} value={customerName} onChange={event => setCustomerName(event.target.value)} autoComplete="name" /></label>
      <label>연락받을 전화번호 <span>(필수)</span><input disabled={disabled} required type="tel" inputMode="tel" maxLength={30} value={phone} onChange={event => setPhone(event.target.value)} autoComplete="tel" placeholder="연락 가능한 전화번호" /></label>
    </div>
    <label>문의 내용 <span>(선택)</span><textarea disabled={disabled} rows={3} maxLength={2000} value={fields.details || ''} onChange={event => update('details', event.target.value)} placeholder={guide.detailsPlaceholder} /></label>
    {activeReference && <p className="reference-note">선택한 사례: {activeReference}</p>}
    <details className="inquiry-extra">
      <summary>상세 조건 추가 <span>(선택)</span></summary>
      <p className="inquiry-help">규모·일정·예산을 알려주시면 상담에 도움이 됩니다. 접어도 입력한 내용은 유지됩니다.</p>
      <fieldset className="inquiry-service-fields">
        <legend aria-live="polite">{guide.legend}</legend>
        <div className="form-grid">{guide.fields.map(field => <label key={service + '-' + field.key}>{field.label}
          <input disabled={disabled} maxLength={200} value={fields[field.key] || ''} onChange={event => update(field.key, event.target.value)} placeholder={field.placeholder} />
        </label>)}</div>
        <label>예산<input disabled={disabled} maxLength={100} value={common.budget} onChange={event => {
          setCommon(previous => ({ ...previous, budget: event.target.value }));
          resetResult();
        }} placeholder="미정이면 ‘상담 희망’" /></label>
      </fieldset>
      <div className="photo-advice"><strong>현장 사진도 함께 준비해주세요.</strong><p>{guide.photoAdvice} 실제 상담 채널에서 함께 보내주세요.</p></div>
    </details>
    <div className="inquiry-honeypot" aria-hidden="true"><label>Website<input tabIndex={-1} autoComplete="off" value={website} onChange={event => setWebsite(event.target.value)} /></label></div>
    <div className="inquiry-consent">
      <p><strong>개인정보 수집·이용 안내</strong></p>
      <dl><div><dt>목적</dt><dd>{settings.purpose}</dd></div><div><dt>항목</dt><dd>{settings.items}</dd></div><div><dt>보유 기간</dt><dd>{settings.retention || inquiryPrivacy.retention}</dd></div><div><dt>문의처</dt><dd>{settings.contact || inquiryPrivacy.contact}</dd></div></dl>
      <p>동의를 거부할 수 있으며, 필수 동의 없이는 온라인 견적을 접수할 수 없습니다. <a className="text-link" href="/privacy" target="_blank" rel="noopener noreferrer">개인정보 처리방침 보기</a></p>
      {settings.localTest && <p role="note">로컬 테스트 모드입니다. 실제 고객 정보를 입력하지 마세요.</p>}
      <label className="inquiry-consent-check"><input disabled={disabled || !settings.enabled} type="checkbox" required checked={consent} onChange={event => setConsent(event.target.checked)} /><span>개인정보 수집·이용에 동의합니다. (필수)</span></label>
    </div>
    <p className="form-notice">{settings.enabled?'접수 버튼을 누르면 입력 내용이 서버에 저장됩니다. 저장 성공 시에만 접수번호를 표시합니다.':'현재 온라인 접수는 받지 않습니다. 작성한 내용은 서버에 저장되지 않습니다. 문의 내용을 정리·복사한 뒤 전화 또는 카카오톡으로 직접 상담해 주세요.'}</p>
    {settings.enabled && settings.turnstileSiteKey && <InquiryChallenge siteKey={settings.turnstileSiteKey}
      resetCount={challengeReset} onToken={setChallengeToken} onError={setChallengeError} />}
    {challengeError && <p className="inquiry-error" role="alert">{challengeError}</p>}
    <button className="button gold" type="submit" disabled={!settings.enabled || disabled || (!!settings.turnstileSiteKey && !challengeToken)}>{!settings.enabled?'온라인 접수 준비 중':submitting?'접수 중…':receiptId?'접수 완료':'견적 접수하기'}</button>
    {error && <p className="inquiry-error" role="alert">{error}</p>}
    {receiptId && <div className="inquiry-result" role="status"><h2>견적이 접수되었습니다.</h2><p>접수번호: <strong className="inquiry-receipt">{receiptId}</strong></p><p>입력하신 연락처로 상담을 진행합니다. 접수번호를 별도로 보관해주세요.</p></div>}
    <details className="inquiry-alternative">
    <summary>직접 전달할 문의 내용 준비</summary>
    <p>온라인 접수 대신 상담 연락처로 직접 전달할 때 이용해주세요. 여기서 내용을 만드는 것만으로는 접수되지 않습니다.</p>
    <button className="button outline inquiry-copy-prepare" type="button" disabled={submitting} onClick={() => { setPrepared(true); setCopied(''); }}>문의 내용 만들기</button>
    {prepared && <div className="inquiry-result">
      <h2>전달할 문의 내용</h2>
      <textarea readOnly value={text} rows={12} aria-label="복사할 문의 내용" onFocus={event => event.target.select()} />
      <button className="button outline" type="button" onClick={copy}>문의 내용 복사</button>
      <p role="status">{copied || '내용을 복사한 뒤 카카오톡 상담에 붙여넣어 전달해주세요.'}</p>
      <p><a className="text-link" href={company.kakaoChatUrl} target="_blank" rel="noopener noreferrer">카카오톡으로 문의하기 (새 창)</a></p>
      <a className="text-link" href={company.phoneHref}>전화 상담 {company.phone}</a>
    </div>}
    </details>
  </form>;
}
