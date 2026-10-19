import type { PortfolioItem } from './portfolio-data';
import { relatedPortfolioItems } from './portfolio-data';

export default function PortfolioRelated({ item }: { item: PortfolioItem }) {
  const related = relatedPortfolioItems(item);
  if (!related.length) return null;
  return <section className="section case-related" aria-labelledby="case-related-title">
    <h2 id="case-related-title">함께 살펴볼 포트폴리오</h2>
    <ul>{related.map(project => <li key={project.slug}>
      <a className="text-link" href={`/portfolio/${project.slug}`}>{project.name}</a>
    </li>)}</ul>
  </section>;
}
