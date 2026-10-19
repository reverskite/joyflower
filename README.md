# 조이플라워 · Joyflower

대전 기반 공간 연출·조경관리 업체의 서비스와 시공 사례를 소개하고 견적 상담을 연결하는 웹사이트입니다.

운영 주소: https://thejoyflower.co.kr/

## 기술 스택

TypeScript, React 19, Next.js App Router 구조, Vinext/Vite, Tailwind CSS 4, shadcn/ui·Radix·Base UI, Cloudflare Workers·D1(SQLite), Drizzle ORM, Cloudflare Access·Turnstile, pnpm, ESLint.

## 구현 완료 기능

- 반응형 메인, 크리스마스 연출·플랜테리어·조경관리 서비스 안내
- 시공 포트폴리오 목록·상세, 관련 사례 및 브랜드별 프로젝트 소개
- 견적 문의 UI/API: 입력 검증, 개인정보 동의, 중복 방지, 빈도 제한, D1 저장
- 관리자 문의 목록·상세·처리 상태 변경·변경 이력 및 인증·접근 제어
- SEO 메타데이터, 사이트맵, robots, 구조화 데이터 및 분석 연동 코드
- 알림 outbox, 재시도 및 이메일·알림톡·SMS 모의 발송 테스트

소스 구현 기준입니다. 문의·관리자·분석의 운영 활성화는 별도 설정에 따릅니다.

## 준비 중인 기능

- 이메일·카카오 알림톡·SMS 제공업체의 실제 발송 연결 및 운영 검증
- 알림 전달 결과 조회·대사 등 후속 운영 처리
- 환경별 비밀값과 정책·검증 근거를 갖춘 기능 활성화

모의 발송은 실제 고객 알림 발송이 아닙니다.

## 로컬 실행

Node.js 22.13.0 이상과 package.json의 packageManager에 명시된 pnpm을 사용합니다.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

기본 개발 주소: http://localhost:5173 . 새 체크아웃은 portable 프로필을 사용합니다.

```sh
pnpm lint
pnpm build
pnpm start
```

start는 빌드한 Worker를 로컬에서 실행합니다. 출력된 루프백 주소를 사용하세요. 위 명령은 운영 배포를 수행하지 않습니다.

D1 문의 기능에는 로컬 마이그레이션과 환경 설정이 필요합니다. 빌드 후 drizzle/*.sql을 번호 순서로 한 번씩 적용하며, 아래 파일명을 각 마이그레이션으로 바꿉니다.

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_inquiries.sql
```

로컬 환경변수는 Git에서 제외되는 .dev.vars에 설정합니다. 변수 이름·타입은 cloudflare-env.d.ts, 활성화 조건은 lib/inquiry-settings.ts 등을 확인하세요. 비밀키와 실제 고객 정보는 저장소에 넣지 않습니다. 운영 설정·자격 증명은 별도로 관리하므로 이 저장소만으로 운영 배포가 자동 재현되지는 않습니다.

## 본인 역할과 ChatGPT·Codex 활용

- 프로젝트 담당자(reverskite): 서비스 목적·요구사항 정의, 콘텐츠·시공 사례 선정, 결과 검토와 운영 의사결정.
- ChatGPT·Codex: 요구사항 정리, 화면·코드 구현 및 수정, 오류 분석, 테스트와 문서화 보조.
- AI가 생성·수정한 결과를 담당자가 검토하고 서비스에 맞게 판단하는 협업 프로젝트입니다. AI 도움 없이 전체 코드를 직접 작성한 것으로 표기하지 않습니다.

## 구성 및 업로드 정책

app/은 페이지·API, components/는 UI, lib/는 업무 로직, db/와 drizzle/은 스키마·마이그레이션, public/은 공개 웹 자산, scripts/는 개발·검증 도구입니다.

환경 파일·비밀키·인증 도구 상태·로컬 DB·고객 내보내기·의존성·빌드 결과·로컬 배포 설정·운영 점검 기록은 .gitignore로 제외합니다. drizzle/*.sql은 고객 데이터 덤프가 아닌 스키마 마이그레이션입니다. 시공 사진과 콘텐츠는 웹사이트 표시용 공개 자산입니다.

작업 폴더는 Git 이력 없이 제공되어 최초 커밋부터 관리합니다. 이전 README 원본은 업로드에서 제외되는 work/README.before-github.md에 보존했습니다. 기존 로컬 파일과 운영 설정은 삭제하지 않습니다.
