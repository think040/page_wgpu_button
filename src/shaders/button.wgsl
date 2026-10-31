// 둥근 모서리 3D 버튼 + 장식 오브젝트 셰이더
// 메인 패스와 반사(거울) 패스에서 같이 사용한다.
// 앞에 quaternion.wgsl, body.wgsl, object.wgsl, scene.wgsl을 이어 붙여 컴파일한다.

@group(1) @binding(1) var labelTex : texture_2d<f32>;
@group(1) @binding(2) var labelSampler : sampler;

struct VSOut {
  @builtin(position) position : vec4f,
  @location(0) worldPos : vec3f,
  @location(1) worldNormal : vec3f,
  @location(2) localPos : vec3f,
  @location(3) localNormal : vec3f,
};

@vertex
fn vs_main(@location(0) position : vec3f, @location(1) normal : vec3f) -> VSOut {
  var out : VSOut;
  let world = object_world_pos(position);
  out.position = scene.viewProj * vec4f(world, 1.0);
  out.worldPos = world;
  out.worldNormal = object_world_normal(normal);
  out.localPos = position;
  out.localNormal = normal;
  return out;
}

// 주변광: 위는 따뜻한 오븐 빛, 아래는 어두운 바닥
fn ambient(n : vec3f) -> vec3f {
  let up = n.y * 0.5 + 0.5;
  return mix(vec3f(0.10, 0.04, 0.03), vec3f(0.55, 0.36, 0.22), up);
}

@fragment
fn fs_main(in : VSOut) -> @location(0) vec4f {
  // 반사 패스: 바닥(y=0) 아래쪽은 잘라낸다
  if (scene.params.y > 0.5 && in.worldPos.y < 0.0) {
    discard;
  }

  let n = normalize(in.worldNormal);
  let v = normalize(scene.cameraPos.xyz - in.worldPos);
  let l = normalize(-scene.lightDir.xyz);
  let h = normalize(l + v);

  var albedo = obj.color.rgb; // CPU에서 선형 공간 값으로 전달됨

  // 앞면(평평한 부분)에 텍스트 라벨 텍스처 입히기
  // (textureSample은 균일한 제어 흐름에서 호출해야 하므로 먼저 샘플링 후 마스킹)
  let uv = vec2f(
    in.localPos.x / obj.params.z * 0.5 + 0.5,
    0.5 - in.localPos.y / obj.params.w * 0.5
  );
  let label = textureSample(labelTex, labelSampler, clamp(uv, vec2f(0.0), vec2f(1.0)));
  let onFace = select(0.0, 1.0, obj.params.x > 0.5 && in.localNormal.z > 0.98);
  // 라벨 텍스처는 sRGB → 선형 공간으로 변환 후 합성
  albedo = mix(albedo, pow(label.rgb, vec3f(2.2)), label.a * onFace);

  // 법선 방향으로 살짝 띄워 자기 그림자 줄무늬(acne)를 막는다
  let shadow = shadow_factor(in.worldPos + n * 0.02);
  let diff = max(dot(n, l), 0.0) * shadow;
  let spec = pow(max(dot(n, h), 0.0), 96.0) * 0.9 * shadow;
  // 보조 림 라이트 (뒤쪽 파란빛)
  let rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  let fill = max(dot(n, normalize(vec3f(-0.6, 0.3, 0.7))), 0.0) * 0.25;

  let glow = obj.params.y;
  var color = albedo * (ambient(n) + diff * vec3f(1.0, 0.86, 0.7) * 1.1 + fill)
            + vec3f(spec)
            + rim * vec3f(1.0, 0.55, 0.25) * (0.35 + glow * 0.8)
            + albedo * glow * 0.25;

  // 은은한 맥동
  color += albedo * 0.04 * (sin(scene.params.x * 2.0) * 0.5 + 0.5);

  // ACES 근사 톤매핑 + 감마
  color = clamp((color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14), vec3f(0.0), vec3f(1.0));
  color = pow(color, vec3f(1.0 / 2.2));
  return vec4f(color, 1.0);
}
