# 전역 로딩 오버레이 구현 원리

> 구현일: 2026-04-05  
> 관련 파일: `loadingStore.js` · `useLoading.js` · `GlobalLoadingOverlay.jsx`

---

## 왜 만들었나?

백엔드 작업(CSV Bootstrap 적재 등)은 수십 초가 걸릴 수 있습니다.  
이 동안 사용자에게 아무 피드백이 없으면 "눌렸나? 안 눌렸나?" 하고 다시 클릭하게 됩니다.

**목표**: 어떤 페이지에서도 한 줄로 전체화면 로딩 오버레이를 띄울 수 있게 한다.

```js
// 쓰는 쪽에서는 이것만 하면 됩니다
await run(() => someApi.heavyOperation(), '처리 중...');
```

---

## 전체 구조 한눈에 보기

```
[컴포넌트]
    │  run(asyncFn, message) 호출
    ▼
[useLoading 훅]  ──show/hide──▶  [loadingStore (Zustand)]
                                        │ isLoading, message
                                        ▼
                               [GlobalLoadingOverlay]
                                (App.jsx 최상단에 상주)
```

총 세 층으로 나뉩니다.

| 층 | 파일 | 역할 |
|---|---|---|
| **상태 (State)** | `loadingStore.js` | `isLoading`, `message` 전역 보관 |
| **로직 (Hook)** | `useLoading.js` | 비동기 함수 실행 + 상태 제어 |
| **UI (View)** | `GlobalLoadingOverlay.jsx` | 상태를 읽어 화면에 렌더링 |

---

## 1단계: 전역 상태 — Zustand Store

### 왜 Zustand인가?

React 의 `useState` 는 **컴포넌트 안에서만** 살아 있습니다.  
A 컴포넌트에서 `setIsLoading(true)` 를 해도 B 컴포넌트는 모릅니다.

Zustand 는 **React 트리 바깥에** 상태를 만들어,  
어느 컴포넌트에서 읽거나 바꿔도 모두 동기화됩니다.

```js
// src/store/loadingStore.js
import { create } from 'zustand';

export const useLoadingStore = create((set) => ({
  isLoading: false,
  message: null,
  show: (message = null) => set({ isLoading: true, message }),
  hide: () => set({ isLoading: false, message: null }),
}));
```

#### `create()` 가 하는 일

1. 상태 객체(`isLoading`, `message`)를 메모리에 보관
2. `set()` 이 호출되면 해당 상태를 구독 중인 **모든 컴포넌트를 자동으로 리렌더링**
3. 훅(`useLoadingStore`)을 반환 → 컴포넌트에서 `import` 해서 사용

```
show() 호출
  → set({ isLoading: true })
  → Zustand 내부에서 구독자 목록 순회
  → GlobalLoadingOverlay 리렌더링
  → null → <오버레이 JSX> 로 바뀜
```

---

## 2단계: 로직 캡슐화 — 커스텀 훅

### 커스텀 훅이란?

`use` 로 시작하는 함수는 React 훅입니다.  
안에서 다른 훅(`useState`, `useEffect`, `useXxxStore` 등)을 쓸 수 있습니다.

**반복되는 패턴을 하나의 함수로 묶는 것**이 커스텀 훅의 핵심입니다.

### 기존 패턴 (반복 코드)

```js
// 모든 컴포넌트마다 이걸 써야 했습니다
const [isLoading, setIsLoading] = useState(false);

setIsLoading(true);
try {
  await someApi.doSomething();
} finally {
  setIsLoading(false); // 에러가 나도 반드시 실행
}
```

### useLoading 훅으로 캡슐화

```js
// src/hooks/useLoading.js
export const useLoading = () => {
  const { show, hide, isLoading } = useLoadingStore();

  const run = async (asyncFn, message = null) => {
    show(message);        // 1. 오버레이 표시
    try {
      return await asyncFn(); // 2. 비동기 함수 실행
    } finally {
      hide();             // 3. 반드시 오버레이 숨김 (에러 나도 실행됨)
    }
  };

  return { run, isRunning: isLoading };
};
```

#### `try / finally` 가 중요한 이유

```js
show();
try {
  await riskyOperation(); // ← 여기서 에러가 터지면?
} finally {
  hide(); // ← catch 없어도 finally는 반드시 실행됩니다
}
```

`finally` 블록은 **성공하든 실패하든 무조건 실행**됩니다.  
`hide()` 를 `finally` 에 넣으면 에러가 나도 오버레이가 영원히 남는 버그를 방지합니다.

#### 고차 함수 (Higher-Order Function) 패턴

`run()` 은 함수를 인자로 받아서 실행합니다.

```js
// asyncFn 자리에 함수를 넘깁니다
await run(
  () => importApi.bootstrapAdminCsv(file, playStyle), // ← 이게 asyncFn
  'DB 적재 중...'
);
```

`() => importApi.bootstrapAdminCsv(...)` 는 **화살표 함수로 API 호출을 감싼 것**입니다.  
이렇게 하면 `run()` 이 타이밍을 직접 제어할 수 있습니다 — `show()` 다음에 실행하기 위해.

---

## 3단계: UI — GlobalLoadingOverlay

### 왜 App.jsx 최상단에 놓는가?

```jsx
// App.jsx
function App() {
  return (
    <Router>
      <GlobalLoadingOverlay />  {/* ← 한 번만, 최상단에 */}
      <Toaster ... />
      <Routes> ... </Routes>
    </Router>
  );
}
```

- **한 번만**: 오버레이는 앱 전체에 하나면 충분합니다
- **최상단**: `z-index: 9999` 로 다른 모든 UI 위에 올라갑니다
- `isLoading` 이 `false` 면 `return null` → DOM에 아무것도 추가되지 않습니다

### `position: fixed` 의 역할

```css
position: fixed;
inset: 0;        /* top: 0; right: 0; bottom: 0; left: 0 의 단축 */
z-index: 9999;
```

- `position: fixed` — 스크롤과 무관하게 **뷰포트(화면)** 기준으로 고정
- `inset: 0` — 화면 네 변 모두에 딱 붙음 → 전체 화면 커버
- `z-index: 9999` — 다른 모든 요소(헤더, 모달 등) 위에 올라옴

### `backdrop-filter: blur` 의 역할

```css
backdrop-filter: blur(6px);
```

오버레이 **뒤에 있는 콘텐츠** 를 흐리게 만듭니다 (`background` 를 투명하게 해야 보임).  
배경이 완전히 가려지지 않아 "잠시 멈춤" 느낌을 줍니다.

> 💡 `background: rgba(2, 6, 23, 0.82)` 처럼 알파값(0.82)을 1 미만으로 해야  
> blur 효과가 배경을 통해 보입니다.

### CSS 애니메이션 원리

#### 이중 스피너

```
외부 SVG: 시계 방향 1초 회전 (spinCW)
내부 SVG: 반시계 방향 0.7초 회전 (spinCCW)
```

두 링이 **다른 속도, 다른 방향** 으로 돌아서 복잡해 보이지만, 원리는 단순합니다:

```css
@keyframes spinCW  { to { transform: rotate(360deg);  } }
@keyframes spinCCW { to { transform: rotate(-360deg); } }
```

`rotate(360deg)` 는 한 바퀴 회전입니다.  
`animation: spinCW 1s linear infinite` — 1초마다 무한 반복.

#### 카드 슬라이드업

```css
@keyframes cardSlideUp {
  from { opacity: 0; transform: translateY(16px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0)    scale(1);    }
}
```

- `opacity: 0 → 1` — 서서히 나타남 (fade in)
- `translateY(16px) → 0` — 아래에서 위로 올라옴
- `scale(0.97) → 1` — 약간 커지며 등장

세 가지가 **동시에** 일어나서 "팝업이 자연스럽게 등장하는" 느낌을 만듭니다.

#### `cubic-bezier(0.34, 1.56, 0.64, 1)` 이란?

애니메이션 속도 커브(이징)입니다. 0~1 사이를 넘어가는 값(1.56)이 있어서  
목표 위치를 **살짝 지나쳤다가 돌아오는** 스프링 효과가 납니다.

```
linear:        ──────────────────→ (일정한 속도)
ease:          ─────────────────→  (끝에서 느려짐)
cubic-bezier:  ──────────────────→ (목표를 지나쳤다가 돌아옴 ← 스프링!)
              (이 값을 사용한 것)
```

---

## 연결 흐름 최종 정리

```
사용자가 "Init DB" 클릭
    │
    ▼
AdminBootstrapUpload.handleFileSelect()
    │  run(() => importApi.bootstrapAdminCsv(...), 'SP 데이터를 DB에 적재하는 중...')
    ▼
useLoading.run()
    ├─ loadingStore.show('SP 데이터를...')
    │       │
    │       ▼
    │   isLoading = true, message = 'SP 데이터를...'
    │       │
    │       ▼ (Zustand 구독자 자동 리렌더링)
    │   GlobalLoadingOverlay
    │       └─ isLoading = true → 오버레이 DOM 삽입
    │
    ├─ await importApi.bootstrapAdminCsv(...)  (백엔드 처리 중...)
    │
    └─ (성공/실패 무관) finally → loadingStore.hide()
            │
            ▼
        isLoading = false
            │
            ▼ (Zustand 구독자 자동 리렌더링)
        GlobalLoadingOverlay → return null → DOM에서 제거
```

---

## 배운 점 / 핵심 개념 요약

| 개념 | 설명 |
|---|---|
| **Zustand** | React 트리 밖 전역 상태 관리. 어디서든 읽기/쓰기 가능 |
| **커스텀 훅** | `use`로 시작하는 함수. 반복 로직을 묶어 재사용 |
| **try / finally** | 성공·실패 모두에서 실행. 리소스 정리(hide)에 필수 |
| **고차 함수** | 함수를 인자로 받아 실행 타이밍을 제어 |
| **position: fixed + inset: 0** | 화면 전체를 덮는 오버레이의 기본 패턴 |
| **backdrop-filter: blur** | 뒤 콘텐츠를 흐리게, 배경이 반투명이어야 동작 |
| **CSS @keyframes** | `from → to` 사이 값을 브라우저가 보간(interpolate) |
| **cubic-bezier** | 애니메이션 속도 커브. 1.56 같은 오버슈트로 스프링 효과 |

---

## 관련 파일

- [`src/store/loadingStore.js`](../../src/store/loadingStore.js)
- [`src/hooks/useLoading.js`](../../src/hooks/useLoading.js)
- [`src/components/common/GlobalLoadingOverlay.jsx`](../../src/components/common/GlobalLoadingOverlay.jsx)
- [`src/components/admin/AdminBootstrapUpload.jsx`](../../src/components/admin/AdminBootstrapUpload.jsx) — 실제 사용 예시
