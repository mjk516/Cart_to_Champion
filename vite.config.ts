import { createServer } from 'node:http';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * 개발 서버 주소: http://cart-to-champion/  (README "개발 주소" 참고)
 * - /etc/hosts에 `127.0.0.1 cart-to-champion` 한 줄이 있어야 이름이 이 컴퓨터로 연결된다(관리자 권한 필요, 직접 추가).
 * - macOS는 80번 포트를 '모든 주소'로 열 때만 관리자 권한 없이 허용해서 host가 0.0.0.0이다.
 *   같은 네트워크의 기기도 IP로 접속할 수 있으므로 allowedHosts로 이름 접속을 제한하고 Vite는 보안 패치된 버전을 쓴다.
 */
const HOST_NAME = 'cart-to-champion';
const PORT = 80;
const OLD_PORT = 5173;

/**
 * 예전 주소(localhost:5173, cart-to-champion.localhost:5173)로 들어오면 그 주소의 저장 파일을 들고 새 주소로 옮긴다.
 * 브라우저 저장소는 주소마다 따로라서, 이렇게 옮기지 않으면 기존 커리어가 새 주소에서 안 보인다.
 */
const MIGRATE_PAGE = `<!doctype html><meta charset="utf-8"><title>주소가 바뀌었습니다</title>
<body style="background:#09090b;color:#e4e4e7;font:15px system-ui;padding:40px;line-height:1.6">
<h2>카트에서 챔피언까지 주소가 바뀌었습니다</h2><p id="m">새 주소 <b>http://${HOST_NAME}/</b>로 옮기는 중…</p>
<script>
var KEY='kart-to-champion-save', NEW='http://${HOST_NAME}/';
var save=null; try{save=localStorage.getItem(KEY);}catch(e){}
var target=NEW+(save?'#migrate='+encodeURIComponent(save):'');
var img=new Image(); var done=false;
img.onload=function(){done=true;location.replace(target);};
img.onerror=function(){done=true;document.getElementById('m').innerHTML='새 주소에 연결할 수 없습니다. 터미널에서 아래 명령으로 이름을 등록한 뒤 이 페이지를 새로고침하세요.<pre style="background:#18181b;padding:10px;border-radius:8px">sudo sh -c \\'echo "127.0.0.1 ${HOST_NAME}" >> /etc/hosts\\'</pre>'+(save?'저장된 커리어는 새 주소로 옮겨질 때까지 이 주소에 그대로 남아 있습니다.':'');};
img.src=NEW+'favicon.svg?'+Date.now();
</script></body>`;

const legacyRedirect = (): Plugin => ({
  name: 'legacy-address-migration',
  configureServer(server) {
    // 테스트(vitest)도 Vite 서버를 띄우므로 그때는 안내 서버를 켜지 않는다(켜면 테스트가 끝나도 프로세스가 남는다)
    if (process.env.VITEST) return;
    const legacy = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(MIGRATE_PAGE);
    });
    legacy.on('error', () => { /* 5173이 사용 중이면 생략 */ });
    legacy.listen(OLD_PORT, '127.0.0.1');
    server.httpServer?.on('close', () => legacy.close());
  },
});

export default defineConfig(({ command }) => ({
  plugins: [react(), legacyRedirect()],
  // 배포 빌드는 상대 경로라 어느 주소(GitHub Pages의 하위 경로 포함)에 올려도 동작한다
  base: command === 'serve' ? '/' : './',
  server: { port: PORT, host: '0.0.0.0', strictPort: true, open: false, allowedHosts: [HOST_NAME, 'localhost'] },
  preview: { port: 4173, host: '127.0.0.1' },
  test: { include: ['test/**/*.test.ts'] },
}) as never);
