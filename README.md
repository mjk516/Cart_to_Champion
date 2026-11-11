# 카트에서 챔피언까지

12세 카트 유망주에서 F1 월드 챔피언까지 가는 레이싱 커리어 시뮬레이션. 브라우저에서만 돌아가는 정적 웹 게임이고, 진행 상황은 브라우저(localStorage)에 저장된다.

비공식 팬 게임이다. Formula 1, FIA 및 각 팀·드라이버와 아무 관계가 없으며 승인받지 않았다. 자세한 설계는 [SPEC.md](SPEC.md), 요구사항은 [PRD.md](PRD.md).

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
| `npm run balance -- --n 100` | 자산 규모·성격별로 커리어를 자동 진행해 챔피언 확률 등 분포를 본다 |
| `npm run rate-drivers` | 공개 경기 기록(Jolpica F1 API)으로 실제 드라이버 능력치 초안을 계산하고 검증한다. `--write`로 `src/engine/data.ts`에 반영 |
| `npx tsx scripts/build-circuits.ts <geojson>` | bacinger/f1-circuits 레이아웃을 트랙 뷰용 SVG path로 바꾼다 |

## 배포

빌드 결과(`dist/`)는 상대 경로로 만들어져 어떤 정적 호스팅(하위 경로 포함)에 올려도 동작한다.

- **GitHub Pages**: `.github/workflows/deploy.yml`이 main에 푸시될 때 테스트·빌드 후 배포한다. 저장소 Settings → Pages → Source를 "GitHub Actions"로 바꾼다.
- **Netlify·Vercel 등**: 빌드 명령 `npm run build`, 출력 폴더 `dist`.
- **공유 미리보기**: SNS 카드에 이미지가 보이려면 배포 주소를 `VITE_SITE_URL`(끝에 `/` 포함)로 넣고 빌드한다. GitHub Actions에서는 저장소 Variables의 `SITE_URL`을 쓴다.

## 크레딧

- 서킷 레이아웃: [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits), Copyright (c) 2019-2025 Tomislav Bacinger, MIT License
- 경기 기록: [Jolpica F1 API](https://github.com/jolpica/jolpica-f1)
- 글꼴: Noto Sans KR, Nanum Pen Script (SIL Open Font License)
