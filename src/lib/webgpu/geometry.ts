export interface Mesh {
  /** position(xyz) + normal(xyz) 인터리브 */
  vertices: Float32Array;
  indices: Uint32Array;
  /** 피킹용 원본 위치 배열 */
  positions: Float32Array;
  halfExtents: [number, number, number];
}

/**
 * 한 축의 좌표 분할: 둥근 영역(가장자리 r)은 촘촘하게, 평평한 영역은 성기게.
 */
function axisSteps(half: number, radius: number, curveSegs: number, flatSegs: number): number[] {
  const inner = half - radius;
  const out: number[] = [];
  for (let i = 0; i < curveSegs; i++) out.push(-half + (radius * i) / curveSegs);
  for (let i = 0; i < flatSegs; i++) out.push(-inner + (2 * inner * i) / flatSegs);
  for (let i = 0; i <= curveSegs; i++) out.push(inner + (radius * i) / curveSegs);
  return out;
}

/**
 * 모서리가 둥근 박스 메시.
 * 각 면을 격자로 만든 뒤, 각 정점을 "안쪽 박스 + 반지름 r 구면"으로 투영한다.
 * 같은 공식으로 법선을 구하므로 면 경계에서도 이음새 없이 매끄럽다.
 */
export function createRoundedBox(
  hx: number,
  hy: number,
  hz: number,
  radius: number,
  curveSegs = 8,
): Mesh {
  const r = Math.min(radius, hx, hy, hz);
  const half = [hx, hy, hz];
  const steps = half.map((h) => axisSteps(h, r, curveSegs, 2));

  const verts: number[] = [];
  const positions: number[] = [];
  const indices: number[] = [];

  // [법선 축, u 축, v 축]
  const faces: Array<[number, number, number]> = [
    [0, 1, 2],
    [1, 2, 0],
    [2, 0, 1],
  ];

  for (const [na, ua, va] of faces) {
    for (const sign of [1, -1]) {
      const us = steps[ua];
      const vs = steps[va];
      const base = verts.length / 6;
      const cube: number[][] = [];

      for (let j = 0; j < vs.length; j++) {
        for (let i = 0; i < us.length; i++) {
          const p = [0, 0, 0];
          p[na] = sign * half[na];
          p[ua] = us[i];
          p[va] = vs[j];
          cube.push(p);

          const inner = p.map((c, k) => Math.max(-(half[k] - r), Math.min(half[k] - r, c)));
          let n = p.map((c, k) => c - inner[k]);
          const len = Math.hypot(n[0], n[1], n[2]) || 1;
          n = n.map((c) => c / len);
          const pos = inner.map((c, k) => c + n[k] * r);

          verts.push(pos[0], pos[1], pos[2], n[0], n[1], n[2]);
          positions.push(pos[0], pos[1], pos[2]);
        }
      }

      const cols = us.length;
      for (let j = 0; j < vs.length - 1; j++) {
        for (let i = 0; i < cols - 1; i++) {
          const a = j * cols + i;
          const b = a + 1;
          const c = a + cols;
          const d = c + 1;
          for (const tri of [
            [a, b, d],
            [a, d, c],
          ]) {
            // 투영 전 큐브 좌표로 감김 방향을 확인 → 바깥쪽이 CCW가 되도록
            const [p0, p1, p2] = tri.map((t) => cube[t]);
            const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
            const e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
            const cross = [
              e1[1] * e2[2] - e1[2] * e2[1],
              e1[2] * e2[0] - e1[0] * e2[2],
              e1[0] * e2[1] - e1[1] * e2[0],
            ];
            const t = cross[na] * sign >= 0 ? tri : [tri[0], tri[2], tri[1]];
            indices.push(base + t[0], base + t[1], base + t[2]);
          }
        }
      }
    }
  }

  return {
    vertices: new Float32Array(verts),
    indices: new Uint32Array(indices),
    positions: new Float32Array(positions),
    halfExtents: [hx, hy, hz],
  };
}

/** XZ 평면의 단위 사각형 (-1..1). 실제 크기는 셰이더에서 확대한다. */
export function createPlane(): Mesh {
  const vertices = new Float32Array([
    -1, 0, -1, 0, 1, 0,
    1, 0, -1, 0, 1, 0,
    1, 0, 1, 0, 1, 0,
    -1, 0, 1, 0, 1, 0,
  ]);
  return {
    vertices,
    indices: new Uint32Array([0, 2, 1, 0, 3, 2]),
    positions: new Float32Array([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1]),
    halfExtents: [1, 0, 1],
  };
}
