import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Header, Footer } from '../../site-parts';
import { portfolioItems, portfolioSeo } from '../../portfolio-data';
import { pageMetadata } from '../../../lib/seo';
import PortfolioRelated from '../../portfolio-related';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return portfolioItems.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const item = portfolioItems.find(item => item.slug === slug);
  return item ? pageMetadata(portfolioSeo(item), `/portfolio/${item.slug}`) : {};
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const item = portfolioItems.find(item => item.slug === slug);
  if (!item) notFound();
  const detail = item.detail;
  const Breadcrumb = detail ? 'div' : 'nav';

  return <>
    <Header />
    <main>
      <Breadcrumb className="breadcrumb" aria-label={detail ? undefined : '현재 위치'}>
        <Link prefetch={false} href="/">홈</Link><span>/</span><Link prefetch={false} href="/portfolio">포트폴리오</Link><span>/</span><span aria-current={detail ? undefined : 'page'}>{item.name}</span>
      </Breadcrumb>
      <section className="case-layout section">
        <div className={detail ? 'case-photo' : 'case-photo case-primary-photo'}>
          <Image unoptimized src={item.image} alt={detail?.alt ?? item.alt} width={item.width ?? 645} height={item.height ?? 879} fetchPriority={detail ? undefined : 'high'} loading="eager" />
          {detail && <p>{detail.caption}</p>}
        </div>
        <div className="case-info">
          <p className="eyebrow">{detail?.eyebrow ?? (item.category === 'christmas' ? 'CHRISTMAS COLLECTION' : item.category === 'planterior' ? 'PLANTERIOR COLLECTION' : 'LANDSCAPE COLLECTION')}</p>
          <h1>{item.name}</h1>
          <p className="lead">{detail ? detail.lead.map((line, index) => <span key={index}>{index > 0 && <br />}{line}</span>) : item.description}</p>
          <dl>
            {!detail && <div><dt>서비스</dt><dd>{item.categoryLabel}</dd></div>}
            <div><dt>공간</dt><dd>{detail?.space ?? item.space}</dd></div>
            {item.region && <div><dt>지역</dt><dd>{item.region}</dd></div>}
            {item.lighting && <div><dt>조명</dt><dd>{item.lighting}</dd></div>}
            <div><dt>{item.category === 'christmas' ? '장식' : '연출 구성'}</dt><dd>{detail?.decorations ?? item.decorations}</dd></div>
          </dl>
          {item.detailDescription?.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          <p>{detail?.consultationNote ?? (item.category === 'christmas'
            ? '사진 속 스타일을 참고해 상담하실 수 있습니다. 트리 규격과 장식 구성, 대여 일정 및 현장 조건에 따라 제공 범위가 달라집니다.'
            : '사진 속 스타일을 참고해 상담하실 수 있습니다. 공간의 치수와 설치 환경, 원하는 소재와 구성에 따라 작업 범위를 협의합니다.')}</p>
          <a className="button gold" href={`/inquiry?service=${item.category}&reference=${item.slug}`}>{detail?.inquiryLabel ?? '이 스타일로 견적 문의하기'}</a>
          <Link prefetch={false} className="back-link" href="/portfolio">포트폴리오 목록으로</Link>
        </div>
      </section>
      {item.gallery && item.gallery.length > 0 && <section className="section case-gallery" aria-labelledby="case-gallery-title">
        <div className="section-heading"><div><p className="eyebrow">A CLOSER LOOK</p><h2 id="case-gallery-title">공간 속 디테일</h2></div><p>같은 현장의 다른 구도와 세부 연출을 살펴보세요.</p></div>
        <div className="case-gallery-grid">{item.gallery.map(photo => <figure key={photo.image}>
          <Image unoptimized src={photo.image} alt={photo.alt} width={photo.width} height={photo.height} loading="lazy" />
          <figcaption>{photo.caption}</figcaption>
        </figure>)}</div>
      </section>}
      <PortfolioRelated item={item} />
    </main>
    <Footer />
  </>;
}
