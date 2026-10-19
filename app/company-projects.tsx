import Link from 'next/link';
import { portfolioItems } from './portfolio-data';
import { company } from '../lib/company';

const featuredSlugs = [
  'oci-headquarters',
  'seoul-jung-gu-office',
  'penthouse-planterior',
  'library-planterior',
];

export default function CompanyProjects() {
  const projects = featuredSlugs.flatMap(slug => {
    const item = portfolioItems.find(project => project.slug === slug);
    return item ? [item] : [];
  });

  return <div className="company-projects">
    <dl className="company-contact-info">
      <div><dt>대표자</dt><dd>{company.representative}</dd></div>
      <div><dt>전화 상담</dt><dd><a href={company.phoneHref}>{company.phone}</a></dd></div>
    </dl>
    <h3>현장으로 만나는 조이플라워</h3>
    <p>기업 로비부터 공공시설과 생활공간까지, 현장별 연출을 살펴보세요.</p>
    <ul>{projects.map(item => <li key={item.slug}>
      <Link prefetch={false} href={`/portfolio/${item.slug}`}>
        <span>{item.categoryLabel}</span>
        <strong>{item.name}</strong>
        <span className="company-project-space">{item.space}</span>
        <span className="company-project-link">사례 보기 <span aria-hidden="true">↗</span></span>
      </Link>
    </li>)}</ul>
  </div>;
}
