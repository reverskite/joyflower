import { portfolioItems, type PortfolioItem } from './portfolio-data.ts';

export type BrandProject = {
  id: string;
  name: string;
  category: 'company' | 'commercial' | 'research' | 'public' | 'media';
  logoPath: string | null;
  previewLogoFile?: string;
  logoWidth?: number;
  logoHeight?: number;
  visualWidth?: number;
  sourceUrl: string;
  usageStatus: 'approved' | 'pending' | 'unavailable';
  approvalReference?: string;
  logoIdentityVerified: boolean;
  projectVerified: boolean;
  projectEvidence: string;
  portfolioId?: string;
  displayPriority: number;
  isVisible: boolean;
  reviewNote: string;
};

// Approval evidence and confirmed project identity are independent requirements.
// Pending downloads stay in deployment/brand-logos/pending, outside public assets.
export const brandProjects: BrandProject[] = [
  {
    id: 'lg-energy-solution', name: 'LG에너지솔루션', category: 'company',
    logoPath: null, previewLogoFile: 'lg-energy-solution.svg', logoWidth: 353, logoHeight: 56, visualWidth: 210,
    sourceUrl: 'https://www.lgensol.com/kr/company/info-ci', usageStatus: 'pending',
    logoIdentityVerified: true, projectVerified: true,
    projectEvidence: '기존 lg-energy-solution 포트폴리오의 실내 트리 설치 사진·설명',
    portfolioId: 'lg-energy-solution', displayPriority: 10, isVisible: true,
    reviewNote: '공식 CI 안내가 사용 전 사전 협의를 요구함. 홈페이지 실적 소개용 승인 필요.',
  },
  {
    id: 'oci', name: 'OCI', category: 'company',
    logoPath: null, previewLogoFile: 'oci.jpg', logoWidth: 374, logoHeight: 193, visualWidth: 106,
    sourceUrl: 'https://www.oci.co.kr/company/ci', usageStatus: 'pending',
    logoIdentityVerified: false, projectVerified: true,
    projectEvidence: '운영자 제공 OCI본사 사진 및 기존 oci-headquarters 설명',
    portfolioId: 'oci-headquarters', displayPriority: 20, isVisible: true,
    reviewNote: 'OCI본사 작업은 등록되어 있으나 대상 법인이 OCI 주식회사인지 OCI홀딩스인지 확인 필요. 다운로드는 OCI 주식회사 워드마크.',
  },
  {
    id: 'ak-plaza', name: 'AK PLAZA', category: 'commercial',
    logoPath: null, previewLogoFile: 'ak-plaza.svg', logoWidth: 249.47, logoHeight: 32.251, visualWidth: 185,
    sourceUrl: 'https://www.akplaza.com/etc/company/identity', usageStatus: 'pending',
    logoIdentityVerified: false, projectVerified: true,
    projectEvidence: '운영자가 세종 AK플라자로 등록한 sejong-ak-plaza 사진·설명',
    portfolioId: 'sejong-ak-plaza', displayPriority: 30, isVisible: true,
    reviewNote: '설치 지점은 기존 자료상 세종. 사진의 AK& 표기와 현재 AK PLAZA CI의 사용 적합성 및 홍보용 승인 확인 필요.',
  },
  {
    id: 'anook', name: '아늑', category: 'commercial', logoPath: null,
    sourceUrl: 'https://anookhotel.com/', usageStatus: 'unavailable',
    logoIdentityVerified: false, projectVerified: false, projectEvidence: '',
    displayPriority: 40, isVisible: false,
    reviewNote: '정확한 브랜드·설치 지점 및 작업 자료 미확인. 기존 낙원온천 호텔과 임의로 연결하지 않음. 독립된 공식 CI 다운로드 미확보.',
  },
  {
    id: 'kaist', name: 'KAIST', category: 'research',
    logoPath: null, logoWidth: 396, logoHeight: 110, visualWidth: 165,
    sourceUrl: 'https://pr.kaist.ac.kr/kr/html/kaist/010401.html', usageStatus: 'pending',
    logoIdentityVerified: true, projectVerified: false, projectEvidence: '',
    displayPriority: 50, isVisible: false,
    reviewNote: '등록된 시공사례 없음. 공식 UI 안내에서 상업적 사용을 제한하므로 별도 허가 필요.',
  },
  {
    id: 'kaeri', name: '한국원자력연구원', category: 'research',
    logoPath: null, logoWidth: 374, logoHeight: 104, visualWidth: 200,
    sourceUrl: 'https://www.kaeri.re.kr/board?menuId=MENU00342', usageStatus: 'pending',
    logoIdentityVerified: true, projectVerified: false, projectEvidence: '',
    displayPriority: 60, isVisible: false,
    reviewNote: '현재 등록된 warm-christmas는 한국천문연구원으로 정정된 사례이며 이 기관의 증빙으로 재사용하지 않음. 별도 작업 자료 및 로고 사용 조건 확인 필요.',
  },
  {
    id: 'kari', name: '한국항공우주연구원', category: 'research',
    logoPath: null, logoWidth: 443, logoHeight: 112, visualWidth: 205,
    sourceUrl: 'https://kari.re.kr/kor/contents/92', usageStatus: 'pending',
    logoIdentityVerified: true, projectVerified: false, projectEvidence: '',
    displayPriority: 70, isVisible: false,
    reviewNote: '등록된 시공사례 없음. 작업 자료와 홈페이지 홍보용 로고 사용 조건 확인 필요.',
  },
  {
    id: 'kipo', name: '특허청', category: 'public', logoPath: null,
    sourceUrl: 'https://www.kipo.go.kr/ko/MainApp.do', usageStatus: 'unavailable',
    logoIdentityVerified: false, projectVerified: true,
    projectEvidence: '운영자 제공 사진 및 korean-patent-office 라운지 트리 사례',
    portfolioId: 'korean-patent-office', displayPriority: 80, isVisible: true,
    reviewNote: '현 공식 홈페이지는 지식재산처 로고를 사용. 기존 특허청 실적을 다른 기관명·로고로 임의 변경하지 않음. 작업 당시 표장과 사용 승인 확인 필요.',
  },
  {
    id: 'daejeon-police', name: '대전경찰청', category: 'public',
    logoPath: null, logoWidth: 200, logoHeight: 43, visualWidth: 180,
    sourceUrl: 'https://www.djpolice.go.kr/', usageStatus: 'pending',
    logoIdentityVerified: true, projectVerified: false, projectEvidence: '',
    displayPriority: 90, isVisible: false,
    reviewNote: '대전경찰청 공식 사이트 OG 이미지 확보. 저해상도 JPG이므로 승인 시 고해상도 투명 원본 요청 권장. 실제 작업 자료 및 사용 승인 필요.',
  },
  {
    id: 'sejong-government', name: '정부세종청사', category: 'public',
    logoPath: null, logoWidth: 215, logoHeight: 56, visualWidth: 200,
    sourceUrl: 'https://www.gbmo.go.kr/chungsa/cm/cntnts/cntntsView.do?mi=1088&cntntsId=1012', usageStatus: 'pending',
    logoIdentityVerified: false, projectVerified: false, projectEvidence: '',
    displayPriority: 100, isVisible: false,
    reviewNote: '확보한 MI는 정부청사관리본부이며 정부세종청사 입주기관 전체를 대표하는 시공 증빙이 아님. 정확한 설치 기관·장소·범위 및 사용 승인 확인 필요.',
  },
  {
    id: 'jinxed-at-first', name: '드라마 「징크스의 연인」', category: 'media',
    logoPath: null, sourceUrl: '', usageStatus: 'unavailable',
    logoIdentityVerified: false, projectVerified: true,
    projectEvidence: '기존 jinxed-at-first-set 사진·설명에 촬영장 야외 크리스마스트리 설치가 명시됨',
    portfolioId: 'jinxed-at-first-set', displayPriority: 110, isVisible: true,
    reviewNote: '기존 사진과 기록된 작업 범위만 소개. 방송사·제작사 로고, 포스터, 제휴·추천 주장은 사용하지 않음.',
  },
];

export function publicBrandProjects(entries: readonly BrandProject[] = brandProjects, projects: readonly PortfolioItem[] = portfolioItems) {
  return entries.filter(entry => entry.isVisible && entry.projectVerified && entry.projectEvidence.trim())
    .slice().sort((a, b) => a.displayPriority - b.displayPriority)
    .map(entry => ({ ...entry, portfolio: projects.find(project => project.slug === entry.portfolioId) }));
}

export function approvedBrandLogo(entry: BrandProject) {
  return entry.projectVerified && entry.isVisible && Boolean(entry.projectEvidence.trim()) &&
    entry.logoIdentityVerified && entry.usageStatus === 'approved' && Boolean(entry.approvalReference?.trim()) &&
    Boolean(entry.sourceUrl) && /^\/brand-logos\/[a-z0-9-]+\.(svg|png|jpg|webp)$/.test(entry.logoPath ?? '') &&
    Number.isFinite(entry.logoWidth) && (entry.logoWidth ?? 0) > 0 &&
    Number.isFinite(entry.logoHeight) && (entry.logoHeight ?? 0) > 0;
}
