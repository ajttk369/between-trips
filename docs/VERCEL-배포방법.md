# Vercel URL로 둘이 사용하기

Vercel 배포용 코드와 설정을 준비했습니다. 실제 프로젝트 생성·환경변수 등록·공개 배포는 아래 순서로 직접 진행합니다. 아직 생성된 배포 URL은 없습니다.

## 1. PowerShell에서 여행 폴더로 이동

Windows + R → powershell → Enter 후 아래 명령을 실행합니다.

```powershell
cd "C:\Users\DYU\Desktop\종안\포폴모음\여행"
npx.cmd vercel@latest login
```

브라우저가 열리면 기존 Vercel 계정으로 로그인합니다. 로그인 완료 안내 후 PowerShell로 돌아옵니다. Vercel CLI 설치 여부를 물으면 y를 입력합니다.

## 2. 여행용 Vercel 프로젝트 만들기

```powershell
npx.cmd vercel@latest link
```

질문에는 다음과 같이 답합니다. 표현은 CLI 버전에 따라 조금 다를 수 있습니다.

| 질문 | 입력할 내용 |
|---|---|
| Set up ...? | Y |
| Which scope...? | 본인의 Vercel 계정/팀 선택 |
| Link to existing project? | N — 여행 앱을 새 프로젝트로 생성 |
| Project name | between-our-trips 또는 원하는 영문 이름 |
| Directory / Code location | ./ |
| Framework | 물어보면 Other |

포폴분석에 이미 사용하는 Vercel 프로젝트와는 별도의 프로젝트를 선택합니다. 프로젝트 생성·연결만으로는 배포가 끝나지 않습니다.

## 3. Vercel에 Supabase 환경변수 넣기

Vercel 대시보드에서 방금 만든 여행 프로젝트 → Settings → Environment Variables로 들어갑니다. 아래 값을 **Production** 환경에 등록합니다. Preview 배포도 사용하려면 해당 환경에도 별도로 등록합니다.

| 이름 | 값 |
|---|---|
| STORAGE_BACKEND | supabase |
| SUPABASE_URL | https://nsefupmnsoofcoiwccqi.supabase.co |
| SUPABASE_SERVICE_ROLE_KEY | 로컬 여행/.env 파일에 있는 같은 이름의 서버용 키 |
| COOKIE_SECURE | true |
| GEOAPIFY_API_KEY | 선택: 검색·실제 경로 API 키. 없으면 생략 |

서버용 키는 Vercel의 서버 환경변수에만 넣습니다. 이름 앞에 NEXT_PUBLIC_ 또는 VITE_를 붙이지 마세요. 채팅이나 공개 저장소에 키를 올리지 않습니다. .env·로컬 DB·테스트 파일은 .vercelignore로 업로드에서 제외했습니다.

PUBLIC_URL은 첫 배포 때 생략할 수 있습니다. Vercel의 시스템 환경변수 접근을 활성화하면 프로덕션 도메인을 자동으로 사용합니다. 배포가 끝난 뒤 고정 도메인을 명시하려면 PUBLIC_URL=https://실제주소 를 추가하고 다시 배포합니다. Vercel 환경에 localhost를 PUBLIC_URL로 입력하지 마세요.

## 4. 배포하기

PowerShell에서 실행합니다.

```powershell
npx.cmd vercel@latest --prod
```

설정을 물으면 다음 값입니다. 프로젝트의 vercel.json에도 지정되어 있습니다.

| 설정 | 값 |
|---|---|
| Framework Preset | Other |
| Node.js Version | 24.x |
| Build Command | npm run build:vercel |
| Output Directory | dist |
| Install Command | npm ci 또는 기본값 |

완료되면 https://...vercel.app 주소가 표시됩니다. 이 프로덕션 주소를 사용합니다. dist 폴더만 따로 업로드하면 로그인 API가 빠지므로 반드시 여행 프로젝트 폴더에서 배포합니다.

프로덕션 주소가 Vercel 로그인을 요구하면 프로젝트의 Deployment Protection 설정에서 공유할 프로덕션 주소에 Vercel 로그인이 요구되는지 확인합니다. 여행 앱 자체의 로그인·초대·참여자 권한은 별도로 적용됩니다.

## 5. Supabase 인증 주소에 새 URL 추가

Supabase의 기존 CareerLens AI 프로젝트 → Authentication → URL Configuration → Redirect URLs → Add URL에서 실제 생성된 주소 두 개를 추가합니다. 아래는 형식 예시이며 배포된 주소로 바꿔 입력합니다.

```text
https://실제프로젝트.vercel.app
https://실제프로젝트.vercel.app/**
```

기존 포폴분석 Site URL과 Redirect URLs는 유지합니다. 여행 앱은 가입 요청 시 여행 앱 주소를 인증 후 돌아올 주소로 지정합니다.

## 6. 접속·저장·공유 확인

1. 배포 URL 뒤에 /setup.html을 붙여 열고 Supabase 준비 완료를 확인합니다.
2. 배포 URL에서 회원가입 → 이메일 인증 → 로그인합니다. 이미 같은 Supabase에 가입한 계정은 기존 계정으로 로그인합니다.
3. 새 여행과 장소 하나를 만들고 새로고침해 기록이 유지되는지 확인합니다.
4. 함께 계획하기 → 초대 코드를 만들고 연인에게 **배포된 앱 주소와 초대 코드**를 보냅니다.
5. 연인은 다른 계정으로 가입·로그인 후 초대를 수락합니다.
6. 서로 다른 기기에서 장소를 저장하고 약 4초 내에 상대 화면에 반영되는지 확인합니다.

Vercel 배포 주소에서는 PC와 PowerShell을 꺼도 접속할 수 있습니다. 데이터는 이미 연결한 Supabase에 저장됩니다. localhost에서 가입했던 계정도 같은 Supabase Auth 계정이므로 사용할 수 있으며, 배포 주소에서는 다시 로그인합니다.

## 준비한 변경과 검증 범위

- 정적 화면은 dist로 빌드하고 API는 api/handler.js의 Vercel Node 함수로 처리합니다.
- Supabase 모드에서 로컬 디렉터리·SQLite 파일을 생성하지 않습니다.
- Vercel에서 파싱한 JSON 요청과 일반 Node HTTP 요청을 모두 지원합니다.
- HTTPS 출처 검사, Secure/HttpOnly 쿠키, 비공개 DB 접근을 유지합니다.
- Vercel에서는 장시간 SSE 대신 4초 간격의 조회로 변경·권한·로그인 상태를 확인합니다. 화면이 백그라운드이면 조회를 쉬고, 동시 수정은 기존 DB 버전 검사로 보호합니다.
- 서버 인스턴스 메모리의 요청 횟수 제한은 인스턴스별 보조 제한입니다. Supabase Auth 자체 제한과 Vercel 프로젝트의 사용량 설정도 적용됩니다.
- 로컬 빌드·자동 테스트는 완료했지만 실제 Vercel 배포 및 두 기기의 프로덕션 동작은 아직 검증하지 않았습니다.

공식 문서: [CLI 프로젝트 연결](https://vercel.com/docs/cli/link), [배포](https://vercel.com/docs/cli/deploy), [환경변수](https://vercel.com/docs/environment-variables), [Node.js 버전](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).
