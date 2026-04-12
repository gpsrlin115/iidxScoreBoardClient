# Bugfix: 415 Unsupported Media Type — Bootstrap CSV 업로드

> **발생일**: 2026-04-05  
> **영향 엔드포인트**: `POST /api/admin/bootstrap/iidx/csv`  
> **에러 코드**: `415 Unsupported Media Type`

---

## 1. 증상

관리자 Bootstrap CSV 업로드 요청이 항상 415로 실패.

```
백엔드 로그:
Resolved [org.springframework.web.HttpMediaTypeNotSupportedException:
Content-Type 'application/json' is not supported]
```

브라우저 Network 탭에서도 `Content-Type: application/json` 이 그대로 전송되고 있었음.

---

## 2. 원인 분석

### 2.1 HTTP multipart/form-data 란?

파일을 HTTP로 전송할 때 사용하는 Content-Type.  
텍스트 필드와 바이너리 파일을 하나의 요청 본문에 함께 담는 방식이다.

```
Content-Type: multipart/form-data; boundary=----WebKitFormBoundaryXYZ

------WebKitFormBoundaryXYZ
Content-Disposition: form-data; name="file"; filename="score.csv"
Content-Type: text/csv

(파일 바이너리 데이터)
------WebKitFormBoundaryXYZ
Content-Disposition: form-data; name="playStyle"

SP
------WebKitFormBoundaryXYZ--
```

`boundary` 는 각 파트를 구분하는 구분자다.  
브라우저와 axios 가 `FormData` 를 전달받으면 **이 boundary 를 자동으로 생성해서** Content-Type 헤더에 붙인다.

### 2.2 왜 415가 났는가?

`src/api/client.js` 에 공통 Axios 인스턴스를 생성할 때 기본 헤더가 고정되어 있었다.

```js
// 수정 전 client.js
const apiClient = axios.create({
  baseURL: '...',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',  // ← 문제의 원인
  },
});
```

`axios.create()` 의 `headers` 는 **모든 요청에 전역으로 적용**된다.  
`FormData` 를 요청 body 로 넘겨도, 이미 `application/json` 이 기본값으로 박혀 있어서 덮어쓰이지 않고 그대로 전송됐다.

> **핵심 포인트**: axios 는 `FormData` 를 감지해서 Content-Type 을 자동으로 설정하지만,
> **이미 Content-Type 이 설정되어 있으면 덮어쓰지 않는다.**

```
프론트 → FormData 생성
       → apiClient.post('/admin/bootstrap/iidx/csv', formData)
       → 인터셉터 실행, Content-Type 이미 'application/json'
       → 서버 수신: Content-Type: application/json
       → Spring Boot: "나는 multipart/form-data 만 받는데?" → 415
```

### 2.3 왜 Content-Type 을 직접 'multipart/form-data' 로 하드코딩하면 안 되는가?

```js
// ❌ 이렇게 하면 안 됨
headers: { 'Content-Type': 'multipart/form-data' }
```

`boundary` 가 없기 때문이다.  
서버는 boundary 를 기준으로 각 파트를 파싱하는데,  
boundary 가 없으면 어디서 파트가 나뉘는지 알 수 없어서 파싱에 실패한다.

`boundary` 는 FormData 를 구성할 때 브라우저/axios 가 **랜덤하게 생성**하는 값이라  
미리 알 수 없다. 반드시 자동 설정에 맡겨야 한다.

---

## 3. 해결 방법

**권장안 1 (전역 수정)** 을 채택.  
공통 Axios 인스턴스에서 Content-Type 전역 기본값을 제거하고,  
request interceptor 에서 요청 데이터 타입에 따라 동적으로 설정한다.

### 수정된 `src/api/client.js`

```js
// ✅ 수정 후
const apiClient = axios.create({
  baseURL: '...',
  withCredentials: true,
  // Content-Type 기본값 제거
});

apiClient.interceptors.request.use((config) => {
  // FormData 이면 Content-Type 헤더를 삭제
  // → axios/브라우저가 multipart/form-data; boundary=... 를 자동으로 붙임
  const isFormData = typeof FormData !== 'undefined' && config.data instanceof FormData;

  if (isFormData) {
    delete config.headers['Content-Type'];
  } else if (!config.headers['Content-Type'] && config.data !== undefined) {
    // body 가 있는 일반 요청은 JSON 으로 설정
    config.headers['Content-Type'] = 'application/json';
  }

  // CSRF 토큰 주입 (기존 로직 유지)
  const csrfToken = document.cookie
    .split('; ')
    .find((row) => row.startsWith('XSRF-TOKEN='))
    ?.split('=')[1];
  if (csrfToken) {
    config.headers['X-XSRF-TOKEN'] = decodeURIComponent(csrfToken);
  }

  return config;
});
```

### 파급 수정: `src/api/scores.js` — `uploadAvatar`

```js
// ❌ 수정 전: boundary 없는 하드코딩
await apiClient.post('/users/me/avatar', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
});

// ✅ 수정 후: 인터셉터에 위임
await apiClient.post('/users/me/avatar', formData);
// → 인터셉터가 FormData 를 감지해 올바른 헤더 자동 설정
```

---

## 4. 의사결정 기록 (왜 권장안 1인가?)

| 방법 | 장점 | 단점 |
|---|---|---|
| **권장안 1** (인터셉터 전역 처리) | 이후 모든 FormData 요청에 자동 적용, 일관성 | 인터셉터 로직 추가 필요 |
| 권장안 2 (업로드 호출부 예외 처리) | 변경 범위 최소 | 매 FormData 호출마다 수동 처리 필요, 실수 여지 존재 |
| Content-Type 하드코딩 | 직관적으로 보임 | boundary 누락 → 서버 파싱 실패 위험 |

→ **권장안 1** 이 추후 유지보수 측면에서 가장 안전하고 일관성 있는 방법이다.

---

## 5. 배운 점 / 학습 포인트

1. **`axios.create()` 의 기본 헤더는 모든 요청에 전역 적용된다.**  
   `FormData` 를 보낼 때 자동 설정을 기대했다면, 기본값이 없어야 한다.

2. **axios 의 Content-Type 자동 설정은 "헤더가 비어 있을 때만" 작동한다.**  
   이미 값이 있으면 덮어쓰지 않는다.

3. **multipart/form-data 의 boundary 는 자동 생성 값이다.**  
   직접 하드코딩하는 것은 불가능하고, 해서도 안 된다.

4. **415 vs 403 는 전혀 다른 문제다.**  
   - `415 Unsupported Media Type`: 요청 형식(Content-Type) 불일치 → 프론트 수정
   - `403 Forbidden`: 권한/CSRF 문제 → 인증/토큰 확인

---

## 6. 관련 파일

- [`src/api/client.js`](../../src/api/client.js) — Axios 공통 인스턴스 (핵심 수정)
- [`src/api/import.js`](../../src/api/import.js) — `bootstrapAdminCsv`, `uploadCsv`
- [`src/api/scores.js`](../../src/api/scores.js) — `uploadAvatar` (파급 수정)
