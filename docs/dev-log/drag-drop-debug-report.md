# Admin Tier Table 드래그 앤 드롭 버그 디버깅 리포트

**프로젝트**: iidxScoreBoardClient  
**파일**: `src/pages/AdminTierTable.jsx`, `src/store/adminTierStore.js`  
**날짜**: 2026-04-09

---

## 증상

Unassigned Pool에서 tier row로 노래를 드래그하면 간헐적으로 또는 항상 snap back(원위치 복귀)이 발생.

---

## 디버깅 과정

### 1단계: 초기 코드 분석

**발견한 설계 문제 2가지**:

1. `handleDragEnd`에 cross-container 처리가 없었음  
   - same-container 재정렬만 처리하고, cross-container drop은 그냥 return  
   - `handleDragOver`가 미처 처리 못한 경우 snap back 발생

2. `moveItemBetweenContainers`가 stale closure 사용  
   - `draftTierData`, `unassignedSongs`를 컴포넌트 scope에서 직접 참조  
   - 빠른 드래그 시 오래된 state로 잘못된 계산

**1차 수정 (Antigravity)**:
- `handleDragOver` / `handleDragEnd`에서 `useAdminTierStore.getState()`로 최신 state 조회
- `moveItemBetweenContainers`를 순수 함수로 변환 (state를 파라미터로 수신)
- `handleDragEnd`에 else 블록 추가 (cross-container fallback)
- `findContainer`를 state 파라미터 수신 가능하도록 리팩토링

→ **여전히 안 됨**

---

### 2단계: 로그가 아예 안 찍히는 문제

콘솔 로그를 추가했는데 아무것도 출력되지 않음.

**원인 분석**:

`handleDragOver`에서 상태를 즉시 업데이트하고 있었음.

```
handleDragOver 호출 → moveItemBetweenContainers → updateDraftState (상태 변경)
→ 다음 handleDragOver 호출 시 findContainer가 이미 이동된 위치를 찾음
→ activeContainer === overContainer 조건 성립 → early return
→ 로그 찍히기 전에 return됨
```

더 근본적인 문제: `handleDragOver`에서 상태를 업데이트하면 @dnd-kit 내부 추적과 React state가 불일치 → snap back 유발.

**2차 수정**:
- `handleDragOver`를 no-op으로 변경 (상태 업데이트 금지)
- 모든 상태 변경을 `handleDragEnd`에서만 처리

→ **로그는 찍히기 시작했으나 여전히 안 됨**

---

### 3단계: overId와 activeId가 동일한 문제

```
🏁 handleDragEnd START {active: 'Lisa-RICCIA', over: 'Lisa-RICCIA'}
```

드롭 타겟이 S+ tier가 아니라 자기 자신(원본 노래)으로 인식됨.  
→ collision detection이 tier row를 감지하지 못함

추가 로그로 확인:
```
📍 Containers detected {activeContainer: 'unassigned', overContainer: null, overId: 'S+'}
❌ Missing container info, returning
```

`overId: 'S+'`인데 `overContainer: null` → `Object.keys(currentTierData).includes('S+')` === **false**

**원인**: `currentTierData = {}` (완전히 비어있음)

---

### 4단계: draftTierData가 빈 객체인 이유 추적

`fetchDataForEdit`에 로그 추가:

```
📥 Tier draft received: {}
📥 All songs received: 590 songs
📥 Setting state with tiers: []  unassigned: 590
```

**발견**:
- API가 `{}` 반환 (백엔드에 저장된 draft 없음)
- `safeTiers = draftTiers || {}` → 빈 객체 그대로 사용
- `draftTierData`에 tier 키들이 없음

**UI와의 불일치**:
```javascript
// AdminTierTable.jsx
const orderedTiers = Object.keys(draftTierData).length > 0 
  ? Object.keys(draftTierData) 
  : ['S+', 'S', 'A+', 'A', 'B+', 'B', 'C', 'D', 'E', 'F'];  // fallback
```

UI에는 fallback으로 S+, S 등이 렌더링되지만, `draftTierData`에는 해당 키가 없음.  
→ `Object.keys({}).includes('S+')` === false → 드롭 타겟 인식 실패

#### 중간에 발견된 인증 문제

API가 처음에 `403 Forbidden`을 반환하고 있었음.  
원인: 세션 만료로 자동 로그아웃된 상태. 재로그인 후 403 해소.

---

## 최종 원인 요약

| 레이어 | 문제 |
|--------|------|
| **백엔드 데이터** | 저장된 draft가 없어서 `draftTierData: {}` |
| **UI 렌더링** | fallback으로 tier row는 보임 |
| **드롭 감지** | `Object.keys({}).includes('S+')` === false → 드롭 타겟 인식 실패 |
| **결과** | snap back (상태 업데이트 없음) |

---

## 최종 수정

### `adminTierStore.js`

draft가 비어있으면 기본 tier 구조로 초기화:

```javascript
// 변경 전
const safeTiers = draftTiers || {};

// 변경 후
const DEFAULT_TIERS = { 'S+': [], 'S': [], 'A+': [], 'A': [], 'B+': [], 'B': [], 'C': [], 'D': [], 'E': [], 'F': [] };
const safeTiers = (draftTiers && Object.keys(draftTiers).length > 0) ? draftTiers : DEFAULT_TIERS;
```

### `AdminTierTable.jsx`

`handleDragOver`를 no-op으로 변경 (상태 업데이트 금지):

```javascript
const handleDragOver = (event) => {
  // @dnd-kit 내부 추적과의 불일치를 방지하기 위해 상태 업데이트 없음
  // 모든 상태 변경은 handleDragEnd에서만 수행
};
```

---

## 교훈

1. **@dnd-kit 패턴**: `handleDragOver`에서 상태를 업데이트하면 라이브러리 내부 상태와 불일치 발생 → snap back. 상태 변경은 `handleDragEnd`에서만 할 것.

2. **UI와 State의 불일치 주의**: UI fallback 렌더링과 실제 state가 다를 수 있음. tier row가 화면에 보인다고 state에도 해당 키가 있다고 가정하면 안 됨.

3. **빈 데이터 처리**: 백엔드에서 빈 응답이 오는 경우 적절한 기본값으로 초기화해야 함.

4. **디버깅 순서**: 증상(snap back) → 로그 추가 → 로그가 안 찍히는 이유 분석 → 데이터 흐름 추적 → 근본 원인 발견
