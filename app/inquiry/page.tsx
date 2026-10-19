import type {Metadata} from 'next';
import { pageMetadata } from '../../lib/seo';
import {Header,Footer} from '../site-parts';
import InquiryForm from './inquiry-form';
import { inquiryPageSettings } from '../../lib/inquiry-page-settings';
import { portfolioItems } from '../portfolio-data';
import { isService } from './service-fields';
import { company } from '../../lib/company';
export const dynamic = 'force-dynamic';
export const metadata:Metadata=pageMetadata({title:'견적문의 | 조이플라워',description:'희망 서비스와 지역, 일정, 예산을 정리하여 조이플라워 상담을 준비하세요.'}, '/inquiry');
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
export default async function Page({ searchParams }: Props) {
  const settings = await inquiryPageSettings();
  const params = await searchParams;
  const service = typeof params.service === 'string' ? params.service : null;
  const item = portfolioItems.find(item => item.slug === params.reference);
  const initialService = isService(service) ? service : (item?.category || 'christmas');
  const initialReference = item ? { name: item.name, service: item.category, slug: item.slug } : null;
  return <><Header /><main><section className="section inquiry-layout"><div>
    <p className="eyebrow">LET&apos;S TALK ABOUT YOUR SPACE</p>
    <h1>우리 공간에 맞는<br />견적을 준비해볼까요?</h1>
    <p className="lead">아는 정보만 적어주세요.<br />구체적인 구성은 상담으로 정하면 됩니다.</p>
    <div className="area-guide"><strong>전국 작업 가능</strong>
      <p>업체 주소: 대전 대덕구 선비마을로 170, 조이플라워</p><strong>상담 방법</strong>
      <p>{settings.enabled ? '문의 내용을 작성하고 접수해주세요. 저장이 완료되면 접수번호를 안내합니다.' : '현재 온라인 접수는 받지 않습니다. 전화 또는 카카오톡으로 상담해 주세요.'}</p>
      <p>대표자: {company.representative}</p>
      <a className="text-link" href={company.phoneHref}>전화 상담 {company.phone}</a>
      <p><a className="text-link" href={company.kakaoChatUrl} target="_blank" rel="noopener noreferrer">카카오톡 상담 (새 창)</a></p>
    </div>
  </div><InquiryForm settings={settings} initialService={initialService} initialReference={initialReference} /></section></main><Footer /></>;
}
