// 쿼터니언 유틸리티 (xyzw, w가 스칼라 성분)
// 렌더 셰이더와 컴퓨트 셰이더 앞에 이어 붙여 공용으로 사용한다.

// 해밀턴 곱: a * b (b 회전을 먼저 적용한 뒤 a 회전)
fn quat_mul(a : vec4f, b : vec4f) -> vec4f {
  return vec4f(
    a.w * b.xyz + b.w * a.xyz + cross(a.xyz, b.xyz),
    a.w * b.w - dot(a.xyz, b.xyz)
  );
}

// 켤레 (단위 쿼터니언에서는 역회전)
fn quat_conj(q : vec4f) -> vec4f {
  return vec4f(-q.xyz, q.w);
}

// 벡터 회전: q * v * q⁻¹ 를 전개한 식
fn quat_rotate(q : vec4f, v : vec3f) -> vec3f {
  let t = 2.0 * cross(q.xyz, v);
  return v + q.w * t + cross(q.xyz, t);
}

// 회전 행렬. 각 열이 박스의 로컬 축(x, y, z)의 월드 방향이다.
fn quat_to_mat3(q : vec4f) -> mat3x3f {
  return mat3x3f(
    quat_rotate(q, vec3f(1.0, 0.0, 0.0)),
    quat_rotate(q, vec3f(0.0, 1.0, 0.0)),
    quat_rotate(q, vec3f(0.0, 0.0, 1.0))
  );
}

// 각속도 w(월드 공간, rad/s)로 dt만큼 회전: q' = q + 0.5 * dt * (w, 0) * q
fn quat_integrate(q : vec4f, w : vec3f, dt : f32) -> vec4f {
  return normalize(q + quat_mul(vec4f(w, 0.0), q) * 0.5 * dt);
}
