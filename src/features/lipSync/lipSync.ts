import { LipSyncAnalyzeResult } from "./lipSyncAnalyzeResult";

const TIME_DOMAIN_DATA_LENGTH = 2048;

export class LipSync {
  public readonly audio: AudioContext;
  public readonly analyser: AnalyserNode;
  public readonly timeDomainData: Float32Array;
  private currentSource: AudioBufferSourceNode | null = null;

  public constructor(audio: AudioContext) {
    this.audio = audio;

    this.analyser = audio.createAnalyser();
    this.timeDomainData = new Float32Array(TIME_DOMAIN_DATA_LENGTH);
  }

  public update(): LipSyncAnalyzeResult {
    this.analyser.getFloatTimeDomainData(this.timeDomainData);

    let volume = 0.0;
    for (let i = 0; i < TIME_DOMAIN_DATA_LENGTH; i++) {
      volume = Math.max(volume, Math.abs(this.timeDomainData[i]));
    }

    // cook
    volume = 1 / (1 + Math.exp(-45 * volume + 5));
    if (volume < 0.1) volume = 0;

    return {
      volume,
    };
  }

  public async playFromArrayBuffer(buffer: ArrayBuffer, onEnded?: () => void) {
    const audioBuffer = await this.audio.decodeAudioData(buffer);

    const bufferSource = this.audio.createBufferSource();
    bufferSource.buffer = audioBuffer;
    this.currentSource = bufferSource;

    bufferSource.connect(this.audio.destination);
    bufferSource.connect(this.analyser);
    if (onEnded) {
      bufferSource.addEventListener("ended", () => {
        if (this.currentSource === bufferSource) {
          this.currentSource = null;
        }
        onEnded();
      }, { once: true });
    } else {
      bufferSource.addEventListener("ended", () => {
        if (this.currentSource === bufferSource) {
          this.currentSource = null;
        }
      }, { once: true });
    }
    bufferSource.start();
  }

  public async playFromURL(url: string, onEnded?: () => void) {
    const res = await fetch(url);
    const buffer = await res.arrayBuffer();
    this.playFromArrayBuffer(buffer, onEnded);
  }

  public stop() {
    if (!this.currentSource) {
      return;
    }

    const source = this.currentSource;
    this.currentSource = null;
    try {
      source.stop();
    } catch {
      // no-op
    }
  }
}
