import Phaser from "phaser";

export const BALL_PIPELINE_KEY = "BallFishEye";

/** 0 = flat, 1 = strong sphere bulge. */
export const BALL_FISH = 0.72;

const FRAG_SHADER = `
#define SHADER_NAME BALL_FISHEYE_FS

#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D uMainSampler;
uniform vec2 uScroll;
uniform float uUvScale;
uniform float uFish;

varying vec2 outTexCoord;
varying float outTintEffect;
varying vec4 outTint;

void main ()
{
    vec2 p = outTexCoord * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;

    float z = sqrt(max(1e-5, 1.0 - r2));
    // Orthographic sphere: warp UVs toward the front face.
    vec2 warped = mix(p, p / (z + 0.35), uFish);

    vec2 uv = fract(uScroll + warped * (0.5 * uUvScale));
    vec4 texture = texture2D(uMainSampler, uv);

    vec4 texel = vec4(outTint.bgr * outTint.a, outTint.a);
    vec4 color = texture * texel;
    if (outTintEffect == 1.0) {
        color.rgb = mix(texture.rgb, outTint.bgr * outTint.a, texture.a);
    } else if (outTintEffect == 2.0) {
        color = texel;
    }
    gl_FragColor = color;
}
`;

export class BallFishEyePipeline extends Phaser.Renderer.WebGL.Pipelines
  .SinglePipeline {
  constructor(game: Phaser.Game) {
    super({
      game,
      name: BALL_PIPELINE_KEY,
      fragShader: FRAG_SHADER,
    });
  }

  onBind(gameObject?: Phaser.GameObjects.GameObject): void {
    super.onBind();
    const data = (gameObject as Phaser.GameObjects.Image | undefined)
      ?.pipelineData as
      | { scrollX?: number; scrollY?: number; uvScale?: number; fish?: number }
      | undefined;
    this.set2f("uScroll", data?.scrollX ?? 0, data?.scrollY ?? 0);
    this.set1f("uUvScale", data?.uvScale ?? 1);
    this.set1f("uFish", data?.fish ?? BALL_FISH);
  }

  onBatch(gameObject?: Phaser.GameObjects.GameObject): void {
    if (gameObject) this.flush();
  }
}

export function ensureBallPipeline(game: Phaser.Game): boolean {
  const renderer = game.renderer;
  if (!(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return false;
  if (!renderer.pipelines.has(BALL_PIPELINE_KEY)) {
    renderer.pipelines.add(
      BALL_PIPELINE_KEY,
      new BallFishEyePipeline(game),
    );
  }
  return true;
}
