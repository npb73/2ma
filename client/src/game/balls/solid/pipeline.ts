import Phaser from "phaser";

export const BALL_PIPELINE_KEY = "BallFishEye";

/** 0 = flat, 1 = strong sphere bulge. */
export const BALL_FISH = 0.72;

/** Phaser WebGLConst for UNSIGNED_BYTE (must be {enum,size}, not raw GLenum). */
const GL_UNSIGNED_BYTE = { enum: 0x1401, size: 1 };

/** Global toggle used by adaptive quality. */
let pipelineAllowed = true;

export function setBallPipelineAllowed(allowed: boolean): void {
  pipelineAllowed = allowed;
}

export function isBallPipelineAllowed(): boolean {
  return pipelineAllowed;
}

const VERT_SHADER = `
#define SHADER_NAME BALL_FISHEYE_VS

precision mediump float;

uniform mat4 uProjectionMatrix;

attribute vec2 inPosition;
attribute vec2 inTexCoord;
attribute float inTexId;
attribute float inTintEffect;
attribute vec4 inTint;
attribute vec2 inScroll;
attribute vec2 inParams;

varying vec2 outTexCoord;
varying float outTintEffect;
varying vec4 outTint;
varying vec2 outScroll;
varying vec2 outParams;

void main ()
{
    gl_Position = uProjectionMatrix * vec4(inPosition, 1.0, 1.0);

    outTexCoord = inTexCoord;
    outTint = inTint;
    outTintEffect = inTintEffect;
    outScroll = inScroll;
    outParams = inParams;
}
`;

const FRAG_SHADER = `
#define SHADER_NAME BALL_FISHEYE_FS

#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D uMainSampler;

varying vec2 outTexCoord;
varying float outTintEffect;
varying vec4 outTint;
varying vec2 outScroll;
varying vec2 outParams;

void main ()
{
    vec2 p = outTexCoord * 2.0 - 1.0;
    float r2 = dot(p, p);
    // Soft circle edge (no discard — cheaper on many GPUs).
    float mask = 1.0 - smoothstep(0.92, 1.0, r2);
    if (mask <= 0.001) {
        gl_FragColor = vec4(0.0);
        return;
    }

    float uUvScale = outParams.x;
    float uFish = outParams.y;

    float z = sqrt(max(1e-5, 1.0 - min(r2, 1.0)));
    vec2 warped = mix(p, p / (z + 0.35), uFish);

    vec2 uv = fract(outScroll + warped * (0.5 * uUvScale));
    vec4 texture = texture2D(uMainSampler, uv);

    vec4 texel = vec4(outTint.bgr * outTint.a, outTint.a);
    vec4 color = texture * texel;
    if (outTintEffect == 1.0) {
        color.rgb = mix(texture.rgb, outTint.bgr * outTint.a, texture.a);
    } else if (outTintEffect == 2.0) {
        color = texel;
    }
    color.a *= mask;
    gl_FragColor = color;
}
`;

type PipelineShader = { vertexComponentCount: number };

/**
 * Single-texture fish-eye pipeline with per-vertex scroll/uvScale/fish so
 * solid balls of the same texture can batch (no per-sprite flush).
 */
export class BallFishEyePipeline extends Phaser.Renderer.WebGL.Pipelines
  .SinglePipeline {
  private _scrollX = 0;
  private _scrollY = 0;
  private _uvScale = 1;
  private _fish = BALL_FISH;

  constructor(game: Phaser.Game) {
    super({
      game,
      name: BALL_PIPELINE_KEY,
      vertShader: VERT_SHADER,
      fragShader: FRAG_SHADER,
      attributes: [
        { name: "inPosition", size: 2 },
        { name: "inTexCoord", size: 2 },
        { name: "inTexId", size: 1 },
        { name: "inTintEffect", size: 1 },
        {
          name: "inTint",
          size: 4,
          type: GL_UNSIGNED_BYTE,
          normalized: true,
        },
        { name: "inScroll", size: 2 },
        { name: "inParams", size: 2 },
      ],
    });
  }

  onBind(gameObject?: Phaser.GameObjects.GameObject): void {
    // Skip parent uniform uploads for scroll — those are per-vertex now.
    // Still call WebGLPipeline onBind via SinglePipeline for sampler setup.
    Phaser.Renderer.WebGL.Pipelines.SinglePipeline.prototype.onBind.call(
      this,
    );
    const data = (gameObject as Phaser.GameObjects.Image | undefined)
      ?.pipelineData as
      | { scrollX?: number; scrollY?: number; uvScale?: number; fish?: number }
      | undefined;
    this._scrollX = data?.scrollX ?? 0;
    this._scrollY = data?.scrollY ?? 0;
    this._uvScale = data?.uvScale ?? 1;
    this._fish = data?.fish ?? BALL_FISH;
  }

  // Intentionally empty — per-vertex attrs allow batching across sprites.
  onBatch(_gameObject?: Phaser.GameObjects.GameObject): void {}

  private writeVert(
    x: number,
    y: number,
    u: number,
    v: number,
    unit: number,
    tintEffect: number,
    tint: number,
  ): void {
    const vertexViewF32 = this.vertexViewF32;
    const vertexViewU32 = this.vertexViewU32;
    const shader = this.currentShader as unknown as PipelineShader;
    let vertexOffset =
      this.vertexCount * shader.vertexComponentCount - 1;

    vertexViewF32[++vertexOffset] = x;
    vertexViewF32[++vertexOffset] = y;
    vertexViewF32[++vertexOffset] = u;
    vertexViewF32[++vertexOffset] = v;
    vertexViewF32[++vertexOffset] = unit;
    vertexViewF32[++vertexOffset] = tintEffect;
    vertexViewU32[++vertexOffset] = tint;
    vertexViewF32[++vertexOffset] = this._scrollX;
    vertexViewF32[++vertexOffset] = this._scrollY;
    vertexViewF32[++vertexOffset] = this._uvScale;
    vertexViewF32[++vertexOffset] = this._fish;

    this.vertexCount++;
  }

  batchVert(
    x: number,
    y: number,
    u: number,
    v: number,
    unit: number,
    tintEffect: number | boolean,
    tint: number,
  ): void {
    this.writeVert(x, y, u, v, unit, Number(tintEffect), tint);
    if (this.currentBatch) {
      this.currentBatch.count = this.vertexCount - this.currentBatch.start;
    }
  }

  batchQuad(
    gameObject: Phaser.GameObjects.GameObject | null,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
    u0: number,
    v0: number,
    u1: number,
    v1: number,
    tintTL: number,
    tintTR: number,
    tintBL: number,
    tintBR: number,
    tintEffect: number | boolean,
    texture?: Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper,
    unit?: number,
  ): boolean {
    if (gameObject) this.onBind(gameObject);

    if (unit === undefined) unit = this.currentUnit;

    let hasFlushed = false;
    if (this.shouldFlush(6)) {
      this.flush();
      hasFlushed = true;
    }

    if (!this.currentBatch && texture) {
      unit = this.setTexture2D(texture);
    }

    const te = Number(tintEffect);
    this.writeVert(x0, y0, u0, v0, unit, te, tintTL);
    this.writeVert(x1, y1, u0, v1, unit, te, tintBL);
    this.writeVert(x2, y2, u1, v1, unit, te, tintBR);
    this.writeVert(x0, y0, u0, v0, unit, te, tintTL);
    this.writeVert(x2, y2, u1, v1, unit, te, tintBR);
    this.writeVert(x3, y3, u1, v0, unit, te, tintTR);

    if (this.currentBatch) {
      this.currentBatch.count = this.vertexCount - this.currentBatch.start;
    }

    return hasFlushed;
  }
}

export function ensureBallPipeline(game: Phaser.Game): boolean {
  if (!pipelineAllowed) return false;
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
