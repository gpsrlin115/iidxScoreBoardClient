# 브랜치와 릴리스

| 브랜치 | 역할 |
|---|---|
| `dev` | 개발 통합 브랜치. 기능·수정·CI·의존성 PR은 모두 여기로 보낸다. |
| `main` | 운영 배포 브랜치. push되면 `deploy-frontend.yml`이 배포한다. |

## 규칙

- PR은 `dev`로 보낸다. `main`으로 직접 보내지 않는다.
- 예외는 Dependabot 보안 업데이트다. 이 PR은 설정과 상관없이 `main`으로 열린다.
- 릴리스는 `dev` → `main` PR을 **머지 커밋**으로 합친다.
- `main`에 push되면 `back-merge-main-to-dev.yml`이 `main`을 `dev`에 되돌려 합친다.
- Dependabot 버전 업데이트는 `dependabot.yml`의 `target-branch: dev`로 `dev`에 열린다.

## 왜 이렇게 바꿨나

2026-09-27 기준 `dev`가 `main`보다 18커밋 뒤처져 있었다. 원인은 두 가지였다.

- 기능·CI·의존성 PR(#37·#38·#40·#42·#46·#47·#50·#51·#53·#55)이 `main`으로 바로 들어갔다.
- 릴리스 머지 커밋을 `dev`로 되돌려 합친 적이 없었다.

그 결과 `dev`에는 PR 검증 워크플로(`verify-frontend.yml`)조차 없었고, `dev`로 보낸 PR에는 CI가 전혀 돌지 않았다. `dev`에 `main`에 없는 커밋이 없어서 `dev`를 `main`으로 fast-forward해 맞췄고, 같은 일이 반복되지 않게 역머지를 자동화했다.

## 역머지가 실패했을 때

Actions에서 "Back-merge main into dev"가 실패하는 경우는 두 가지다. 충돌이 났거나, `dev`로 다른 머지가 연달아 들어와 push가 세 번 모두 거절된 경우다. 아래처럼 손으로 합친다.

```bash
git fetch origin
git switch -c chore/back-merge-main origin/dev
git merge --no-ff origin/main
# 충돌을 풀고 커밋한 뒤 dev 대상 PR을 연다
```

충돌 없이 push만 거절된 경우라면 Actions 화면에서 워크플로를 다시 실행해도 된다(`workflow_dispatch`).
