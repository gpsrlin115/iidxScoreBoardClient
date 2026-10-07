# 본인 기록 수집 UI 로컬 검증

이 도구는 빌드된 프런트엔드를 `127.0.0.1`에 제공하고, `/api` 요청에 결정적인 로컬 모의 응답을 돌려준다. e-amusement 또는 백엔드에 연결하지 않는다. 시나리오를 바꿀 때마다 모의 연결, 작업, 요청 통계를 초기화한다. 요청 추적에는 HTTP 메서드와 경로, CSRF 유효 여부, JSON 본문 키만 기록한다.

## 실행

저장소 명령은 WSL Ubuntu 경로에서 실행한다.

```bash
cd /home/administrator/iidxScoreBoardClient
export PATH=/home/administrator/.nvm/versions/node/v22.23.2/bin:/usr/local/bin:/usr/bin:/bin
npm run build:oci
/home/administrator/.nvm/versions/node/v22.23.2/bin/node scripts/rival-validation/server.mjs --dist dist --port 5310
```

브라우저에서 [http://127.0.0.1:5310/import/csv](http://127.0.0.1:5310/import/csv)를 연다. 모의 API의 기본 시나리오는 `normal`이다. 테스트 계정은 가짜 로그인 사용자이며, 확인 입력란에는 실제 쿠키를 넣지 않는다.

다른 터미널에서 시나리오를 설정하고 요청 추적을 확인할 수 있다.

```bash
curl -sS -X POST http://127.0.0.1:5310/__mock \
  -H 'Content-Type: application/json' \
  -d '{"scenario":"normal"}'
curl -sS http://127.0.0.1:5310/__mock
```

`GET /__mock`은 현재 시나리오, 상태, API별 요청 수, 최근 추적 내역, 최대 동시 상태 조회 수를 반환한다. 확인 요청 추적에는 `bodyKeys: ["eagateCookie"]`가 보이고, 본인 작업 등록은 `POST /crawler/rival/jobs/me`에 `hasBody: false`로 기록된다. 쿠키 값이나 헤더 원문은 추적에 넣지 않는다. 모든 시나리오는 실제 인증 또는 네트워크 수집의 증거가 아니다.

## 지원 시나리오

시나리오 이름은 서버 소스의 허용 목록과 일치한다.

| 시나리오 | 확인할 동작 |
| --- | --- |
| `normal` | 본인 확인 후 작업 요청, 활성 상태 폴링, DONE 및 점수 갱신 |
| `verification-failed` | 본인 확인 오류 표시, 세션 로그인은 유지 |
| `rate-limit` | `Retry-After: 3` 기반 확인 재시도 제한 |
| `rate-limit-no-time` | 재시도 시각이 없는 429 처리 |
| `already-linked` | 이미 다른 계정에 연결된 코드 오류 |
| `disabled` | 서버 기능 비활성 및 CSV/북마클릿 대체 안내 |
| `disabled-active` | 기능 비활성 중에도 기존 활성 작업 취소 가능 |
| `undeployed` | 작업 API 404 및 배포 상태 안내 |
| `operator-unavailable` | 등록 시 운영 수집 세션 준비 안 됨 오류 |
| `partial` | 일부 저장 가능성을 표시하는 부분 완료 상태 |
| `failed` | 실패 상태와 수동 재요청 안내 |
| `cancelled` | 취소된 작업 상태 |
| `active` | 이미 진행 중인 작업 및 중복 요청 방지 |
| `null-progress` | 누락된 진행률 필드를 꾸며내지 않는지 확인 |
| `verification-slow` | 확인 대기 중 연결 해제 후 늦은 응답 무시 |
| `expire-session` | API 401 처리 |
| `cancel-missing` | 취소 중 대상 작업이 사라지는 경합 처리 |

시나리오별 실제 분기는 `server.mjs`의 `/__mock` 처리와 API 라우트에 있다. 화면 문구나 동작을 바꾼 뒤에는 관련 시나리오를 재생해 확인한다. 서버 종료는 터미널에서 `Ctrl+C`를 누른다.

## 기록된 검사 결과의 해석

검증 기록에는 다음 UI 흐름이 포함된다: 본인 확인부터 DONE 및 점수 화면까지, 확인 실패와 로그인 유지, 활성 작업 취소, 느린 확인 도중 연결 해제, 비활성 기능, 작업 API 404. 점수 모의 응답은 수집 완료 뒤 점수와 PGreat 수치를 바꾸지만 MISS COUNT는 7로 유지한다.

요청 추적은 CSRF 보호 쓰기 요청과 상태 조회의 최대 동시성 1을 확인하는 데 쓰인다. 브라우저 저장소 전체를 검사하지 않으므로 “저장소에 비밀값이 없다”는 주장을 이 스크립트 결과만으로 할 수 없다. 실제 e-amusement 쿠키, 운영 백엔드, 서버 수집 세션, DB 저장은 이 도구의 범위 밖이다.
