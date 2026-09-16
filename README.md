# OPIc Study Studio

OPIc 학습 자료를 한곳에서 관리하고 공부할 수 있는 개인용 웹사이트입니다.

- 화면은 React로 만들어졌으며 GitHub Pages에 배포할 수 있습니다.
- 로그인, 학습 기록, 노트, 첨부 파일은 Supabase에 저장됩니다.
- 한 명의 승인된 사용자만 모든 학습 데이터에 접근할 수 있습니다.
- PC와 모바일에서 같은 주소로 접속하면 학습 기록이 동기화됩니다.

> **현재 상태**
>
> 프로젝트 코드는 완성되어 있지만, 실제 Supabase 프로젝트에는 아직 연결하지 않았고 GitHub Pages에도 배포하지 않았습니다. 유료 기능도 활성화하지 않았습니다. 실제 학습 문서와 추출된 내용은 Git 저장소나 웹사이트 빌드 결과물에 포함되지 않습니다.

## 처음 설치한다면: 전체 순서 한눈에 보기

아래 순서대로 진행하면 됩니다.

1. Node.js와 pnpm을 준비하고 패키지를 설치합니다.
2. **.env.local** 파일에 Supabase URL과 Publishable Key를 입력합니다.
3. Supabase 프로젝트에 데이터베이스 마이그레이션을 적용합니다.
4. 웹사이트에서 사용할 계정을 만들고, 그 계정의 UUID를 허용 목록에 등록합니다.
5. 비밀번호 재설정용 URL을 Supabase에 등록합니다.
6. 로컬에서 로그인, 가져오기, 저장 기능을 확인합니다.
7. GitHub 저장소에 코드를 올리고 GitHub Pages로 배포합니다.
8. 최종 GitHub Pages 주소를 Supabase 리디렉션 URL에 추가합니다.

설정 명령어와 주의사항은 아래에 단계별로 설명되어 있습니다.

## 제공 기능

- 로그인, 로그아웃, 비밀번호 재설정 및 비밀번호 변경
- Supabase Auth 사용자 UUID 한 명만 허용하는 개인용 접근 제어
- Row Level Security(RLS)와 비공개 Storage를 이용한 데이터 보호
- 대시보드, 학습 진행률, 즐겨찾기, 이전/다음 이동
- 검색, 필터, 무작위 문제, 답변 타이머
- 영어 질문, 한국어 해석, 여러 개의 답변, 핵심 표현, 태그, 개인 노트를 구분하여 관리
- OPIc 학습 가이드 글 열람
- 사이트 안에서 문제와 가이드 글 생성 및 수정
- DOCX/JSON 파일을 먼저 검토한 뒤 가져오는 안전한 가져오기 기능
- 원본 파일 해시를 이용한 중복 가져오기 방지와 트랜잭션 처리
- 비공개 파일 업로드와 60초짜리 임시 다운로드 링크
- 자료 보관 처리, 전체 백업 다운로드, 누락 항목만 복원
- 나중에 확장할 수 있도록 준비된 비활성 상태의 Ask My Materials/RAG 기능
- 자동 테스트, Supabase 마이그레이션, GitHub Pages 배포 워크플로

## 개인정보와 보안 구조

이 프로젝트는 **공개해도 되는 코드**와 **비공개로 유지해야 하는 학습 데이터**를 분리합니다.

### Git 저장소에 들어가는 것

- React 애플리케이션 코드
- 데이터베이스 구조와 RLS 정책
- DOCX 추출 스크립트
- 테스트와 배포 설정
- 비밀 값이 없는 예시 환경 변수 파일

### Git 저장소에 들어가면 안 되는 것

- 실제 DOCX/PDF 학습 자료
- DOCX에서 추출한 JSON 파일
- 백업 파일
- **.env.local**
- Supabase 비밀 키, 데이터베이스 비밀번호, AI API 키

이 파일들은 **.gitignore**로 제외되어 있습니다. 그래도 커밋하기 전에는 반드시 변경 파일 목록을 확인하세요.

브라우저 코드에는 다음 두 값만 사용합니다.

- Supabase Project URL
- Supabase Publishable Key

Publishable Key는 브라우저에서 사용하도록 만든 공개 키입니다. 실제 데이터 보호는 로그인과 RLS 정책이 담당합니다.

> **절대 넣으면 안 되는 값**
>
> service_role 키, Secret Key, 데이터베이스 비밀번호, AI API 키를 VITE_로 시작하는 환경 변수에 넣지 마세요. VITE_ 값은 빌드된 브라우저 코드에서 확인할 수 있습니다.

승인된 사용자 UUID는 **private.app_config** 테이블에 저장됩니다. 데이터베이스와 파일 저장소 정책은 로그인한 사용자의 UUID가 이 값과 일치할 때만 접근을 허용합니다.

## 1. Windows 준비 사항

다음 프로그램이 필요합니다.

- Git
- Node.js 22 LTS
- Docker Desktop: 로컬에서 Supabase 데이터베이스 테스트를 실행할 때만 필요

PowerShell을 열고 pnpm을 준비한 뒤 패키지를 설치합니다.

~~~powershell
corepack enable
corepack prepare pnpm@10 --activate
pnpm install --frozen-lockfile
~~~

## 2. 로컬 실행 설정

예시 환경 변수 파일을 복사합니다.

~~~powershell
Copy-Item .env.example .env.local
notepad .env.local
~~~

Supabase Dashboard에서 **Project Settings → API**로 이동하여 다음 값을 확인합니다.

- Project URL → **VITE_SUPABASE_URL**
- Publishable Key → **VITE_SUPABASE_PUBLISHABLE_KEY**

키는 가능하면 sb_publishable_... 형식을 사용하세요. service_role 키나 Secret Key는 사용하면 안 됩니다.

설정을 저장한 뒤 개발 서버를 실행합니다.

~~~powershell
pnpm dev
~~~

터미널에 표시되는 주소를 브라우저에서 엽니다.

코드가 정상인지 확인하려면 다음 명령을 실행합니다.

~~~powershell
pnpm test
pnpm typecheck
pnpm build
node scripts/check-bundle.mjs
~~~

마지막 명령은 빌드 결과물에 비밀 값이나 비공개 학습 데이터가 들어가지 않았는지 검사합니다.

## 3. Supabase 데이터베이스 준비

> **주의: 이 단계부터는 실제 Supabase 프로젝트가 변경됩니다.**
>
> 명령을 실행하기 전에 대상 프로젝트가 맞는지 확인하세요. 먼저 --dry-run 결과를 검토하고, 원격 프로젝트에서는 db reset --linked를 실행하지 마세요. 이 명령은 원격 데이터를 삭제할 수 있습니다.

Supabase CLI에 로그인하고 프로젝트 목록을 확인합니다.

~~~powershell
npx supabase@latest login
npx supabase@latest projects list
~~~

올바른 프로젝트를 연결한 뒤, 실제 적용 전에 변경 내용을 미리 확인합니다.

~~~powershell
npx supabase@latest link --project-ref YOUR_PROJECT_REF
npx supabase@latest db push --dry-run
~~~

출력 내용을 확인하고 문제가 없을 때만 실제로 적용합니다.

~~~powershell
npx supabase@latest db push
~~~

마이그레이션은 다음 항목을 만듭니다.

- 문제, 답변, 표현, 가이드, 태그, 진행률, 즐겨찾기, 노트 테이블
- 한 명의 사용자만 허용하는 비공개 설정 테이블
- 모든 학습 데이터에 적용되는 RLS 정책
- 안전한 가져오기와 복원용 데이터베이스 함수
- 향후 RAG 기능에 사용할 수 있는 벡터 테이블
- **study-materials** 비공개 Storage 버킷과 접근 정책

벡터 테이블은 준비만 되어 있으며, 외부 AI 서비스는 연결되어 있지 않습니다.

## 4. 웹사이트 사용자 만들기

Supabase Dashboard에 로그인하는 관리자 계정과 이 웹사이트에서 공부할 사용자 계정은 서로 다릅니다.

1. Supabase Dashboard에서 **Authentication → Users**로 이동합니다.
2. **Add user → Create new user**를 선택합니다.
3. 웹사이트 로그인에 사용할 이메일과 비밀번호를 입력합니다.
4. 이메일을 확인된 상태로 만듭니다.
5. 생성된 사용자의 UUID를 복사합니다.
6. **SQL Editor**에서 아래 SQL을 실행합니다.

~~~sql
insert into private.app_config (singleton, owner_user_id)
values (true, 'YOUR_WEBSITE_USER_UUID');
~~~

YOUR_WEBSITE_USER_UUID를 방금 복사한 실제 UUID로 바꾸세요.

그다음 **Authentication → Sign In / Providers → Email**에서 **Allow new users to sign up**을 끄세요. 익명 로그인도 켜지 마세요.

Supabase 화면 이름은 업데이트에 따라 조금 달라질 수 있습니다. 자세한 내용은 [Supabase 일반 인증 설정 문서](https://supabase.com/docs/guides/auth/general-configuration)를 참고하세요.

실수로 다른 사용자가 가입하더라도, UUID가 허용 목록과 일치하지 않으면 학습 데이터에는 접근할 수 없습니다.

## 5. 비밀번호 재설정 URL 설정

비밀번호 재설정 이메일의 링크가 올바른 페이지로 돌아오도록 Supabase Dashboard의 **Authentication → URL Configuration**을 설정합니다.

### Site URL

배포 후 사용할 GitHub Pages 주소를 입력합니다. 예:

~~~text
https://YOUR_GITHUB_NAME.github.io/YOUR_REPOSITORY_NAME/
~~~

### Redirect URLs

로컬 개발 주소와 배포 주소를 모두 추가합니다. 예:

~~~text
http://localhost:5173/**
https://YOUR_GITHUB_NAME.github.io/YOUR_REPOSITORY_NAME/**
~~~

정확한 포트가 다르면 개발 서버에 표시된 주소를 사용하세요.

관련 공식 문서:

- [Supabase 비밀번호 재설정](https://supabase.com/docs/guides/auth/passwords)
- [Supabase 리디렉션 URL 설정](https://supabase.com/docs/guides/auth/redirect-urls)

Supabase 기본 이메일 전송은 개발과 소규모 개인 사용을 위한 최선 노력 방식이며, 기본 제한은 시간당 이메일 2개입니다. 더 안정적인 전송이 필요할 때만 사용자 지정 SMTP를 검토하세요.

## 6. 데이터베이스와 Storage 정책 테스트

이 단계는 선택 사항이지만, 실제 자료를 넣기 전에 실행하는 것을 권장합니다. Docker Desktop이 필요하며 Supabase 로컬 환경은 약 7GB의 여유 공간을 권장합니다.

~~~powershell
npx supabase@latest start
npx supabase@latest db reset
npx supabase@latest test db
~~~

이 테스트는 다음 내용을 확인합니다.

- 승인된 사용자만 데이터를 읽고 쓸 수 있는지
- 다른 로그인 사용자가 차단되는지
- 익명 사용자가 차단되는지
- Storage 파일 경로와 정책이 올바르게 작동하는지

보안 구조를 더 자세히 알고 싶다면 아래 공식 문서를 참고하세요.

- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Storage 접근 제어](https://supabase.com/docs/guides/storage/security/access-control)
- [비공개 Storage 버킷](https://supabase.com/docs/guides/storage/buckets/fundamentals)

## 7. 제공된 OPIc 가이드 가져오기

저장소에는 DOCX를 읽는 스크립트만 들어 있고, 실제 학습 문서 내용은 들어 있지 않습니다. 추출 결과가 저장되는 **.private-import/** 폴더도 Git에서 제외됩니다.

가장 쉬운 방법은 웹사이트에서 직접 가져오는 것입니다.

1. 웹사이트에 로그인합니다.
2. **Import and backup** 화면을 엽니다.
3. 원본 DOCX 또는 미리 만든 가져오기용 JSON을 선택합니다.
4. 저장하기 전에 검토 화면을 확인합니다.
5. 다음 항목을 특히 살펴봅니다.
   - 인식된 문제와 가이드 개수
   - 해석이 애매한 항목
   - 중복 가능성이 있는 항목
   - 질문이나 답변이 누락된 항목
   - 표가 일반 문장으로 변환된 항목
6. 가져오지 않을 항목의 선택을 해제합니다.
7. 문제가 없으면 저장합니다.

DOCX를 직접 가져오면 원본 파일도 비공개 Storage에 업로드됩니다. 같은 파일을 다시 가져오면 SHA 해시를 확인하여 중복 저장을 막습니다. 가져오기 기능은 기존 문제를 자동으로 수정하거나 덮어쓰지 않습니다.

웹사이트를 사용하지 않고 JSON만 미리 만들려면 다음 명령을 사용할 수 있습니다.

~~~powershell
python scripts/extract_initial_docx.py "C:\Path\To\Guide.docx" ".private-import\guide.import.json"
~~~

추출기는 가능한 한 다음 내용을 보존합니다.

- 문서 제목과 섹션 구조
- 질문과 한국어 해석
- 여러 개의 답변
- 핵심 표현과 태그
- 가이드 설명

다만 DOCX의 표, 떠 있는 텍스트 상자, 추적된 변경 사항, 주석처럼 복잡한 요소는 완벽하게 해석되지 않을 수 있습니다. 그래서 반드시 검토 화면을 거치도록 설계되어 있습니다. 의심스러운 경우 원본 DOCX를 기준으로 판단하세요.

이후 직접 올리는 파일에는 다음 제한이 있습니다.

- DOCX: 내용을 추출하여 검토 가능
- JSON: 형식을 검사한 뒤 검토 가능
- PDF: 비공개 첨부 파일로만 보관하며 OCR은 하지 않음
- 파일 크기: 최대 25MB

## 8. 백업과 복원

**Import and backup** 화면에서 **Download backup**을 선택하면 학습 기록과 첨부 파일 정보를 JSON으로 내려받을 수 있습니다.

백업 파일에는 개인 학습 내용이 들어 있으므로 안전한 위치에 보관하고 Git 저장소에는 커밋하지 마세요.

복원 기능은 다음 원칙으로 작동합니다.

- 현재 데이터에 없는 항목만 추가합니다.
- 기존 문제, 답변, 노트는 덮어쓰지 않습니다.
- 일부 항목이 실패하면 어떤 항목이 실패했는지 표시합니다.
- 같은 백업으로 다시 시도해도 이미 복원된 항목을 중복 생성하지 않습니다.

데이터베이스 전체를 관리하는 고급 백업이 필요하면 Supabase CLI의 db dump --data-only 방식도 사용할 수 있습니다. 자세한 내용은 [Supabase 로컬 개발 및 마이그레이션 문서](https://supabase.com/docs/guides/local-development/cli-workflows)를 참고하세요.

## 9. GitHub Pages에 배포

이 사이트는 GitHub Pages의 하위 경로에서도 동작하도록 상대 경로와 해시 기반 라우팅을 사용합니다.

### 먼저 알아둘 점

- GitHub Free에서는 공개 저장소의 Pages를 무료로 사용할 수 있습니다.
- Pro/Team 요금제에서는 비공개 저장소에서도 Pages를 사용할 수 있지만, 일반적인 Pages 배포 결과는 공개 웹사이트입니다.
- 조직 구성원에게만 보이는 진정한 비공개 Pages는 GitHub Enterprise Cloud 조직 기능입니다.
- 비용 없이 개인적으로 사용하는 가장 단순한 방법은 **비공개 학습 자료를 완전히 제외한 공개 코드 저장소**를 사용하는 것입니다.

최신 조건은 [GitHub 요금제 문서](https://docs.github.com/en/get-started/learning-about-github/githubs-plans)에서 다시 확인하세요. Pages 설정 방식은 [GitHub Pages 사용자 지정 워크플로 문서](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)를 참고할 수 있습니다.

### 배포 순서

1. GitHub에 빈 저장소를 만듭니다.
2. 실제 DOCX, PDF, 가져오기 JSON, 백업 파일이 변경 목록에 없는지 확인합니다.
3. 코드를 **main** 브랜치에 커밋하고 푸시합니다.
4. GitHub 저장소의 **Settings → Secrets and variables → Actions → Variables**에 다음 값을 등록합니다.
   - VITE_SUPABASE_URL
   - VITE_SUPABASE_PUBLISHABLE_KEY
5. **Settings → Pages**에서 Source를 **GitHub Actions**로 선택합니다.
6. main 브랜치에 푸시하거나 Pages 워크플로를 직접 실행합니다.
7. 배포가 끝나면 최종 Pages 주소를 Supabase의 Site URL과 Redirect URLs에 추가합니다.

배포 워크플로는 테스트, 타입 검사, 빌드, 비공개 데이터 검사를 통과한 뒤 **dist** 폴더 전체를 배포합니다. Supabase 설정이 빠진 데모 모드는 배포하지 않습니다.

## 10. PC와 모바일에서 사용

PC와 모바일 브라우저에서 같은 GitHub Pages 주소를 열고 같은 계정으로 로그인하면 됩니다.

Supabase에 저장되는 항목은 기기 사이에서 동기화됩니다.

- 학습 진행률
- 즐겨찾기
- 노트
- 문제와 답변
- 가이드 글
- 첨부 파일 정보

테마와 글자 크기처럼 민감하지 않은 화면 설정은 각 브라우저에만 저장될 수 있습니다. 개인정보 보호를 위해 비공개 학습 데이터를 오프라인 캐시나 서비스 워커에 저장하지 않습니다.

## 무료 요금제 참고 사항

아래 내용은 **2026년 9월 14일에 확인한 기준**이며 서비스 정책은 바뀔 수 있습니다. 배포하기 전에 공식 링크에서 현재 조건을 다시 확인하세요.

### Supabase Free

- 활성 프로젝트 최대 2개
- 프로젝트당 데이터베이스 500MB
- Storage 1GB
- 데이터 전송 5GB
- 월간 활성 사용자 50,000명
- Edge Function 호출 500,000회

자세한 내용은 [Supabase 요금 안내](https://supabase.com/docs/guides/platform/billing-on-supabase)를 참고하세요.

Free 프로젝트는 활동이 없으면 7일 후 일시 중지될 수 있습니다. 복구 방법은 [프로젝트 일시 중지 안내](https://supabase.com/docs/guides/platform/free-project-pausing)에 설명되어 있습니다.

Free 요금제는 자동으로 비용이 청구되지는 않지만, 사용량을 계속 초과하면 일부 기능이 제한될 수 있습니다.

- [Supabase 비용 제어](https://supabase.com/docs/guides/platform/cost-control)
- [Supabase 결제 FAQ](https://supabase.com/docs/guides/platform/billing-faq)

### GitHub

- GitHub Free 개인 계정은 공개 저장소 Pages를 사용할 수 있습니다.
- 개인 계정의 GitHub Actions 무료 사용량은 월 2,000분입니다.
- 비공개 저장소 Pages는 유료 요금제가 필요할 수 있습니다.
- 조직 구성원에게만 공개되는 Pages는 Enterprise Cloud 조직 기능입니다.

## 문제 해결

### “Supabase is not configured”가 표시됨

다음을 확인하세요.

- **.env.local** 파일이 프로젝트 최상위 폴더에 있는지
- VITE_SUPABASE_URL과 VITE_SUPABASE_PUBLISHABLE_KEY가 모두 입력되어 있는지
- 값에 불필요한 따옴표나 끝 공백이 없는지
- 환경 변수를 수정한 뒤 pnpm dev를 다시 실행했는지

### 로그인되었다가 바로 로그아웃됨

로그인 사용자의 UUID가 **private.app_config.owner_user_id**와 다르거나 마이그레이션이 적용되지 않았을 가능성이 큽니다.

Supabase Dashboard에 로그인할 때 쓰는 이메일이 아니라, **Authentication → Users**에서 만든 웹사이트 사용자의 UUID를 등록했는지 확인하세요.

### 데이터가 비어 있거나 “permission denied” 오류가 발생함

다음을 확인하세요.

- 모든 마이그레이션이 적용되었는지
- 로그인한 사용자가 허용된 owner UUID와 일치하는지
- Storage 버킷이 비공개 상태인지

문제를 해결하기 위해 RLS를 끄거나 버킷을 공개로 바꾸지 마세요. 원인을 수정해야 합니다.

### 비밀번호 재설정 링크가 잘못된 페이지로 이동함

Supabase의 Site URL과 Redirect URLs에 GitHub Pages의 **저장소 이름까지 포함한 전체 경로**가 들어 있는지 확인하세요. 로컬 주소와 배포 주소에는 필요한 경우 /** 와일드카드도 추가하세요.

### 파일 업로드 실패

다음을 확인하세요.

- 파일 형식이 DOCX, PDF 또는 JSON인지
- 파일 크기가 25MB 이하인지
- study-materials 버킷이 비공개인지
- 네 개의 Storage 정책이 모두 생성되었는지
- 파일 경로의 첫 번째 부분이 로그인 사용자의 UUID인지

### 가져오기 검토 화면에 경고가 많음

경고는 원본을 자동으로 잘못 저장하지 않도록 보여 주는 정상적인 안전장치입니다. 특히 다음 경우를 직접 확인하세요.

- 질문 번호나 참조가 누락됨
- 답변이 없음
- 같은 질문이 반복됨
- 하나의 문단에 여러 질문이나 답변이 섞여 있음
- Word 표가 일반 텍스트로 변환됨

원본 DOCX를 최종 기준으로 사용하세요.

### 같은 파일을 다시 가져올 수 없음

정상 동작입니다. 같은 원본의 SHA 해시를 감지하여 중복 생성을 막습니다. 이미 저장한 내용을 사이트에서 수정하거나, 실제로 변경된 새 원본 파일을 가져오세요.

### GitHub Pages에서 CSS나 JavaScript가 불러와지지 않음

다음을 확인하세요.

- 제공된 GitHub Actions 워크플로가 dist 폴더 전체를 배포하는지
- src 폴더를 직접 배포하고 있지 않은지
- Vite가 상대 경로로 빌드되고 있는지

### GitHub Pages에서 새로고침하면 빈 화면이 표시됨

이 프로젝트는 해시 기반 주소를 사용합니다. 사이트 내부 주소가 /#/... 형태인지 확인하세요.

### Supabase에 연결되지 않음

Supabase 상태 페이지와 프로젝트가 일시 중지되었는지 확인하세요. 네트워크가 잠시 끊겨도 저장하지 못한 노트 내용은 화면에 유지되므로, 연결이 돌아온 뒤 다시 저장할 수 있습니다.

## 현재 제한 사항

- 실제 원격 Supabase의 RLS, Storage, 이메일, 기기 간 동기화와 GitHub Pages 배포는 사용자가 프로젝트를 연결하고 설정한 뒤에만 최종 확인할 수 있습니다.
- DOCX 가져오기는 검토 우선 방식입니다. 떠 있는 개체, 추적된 변경 사항, 주석, 복잡한 표 배치를 완벽히 재현하지는 않습니다.
- PDF 내용에 대한 OCR은 지원하지 않습니다.
- 복원은 누락 항목만 추가하며 기존 데이터를 덮어쓰지 않습니다.
- RAG용 외부 AI 서비스는 연결되어 있지 않습니다. 관련 함수는 승인된 사용자인지 확인한 뒤 항상 not_configured 상태를 반환합니다.
