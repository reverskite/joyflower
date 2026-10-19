import type { Metadata } from 'next';
import { pageMetadata } from '../../lib/seo';
import {Header,Footer,Contact} from '../site-parts';
import {Portfolio} from '../portfolio-parts';
import { portfolioItems, sortPortfolioItems } from '../portfolio-data';
export const metadata:Metadata=pageMetadata({title:'포트폴리오 | 조이플라워',description:'조이플라워 공간 연출 사진과 서비스별 현장 이야기를 확인하세요.'}, '/portfolio');
export default function Page() {
  return <>
    <Header />
    <main className="portfolio-index">
      <div className="page-intro">
        <p className="eyebrow">JOY FLOWER PORTFOLIO</p>
        <h1>공간을 빛낸 순간들</h1>
        <p>조이플라워의 설치 사진과 기관별 포트폴리오를 만나보세요.</p>
      </div>
      <Portfolio filters showLink={false} showHeading={false}>
        {/* Native disclosure keeps every link in server HTML and works without JavaScript. */}
        <details className="portfolio-directory">
          <summary><span>전체 시공사례 보기 <span className="portfolio-directory-count">({portfolioItems.length})</span></span></summary>
          <nav aria-label="전체 시공사례">
            <ul>
              {sortPortfolioItems().map(item => <li key={item.slug}>
                <a href={`/portfolio/${item.slug}`}>{item.name}</a>
              </li>)}
            </ul>
          </nav>
        </details>
      </Portfolio>
      <Contact />
    </main>
    <Footer />
  </>;
}
