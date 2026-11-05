# Google 지도 연결

앱 안의 일정 지도·위치 선택 지도를 Google Maps로 바꾸고, 장소 검색을 Google Places의 Text Search (New)로 연결하는 코드가 포함돼 있습니다. 기존 Geoapify 키로 Google 지도를 사용할 수는 없습니다.

## Google Cloud 준비

1. [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트를 만들거나 선택합니다. 이름은 `between-trips` 등으로 정할 수 있습니다.
2. Google Maps Platform의 실제 운영에는 결제 계정 연결이 필요합니다. 지도 로드·검색·상세 위치 조회는 사용량에 따라 과금됩니다. 콘솔에서 예산 알림과 각 API의 사용 한도를 확인하세요. 예산 알림은 과금 중단 장치가 아닙니다.
3. **APIs & Services → Library**에서 다음 API를 활성화합니다.
   - **Maps JavaScript API** — 앱 내부 지도
   - **Places API (New)** — 숙소·장소 검색, 저장한 장소 ID의 위치 조회
4. **APIs & Services → Credentials → Create credentials → API key**에서 키를 만듭니다.
5. 키 편집에서 **Application restrictions → Websites / HTTP referrers**를 선택하고 다음 주소를 허용합니다.

```text
https://between-trips.vercel.app/*
http://localhost:4310/*
http://127.0.0.1:4310/*
```

다른 미리보기·배포 도메인에서도 쓰려면 그 정확한 도메인을 추가하세요. 모든 Vercel 사이트를 허용하는 광범위한 와일드카드는 사용하지 않는 편이 좋습니다.

6. **API restrictions → Restrict key**에서 위의 두 API만 선택하고 저장합니다.

이 키는 지도 SDK가 브라우저에서 사용하는 **웹사이트 제한 키**입니다. 앱의 공개 설정 응답에 포함되는 것이 정상입니다. OpenAI·Supabase service role 등 서버 비밀 키와는 용도가 다릅니다. Google의 서버 전용 키를 대신 넣지 마세요.

## Vercel에 추가

프로젝트 **Environment Variables**에서 추가합니다.

| Key | Value | Environment |
| --- | --- | --- |
| `GOOGLE_MAPS_API_KEY` | 발급한 Google 웹 지도 키 — 큰따옴표 제외 | Production, Preview |

저장한 뒤 최신 코드를 GitHub에 올리고 Vercel에서 새 배포가 Ready가 되는지 확인하세요. 환경변수만 변경했다면 Redeploy해야 합니다.

PC에서도 확인하려면 `여행/.env`에 추가하고 서버를 다시 시작합니다.

```env
GOOGLE_MAPS_API_KEY="발급한_Google_웹사이트_제한_키"
```

`GEOAPIFY_API_KEY`는 그대로 두어도 됩니다. Google 키 설정 시 지도와 장소 검색은 Google을 사용하고, 기존 도보·자동차 경로 API 연결은 Geoapify 설정을 따릅니다. Google 키를 비워두면 기존 OpenStreetMap 지도·Geoapify 검색을 사용합니다. Google 연결이 실패했다고 검색 결과를 몰래 다른 지도로 옮겨 표시하지 않습니다.

## 숙소 위치를 다시 확인하는 방법

1. 숙소 수정창에서 숙소 이름을 예약에 나온 이름으로 입력합니다. 예: `Patio Higashi-Shinjuku`.
2. 주소에는 예약·Google Maps에서 확인한 전체 주소를 입력합니다. 주소의 번지까지 유지합니다.
3. 장소 검색에 **숙소 이름 + 도쿄 / Tokyo / 新宿**처럼 건물 이름과 도시를 넣어 검색합니다. 지역 이름만 검색하면 건물을 특정할 수 없습니다.
4. ‘지역·도로 중심’ 결과는 숙소의 정확한 위치로 선택하지 않습니다. 건물 후보를 선택하고 지도와 예약 주소를 비교하세요.
5. 후보 선택은 입력한 숙소 이름·주소·예약 링크를 덮어쓰지 않습니다. Google 후보의 이름·주소는 검색 중 확인용으로 표시합니다.
6. 맞는 장소가 있으면 Google 장소 ID로 연결해 저장합니다. 검색되지 않으면 Google 지도에서 직접 위치를 눌러 사용자 지정 좌표로 저장할 수 있습니다. 직접 지도에서 위치를 바꾸면 기존 Google 장소 ID 연결을 해제합니다.

이전에 지역 중심 좌표를 저장했다면 자동으로 다른 위치로 옮기지 않습니다. 기존 숙소를 수정해 이름·주소·지도 위치를 다시 확인하세요.

## 데이터·동작 범위

- Google 장소 검색 응답의 이름·주소·좌표는 현재 페이지 메모리에서 사용합니다. 저장소에는 해당 Google 장소 ID와 사용자가 입력한 이름·주소·메모를 저장하며, Google 조회 좌표는 영구 저장·JSON 내보내기에 넣지 않습니다. 다시 열면 Google에서 위치를 조회합니다.
- Google 키가 없는 환경에서는 Google ID로 저장한 장소의 위치를 다른 지도에 표시하지 않습니다. Google 연결을 복구하거나 직접 지도 위치를 확인해야 합니다.
- Google 지도 로고·저작권 표시는 SDK가 제공하는 그대로 표시합니다. 개인정보·이용 안내를 `/privacy.html`, `/terms.html`에서 제공합니다.
- 번호는 일정 순서이고, 점선은 직선 연결입니다. 실제 도로 경로가 아닙니다. 지도 클릭·번호 핀 선택·모바일 지도 전환을 지원합니다.
- 테스트는 모의 Google SDK·검색 응답과 기존 도메인·DB 검사를 사용합니다. 실제 Google 키, 결제 계정, Google 지도·검색 성공 응답은 아직 검증하지 않았습니다. 외부 설정과 실제 앱에서 확인해야 연결 완료입니다.
- 이번 구현 중 브라우저 검증 도구의 연결 오류가 이어져 Google 지도 화면의 최종 시각 검증은 수행하지 못했습니다.

공식 문서: [지도 API 키 설정](https://developers.google.com/maps/documentation/javascript/get-api-key), [Text Search (New)](https://developers.google.com/maps/documentation/javascript/place-search), [지도 요금·사용량](https://developers.google.com/maps/documentation/javascript/usage-and-billing), [Places 정책](https://developers.google.com/maps/documentation/places/web-service/policies).
