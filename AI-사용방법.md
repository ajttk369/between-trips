# AI 여행 도우미 연결

숙소의 위치·숙박 날짜, 여행 기간, 저장 장소, 기존 일정·교통 예약 시간을 참고해 음식·카페·관광지를 추천합니다. 대화로 초안을 수정하고 **공동 일정에 반영**을 눌러 저장합니다. 대화는 본인만 조회하며, 반영한 장소·일정은 여행 참여자가 함께 봅니다.

## 1. Supabase에서 AI 저장소 준비 — 한 번만

1. 기존 프로젝트의 **SQL Editor → New query**를 엽니다.
2. 이 프로젝트의 `supabase/ai.sql` 파일 내용 전체를 복사합니다.
3. SQL Editor에 붙여넣고 **Run**을 누릅니다.
4. Table Editor에서 `travel_ai_chats`, `travel_ai_limits`가 추가됐는지 확인합니다. 처음에는 비어 있습니다.

기존 `analyses`, 여행 테이블, 회원 데이터는 삭제하지 않습니다. AI 테이블은 브라우저 직접 접근을 차단하고, 로그인한 사용자를 검증하는 서버와 DB 함수를 통해 접근합니다. 별도의 Realtime 설정은 필요하지 않습니다. 이 SQL은 기존 여행용 `supabase/schema.sql`을 실행한 프로젝트에 적용합니다.

배포 후 `/setup-ai.sql`에서도 동일한 SQL을 볼 수 있습니다. SQL 파일에 비밀 키는 없습니다.

## 2. Vercel 환경변수 추가

**Vercel → between-trips → Settings → Environment Variables**에서 추가합니다.

| Key | Value | Environment |
| --- | --- | --- |
| `OPENAI_API_KEY` | 기존 `여행/.env`의 해당 키 값 | Production, Preview |
| `OPENAI_MODEL` | `gpt-5-mini` | Production, Preview |
| `AI_DAILY_LIMIT` | `30` — 선택, 전체 프로젝트 하루 한도 | Production, Preview |
| `AI_USER_DAILY_LIMIT` | `10` — 선택, 계정별 하루 한도 | Production, Preview |

이미 설정한 `STORAGE_BACKEND=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PUBLIC_URL` 등은 유지합니다. 위의 한도는 한국 시각 하루 기준이며, 실패한 추천 요청도 횟수에 포함됩니다. API 결제 잔액·사용 한도와는 별도입니다.

키는 [OpenAI API Keys](https://platform.openai.com/api-keys)에서 관리합니다. 기존 키 전체가 보이지 않으면 로컬 `.env`에 저장한 값을 사용하거나 새 키를 발급합니다. 키를 GitHub·채팅·스크린샷에 공개하지 마세요. `NEXT_PUBLIC_` 접두사를 붙이지 않습니다.

환경변수를 저장한 다음 코드 업데이트를 배포해야 새 설정이 적용됩니다.

## 3. 코드 올리기

`여행` 폴더에서 터미널을 열고 실행합니다.

```powershell
git status --short
git add .
git commit -m "Add conversational AI travel planner"
git push origin main
```

`.env`와 `node_modules`, 로컬 데이터는 기존 `.gitignore`로 제외됩니다. `git status`에서 `.env`가 새 파일로 표시되면 업로드를 멈추고 제외 설정을 확인하세요. Vercel의 새 배포가 **Ready**가 되면 앱을 새로고침합니다. Vercel에 환경변수만 바꾼 경우에도 Deployments에서 **Redeploy**가 필요합니다.

## 4. 사용 순서

1. 여행에 실제 날짜와 도시를 입력합니다.
2. **숙소·예약 → 숙소 등록**에서 이름·주소·체크인·아웃 날짜를 저장합니다. 예약이 끝났으면 상태를 **예약 완료**로 선택합니다.
3. **AI 여행 도우미**에서 날짜를 고르고 요청합니다. 예: “숙소 근처에서 점심 먹고 조용한 카페, 관광지 두 곳을 가고 싶어.”
4. 제안을 읽고 이어서 요청합니다. 예: “카페는 다른 곳으로 바꾸고 저녁 식당도 추가해줘.”
5. 오른쪽/아래 변경안의 추가·수정·삭제 항목을 확인하고 **공동 일정에 반영**을 누릅니다.
6. **현재 일정 보기**에서 저장된 일정을 확인합니다. 새로고침 후 AI 대화도 다시 불러올 수 있습니다.

동행이 먼저 여행을 수정하면 기존 초안을 그대로 적용하지 않습니다. “최신 일정 기준으로 다시 제안해줘”라고 요청하세요. 다른 화면에서 같은 계정으로 대화 중이면 새로 불러온 뒤 이어갑니다.

## 동작 범위와 확인할 점

- OpenAI Responses API·웹 검색·구조화된 출력 연결 코드가 포함돼 있습니다. 웹 검색에서 반환한 출처가 없는 새 음식점·카페·관광지는 일정 변경안에서 제외합니다.
- 숙소·일정 문맥과 입력한 대화가 OpenAI로 전송됩니다. 계정 이메일·예약번호는 자동 문맥에서 제외합니다. 직접 대화에 입력한 내용은 요청에 포함됩니다.
- AI가 추정한 GPS 좌표는 저장하지 않습니다. 새 장소는 주소와 출처를 저장하며, **함께 저장한 장소 → 장소 편집**에서 지도 위치를 확인해야 지도 핀·거리 계산에 포함됩니다.
- 영업시간·가격·미래 날짜의 예약 가능 여부는 확정 정보가 아닙니다. 확인되지 않은 가격은 확인 필요로 표시합니다. 실제 경로·소요 시간 계산은 기존 지도/경로 서비스 설정을 따릅니다.
- 서버의 OpenAI 응답 제한 시간은 45초입니다. 시간이 초과되면 하루나 한두 장소로 범위를 줄여 요청하세요.
- 자동 테스트 17개 및 격리된 샘플 서버에서 대화 → 카페 변경·저녁 추가 → 공동 일정 반영 → 새로고침 후 대화 보존을 검증했습니다. 실제 OpenAI 유료 호출과 운영 Supabase의 AI SQL 적용·Vercel 배포는 이 검증에서 수행하지 않았습니다. API 키의 유효성·잔액은 아직 확인하지 않았습니다.

## 오류가 나면

| 표시 | 확인할 내용 |
| --- | --- |
| AI 도우미 연결 준비 중 | Vercel의 `OPENAI_API_KEY` 저장 및 재배포 |
| AI 도우미 저장소 준비 필요 | 같은 Supabase 프로젝트에서 `supabase/ai.sql` 실행 |
| AI 서비스 연결 설정 확인 필요 | OpenAI 키 유효성·프로젝트 권한 |
| AI 서비스 사용 한도 도달 | OpenAI의 사용량·결제 잔액·속도 제한 |
| 오늘 추천 횟수 모두 사용 | 앱의 하루 한도. 다음 날 사용하거나 관리자가 환경변수 변경 후 재배포 |
| 동행이 일정 변경 | 최신 여행을 불러온 후 새 제안 요청 |

공식 참고: [Responses API](https://developers.openai.com/api/docs/guides/text), [웹 검색](https://developers.openai.com/api/docs/guides/tools-web-search), [구조화된 출력](https://developers.openai.com/api/docs/guides/structured-outputs).
