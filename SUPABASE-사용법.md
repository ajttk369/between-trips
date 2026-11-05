# Supabase 연결하고 둘이 사용하기

여행 앱은 **Supabase 모드**로 전환했습니다. 기존 `리뷰어/.env.local`의 Supabase URL과 서버 전용 키를 여행 앱의 무시되는 `.env`에 복사했습니다. 비밀 키는 화면·브라우저 코드·이 문서에 포함하지 않습니다. 포폴분석 파일과 테이블은 변경하지 않았습니다.

**실제 클라우드 연결 완료 여부는 앱의 `/setup.html`에서 확인합니다.** 프로젝트가 응답하고 아래 SQL을 실행해야 회원가입과 저장을 사용할 수 있습니다. 연결 실패 시 PC 저장으로 몰래 전환하지 않습니다.

## 처음 한 번 준비

1. 여행 서버를 실행하고 **http://localhost:4310/setup.html**을 엽니다.
2. **Supabase 대시보드 열기**로 기존 프로젝트에 들어갑니다. 조직 주소(`/dashboard/org/...`)와 실제 프로젝트 주소(`/dashboard/project/...`)는 다릅니다. 기존 설정에 들어 있던 프로젝트는 `nsefupmnsoofcoiwccqi`입니다. API가 응답하지 않으면 현재 실행 중인 프로젝트가 맞는지 확인하세요.
3. 앱 안내 화면에서 **설정 SQL 전체 복사**를 누릅니다.
4. Supabase 왼쪽 **SQL Editor → New query**에 붙여 넣고 **Run**을 누릅니다. 같은 내용은 `supabase/schema.sql`에 있습니다.
5. **Authentication → Sign In / Providers**에서 Email 로그인이 켜져 있는지 확인합니다.
6. **Authentication → URL Configuration → Redirect URLs**에 `http://localhost:4310`과 `http://localhost:4310/**`를 추가합니다. 휴대폰으로 사용할 PC의 LAN 주소도 해당 주소만 추가합니다. 예: `http://192.168.0.8:4310`, `http://192.168.0.8:4310/**`. 포폴분석의 기존 Site URL은 유지할 수 있습니다.
7. 여행 앱의 연결 안내 화면에서 **다시 확인**을 누릅니다. **Supabase 여행 저장소가 준비됐어요**가 표시되면 연결 준비가 끝났습니다.

현재 프로젝트가 다른 경우 해당 프로젝트의 URL과 **서버 전용 service_role 또는 secret 키**를 여행 폴더의 `.env`에 설정합니다. 키를 채팅·소스 코드·스크린샷에 공개하지 마세요. `.env`를 바꾼 뒤 서버를 다시 시작합니다.

```dotenv
STORAGE_BACKEND=supabase
SUPABASE_URL=https://실제-프로젝트.supabase.co
SUPABASE_SERVICE_ROLE_KEY=서버_전용_키
```

## 회원가입부터 동행 초대까지

1. **http://localhost:4310** → **회원가입**에서 이름·이메일·10자 이상 비밀번호를 입력합니다.
2. 이메일 인증이 켜져 있으면 가입 메일의 링크를 누릅니다. 인증 후 앱으로 돌아와 **로그인**합니다. 인증 메일이 없으면 스팸함과 Supabase Auth 로그·메일 발송 제한을 확인합니다.
3. **새 여행**에서 일본의 방문 도시와 실제 출발·종료 날짜를 입력합니다.
4. **장소 저장**과 **숙소 등록**에서 가고 싶은 곳을 저장하고, 지도에서 위치를 찍습니다. API 키가 없어도 직접 등록과 직선거리 확인은 가능합니다.
5. **함께 계획하기 → 7일 초대 링크 만들기**에서 코드를 복사합니다.
6. 연인은 **자기 계정으로 따로 가입·인증·로그인**하고 **초대받은 여행 참여**에서 코드를 입력합니다.
7. 같은 여행 안에서 서로 저장한 장소·하트·댓글·일정·숙소·준비물·지출을 함께 봅니다. 변경 내용은 약 2초 간격으로 자동 반영합니다. 동시에 편집하면 충돌 안내에서 최신 내용을 확인한 뒤 다시 저장합니다.

## 정보는 어디에 저장되나요?

- 회원 계정·비밀번호: **Supabase Auth**. 앱이 별도의 비밀번호 테이블이나 해시를 만들지 않습니다.
- 이름: `travel_profiles` 및 여행 참여자 이름.
- 여행·장소·일정·숙소·예약·준비물·지출·댓글·하트: `travel_workspaces`.
- 만료되는 초대: `travel_invites`. 초대 코드 원문은 저장하지 않고 해시만 저장합니다.
- 로그인 토큰: 서버가 발급하는 HttpOnly 쿠키. 프런트엔드 JS와 localStorage에 로그인 토큰을 보관하지 않습니다.

테이블은 RLS를 켜고 `anon`·`authenticated`의 직접 DB 접근을 차단합니다. 서버가 Supabase Auth로 로그인 사용자를 확인하고 여행 참여자 권한을 검사합니다. 저장·초대 수락·참여 해제는 DB 함수가 다시 권한과 버전을 검사하고 하나의 트랜잭션으로 처리합니다. service_role/secret 키는 서버에서만 사용합니다.

## PC를 꺼도 사용할 수 있나요?

Supabase는 데이터를 저장하는 곳입니다. **현재 앱 서버는 PC에서 실행됩니다.** 현재는 PC와 서버가 켜진 상태에서 같은 Wi-Fi로 접속하거나 PC에서 사용할 수 있습니다. Supabase가 연결되어도 localhost 주소가 인터넷 주소로 바뀌지는 않습니다.

집 밖에서도 쓰려면 여행 앱 서버를 HTTPS로 배포하고 같은 `.env` 값을 배포 환경변수에 설정해야 합니다. `PUBLIC_URL`을 실제 앱 주소로, `COOKIE_SECURE=true`로 설정하고 그 앱 주소를 Supabase Auth의 Redirect URLs에 추가합니다. Supabase 모드에서는 사용자·여행 데이터가 로컬 디스크에 의존하지 않습니다. Vercel 배포 방법은 VERCEL-배포방법.md를 참고하세요. Vercel에서는 약 4초 간격으로 변경을 확인합니다.

## 기존 로컬 계정·여행이 있다면

기존 `data/travel.sqlite`는 삭제하거나 업로드하지 않았습니다. 로컬 비밀번호 해시는 Supabase Auth 계정으로 자동 이전하지 않습니다. Supabase에서 새로 가입해야 합니다.

기존 여행이 있으면 별도의 터미널에서 로컬 모드를 잠시 열어 로그인한 뒤 JSON을 내보낼 수 있습니다.

```powershell
$env:STORAGE_BACKEND='sqlite'
$env:PORT='4320'
node --use-system-ca --env-file-if-exists=.env server.mjs
```

http://localhost:4320 에서 기존 로컬 계정으로 로그인 → 여행 JSON 내보내기 → Supabase 모드의 http://localhost:4310 에서 **여행 가져오기**를 선택합니다. 공유 권한·하트·댓글은 초기화되고 작성자·결제자는 가져온 계정으로 바뀝니다. 사용 후 별도 터미널을 닫습니다. 원래 로컬 DB는 보존됩니다.

## 확인 명령

```powershell
npm run supabase:check
npm run check
npm test
```

연결 확인 명령은 테이블 유무와 함수 권한만 확인합니다. 키·비밀번호·여행 기록을 출력하지 않습니다. 자동 테스트는 별도 SQLite와 메모리 PostgreSQL(PGlite)을 사용하며 실제 Supabase 회원가입이나 운영 데이터 변경을 하지 않습니다. Auth SDK의 요청 흐름은 모의 응답으로 검증하므로 실제 프로젝트에서 이메일 인증·두 계정 저장 검증까지 끝나야 실연결이 확인됩니다.

공식 참고: [이메일 회원가입](https://supabase.com/docs/reference/javascript/auth-signup), [사용자 검증](https://supabase.com/docs/reference/javascript/auth-getuser), [DB 함수 권한](https://supabase.com/docs/guides/database/functions).
