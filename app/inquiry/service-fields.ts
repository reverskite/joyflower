export const services = {
  christmas: '크리스마스 트리 대여',
  planterior: '조화 플랜테리어',
  landscape: '조경관리',
};

export type Service = keyof typeof services;
type Field = { key: string; label: string; placeholder: string };
type Guide = { legend: string; fields: Field[]; detailsLabel: string; detailsPlaceholder: string; photoAdvice: string };

export const serviceGuides: Record<Service, Guide> = {
  christmas: {
    legend: '트리 대여 상담 정보',
    fields: [
      { key: 'space', label: '설치 공간·규모', placeholder: '예: 실내 로비, 천장 높이 3m' },
      { key: 'height', label: '희망 트리 높이', placeholder: '예: 2m 정도 / 크기 상담 희망' },
      { key: 'quantity', label: '희망 수량', placeholder: '예: 메인 트리 1개, 작은 트리 2개' },
      { key: 'installDate', label: '희망 설치일', placeholder: '예: 11월 말 / 일정 협의' },
      { key: 'removeDate', label: '희망 철거일', placeholder: '예: 1월 초 / 일정 협의' },
    ],
    detailsLabel: '원하는 장식·스타일',
    detailsPlaceholder: '예: 따뜻한 골드 조명, 레드·골드 장식, 선물 상자. 원하는 분위기와 반입·작업 시간 등도 알려주세요.',
    photoAdvice: '설치할 자리의 전체 사진과 천장·전원 위치, 반입 동선이 보이는 사진을 준비해주세요.',
  },
  planterior: {
    legend: '조화 플랜테리어 상담 정보',
    fields: [
      { key: 'space', label: '공간 용도·설치 위치', placeholder: '예: 카페 입구, 사무실 로비' },
      { key: 'dimensions', label: '꾸밀 공간의 치수', placeholder: '예: 가로 3m × 세로 1m, 높이 2m' },
      { key: 'method', label: '희망 배치·설치 방식', placeholder: '예: 화분 배치, 벽면 장식 / 상담 희망' },
      { key: 'workDate', label: '희망 작업일', placeholder: '예: 매장 오픈 전 / 날짜 협의' },
    ],
    detailsLabel: '원하는 소재·분위기',
    detailsPlaceholder: '예: 자연스러운 초록 식물, 꽃을 활용한 포인트. 참고 이미지와 원하는 색감, 고정 설치가 가능한 위치를 알려주세요.',
    photoAdvice: '공간 전체와 꾸밀 위치의 가까운 사진, 벽·바닥 등 설치면 상태가 보이는 사진을 준비해주세요.',
  },
  landscape: {
    legend: '조경관리 상담 정보',
    fields: [
      { key: 'space', label: '관리할 공간', placeholder: '예: 건물 외부 화단, 실내 식재 구역' },
      { key: 'area', label: '대략적인 관리 면적', placeholder: '예: 약 30㎡ / 면적 확인 필요' },
      { key: 'condition', label: '식물과 현장의 현재 상태', placeholder: '예: 가지가 무성함, 잡초 정리가 필요함' },
      { key: 'frequency', label: '희망 관리 방식·주기', placeholder: '예: 일회성 정비 / 월 1회 정기관리 희망' },
      { key: 'workDate', label: '희망 방문일', placeholder: '예: 다음 달 첫째 주 / 일정 협의' },
    ],
    detailsLabel: '필요한 관리 작업·요청사항',
    detailsPlaceholder: '관리할 식물의 종류·수량, 우선 해결하고 싶은 부분, 부산물 처리 필요 여부와 작업 가능 시간을 알려주세요.',
    photoAdvice: '관리 구역 전체와 식물 상태, 정리가 필요한 부분을 가까이 촬영한 사진을 준비해주세요.',
  },
};

export function isService(value: string | null): value is Service {
  return value !== null && Object.hasOwn(services, value);
}
