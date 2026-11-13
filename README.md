# 카트에서 챔피언까지

**플레이: https://cart-to-champion.vercel.app/**

예전 주소 https://mjk516.github.io/Cart_to_Champion/ 도 열리고, 맨 위 안내 띠의 "내 커리어 가지고 새 주소로 가기"를 누르면 커리어가 함께 넘어온다.

12세 카트 유망주에서 F1 월드 챔피언까지 가는 레이싱 커리어 시뮬레이션. 브라우저에서만 돌아가는 정적 웹 게임이고, 진행 상황은 브라우저(localStorage)에 저장된다. 가입·결제·광고 없음.

비공식 팬 게임이다. Formula 1, FIA 및 각 팀·드라이버와 아무 관계가 없으며 승인받지 않았다. 규칙과 수치는 [SPEC.md](SPEC.md), 요구사항과 구현 현황은 [PRD.md](PRD.md), 바뀐 내용은 게임 안 **패치노트** 화면에 있다.

## 게임에 들어 있는 것

**커리어 만들기**
- 성·이름·별명(별명으로 불리기), 국적 64개국(나라에 맞는 성명 순서), 헬멧 색·무늬, 차 번호(실제 F1 번호는 경고)
- 난이도 쉬움·보통·어려움, 가정 자산 5단계, 성격 6종(기질에 따라 잠재력·기복·방출 위험), 후보 3명, 집중 육성, 손 서명

**커리어 진행**
- 카트 → F4 → FRECA → F3 → F2 → F1 사다리, 슈퍼 라이선스, 아카데미, 매니저 조언, 신인 F1 시트 7팀 추첨, 베테랑은 39세까지 F1 시트 보장
- 실제 2026 그리드·캘린더에서 시작해 갈라지는 세계: 드라이버 성장·노화·이적·은퇴, 나라별 가상 신인(그리드 이름 중복 없음), 팀 진입·철수, 캘린더 변화, 팀 대표 교체
- 대한민국 국적 군 복무

**성장과 훈련**
- 능력치 6개(XP·잠재력), 나이·성장형 곡선, 38세부터 노화
- 훈련은 한 해 3번: 시즌 전 계획, 시즌 중(F1은 그랑프리 사이 훈련 세션 2칸, 이후 레이스와 앞으로의 능력치에 반영), 시즌 후(비용 없는 훈련 2칸)
- 코치진 조언(따르면 손해 없음), 어려움은 훈련에 따라 성장이 크게 갈린다

**F1 라이브 주말**
- 프랙티스 → 퀄리파잉 → 스프린트 → 레이스, 실제 서킷 모양 트랙 뷰(배속 ×2~×60), 타이밍 타워, 사고 차 OUT 표시
- 팀 전략 회의: 출발 타이어(실제 F1에서 가장 많이 쓴 타이어를 팀 추천으로), 피트 전략, 성격별 도박·데이터 전략
- 엔지니어 무전: 세이프티카·VSC·비 시작·비 그침·피트 창·레드 플래그(무료 타이어 교체), 서킷별 실제 비 확률과 폭우, 인터·풀웻 타이어
- 레이스 넘기기(먼저 묻기), 결과로 바로 가기, 남은 시즌 자동 진행(시즌 중 훈련 세션에서 멈춤)
- 결승·스프린트 기사, 성격별 SNS 글, 실시간 댓글, 홈 그랑프리

**시즌 밖**
- 오프시즌 전환점 이벤트·기자회견(72개), 팀 내 1인자 경쟁, 언론·팬 반응, 제안 비교와 계약서 서명(첫 F1 서명을 계속 사용)
- 내구레이스(르망·스파·뉘르부르크링 24시, 프티 르망 등) 하이라이트 중계와 기사
- 시즌 결과: 최종 순위표, 팀메이트 맞대결, 주요 결승 기사, 성장 내역

**기록과 저장**
- 업적 34개, 최연소 기록(실제 기록과 비교), 팀 레전드, 내구레이스 기록, 은퇴 화면(커리어 카드·성장 곡선)
- 멈춘 곳부터 이어하기(레이스 랩까지), 커리어별 자동 백업 3개(불러오기·삭제), 저장 파일 내보내기·가져오기
- 게임 방법(실제 화면 그림), 패치노트(항목별 탭), 단어 단위 줄바꿈, 휴대폰 화면 지원

## 기술

- Vite 5 + React 18 + TypeScript, Tailwind CSS, Zustand(persist, 키 `kart-to-champion-save`)
- `src/engine/`: UI와 분리된 순수 TS 엔진. 모든 난수는 시드 기반(`rngFor`), 같은 시드·선택 로그면 결과가 같다(`replayCareer`)
- `src/app/`: 화면. 홈 밖의 화면은 나눠 불러오고 한가할 때 미리 받는다
- 테스트: Vitest(엔진·저장, 105개), Playwright(화면 흐름, 28개)

```
src/engine/  career·season·offseason(커리어 루프), race(랩 단위 레이스), strategy(타이어·비·전략),
             growth·coach(성장·훈련), events·eventsMore(이벤트), raceNews·feed·chatter(기사·반응),
             endurance(내구레이스), achievements(업적·기록), names·josa(이름·조사), data(실제 그리드·서킷)
src/app/     Home, Create, Dashboard, Weekend·LiveRace·StrategyMeeting·RaceAftermath, Offseason,
             Records, Retired, Guide, PatchNotes(patchNotesData), Screens(설정), store(저장)
e2e/         career·weekend·training-resume 화면 흐름 테스트
scripts/     balance, release-check, rate-drivers, build-circuits, guide-shots
```

## 실행

처음 한 번만, 개발 주소 이름을 이 컴퓨터에 등록한다(관리자 권한 필요):

```bash
sudo sh -c 'echo "127.0.0.1 cart-to-champion" >> /etc/hosts'
```

```bash
npm install
npm run dev        # http://cart-to-champion/
npm test           # 엔진·저장 테스트
npm run e2e        # 화면 흐름 자동 테스트(처음 한 번: npx playwright install chromium)
npm run build      # dist/에 정적 파일 생성
npm run preview    # 빌드 결과 미리 보기
```

개발 주소 참고:

- 80번 포트를 관리자 권한 없이 쓰려고 개발 서버를 모든 네트워크 주소(0.0.0.0)로 연다. 같은 네트워크의 기기도 IP로 접속할 수 있으니 공용 와이파이에서는 주의한다. 이름 접속은 `cart-to-champion`, `localhost`만 허용한다
- 예전 주소(`localhost:5173`)로 들어오면 그 주소에 저장된 커리어를 들고 새 주소로 옮겨 준다
- 80번 포트를 쓸 수 없으면 `npm run dev -- --port 5180 --host 127.0.0.1`로 띄우고 `http://localhost:5180/`을 연다

## 스크립트

| 명령 | 하는 일 |
|---|---|
| `npm run balance -- --n 60 --difficulty normal` | 자산 규모·성격별로 커리어를 자동 진행해 챔피언·F1 진출·방출 등 분포를 본다(`easy`·`normal`·`hard`) |
| `npm run release-check` | 좋은 시즌(챔피언·2~3위) 뒤 방출이 얼마나 나오는지 본다 |
| `npm run rate-drivers` | 공개 경기 기록(Jolpica F1 API)으로 실제 드라이버 능력치 초안을 계산하고 검증한다. `--write`로 `src/engine/data.ts`에 반영 |
| `npm run guide-shots` | 게임 방법 화면의 실제 게임 그림을 다시 찍는다 |
| `npx tsx scripts/build-circuits.ts <geojson>` | bacinger/f1-circuits 레이아웃을 트랙 뷰용 SVG path로 바꾼다 |

## 배포

main에 푸시하면 두 곳에 자동으로 올라간다. 빌드 결과(`dist/`)는 상대 경로라 하위 경로에 올려도 동작한다.

- **Vercel(주 주소)**: GitHub 저장소 연결, `vercel.json`(빌드 `npm run build`, 출력 `dist`). 공유 미리보기 이미지는 `VERCEL_PROJECT_PRODUCTION_URL`로 절대 주소를 만든다
- **GitHub Pages(예전 주소)**: `.github/workflows/deploy.yml`(Node 24, ubuntu-24.04)이 엔진 테스트 → E2E → 빌드 → 배포. 공유 미리보기는 저장소 Variables의 `SITE_URL`
- 예전 주소에서 열면 새 주소 안내 띠가 뜨고(`src/app/site.ts`), 커리어를 압축해 링크(`#move=`)로 넘긴다(`src/app/move.ts`)
- 새로 배포할 때 바뀐 내용은 `src/app/patchNotesData.ts` 맨 위 날짜에 적는다

## 크레딧

- 서킷 레이아웃: [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits), Copyright (c) 2019-2025 Tomislav Bacinger, MIT License
- 경기 기록: [Jolpica F1 API](https://github.com/jolpica/jolpica-f1)
- 글꼴: Noto Sans KR, Nanum Pen Script (SIL Open Font License)
