'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useId, useState } from 'react';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { portfolioCategories as categories, portfolioItems, sortPortfolioItems } from './portfolio-data';

const PAGE_SIZE = 6;

function Grid({ category, expandable = false, preview = false }: { category: string; expandable?: boolean; preview?: boolean }) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const gridId = useId();
  const items = sortPortfolioItems(portfolioItems.filter(item => category === 'all' || item.category === category));
  const visibleItems = preview ? items.slice(0, PAGE_SIZE) : expandable ? items.slice(0, visibleCount) : items;
  const hasMore = visibleItems.length < items.length;
  if (!items.length) {
    const label = categories.find(([id]) => id === category)?.[1] || '해당 서비스';
    return <div className="portfolio-empty">
      <p>{label} 사례 사진을 준비하고 있습니다.</p>
      <a className="text-link" href={'/inquiry?service=' + category}>관련 사례 상담하기</a>
    </div>;
  }

  return <>
  <div id={gridId} className={items.length === 2 ? 'project-grid project-grid-pair' : 'project-grid'}>
    {visibleItems.map(item => <a
      className="project-card"
      key={item.slug}
      href={'/portfolio/' + item.slug}
    >
      <div className="project-image"><Image unoptimized src={item.image} alt={item.alt} width={item.width ?? 645} height={item.height ?? 879} loading="lazy" /></div>
      <div className="project-caption">
        <p className="project-category">{item.categoryLabel}</p>
        <h3>{item.name}</h3>
        <p>{item.title}</p>
        <span className="project-detail">상세 보기</span>
      </div>
    </a>)}
  </div>
  {preview && hasMore && <div className="portfolio-load-more">
    <p>전체 {items.length}개 중 {visibleItems.length}개 사례</p>
    <Link prefetch={false} className="button" href="/portfolio">전체 포트폴리오 보기</Link>
  </div>}
  {!preview && expandable && items.length > PAGE_SIZE && <div className="portfolio-load-more">
    <p role="status">전체 {items.length}개 중 {visibleItems.length}개</p>
    <button
      type="button"
      className="button"
      aria-controls={gridId}
      aria-disabled={!hasMore}
      onClick={() => { if (hasMore) setVisibleCount(count => count + PAGE_SIZE); }}
    >{hasMore ? '더 보기' : '모든 사례를 확인했습니다'}</button>
  </div>}
  </>;
}

export default function PortfolioGrid({ service = 'all', filters = false, preview = false }: { service?: string; filters?: boolean; preview?: boolean }) {
  if (!filters) return <Grid category={service} preview={preview} expandable />;
  const initialCategory = categories.some(([id]) => id === service) ? service : 'christmas';
  return <Tabs defaultValue={initialCategory} className="portfolio-tabs">
    <TabsList className="portfolio-filter portfolio-filter-three" aria-label="포트폴리오 서비스 분류">
      {categories.map(([id, title]) => <TabsTrigger key={id} value={id}>{title}</TabsTrigger>)}
    </TabsList>
    {categories.map(([id]) => <TabsContent key={id} value={id}><Grid category={id} expandable /></TabsContent>)}
  </Tabs>;
}
