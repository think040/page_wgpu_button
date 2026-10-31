// 강체 시뮬레이션 컴퓨트 셰이더. 앞에 quaternion.wgsl, body.wgsl 필요.
//   pass1 ray_box   : 마우스 광선-OBB 충돌 → 충격량
//   pass2 box_box   : OBB-OBB 충돌(SAT) → 충격량 + 위치 보정
//   pass3 integrate : 충격량 + 복원 스프링 적분 → position/rotation
// 각 호출은 자기 인덱스의 impulses[i]/bodies[i]만 쓰므로 병렬 실행에 경합이 없다.
// bodies[0]은 버튼이다. 눌림/흔들림 자세를 Home으로 따라가고, 충돌로 생긴 오프셋에만 스프링이 걸린다.

struct Params {
  // xyz: 광선 원점, w: 1이면 이번 프레임에 검사, -1이면 포인터가 떠나 닿음 상태 초기화
  rayOrigin : vec4f,
  rayDir : vec4f,
  prevRayDir : vec4f,
  dt : f32,
  count : u32,
  rayPadding : f32, // 터치용 판정 여유 (월드 단위)
};

// 돌아갈 자세. 궤도를 따라 움직이므로 CPU가 매 프레임 갱신한다.
struct Home {
  pos : vec4f,
  quat : vec4f,
  vel : vec4f,
  angVel : vec4f,
};

// 한 스텝 동안 모은 변화량
struct Impulse {
  linear : vec4f,
  angular : vec4f,
  correction : vec4f,
  // x: 광선이 닿아 있는 상태 (닿는 순간에만 밀기 위해 프레임 간 유지)
  flags : vec4f,
};

@group(0) @binding(0) var<uniform> params : Params;
@group(0) @binding(1) var<storage, read_write> bodies : array<Body>;
@group(0) @binding(2) var<storage, read> homes : array<Home>;
@group(0) @binding(3) var<storage, read_write> impulses : array<Impulse>;

// 마우스 밀기
const RAY_PUSH : f32 = 1.6; // 광선 방향 충격량
const RAY_DRAG : f32 = 0.6; // 마우스 이동 속도가 충격량으로 전달되는 비율
const RAY_MAX_SPEED : f32 = 6.0;
// 충돌
const RESTITUTION : f32 = 0.7;
const PENETRATION_SLOP : f32 = 0.005;
const PENETRATION_FIX : f32 = 0.4;
// 복원 스프링 (감쇠를 낮게 두어 살짝 출렁이며 돌아온다)
const LINEAR_STIFFNESS : f32 = 30.0;
const LINEAR_DAMPING : f32 = 3.0;
const ANGULAR_STIFFNESS : f32 = 30.0;
const ANGULAR_DAMPING : f32 = 3.0;
const MAX_OFFSET : f32 = 1.4;
const FLOOR_BOUNCE : f32 = 0.5;

// ───────────────────────── pass1: ray-box ─────────────────────────

// 슬랩 방식 광선-OBB 교차. 광선을 박스 로컬 공간으로 옮겨 검사한다. 빗나가면 음수.
fn ray_obb(origin : vec3f, dir : vec3f, b : Body, padding : f32) -> f32 {
  let inv = quat_conj(b.quat);
  let o = quat_rotate(inv, origin - b.pos.xyz);
  var d = quat_rotate(inv, dir);
  d = select(d, vec3f(1e-6), abs(d) < vec3f(1e-6));
  let half_size = b.half_size.xyz + padding;
  let t1 = (-half_size - o) / d;
  let t2 = (half_size - o) / d;
  let near = min(t1, t2);
  let far = max(t1, t2);
  let tMin = max(max(near.x, near.y), near.z);
  let tMax = min(min(far.x, far.y), far.z);
  if (tMax < max(tMin, 0.0)) {
    return -1.0;
  }
  return max(tMin, 0.0);
}

@compute @workgroup_size(4)
fn ray_box(@builtin(global_invocation_id) id : vec3u) {
  let i = id.x;
  if (i >= params.count) {
    return;
  }

  var wasHit = impulses[i].flags.x;
  if (params.rayOrigin.w < -0.5) {
    wasHit = 0.0;
  }
  var result : Impulse;
  let b = bodies[i];

  if (params.rayOrigin.w > 0.5) {
    let origin = params.rayOrigin.xyz;
    let dir = params.rayDir.xyz;
    let t = ray_obb(origin, dir, b, params.rayPadding);
    // 버튼 뒤에 가려진 박스는 건드리지 않는다
    let blocker = select(ray_obb(origin, dir, bodies[0], 0.0), -1.0, i == 0u);
    let isHit = t >= 0.0 && (blocker < 0.0 || t < blocker);

    if (isHit && wasHit < 0.5) {
      // 박스 깊이에서의 마우스 이동 속도
      var drag = (dir - params.prevRayDir.xyz) * t / params.dt;
      let speed = length(drag);
      if (speed > RAY_MAX_SPEED) {
        drag *= RAY_MAX_SPEED / speed;
      }
      let kick = dir * RAY_PUSH + drag * RAY_DRAG;
      let r = origin + dir * t - b.pos.xyz;
      result.linear = vec4f(kick * b.pos.w, 0.0);
      result.angular = vec4f(cross(r, kick) * b.linVel.w, 0.0);
    }
    wasHit = select(0.0, 1.0, isHit);
  }

  result.flags.x = wasHit;
  impulses[i] = result;
}

// ───────────────────────── pass2: box-box (OBB-OBB SAT) ─────────────────────────

struct Contact {
  hit : bool,
  normal : vec3f, // b에서 a를 향하는 방향
  depth : f32,
};

// 축 위로 투영한 박스의 반지름
fn projected_radius(axes : mat3x3f, half_size : vec3f, axis : vec3f) -> f32 {
  return half_size.x * abs(dot(axes[0], axis))
       + half_size.y * abs(dot(axes[1], axis))
       + half_size.z * abs(dot(axes[2], axis));
}

// 분리축 15개(면 법선 3 + 3, 모서리 외적 9) 중 겹침이 가장 얕은 축을 찾는다.
fn obb_obb(a : Body, b : Body) -> Contact {
  var axesA = quat_to_mat3(a.quat);
  var axesB = quat_to_mat3(b.quat);
  let delta = a.pos.xyz - b.pos.xyz;

  var contact : Contact;
  contact.depth = 1e9;

  for (var n = 0u; n < 15u; n++) {
    var axis : vec3f;
    var bias = 1.0;
    if (n < 3u) {
      axis = axesA[n];
    } else if (n < 6u) {
      axis = axesB[n - 3u];
    } else {
      axis = cross(axesA[(n - 6u) / 3u], axesB[(n - 6u) % 3u]);
      let lengthSq = dot(axis, axis);
      if (lengthSq < 1e-6) {
        continue; // 평행한 모서리의 외적은 면 법선과 같아 건너뛴다
      }
      axis /= sqrt(lengthSq);
      bias = 1.05; // 값이 비슷하면 안정적인 면 법선을 우선한다
    }

    let dist = dot(delta, axis);
    let depth = projected_radius(axesA, a.half_size.xyz, axis)
              + projected_radius(axesB, b.half_size.xyz, axis)
              - abs(dist);
    if (depth <= 0.0) {
      return contact; // 분리축을 찾으면 충돌 없음
    }
    if (depth * bias < contact.depth) {
      contact.depth = depth * bias;
      contact.normal = select(axis, -axis, dist < 0.0);
    }
  }

  contact.hit = true;
  return contact;
}

// direction 쪽으로 가장 튀어나온 박스 위의 지점. 면이 맞닿으면 면 중앙 쪽으로 모인다.
fn support_point(b : Body, direction : vec3f) -> vec3f {
  var axes = quat_to_mat3(b.quat);
  var p = b.pos.xyz;
  for (var k = 0; k < 3; k++) {
    p += axes[k] * b.half_size[k] * clamp(dot(axes[k], direction) * 8.0, -1.0, 1.0);
  }
  return p;
}

@compute @workgroup_size(4)
fn box_box(@builtin(global_invocation_id) id : vec3u) {
  let i = id.x;
  if (i >= params.count) {
    return;
  }
  let a = bodies[i];

  // 이번 스텝 시작 상태만 읽으므로 양쪽 박스가 같은 값으로 대칭인 충격량을 얻는다
  var linear = vec3f(0.0);
  var angular = vec3f(0.0);
  var correction = vec3f(0.0);

  for (var j = 0u; j < params.count; j++) {
    if (j == i) {
      continue;
    }
    let b = bodies[j];
    let contact = obb_obb(a, b);
    if (!contact.hit) {
      continue;
    }

    let n = contact.normal;
    let point = (support_point(a, -n) + support_point(b, n)) * 0.5;
    let ra = point - a.pos.xyz;
    let rb = point - b.pos.xyz;
    let va = a.linVel.xyz + cross(a.angVel.xyz, ra);
    let vb = b.linVel.xyz + cross(b.angVel.xyz, rb);
    let closing = dot(va - vb, n);

    let invMassSum = a.pos.w + b.pos.w;
    if (closing < 0.0) {
      let rotA = dot(cross(cross(ra, n) * a.linVel.w, ra), n);
      let rotB = dot(cross(cross(rb, n) * b.linVel.w, rb), n);
      let magnitude = -(1.0 + RESTITUTION) * closing / (invMassSum + rotA + rotB);
      linear += n * magnitude * a.pos.w;
      angular += cross(ra, n * magnitude) * a.linVel.w;
    }

    correction += n * max(contact.depth - PENETRATION_SLOP, 0.0) * PENETRATION_FIX
                * a.pos.w / invMassSum;
  }

  impulses[i].linear += vec4f(linear, 0.0);
  impulses[i].angular += vec4f(angular, 0.0);
  impulses[i].correction = vec4f(correction, 0.0);
}

// ───────────────────────── pass3: 강체 적분 ─────────────────────────

@compute @workgroup_size(4)
fn integrate(@builtin(global_invocation_id) id : vec3u) {
  let i = id.x;
  if (i >= params.count) {
    return;
  }
  let home = homes[i];
  var b = bodies[i];

  let dt = params.dt;
  let impulse = impulses[i];
  // 버튼은 Home의 움직임을 그대로 더하고, 나머지 박스는 Home 속도를 감쇠 기준으로만 쓴다
  let follow = b.angVel.w;

  // 선운동: 자기 궤도 위치로 돌아가는 스프링 (반암시적 오일러)
  var vel = b.linVel.xyz + impulse.linear.xyz;
  vel += (LINEAR_STIFFNESS * (home.pos.xyz - b.pos.xyz)
        - LINEAR_DAMPING * (vel - home.vel.xyz * (1.0 - follow))) * dt;
  var pos = b.pos.xyz + (vel + home.vel.xyz * follow) * dt + impulse.correction.xyz;

  let offset = pos - home.pos.xyz;
  let dist = length(offset);
  if (dist > MAX_OFFSET) {
    pos = home.pos.xyz + offset * (MAX_OFFSET / dist);
  }

  // 회전: 자세 오차 쿼터니언의 벡터부가 복원 토크 방향이다
  var err = quat_mul(home.quat, quat_conj(b.quat));
  err = select(err, -err, err.w < 0.0);
  var angVel = b.angVel.xyz + impulse.angular.xyz;
  angVel += (ANGULAR_STIFFNESS * 2.0 * err.xyz
           - ANGULAR_DAMPING * (angVel - home.angVel.xyz * (1.0 - follow))) * dt;
  let quat = quat_integrate(b.quat, angVel + home.angVel.xyz * follow, dt);

  // 바닥(y=0) 아래로 내려가지 않도록 튕긴다
  let bottom = projected_radius(quat_to_mat3(quat), b.half_size.xyz, vec3f(0.0, 1.0, 0.0));
  if (pos.y < bottom) {
    pos.y = bottom;
    vel.y = abs(vel.y) * FLOOR_BOUNCE;
  }

  b.pos = vec4f(pos, b.pos.w);
  b.quat = quat;
  b.linVel = vec4f(vel, b.linVel.w);
  b.angVel = vec4f(angVel, follow);
  bodies[i] = b;
}
