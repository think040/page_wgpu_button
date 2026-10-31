// 오브젝트 공용 정의 (button.wgsl, shadow.wgsl). 앞에 quaternion.wgsl, body.wgsl 필요.
// 모든 오브젝트의 자세는 컴퓨트 결과(bodies)를 직접 읽어 쿼터니언으로 회전한다.

struct Object {
  color : vec4f,
  // x: 라벨 사용 여부, y: 발광(hover/press), z: 절반 너비, w: 절반 높이
  params : vec4f,
  // x: bodies 인덱스, y: 균일 스케일
  body : vec4f,
};

@group(0) @binding(1) var<storage, read> bodies : array<Body>;
@group(1) @binding(0) var<uniform> obj : Object;

fn object_world_pos(position : vec3f) -> vec3f {
  let b = bodies[u32(obj.body.x)];
  return quat_rotate(b.quat, position * obj.body.y) + b.pos.xyz;
}

fn object_world_normal(normal : vec3f) -> vec3f {
  return quat_rotate(bodies[u32(obj.body.x)].quat, normal);
}
