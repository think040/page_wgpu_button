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
| `src/lib/webgpu/ButtonScene.ts` | 렌더러: 반사 패스 → 메인 패스(MSAA 4x), 애니메이션, 입력 처리 |
| `src/lib/webgpu/geometry.ts` | 둥근 모서리 박스 메시 생성 (안쪽 박스 + 구면 투영, 매끄러운 법선) |
| `src/lib/webgpu/picking.ts` | 화면 → 월드 광선, AABB 사전 판정 + Möller–Trumbore 광선-삼각형 교차 |
| `src/shaders/button.wgsl` | 버튼/토핑 셰이딩 (라벨 텍스처, 림라이트, ACES 톤매핑) |
| `src/shaders/floor.wgsl` | 반사 바닥 (평면 반사 텍스처 + 가우시안 블러 + 프레넬 + 타일) |
| `src/app/contact` | 문의 페이지 + 폼 |
| `src/app/api/contact/route.ts` | 문의 API (검증, 허니팟, IP별 요청 제한, `.data/inquiries.jsonl` 저장) |

### 셰이더 import
`.wgsl` 파일은 `next.config.ts`에서 Turbopack(`raw-loader`)과 webpack(`asset/source`) 모두 문자열로 로드하도록 설정되어 있고,
`src/types/wgsl.d.ts`에서 타입을 선언합니다.

### 버튼 동작 (ray-mesh picking)
1. `pointerdown` 위치에서 광선을 쏴 버튼 **메시 삼각형**과 교차해야 눌림 상태 시작 → 버튼이 뒤로 눌리며 위쪽이 젖혀짐
2. `pointerup` 위치에서도 메시와 교차해야 활성화 (밖에서 떼면 취소)
3. 위아래로 흔들리는 회전 애니메이션(0.75초) 후 `/contact`로 이동

### 문의 저장소
기본은 로컬 파일(`.data/inquiries.jsonl`)입니다. Vercel 같은 서버리스 환경은 파일 시스템이 유지되지 않으므로
`route.ts`의 TODO 위치에서 DB 저장이나 메일(Resend, Nodemailer)/Slack 알림으로 바꿔 쓰세요.
