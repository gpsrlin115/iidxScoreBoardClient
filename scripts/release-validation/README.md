# 릴리스 검증 도구

`dev`를 `main`에 올리기 전에, 운영에 나갈 빌드 산출물(`dist/`)을 그대로 띄워 Chrome과 Firefox에서 주요 화면을 자동으로 확인하는 도구다. `main` 푸시는 곧바로 운영 배포로 이어지기 때문에 그 전에 쓴다.

- 백엔드 없이 돈다. `/api`는 가짜 서버가 미리 정한 JSON으로 답한다.
- 서버 응답을 두 모양으로 흉내 낸다. **구 서버**는 서버 `main`, **새 서버**는 서버 `dev`다. 프런트가 서버보다 먼저 배포돼도 괜찮은지 볼 수 있다.
- 운영 서버에는 요청을 보내지 않는다. 번들의 API 주소가 상대 경로 `/api`라 모두 가짜 서버로 간다.

처음 쓴 기록(2026-09-29, dev `34e902a`)은 로컬 전용 `docs/history/2026-09-release-validation/`에 있다.

## 구성

| 파일 | 하는 일 |
|---|---|
| `server.mjs` | `dist/`를 서빙하고, `index.html` 머리에 `probe.js`를 끼워 넣는다. `/api/*`는 `--mode old\|new`에 따라 구 서버나 새 서버 모양으로 답한다 |
| `probe.js` | 앱보다 먼저 실행되는 탐침. 주소의 `?probe=<종류>:<인자>`대로 업로드·PNG 저장 같은 조작을 대신하고, 결과를 `window.__probe`에 남긴다. 앱 코드는 건드리지 않는다 |
| `start.sh` / `stop.sh` | 가짜 서버 3개를 켠다 / `start.sh`가 기록한 PID로 끈다 |
| `make_jobs.py` | 브라우저별 작업 목록 `jobs-chrome.json`(48건), `jobs-firefox.json`(35건)을 만든다 |
| `drive.ps1` | Windows PowerShell 스크립트. Chrome은 CDP, Firefox는 WebDriver BiDi로 작업 목록을 돌며 보고 JSON·캡처·저장된 PNG를 남긴다 |
| `kill.ps1` | 이 도구가 띄운 브라우저만 테스트 프로필 경로로 골라 끈다 |
| `summarize.py` | 보고 JSON을 한 줄씩 요약한다 |
| `pngdiff.py` | PNG 두 장에서 다른 픽셀 수를 센다(PIL 없이) |

| 포트 | 빌드 | 응답 모양 | 용도 |
|---|---|---|---|
| 5301 | 검증할 빌드 | 새 서버 | 서버 배포 뒤의 화면 |
| 5302 | 검증할 빌드 | 구 서버 | 서버 배포 전의 화면 |
| 5303 | `main` 빌드 | 구 서버 | 지금 운영 화면. 시각 비교 기준선 |

| `?probe=` 값 | 하는 일 |
|---|---|
| `smoke:<이름>` | 화면이 다 그려진 뒤 제목·본문 길이·오류 화면 여부를 기록 |
| `admin:<success\|partial\|allfail\|http500\|http403>` | 관리자 화면의 "Init DB" 입력에 `SCENARIO=<값>`이 든 CSV를 넣는다. 가짜 서버가 이 표지를 보고 응답을 고른다. 결과 토스트의 글자·목록·계산된 스타일을 기록 |
| `scores:x` | 점수 화면의 플레이 수 사례 카드(제목이 `PC `로 시작) 하단 문구와 툴팁을 기록 |
| `png:<chips\|dense>` | "PNG 다운로드"를 누르고, 다운로드로 가는 Blob을 가로채 크기와 배경색(`#050813`)이 아닌 픽셀 수를 잰다 |
| `stale:<청크 이름>` | 가짜 서버에 그 lazy 청크를 404로 만들게 한 뒤 이동한다. 배포 중 열려 있던 탭을 흉내 낸다 |

## 실행

WSL에서 돌린다. WSL에는 리눅스용 브라우저가 없어서 Windows의 Chrome·Firefox를 쓴다.

Windows에서 WSL의 `localhost`는 닿지만, WSL에서 Windows 브라우저의 디버깅 포트로는 NAT 때문에 닿지 않는다. 그래서 브라우저 조종은 Windows 안에서 도는 `drive.ps1`이 맡는다.

```bash
# 0) nvm의 node를 앞에 둔다 (세션에 따라 npm이 Windows 쪽으로 잡힌다)
export PATH=/home/administrator/.nvm/versions/node/v22.23.2/bin:$PATH
V=scripts/release-validation

# 1) 검증할 빌드(저장소 루트에서)와 main 기준선 빌드
npm ci && npm run build:oci
BASE=$(mktemp -d)
git archive origin/main | tar -x -C "$BASE"
(cd "$BASE" && npm ci && npm run build:oci)

# 2) 가짜 서버 3개
$V/start.sh dist "$BASE/dist"

# 3) Windows 임시 폴더에 스크립트와 작업 목록
W=/mnt/c/Users/Administrator/AppData/Local/Temp/relval
mkdir -p $W && cp $V/drive.ps1 $V/kill.ps1 $W/ && python3 $V/make_jobs.py $W

# 4) Chrome, Firefox 순서로 (각 1~3분)
WIN='C:\Users\Administrator\AppData\Local\Temp\relval'
for b in chrome firefox; do
  (cd /mnt/c && powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$WIN\\drive.ps1" \
    -Browser $b -JobsFile "$WIN\\jobs-$b.json" -OutDir "$WIN\\out-$b")
done

# 5) 결과
cat $W/out-chrome/drive-chrome.log
python3 $V/summarize.py $W/out-chrome
python3 $V/summarize.py $W/out-firefox
python3 $V/pngdiff.py $W/out-chrome/chrome-mainold-smoke-tier.png $W/out-chrome/chrome-devold-smoke-tier.png

# 6) 정리 (남길 결과는 먼저 복사한다)
$V/stop.sh
(cd /mnt/c && powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$WIN\\kill.ps1")
rm -rf $W
```

## 결과 읽는 법

- `drive-*.log`의 모든 줄이 `done=True`여야 한다. `False`면 탐침이 끝나지 않은 것이니 그 JSON의 `failure`부터 본다.
- `summarize.py` 출력은 `ok: true`, `err: 0`이어야 한다.
  - 예외는 `stale-scores`의 `err: 5`다. 일부러 낸 청크 404와 ErrorBoundary 로그라 정상이다.
- `png`의 `nonBackgroundPixels`는 0보다 훨씬 커야 한다. 0이면 배경색만 찍힌 것이다(PR #70에서 고친 버그).
- `pngdiff.py`의 기준 허용 오차는 채널당 24다. 배경의 별 반짝임 때문에 허용 오차 0으로는 0.1% 안팎이 늘 다르다.

## 서버 계약이 바뀌면

가짜 응답은 서버 DTO를 보고 손으로 만들었다. 서버 응답 필드가 바뀌면 `server.mjs`의 다음 부분을 같이 고친다.

- `PLAY_CASES`, `NEW_ONLY`: 점수 응답(`ScoreResponse`)
- `failuresNew`, `bootstrap()`: DB 초기화 응답(`BootstrapImportResponse`, `ImportFailure`)

새 필드가 서버 `main`에 배포된 뒤에는 `old` 모드가 더는 운영과 같지 않다. 그때는 `NEW_ONLY`를 비우거나 다음 계약 변경 기준으로 다시 정한다.

## 알려진 함정

- `drive.ps1`은 테스트 프로필 `<작업 폴더>\profile-<브라우저>`를 쓴다.
  - 프로필 디스크 캐시가 실행 사이에 남는다. `stale:` 시나리오 전에는 그 폴더를 지운다.
  - 가짜 서버는 에셋을 `no-store`로 내보내지만, 다른 서버에서 받은 캐시까지 무효로 만들지는 못한다.
- `pkill -f server.mjs`는 호출한 셸 자신과도 일치할 수 있다. 끌 때는 `stop.sh`를 쓴다.
- 헤드리스 Firefox는 빈 프로필로 띄운다. `browsingContext.getTree`의 첫 컨텍스트는 권한 창이라 새 탭을 만들어 쓴다(`drive.ps1`에 반영됨).
