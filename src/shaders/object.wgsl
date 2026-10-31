// 오브젝트 공용 정의 (button.wgsl, shadow.wgsl). 앞에 quaternion.wgsl, body.wgsl 필요.
// 강체는 컴퓨트 결과(bodies)를 직접 읽고, 버튼은 CPU가 만든 모델 행렬을 쓴다.

struct Object {
  model : mat4x4f,
  normalMat : mat4x4f,
  color : vec4f,
  // x: 라벨 사용 여부, y: 발광(hover/press), z: 절반 너비, w: 절반 높이
  params : vec4f,
  // x: bodies 인덱스 (음수면 model 행렬 사용)
  body : vec4f,
};

@group(0) @binding(1) var<storage, read> bodies : array<Body>;
@group(1) @binding(0) var<uniform> obj : Object;

fn object_world_pos(position : vec3f) -> vec3f {
  if (obj.body.x >= 0.0) {
    let b = bodies[u32(obj.body.x)];
    return quat_rotate(b.quat, position) + b.pos.xyz;
  }
  return (obj.model * vec4f(position, 1.0)).xyz;
}

fn object_world_normal(normal : vec3f) -> vec3f {
  if (obj.body.x >= 0.0) {
    return quat_rotate(bodies[u32(obj.body.x)].quat, normal);
  }
  return normalize((obj.normalMat * vec4f(normal, 0.0)).xyz);
}
