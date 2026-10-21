/**
 * Real-time capture tap on the master output (export fallback, SPEC §6.5). Uses an AudioWorklet loaded
 * from a `data:` URL (allowed by the CSP, V18); falls back to ScriptProcessorNode where worklets are missing.
 */

export type ChunkHandler = (pcm: Float32Array[], sampleRate: number) => void;

/** Frames per posted chunk. */
export const CAPTURE_CHUNK = 4096;

const PROCESSOR = `
class PhylloCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = ${CAPTURE_CHUNK};
    this.l = new Float32Array(this.size);
    this.r = new Float32Array(this.size);
    this.n = 0;
    this.on = true;
    this.port.onmessage = (e) => { if (e.data === "stop") { this.flush(); this.on = false; } };
  }
  flush() {
    if (this.n === 0) return;
    this.port.postMessage([this.l.slice(0, this.n), this.r.slice(0, this.n)]);
    this.n = 0;
  }
  process(inputs) {
    if (!this.on) return false;
    const input = inputs[0] || [];
    const l = input[0];
    const r = input[1] || l;
    const frames = l ? l.length : 128;
    for (let i = 0; i < frames; i++) {
      this.l[this.n] = l ? l[i] : 0;
      this.r[this.n] = r ? r[i] : 0;
      if (++this.n === this.size) this.flush();
    }
    return true;
  }
}
registerProcessor("phyllo-capture", PhylloCapture);
`;

const loaded = new WeakMap<BaseAudioContext, Promise<void>>();

function loadProcessor(ctx: BaseAudioContext): Promise<void> {
  let p = loaded.get(ctx);
  if (!p) {
    p = ctx.audioWorklet.addModule(`data:text/javascript;charset=utf-8,${encodeURIComponent(PROCESSOR)}`);
    loaded.set(ctx, p);
  }
  return p;
}

/** Taps `source` until the returned function is called. */
export function startCaptureTap(
  ctx: AudioContext,
  source: AudioNode,
  onChunk: ChunkHandler,
  warn: (msg: string) => void,
): () => void {
  let stopped = false;
  let teardown: (() => void) | undefined;
  const rate = ctx.sampleRate;

  if (typeof AudioWorkletNode !== "undefined" && ctx.audioWorklet) {
    loadProcessor(ctx)
      .then(() => {
        if (stopped) return;
        const node = new AudioWorkletNode(ctx, "phyllo-capture", {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          channelCount: 2,
          channelCountMode: "explicit",
        });
        node.port.onmessage = (e: MessageEvent<Float32Array[]>) => onChunk(e.data, rate);
        source.connect(node);
        node.connect(ctx.destination); // outputs silence; keeps the node pulled
        teardown = () => {
          node.port.postMessage("stop");
          // give the processor a moment to flush its last partial chunk
          setTimeout(() => {
            try {
              source.disconnect(node);
            } catch {
              // graph already rebuilt
            }
            node.disconnect();
          }, 50);
        };
      })
      .catch((err: unknown) => {
        warn(`capture worklet unavailable (${String(err)}); using ScriptProcessorNode`);
        if (!stopped) teardown = scriptProcessorTap(ctx, source, onChunk);
      });
  } else {
    teardown = scriptProcessorTap(ctx, source, onChunk);
  }

  return () => {
    if (stopped) return;
    stopped = true;
    teardown?.();
  };
}

function scriptProcessorTap(ctx: AudioContext, source: AudioNode, onChunk: ChunkHandler): () => void {
  const node = ctx.createScriptProcessor(CAPTURE_CHUNK, 2, 2);
  node.onaudioprocess = (e) => {
    const b = e.inputBuffer;
    const l = b.getChannelData(0).slice();
    const r = b.numberOfChannels > 1 ? b.getChannelData(1).slice() : l.slice();
    onChunk([l, r], ctx.sampleRate);
  };
  source.connect(node);
  node.connect(ctx.destination);
  return () => {
    try {
      source.disconnect(node);
    } catch {
      // graph already rebuilt
    }
    node.disconnect();
  };
}
