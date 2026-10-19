import { Header, Footer } from '../site-parts';
import { pageMetadata } from '../../lib/seo';
import { inquiryPageSettings } from '../../lib/inquiry-page-settings';
import { inquiryPrivacy } from '../../lib/inquiry-privacy.mjs';

export const dynamic = 'force-dynamic';
export const metadata = {
  ...pageMetadata({ title: '개인정보 처리방침 | 조이플라워', description: '조이플라워 온라인 견적 접수의 개인정보 처리 안내입니다.' }, '/privacy'),
  robots: { index: false, follow: true },
};

export default async function PrivacyPage() {
  const settings = await inquiryPageSettings();
  return <><Header /><main className="section privacy-page">
    <p className="eyebrow">PRIVACY</p><h1>개인정보 처리방침</h1>
    {!settings.enabled && <p className="lead">온라인 접수 준비 중인 안내입니다. 관리자 인증과 개인정보 보호 절차를 점검하는 동안 온라인 접수를 받지 않습니다.</p>}
    {settings.localTest && <p className="lead">로컬 개발 테스트 전용 안내입니다. 실제 고객 정보를 입력하지 마세요.</p>}
    <p>개인정보 처리 주체: 조이플라워 · 대전 대덕구 선비마을로 170</p>
    <h2>수집 목적과 항목</h2><p>목적: {settings.purpose}</p><p>수집 항목: {settings.items}</p>
    <p>주민등록번호, 결제 정보와 사진 파일은 이 양식으로 수집하지 않습니다. 요청사항에 상담에 불필요한 개인정보를 적지 마세요.</p>
    <h2>보유 기간과 파기</h2><p>{settings.retention || inquiryPrivacy.retention}</p>
    <p>운영 전 담당자는 DB와 백업을 포함한 보관 범위, 파기 방법과 일정을 확정해야 합니다.</p>
    <h2>동의와 권리 행사</h2><p>동의를 거부할 수 있으며, 필수 동의를 거부하면 온라인 견적 접수를 이용할 수 없습니다. 개인정보 열람·정정·삭제·처리 정지 및 동의 철회는 아래 문의처로 요청하실 수 있습니다. 요청 처리 시 본인 확인 방법은 운영 전 확정해야 합니다.</p>
    <h2>접근 제한과 부정 접수 방지</h2><p>접수 내용은 홈페이지에서 공개 조회할 수 없습니다. 원문 IP 주소는 접수 DB에 저장하지 않고, IP와 전화번호에서 만든 HMAC 식별값을 요청 빈도 제한에 사용합니다. 요청 제한 식별값은 최대 30분간 유효하며, 만료 항목은 다음 접수 요청 시 정리합니다. 같은 접수 내용의 중복 확인용 식별값은 접수 기록과 함께 보관합니다.</p>
    <p>이 사이트는 접수 정보를 브라우저 저장소에 자동 저장하지 않습니다. 입력 내용은 제출 시에만 전송됩니다.</p>
    <h2>처리 위탁·국외 처리 및 외부 알림</h2><p>Cloudflare Worker와 D1을 사용하는 기술 구조입니다. 실제 운영 계약에 따른 처리 위탁·국외 처리 여부, 저장 위치와 고지 사항은 운영 전 확인하여 반영해야 합니다. 현재 외부 이메일이나 메신저로 접수 정보를 발송하지 않습니다.</p>
    <h2>개인정보 문의처</h2><p>{settings.contact || inquiryPrivacy.contact}</p>
    <p>안내 버전: {settings.version || inquiryPrivacy.version}</p><a className="text-link" href="/inquiry">견적문의로 돌아가기</a>
  </main><Footer /></>;
}
