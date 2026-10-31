# Fornace Pizza 🍕

Next.js(App Router) + TypeScript + WebGPU로 만든 피자가게 홍보 페이지.

```bash
npm install
npm run dev      # http://localhost:3000
npm run build && npm start
```

> WebGPU 지원 브라우저 필요 (Chrome/Edge 113+, Safari 26+, Firefox 141+ Windows). HTTPS 또는 localhost에서만 동작.
> 미지원 브라우저에서는 일반 HTML 버튼으로 대체됩니다.

## 구조

| 경로 | 내용 |
|---|---|
| `src/components/Hero.tsx` | CSS 애니메이션 히어로 (회전 피자, 조각 당기기/치즈, 불씨, 공전 토핑, 글자 애니메이션) |
| `src/components/CtaCanvas.tsx` | 하단 WebGPU 캔버스 CTA (지원 여부 체크, 대체 UI) |
| `src/lib/webgpu/ButtonScene.ts` | 렌더러: 강체 컴퓨트 → 그림자 패스 → 반사 패스 → 메인 패스(MSAA 4x), 애니메이션, 입력 처리 |
| `src/lib/webgpu/PhysicsSim.ts` | 버튼/토핑 강체 시뮬레이션 실행, 결과를 CPU로 반환 (`PHYSICS_DEBUG`로 콘솔 출력 on/off) |
| `src/lib/webgpu/geometry.ts` | 둥근 모서리 박스 메시 생성 (안쪽 박스 + 구면 투영, 매끄러운 법선) |
| `src/lib/webgpu/picking.ts` | 화면 → 월드 광선, AABB 사전 판정 + Möller–Trumbore 광선-삼각형 교차 |
| `src/shaders/button.wgsl` | 버튼/토핑 셰이딩 (라벨 텍스처, 림라이트, ACES 톤매핑) |
| `src/shaders/floor.wgsl` | 반사 바닥 (평면 반사 텍스처 + 가우시안 블러 + 프레넬 + 타일 + 그림자) |
| `src/shaders/physics.wgsl` | 컴퓨트 3패스: ray-box → OBB-OBB(SAT) → 강체 적분 |
| `src/shaders/shadow.wgsl` | 광원 시점 깊이 패스 (깊이 텍스처는 `scene.wgsl`의 3x3 PCF로 샘플링) |
| `src/shaders/quaternion.wgsl` | 쿼터니언 함수 (렌더/컴퓨트 공용) |
| `src/app/contact` | 문의 페이지 + 폼 |
| `src/app/api/contact/route.ts` | 문의 API (검증, 허니팟, IP별 요청 제한, Supabase 저장) |
| `src/app/admin` | 관리자 페이지 (로그인, 대시보드, 문의, 메뉴, 매장 정보) |
| `src/proxy.ts` | `/admin` 세션 갱신, 비로그인 차단 |
| `src/lib/site.ts` | 홈페이지 메뉴/매장 정보 읽기 (실패하면 기본값) |
| `supabase/` | DB 스키마와 관리자 등록 SQL |

### 셰이더 import
`.wgsl` 파일은 `next.config.ts`에서 Turbopack(`raw-loader`)과 webpack(`asset/source`) 모두 문자열로 로드하도록 설정되어 있고,
`src/types/wgsl.d.ts`에서 타입을 선언합니다.

### 버튼 동작 (ray-mesh picking)
1. `pointerdown` 위치에서 광선을 쏴 버튼 **메시 삼각형**과 교차해야 눌림 상태 시작 → 버튼이 뒤로 눌리며 위쪽이 젖혀짐
2. `pointerup` 위치에서도 메시와 교차해야 활성화 (밖에서 떼면 취소)
3. 위아래로 흔들리는 회전 애니메이션(0.75초) 후 `/contact`로 이동

### 관리자 페이지 설정
Supabase는 Vercel Marketplace로 연결되어 있고, 환경 변수는 Preview/Production에 등록되어 있습니다.

1. Supabase SQL Editor에서 `supabase/migrations/0001_admin.sql` 실행
2. Authentication > Users에서 관리자 계정 생성
3. `supabase/add_admin.sql`의 이메일을 바꿔 실행
4. `/admin`에서 로그인

`admin_users`에 등록된 계정만 들어올 수 있습니다. 공개 가입은 Authentication 설정에서 끄는 것을 권장합니다.

로컬에서 Supabase까지 쓰려면 `.env.local`에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`를 넣으세요.
없으면 홈페이지는 기본 내용으로 표시되고 문의 저장과 관리자 로그인은 동작하지 않습니다.

### 문의 저장소
문의는 Supabase `inquiries` 테이블에 저장합니다. 메일이나 Slack 알림은 `route.ts`의 TODO 위치에 붙이면 됩니다.
