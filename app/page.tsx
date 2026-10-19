import Image from 'next/image';
import Link from 'next/link';
import {Portfolio,Workflow,About} from "./portfolio-parts";
import { Header, Footer, Contact } from "./site-parts";
import { homeSeo, pageMetadata } from '../lib/seo';
export const metadata = pageMetadata(homeSeo, '/');
export default function Home() {
 return <>
  <Header/>
  <main id="home">
   <section className="season-hero"><div className="season-copy"><p className="eyebrow">대전 기반 공간 연출·조경관리</p><h1 className="brand-headline">조이플라워</h1><p className="season-script" aria-hidden="true">Joy in every space.</p><p className="brand-tagline">계절을 디자인하고,<br/>일상에 초록을 더합니다.</p><p className="season-description">크리스마스 트리 대여부터<br/>조화 플랜테리어, 조경관리까지.<br/>대전에서, 세종을 비롯한 전국으로.</p><div className="hero-actions"><Link prefetch={false} className="button gold" href="/portfolio">포트폴리오</Link><a className="text-link" href="/inquiry">견적문의</a></div><div className="season-footnote">전국 공간 연출·조경관리 상담<span>CHRISTMAS · PLANTERIOR · LANDSCAPE</span></div></div><div className="season-image"><Image unoptimized src="/hero.webp" width={1672} height={941} loading="eager" alt="조이플라워 크리스마스 트리의 배경을 확장한 연출 이미지" fetchPriority="high"/><div className="hero-image-caption"><span>SEASONAL HIGHLIGHT</span><strong>빛으로 기억되는 공간</strong><small>배경을 확장한 연출 이미지</small></div></div></section>
<div className="service-ribbon"><span>JOY FLOWER</span><a href="/christmas">크리스마스 트리 대여</a><i>✦</i><a href="/planterior">조화 플랜테리어</a><i>✦</i><a href="/landscape">조경관리</a><span>전국 작업 가능</span></div>
   <section id="service" className="section service"><div className="section-heading"><div><p className="eyebrow">THREE WAYS TO BRING JOY</p><h2>공간을 꾸미고 가꾸는<br/>세 가지 서비스</h2></div><p>계절을 빛내는 트리, 공간을 채우는 조화,<br/>초록을 가꾸는 조경관리.</p></div><div className="service-grid service-links">{[['01','크리스마스 트리 대여','특별한 연말을 위한 트리와 장식. 원하는 분위기와 일정에 맞춰 상담해보세요.','christmas','CHRISTMAS RENTAL'],['02','조화 플랜테리어','조화와 인조식물로 완성하는 공간 연출. 공간의 용도와 분위기부터 함께 살펴봅니다.','planterior','ARTIFICIAL PLANT INTERIOR'],['03','조경관리','공간의 초록을 오래 즐길 수 있도록. 현장 상태와 필요한 관리 범위를 상담합니다.','landscape','LANDSCAPE CARE']].map(([n,t,d,id,en])=><a href={'/'+id} key={n}><span className="number">{n}</span><h3>{t}</h3><p>{d}</p><span className="service-caption">{en}</span><span className="service-more">자세히 보기</span></a>)}</div></section>
<Portfolio filters/><Workflow/><About/>   <section className="section faq"><p className="eyebrow">GOOD TO KNOW</p><h2>상담 전, 궁금한 점</h2><div className="faq-list"><details><summary>서비스 비용은 어떻게 확인하나요?</summary><p>서비스 종류, 작업 범위, 현장 조건과 일정에 맞는 견적을 문의해주세요. 자재비·운송비·작업비와 부가세 포함 여부도 함께 확인해주세요.</p></details><details><summary>우리 지역도 상담 가능한가요?</summary><p>대전 기반으로 세종을 비롯한 전국 현장을 상담합니다. 현장 주소와 원하는 서비스를 알려주시면 작업 가능 범위와 일정, 운송 조건을 안내드립니다.</p></details><details><summary>사진과 같은 트리를 대여할 수 있나요?</summary><p>사진을 참고하여 원하는 스타일을 알려주세요. 실제 대여 가능한 규격과 장식 구성, 해당 일정의 재고는 별도 확인이 필요합니다.</p></details></div></section>
<Contact/>
  </main><Footer/>
 </>;
}
