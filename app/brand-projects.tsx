import Image from 'next/image';
import type { CSSProperties } from 'react';
import BrandLogo from './brand-logo';
import { approvedBrandLogo, publicBrandProjects } from './brand-projects-data';
import styles from './brand-projects.module.css';

export default function BrandProjects() {
  const entries = publicBrandProjects();
  const brands = entries.filter(entry => entry.category !== 'media');
  const media = entries.filter(entry => entry.category === 'media' && entry.portfolio);
  if (!brands.length && !media.length) return null;

  return <section id="brand-projects" className={`section ${styles.section}`} aria-labelledby="brand-projects-title">
    <div className={styles.heading}>
      <p className="eyebrow">PROJECT REFERENCES</p>
      <h2 id="brand-projects-title">주요 설치·시공 실적</h2>
      <p className={styles.description}>기업부터 공공기관까지, 다양한 공간에서 이어온 조이플라워의 작업을 소개합니다.</p>
    </div>
    <ul className={styles.grid}>
      {brands.map(entry => {
        const showLogo = approvedBrandLogo(entry);
        const previewLogo = process.env.NODE_ENV === 'development' && entry.previewLogoFile;
        const logoSrc = showLogo ? entry.logoPath : previewLogo ? `/__brand-logo-preview/${entry.previewLogoFile}` : null;
        return <li key={entry.id}>
          <div className={styles.visual} style={{ '--logo-width': `${entry.visualWidth ?? 190}px` } as CSSProperties}>
            {logoSrc ? <BrandLogo name={entry.name} src={logoSrc} width={entry.logoWidth!} height={entry.logoHeight!}
              className={styles.logo} fallbackClassName={styles.name} /> : <span className={styles.name}>{entry.name}</span>}
          </div>
        </li>;
      })}
    </ul>
    {media.map(entry => {
      const project = entry.portfolio!;
      return <div className={styles.media} key={entry.id}>
        <div className={styles.mediaHeading}><p className="eyebrow">ON LOCATION</p><h3>방송·미디어 작업 실적</h3></div>
        <div className={styles.mediaCard}>
          <Image unoptimized src={project.image} alt={project.alt} width={project.width ?? 645} height={project.height ?? 879} loading="lazy" />
          <div><h4>{entry.name}</h4><p>{project.description}</p></div>
        </div>
      </div>;
    })}
  </section>;
}
