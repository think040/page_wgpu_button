import { mat4, vec3, type Mat4, type Vec3 } from "wgpu-matrix";
import type { Mesh } from "./geometry";

export interface Ray {
  origin: Vec3;
  dir: Vec3;
}

/**
 * 화면 좌표(CSS px) → 월드 공간 광선.
 * NDC의 near(z=0)/far(z=1) 점을 viewProj 역행렬로 되돌린다.
 */
export function screenToRay(
  x: number,
  y: number,
  width: number,
  height: number,
  viewProj: Mat4,
): Ray {
  const ndcX = (x / width) * 2 - 1;
  const ndcY = 1 - (y / height) * 2;
  const inv = mat4.inverse(viewProj);
  const near = vec3.transformMat4([ndcX, ndcY, 0], inv);
  const far = vec3.transformMat4([ndcX, ndcY, 1], inv);
  return { origin: near, dir: vec3.normalize(vec3.subtract(far, near)) };
}

/** 슬랩 방식 광선-AABB 교차 (빠른 사전 판정) */
function rayAabb(origin: Vec3, dir: Vec3, half: readonly number[]): boolean {
  let tmin = -Infinity;
  let tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    const inv = 1 / dir[i];
    let t1 = (-half[i] - origin[i]) * inv;
    let t2 = (half[i] - origin[i]) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
  }
  return tmax >= Math.max(tmin, 0);
}

/**
 * 광선-메시 교차 (Möller–Trumbore).
 * 광선을 모델 공간으로 변환해 실제 삼각형과 정밀하게 검사한다.
 * @returns 가장 가까운 교차 거리(모델 공간), 없으면 null
 */
export function rayIntersectMesh(ray: Ray, mesh: Mesh, model: Mat4): number | null {
  const invModel = mat4.inverse(model);
  const o = vec3.transformMat4(ray.origin, invModel);
  const target = vec3.transformMat4(vec3.add(ray.origin, ray.dir), invModel);
  const d = vec3.subtract(target, o);

  if (!rayAabb(o, d, mesh.halfExtents)) return null;

  const p = mesh.positions;
  const idx = mesh.indices;
  const EPS = 1e-7;
  let closest = Infinity;

  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3;
    const b = idx[i + 1] * 3;
    const c = idx[i + 2] * 3;
    const e1x = p[b] - p[a], e1y = p[b + 1] - p[a + 1], e1z = p[b + 2] - p[a + 2];
    const e2x = p[c] - p[a], e2y = p[c + 1] - p[a + 1], e2z = p[c + 2] - p[a + 2];
    // h = d × e2
    const hx = d[1] * e2z - d[2] * e2y;
    const hy = d[2] * e2x - d[0] * e2z;
    const hz = d[0] * e2y - d[1] * e2x;
    const det = e1x * hx + e1y * hy + e1z * hz;
    if (Math.abs(det) < EPS) continue;
    const invDet = 1 / det;
    const sx = o[0] - p[a], sy = o[1] - p[a + 1], sz = o[2] - p[a + 2];
    const u = (sx * hx + sy * hy + sz * hz) * invDet;
    if (u < 0 || u > 1) continue;
    // q = s × e1
    const qx = sy * e1z - sz * e1y;
    const qy = sz * e1x - sx * e1z;
    const qz = sx * e1y - sy * e1x;
    const v = (d[0] * qx + d[1] * qy + d[2] * qz) * invDet;
    if (v < 0 || u + v > 1) continue;
    const t = (e2x * qx + e2y * qy + e2z * qz) * invDet;
    if (t > EPS && t < closest) closest = t;
  }

  return closest === Infinity ? null : closest;
}
