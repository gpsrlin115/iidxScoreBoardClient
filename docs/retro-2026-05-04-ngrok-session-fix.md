# 회고 — ngrok 외부 접속 환경에서 발생한 인증/데이터 로딩 문제 해결

> 날짜: 2026-05-04
> 관련 레포: `iidxScoreBoard` (백엔드), `iidxScoreBoardClient` (프론트엔드)

---

## 1. 발단

개발 중인 IIDX ScoreBoard를 외부에서 접속할 수 있도록 ngrok으로 프론트엔드를 터널링했다.
접속 URL: `https://entryway-manhole-colony.ngrok-free.dev`

로그인 시도 시 아무것도 작동하지 않았고, 콘솔에 세 가지 유형의 에러가 쏟아졌다.

---

## 2. 발생한 문제들

### 문제 1 — CORS 차단

```
Access to XMLHttpRequest at 'http://localhost:8080/api/auth/login'
from origin 'https://entryway-manhole-colony.ngrok-free.dev'
has been blocked by CORS policy
```

**원인**
백엔드 `CorsConfig.java`의 `allowedOrigins`에 `localhost:5173`, `localhost:5174`만 등록되어 있었고,
ngrok 도메인은 포함되지 않았다.

**해결**
`CorsConfig.java`에 ngrok 도메인 두 가지를 추가했다.

```java
.allowedOrigins(
    "http://localhost:5173",
    "http://localhost:5174",
    "https://entryway-manhole-colony.ngrok-free.app",
    "https://entryway-manhole-colony.ngrok-free.dev"
)
```

---

### 문제 2 — 로그인 후에도 모든 API 403 Forbidden

CORS를 해결한 뒤 로그인은 됐지만, 이후 `/api/scores`, `/api/users/me` 등 모든 인증 필요 API가 403을 반환했다.

**원인**
Spring Boot 세션 쿠키(`SESSION`)의 `SameSite=Lax` 설정 때문이었다.
브라우저는 **다른 출처**(ngrok HTTPS) → **다른 출처**(localhost HTTP)로의 크로스 사이트 요청에
`SameSite=Lax` 쿠키를 전송하지 않는다.

```
프론트: https://entryway-manhole-colony.ngrok-free.dev  (HTTPS)
백엔드: http://localhost:8080                           (HTTP)
```

로그인 시 서버가 발행한 세션 쿠키가 이후 API 요청에 실려 가지 않아
백엔드는 매 요청을 "미인증" 상태로 판단, 403을 반환했다.

**시도했으나 실패한 방법**
- 백엔드용 ngrok 터널 추가: free 계정의 static domain이 이미 프론트에 점유되어 추가 불가

**실제 해결책 — Vite 개발 서버 프록시**

Vite의 `server.proxy` 기능으로 `/api` 요청을 백엔드로 중계했다.
브라우저는 ngrok 한 곳에만 요청하므로 same-origin으로 처리되어 쿠키가 정상 전송된다.

```js
// vite.config.js
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:8080',
      changeOrigin: true,
      secure: false,
    },
  },
}
```

`VITE_API_BASE_URL`도 절대 경로에서 상대 경로로 변경했다.

```
# 변경 전
VITE_API_BASE_URL=http://localhost:8080/api

# 변경 후
VITE_API_BASE_URL=/api
```

> **주의**: `.env.local`이 `.env`보다 우선순위가 높다.
> `.env`를 수정해도 `.env.local`에 같은 키가 남아 있으면 적용되지 않는다.
> → `.env.local`도 동일하게 수정해야 했다.

---

### 문제 3 — 서열표 `songs.map is not a function` 오류

403 문제 해결 후 서열표 페이지에서 새로운 에러가 발생했다.

```
TypeError: songs.map is not a function
  at tierStore.js:72
```

**원인**
백엔드 서열표 API(`GET /api/tiers/{level}/{playStyle}`)의 **응답 형식이 변경**되어 있었으나
프론트엔드 코드가 구 형식만 처리하고 있었다.

| | 형식 | 예시 |
|---|---|---|
| 구 형식 (프론트 기대) | 객체 | `{"S+": ["곡A", "곡B"], "S": ["곡C"]}` |
| 신 형식 (백엔드 반환) | 배열 | `[{title, tier, difficulty, sortOrder, ...}]` |

`tierStore.js`는 `Object.entries(rawTierData)` 후 각 값을 배열로 가정해 `.map()`을 호출했는데,
배열을 `Object.entries`하면 값이 객체가 되어 `.map()`을 호출할 수 없었다.

**해결**
`tiers.js`의 `getTierData` API 어댑터에서 배열 응답을 구 형식 객체로 변환하는 로직을 추가했다.

```js
if (Array.isArray(data)) {
  const grouped = {};
  data
    .filter(item => item.tier != null) // 미분류 곡 제외
    .forEach(item => {
      if (!grouped[item.tier]) grouped[item.tier] = [];
      grouped[item.tier].push(item.title);
    });
  return grouped;
}
```

---

## 3. 교훈 및 개선점

| # | 교훈 | 개선 방향 |
|---|---|---|
| 1 | `.env.local`이 `.env`를 오버라이드한다는 점을 간과했다 | 환경변수 파일 우선순위 숙지; 디버깅 시 `.env.local` 먼저 확인 |
| 2 | SameSite 쿠키 정책은 HTTPS→HTTP 크로스 오리진 조합에서 반드시 걸린다 | 로컬 개발 시 프록시 설정을 기본 구성에 포함할 것 |
| 3 | 백엔드 API 응답 형식이 변경되면 프론트엔드 연동 코드도 같이 업데이트해야 한다 | API 계약을 문서화하고, 형식 변경 시 프론트 어댑터 레이어도 함께 수정 |
| 4 | ngrok free plan은 static domain이 1개로 제한된다 | 팀 단위 테스트가 필요하다면 유료 plan 또는 다른 터널링 방법 고려 |

---

## 4. 변경된 파일 요약

### 백엔드 (`iidxScoreBoard`)
| 파일 | 변경 내용 |
|---|---|
| `src/main/java/.../config/CorsConfig.java` | ngrok 도메인 2종 allowedOrigins 추가 |

### 프론트엔드 (`iidxScoreBoardClient`)
| 파일 | 변경 내용 |
|---|---|
| `vite.config.js` | `/api` 프록시 설정 추가 |
| `.env` / `.env.local` | `VITE_API_BASE_URL`을 `/api` (상대 경로)로 변경 |
| `src/api/tiers.js` | 배열 형식 API 응답 → 구 객체 형식 변환 로직 추가 |
