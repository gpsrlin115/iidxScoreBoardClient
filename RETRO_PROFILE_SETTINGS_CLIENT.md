# 프로필·계정 설정 클라이언트 작업 회고

작성일: 2026-09-22<br>
대상 브랜치: `feat/profile-settings`<br>
기준 브랜치: `origin/feat/google-oauth` (`86cf4da`)

## 1. 작업 배경과 목표

프로필은 단순한 사용자 정보 화면이 아니라, 이후 서비스의 공개 표시명, 성적 동기화 대상, 계정 보안, 외부 로그인 수단이 만나는 지점이다. 이번 요청의 목표는 사용자가 한 화면에서 다음을 관리할 수 있도록 클라이언트를 준비하는 것이었다.

- 공개 표시명으로 사용할 닉네임
- 비공개 IIDX-ID
- 프로필 사진
- 비밀번호 변경 또는 Google 기반 최초 비밀번호 설정
- CSV 가져오기 진입점과 향후 크롤링 기능의 상태

초기 요구에는 백엔드의 사용자 테이블과 API 변경도 포함돼 있었지만, 진행 중 역할을 분리했다. 이 작업에서는 백엔드 저장소를 변경하지 않고, 클라이언트 구현과 백엔드 작업자에게 전달할 계약 문서를 완성하는 것으로 범위를 확정했다.

## 2. 시작 상태와 작업 공간 선택

### 확인된 상태

원래 WSL 클라이언트 체크아웃은 `dev`가 `origin/dev`보다 26커밋 뒤였고, 다음과 같은 미추적 파일이 있었다.

- `.claude/`
- `AGENTS.md`
- `src/data/Sound Effect (15).wav`
- `src/data/Sound Effect (15).wav:Zone.Identifier`

이 상태에서 `pull` 또는 reset을 수행하면 사용자의 미추적 작업을 덮거나 기준을 불명확하게 만들 수 있었다. 또한 Google 계정 설정 화면은 아직 클라이언트 PR #34의 `feat/google-oauth`에 있고, 서버 Google OAuth 변경은 이미 `dev`에 병합된 상태였다.

### 고려한 선택지

| 선택지 | 장점 | 위험 또는 단점 |
| --- | --- | --- |
| 기존 `dev` 체크아웃에서 바로 구현 | 즉시 시작 가능 | 미추적 파일 보존과 최신 기준 확보를 동시에 보장하기 어려움 |
| `origin/dev`에서 새 기능 브랜치 생성 | 최신 기본 브랜치에 바로 맞춤 | 아직 병합되지 않은 PR #34의 `Profile`과 Google 설정을 다시 가져오거나 충돌을 해결해야 함 |
| PR #34 헤드에서 격리 worktree 생성 | 기존 Google 설정을 그대로 확장하고 원래 체크아웃을 보존 | PR #34가 병합되기 전까지 실제 대상 브랜치와 분리됨 |

### 결정

세 번째 선택지를 택했다. `/home/administrator/iidxScoreBoardClient-profile-settings`에 `feat/profile-settings` worktree를 만들고 `origin/feat/google-oauth`를 기준으로 삼았다.

이 결정으로 얻은 효과는 다음과 같다.

- 사용자의 원래 `dev` 체크아웃과 미추적 파일을 건드리지 않았다.
- PR #34가 이미 제공한 `/profile`, Google 연결, Google 재인증 기반 최초 비밀번호 설정 흐름을 유지했다.
- PR #34가 병합된 뒤에는 이 브랜치가 가진 기능 커밋만 `dev`와 비교하면 되므로, 불필요한 재구현을 피할 수 있다.

## 3. 범위와 제품 정책 결정

### 닉네임은 공개 식별자, username은 내부 식별자

사용자는 닉네임을 자유롭게 바꾸길 원했지만, 기존 `username`은 로그인·세션·점수 소유권·감사 로그 전반에 연결돼 있다. username 자체를 변경하면 기존 데이터와 세션의 참조가 흔들리고, 계정 찾기·Google 연결도 복잡해진다.

따라서 다음 경계를 정했다.

- `username`: 로그인과 내부 권한 판단을 위한 변경 불가 식별자
- `nickname`: 댓글과 사이드바에 보이는 고유 공개 표시명
- `iidxId`: 향후 동기화 대상을 위한 비공개 키

클라이언트는 새 서버가 오기 전에도 동작해야 하므로, 표시 영역에서 `nickname ?? username` 폴백을 사용한다. 서버 전환 기간에 nickname이 아직 응답되지 않아도 UI가 비거나 깨지지 않는다는 장점이 있다.

### IIDX-ID는 UI에서 편하게, 서버에서 권위 있게

IIDX-ID는 사용자가 `1234-5678`로 읽기 쉽게 보되, 계약상 요청에는 하이픈 없는 8자리 숫자를 보낸다. 빈 값은 `null`로 보내 등록 해제를 뜻한다.

클라이언트 정규화는 편의 기능이지 신뢰 경계가 아니다. 사용자가 브라우저 요청을 바꿀 수 있으므로, 형식·중복·소유권 관련 규칙은 백엔드가 반드시 다시 검증해야 한다. 이 원칙을 백엔드 인계 문서에 명시했다.

### 크롤링은 버튼만 만들고 실행은 만들지 않음

조사 결과 현재 클라이언트에는 크롤링 화면이 없고, 서버에는 외부 수집기가 이미 얻은 점수를 비교·저장하는 API만 있었다. 사용자 버튼 하나를 위해 프런트에서 외부 사이트 인증, 작업 큐, 재시도, 수집 상태를 임의로 만들면 실제 기능이 없는 화면이 되거나 보안 경계가 무너질 수 있다.

그래서 이번에는 다음으로 제한했다.

- CSV 가져오기는 실제 `/import/csv` 링크로 제공
- 크롤링은 비활성 `크롤링 준비 중` 카드로 제공
- IIDX-ID가 있으면 향후 동기화 시작 지점이라는 설명을 표시
- `/import/crawler` 경로, 크롤링 요청, 임시 로컬 저장소는 추가하지 않음

이 선택은 사용자가 기능 미완성 상태를 오해하지 않게 하면서, 크롤링 설계가 준비됐을 때 같은 카드에서 자연스럽게 기능을 확장할 수 있게 한다.

## 4. 구현 구조와 이유

### 프로필 화면을 독립 섹션으로 분리

기존 `Profile.jsx`는 Google 연결과 최초 비밀번호 설정을 담당했다. 여기에 모든 편집 상태를 한 파일에 추가하면 Google callback 상태, 아바타 파일 선택, 닉네임 저장, 일반 비밀번호 변경이 서로 영향을 주기 쉬워진다.

다음 컴포넌트로 나눴다.

| 구성 | 책임 |
| --- | --- |
| `ProfileAvatar` | 파일 선택·미리보기·업로드·삭제와 5MB/형식 사전 검증 |
| `ProfileDetailsForm` | 닉네임과 IIDX-ID 입력, 정규화, 필드별 오류 표시 |
| `PasswordChangeForm` | 현재 비밀번호 확인, 새 비밀번호 확인, 변경 요청 |
| `DataActions` | CSV 이동과 명확한 크롤링 준비 상태 |
| 기존 `Profile.jsx` | Google 연결/재인증 상태와 각 섹션 조합 |

이 구조에서 하나의 저장 요청 실패가 다른 섹션의 입력값이나 Google 진행 상태를 초기화하지 않는다.

### 인증 스토어를 즉시 갱신

프로필 저장 또는 아바타 변경 후 `/users/me`을 다시 요청하는 대신, API가 반환한 사용자 응답 또는 갱신된 `avatarUrl`로 Zustand 인증 스토어를 즉시 갱신한다.

선택 이유는 다음과 같다.

- 사이드바의 DJ 표시명과 아바타가 즉시 바뀐다.
- 추가 조회 요청과 그 요청이 실패했을 때의 애매한 성공 상태를 피한다.
- 서버 계약은 프로필 저장 성공 시 갱신된 `UserResponse`를 반환하도록 명확히 요구한다.

단, 이 방식은 백엔드가 전체 사용자 응답을 반환한다는 계약에 의존한다. 그래서 계약을 변경해야 한다면 프런트만 조용히 우회하지 않고 인계 문서와 API를 함께 조정해야 한다.

### 브라우저 API와 계약 테스트를 분리

`profileApi`는 실제 Axios 클라이언트를 바인딩하고, `profileClient`는 주입된 HTTP 클라이언트로 요청 형태만 만드는 순수 factory로 분리했다.

이 선택은 백엔드가 아직 없더라도 다음을 테스트할 수 있게 한다.

- `PUT /users/me/profile`의 요청 본문과 IIDX-ID 정규화
- `POST /users/me/password`의 요청 본문
- 기존 `/users/me/avatar` multipart 업로드와 delete 경로
- 서버 코드에 따른 닉네임/IIDX-ID/비밀번호 오류의 필드별 메시지

클라이언트는 자체 영구 저장소나 임시 성공 응답을 만들지 않았다. 실제 서버가 없다는 사실을 숨기지 않고, 테스트에서는 fake client만 사용했다.

### 아바타 안전성은 클라이언트와 서버에 이중으로 둠

클라이언트는 JPEG/PNG/GIF/WebP와 5MB 제한을 먼저 검사해 사용자가 큰 파일을 오래 업로드한 뒤 거절당하지 않게 한다. 선택한 파일은 `URL.createObjectURL`로 미리보기하고 cleanup에서 URL을 해제한다.

그러나 MIME type과 파일 크기는 클라이언트에서 신뢰할 수 없다. 따라서 백엔드 프롬프트에는 매직바이트 검증, 5MB 서버 제한, 새 파일 저장 후 DB 반영, 이전 파일 삭제 순서를 별도로 요구했다. 클라이언트 검증은 UX, 서버 검증은 보안과 데이터 일관성이라는 역할 분리를 유지했다.

## 5. 백엔드 인계 문서의 역할

`BACKEND_PROFILE_SETTINGS_PROMPT.md`는 기능 요청이 아니라 실행 가능한 계약 문서다. 다음 내용을 한곳에 고정한다.

- `users`의 nickname, 정규화 키, IIDX-ID 마이그레이션과 H2 대응
- 기존 사용자 nickname 백필
- `GET /api/users/me`, `PUT /api/users/me/profile`, `POST /api/users/me/password` 계약
- Google 전용 계정은 기존 재인증 기반 최초 비밀번호 설정을 계속 사용한다는 경계
- 다른 Spring Session 종료, 재설정 토큰 정리, 감사 이벤트, 요청 제한
- 댓글 API에서 실제 username을 공개하지 않는 전환 규칙
- 400/409/429 오류 코드와 테스트 요구사항

특히 public comment의 기존 `username` 필드는 구버전 클라이언트가 읽고 있다. 새 서버는 전환 기간에 그 필드를 제거하지 않고 nickname 값으로 채우며, 새 클라이언트는 `nickname ?? username`을 읽는다. 이 방식은 서버와 클라이언트가 동시에 배포되지 않아도 로그인 아이디 노출을 줄이고 화면을 유지한다.

## 6. 작업 중 발생한 문제와 해결

### 문제 1: WSL에서 Windows npm이 실행됨

처음 `npm test`를 실행했을 때 WSL 경로가 Windows `npm.cmd`로 전달됐다. Windows CMD는 UNC 작업 디렉터리를 기본 작업 디렉터리로 사용할 수 없어 다음 성격의 오류가 발생했다.

> UNC 경로는 지원되지 않습니다. Windows 디렉터리를 기본값으로 합니다.

이 상태의 명령은 테스트 결과를 신뢰할 수 없고, 프로세스도 정상 종료하지 않았다.

해결은 WSL용 Node 22.23.2를 명시적으로 선택하는 것이었다.

```bash
source /home/administrator/.nvm/nvm.sh
nvm use --silent 22.23.2
```

이후 모든 Node 명령은 `bash --noprofile --norc` 환경에서 WSL Node/NPM을 명시해 실행했다.

### 문제 2: 불완전한 의존성 설치로 기존 테스트가 실패함

Windows npm 경로를 거친 설치 뒤에는 `zustand`, `react`를 찾지 못해 기존 테스트 일부가 실패했다. 이는 새 프로필 코드가 아니라 worktree의 의존성이 현재 Node 런타임에 맞게 설치되지 않은 상태였다.

WSL Node를 선택한 뒤 `npm ci`를 다시 실행했고, 이후 전체 테스트가 정상적으로 통과했다. 의존성 보안 경고는 1 moderate, 5 high로 출력됐지만, 이번 작업에서 lockfile이나 의존성 버전을 변경하면 프로필 기능 범위를 넘으므로 별도 보안 업데이트 작업으로 남겼다.

### 문제 3: Node 테스트가 Vite의 확장자 생략 import를 해석하지 못함

새 계약 테스트가 `profile.js`를 직접 import했을 때, 그 모듈이 Vite 환경에서는 문제없는 `./client` 확장자 생략 import를 포함해 Node의 ESM 해석에서 실패했다.

처음에는 테스트만의 문제처럼 보였지만, 실제 목표는 API 계약을 backend 없이 테스트하는 것이었다. 그래서 test를 억지로 Vite에 의존시키지 않고 다음과 같이 구조를 바꿨다.

- `profile.js`: Axios 기반 실제 API binding
- `profileClient.js`: 주입받은 client만 사용하는 브라우저 독립 request factory
- `profile.test.js`: `profileClient.js`에 fake client를 주입

그 결과 production 코드의 Axios/CSRF 설정은 유지하면서도 요청 형상을 순수 Node 테스트로 검증할 수 있게 됐다.

### 문제 4: 아바타 오류 메시지가 즉시 지워짐

초기 `ProfileAvatar` 구현에서는 지원하지 않는 파일 또는 5MB 초과 파일을 선택한 뒤 오류 메시지를 설정하고 `clearSelection()`을 호출했다. 하지만 `clearSelection()`도 오류 상태를 비워서, 사용자에게 왜 파일 선택이 취소됐는지 보이지 않는 문제가 있었다.

파일 상태만 초기화하는 `resetFile()`과 사용자 의도로 오류까지 닫는 `clearSelection()`을 분리했다. 오류 상황에서는 전자만 사용해 메시지를 유지하고, 사용자가 취소하거나 업로드가 성공했을 때만 후자를 사용한다.

### 문제 5: ESLint의 제어문자 정규식 규칙

닉네임 입력에서 제어문자를 막기 위해 범위 기반 정규식을 작성했지만, ESLint의 `no-control-regex` 규칙이 이를 오류로 판단했다. 의미를 유지하면서 Unicode property escape인 `/\p{Cc}/u`로 바꿨다.

이 방식은 줄바꿈을 포함한 Unicode 제어 문자를 더 명확하게 표현하고 lint도 통과한다.

## 7. 검증 결과와 한계

### 수행한 검증

WSL Node 22.23.2 환경에서 다음을 실행했다.

```bash
npm ci
npm test
npm run lint
npm run build
```

최종 결과는 다음과 같다.

- `npm test`: 123 passed, 0 failed
- `npm run lint`: passed
- `npm run build`: passed

새 테스트는 닉네임 NFKC 정규화, IIDX-ID 표시/전송 형식, 프로필·비밀번호 API body, 아바타 multipart/delete 경로, 오류 코드 매핑을 포함한다.

### 아직 하지 않은 검증

- 실제 백엔드가 아직 계약을 구현하지 않았으므로 브라우저에서 프로필 저장·비밀번호 변경·아바타 업로드의 live API 검증은 하지 않았다.
- 인증된 상태를 만들어 390px 화면에서 수동으로 확인하는 스모크도 live API와 함께 후속 단계로 남겼다.
- 크롤링 기능은 의도적으로 만들지 않았으므로 크롤링 실행 검증도 없다.

이 항목들은 실패가 아니라, 역할 분리와 백엔드 선배포 원칙에 따른 미실행 범위다. 백엔드 결과가 오면 JSON 응답, 상태 코드, CSRF, 다른 세션 종료, 아바타 파일 처리까지 실제 세션으로 통합 검증해야 한다.

## 8. 다음 단계

1. `BACKEND_PROFILE_SETTINGS_PROMPT.md`를 백엔드 작업자에게 전달한다.
2. 백엔드 구현 결과의 migration 이름, API JSON, 오류 코드, 테스트 결과를 이 계약과 대조한다.
3. 실제 서버가 준비되면 클라이언트에서 프로필 저장, IIDX-ID 해제, 아바타 변경/삭제, 일반 계정 비밀번호 변경, Google 전용 계정 최초 비밀번호 설정을 실세션으로 검증한다.
4. 390px 모바일, 키보드 포커스, 댓글/사이드바 표시명 전환을 브라우저에서 확인한다.
5. 서버를 먼저 배포할 수 있는지 확인한 뒤 클라이언트를 배포한다. commit, push, PR, merge, 배포는 별도 승인으로 진행한다.

## 9. 산출물 목록

- `src/pages/Profile.jsx`
- `src/components/profile/ProfileAvatar.jsx`
- `src/components/profile/ProfileDetailsForm.jsx`
- `src/components/profile/PasswordChangeForm.jsx`
- `src/components/profile/DataActions.jsx`
- `src/api/profile.js`
- `src/api/profileClient.js`
- `src/utils/profile.js`
- `src/utils/profileError.js`
- `test/profile.test.js`
- `BACKEND_PROFILE_SETTINGS_PROMPT.md`
