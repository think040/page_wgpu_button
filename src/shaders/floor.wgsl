// 반사 바닥 셰이더
// 반사 텍스처(거울 카메라로 렌더링한 장면)를 화면 좌표로 샘플링한다.
// 앞에 scene.wgsl을 이어 붙여 컴파일한다.

@group(1) @binding(0) var reflectionTex : texture_2d<f32>;
@group(1) @binding(1) var reflectionSampler : sampler;

struct VSOut {
  @builtin(position) position : vec4f,
  @location(0) worldPos : vec3f,
};

const FLOOR_SIZE : f32 = 30.0;
const BG : vec3f = vec3f(0.067, 0.035, 0.027);

@vertex
fn vs_main(@location(0) position : vec3f, @location(1) normal : vec3f) -> VSOut {
  var out : VSOut;
  let world = vec3f(position.x * FLOOR_SIZE, 0.0, position.z * FLOOR_SIZE);
  out.position = scene.viewProj * vec4f(world, 1.0);
  out.worldPos = world;
  return out;
}

fn hash(p : vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

@fragment
fn fs_main(in : VSOut) -> @location(0) vec4f {
  let size = scene.params.zw;
  let screenUV = in.position.xy / size;
  let t = scene.params.x;

  // 타일 패턴 (오븐 바닥 느낌의 테라코타 타일)
  let tileUV = in.worldPos.xz * 1.2;
  let cell = floor(tileUV);
  let f = fract(tileUV);
  let grout = smoothstep(0.0, 0.03, f.x) * smoothstep(0.0, 0.03, f.y)
            * smoothstep(1.0, 0.97, f.x) * smoothstep(1.0, 0.97, f.y);
  let tileTint = 0.85 + 0.3 * hash(cell);
  var base = vec3f(0.13, 0.055, 0.04) * tileTint * mix(0.6, 1.0, grout);

  // 타일마다 아주 살짝 다른 기울기 → 반사가 미세하게 일렁임
  let wobble = vec2f(hash(cell + 3.1) - 0.5, hash(cell + 7.7) - 0.5) * 0.004
             + vec2f(sin(in.worldPos.x * 6.0 + t), cos(in.worldPos.z * 6.0 + t * 0.8)) * 0.0012;
  let uv = screenUV + wobble;

  // 거리에 따라 살짝 흐려지는 반사 (5x5 가우시안)
  let dist = length(in.worldPos.xz);
  let blur = (0.6 + dist * 0.35) / size;
  var refl = vec3f(0.0);
  var wsum = 0.0;
  for (var x = -2; x <= 2; x++) {
    for (var y = -2; y <= 2; y++) {
      let o = vec2f(f32(x), f32(y));
      let w = exp(-dot(o, o) * 0.35);
      refl += textureSample(reflectionTex, reflectionSampler, uv + o * blur).rgb * w;
      wsum += w;
    }
  }
  refl /= wsum;

  // 프레넬: 비스듬히 볼수록 강한 반사
  let v = normalize(scene.cameraPos.xyz - in.worldPos);
  let fresnel = 0.7 + 0.3 * pow(1.0 - max(v.y, 0.0), 3.0);
  let reflStrength = fresnel * mix(0.55, 1.0, grout);

  var color = base + refl * reflStrength;

  // 버튼 아래 따뜻한 빛 웅덩이
  let pool = exp(-dot(in.worldPos.xz - vec2f(0.0, 0.2), in.worldPos.xz - vec2f(0.0, 0.2)) * 0.45);
  color += vec3f(0.35, 0.12, 0.04) * pool;

  // 버튼/토핑이 드리우는 실시간 그림자
  color *= mix(0.3, 1.0, shadow_factor(in.worldPos));

  // 멀어질수록 배경색으로 페이드
  let fade = smoothstep(4.0, 14.0, dist);
  color = mix(color, BG, fade);
  return vec4f(color, 1.0);
}
