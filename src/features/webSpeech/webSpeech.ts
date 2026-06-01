export type WebSpeechController = {
  start: () => void;
  stop: () => void;
  abort: () => void;
};

export type WebSpeechAudioLevel = {
  rms: number;
  peak: number;
  db: number;
  muted: boolean;
};

type WebSpeechCallbacks = {
  onResult: (text: string) => void;
  onSpeechDetected?: () => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
  onAudioLevel?: (level: WebSpeechAudioLevel) => void;
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
};

function getRecognitionCtor(): any {
  if (typeof window === 'undefined') {
    return null;
  }
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

export function isWebSpeechSupported(): boolean {
  return Boolean(getRecognitionCtor());
}

export function createWebSpeechTranscriber(
  lang: string,
  callbacks: WebSpeechCallbacks,
): WebSpeechController {
  const RecognitionCtor = getRecognitionCtor();
  if (!RecognitionCtor) {
    throw new Error('Web Speech API is not supported in this browser.');
  }

  console.log('[webSpeech] Creating recognition instance for language:', lang);
  const recognition = new RecognitionCtor() as SpeechRecognitionLike;
  let shouldContinue = false;
  let manuallyStopping = false;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let monitorStream: MediaStream | null = null;
  let monitorAudioContext: AudioContext | null = null;
  let monitorSource: MediaStreamAudioSourceNode | null = null;
  let monitorAnalyser: AnalyserNode | null = null;
  let monitorFrameId: number | null = null;
  let lastLevelEmitAt = 0;
  let hasDetectedSpeech = false;

  const cleanupAudioMonitor = () => {
    if (monitorFrameId !== null) {
      cancelAnimationFrame(monitorFrameId);
      monitorFrameId = null;
    }
    if (monitorSource) {
      monitorSource.disconnect();
      monitorSource = null;
    }
    if (monitorAnalyser) {
      monitorAnalyser.disconnect();
      monitorAnalyser = null;
    }
    if (monitorStream) {
      monitorStream.getTracks().forEach((track) => track.stop());
      monitorStream = null;
    }
    if (monitorAudioContext) {
      void monitorAudioContext.close();
      monitorAudioContext = null;
    }
  };

  const startAudioMonitor = async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return;
    }

    cleanupAudioMonitor();
    try {
      monitorStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      monitorAudioContext = new AudioContext();
      monitorSource = monitorAudioContext.createMediaStreamSource(monitorStream);
      monitorAnalyser = monitorAudioContext.createAnalyser();
      monitorAnalyser.fftSize = 1024;
      monitorSource.connect(monitorAnalyser);

      const pcm = new Uint8Array(monitorAnalyser.fftSize);
      const tick = () => {
        if (!monitorAnalyser) {
          return;
        }

        monitorAnalyser.getByteTimeDomainData(pcm);
        let sumSquares = 0;
        let peak = 0;
        for (let index = 0; index < pcm.length; index += 1) {
          const sample = (pcm[index] - 128) / 128;
          const abs = Math.abs(sample);
          if (abs > peak) {
            peak = abs;
          }
          sumSquares += sample * sample;
        }

        const rms = Math.sqrt(sumSquares / pcm.length);
        const db = 20 * Math.log10(Math.max(rms, 0.00001));
        if (!hasDetectedSpeech && rms >= 0.02) {
          hasDetectedSpeech = true;
          callbacks.onSpeechDetected?.();
        }
        const now = Date.now();
        if (callbacks.onAudioLevel && now - lastLevelEmitAt >= 250) {
          callbacks.onAudioLevel({
            rms,
            peak,
            db,
            muted: rms < 0.01,
          });
          lastLevelEmitAt = now;
        }

        monitorFrameId = requestAnimationFrame(tick);
      };

      tick();
    } catch (error: any) {
      console.warn('[webSpeech] audio monitor start failed:', String(error?.message ?? error));
      cleanupAudioMonitor();
    }
  };

  const clearRestartTimer = () => {
    if (restartTimer !== null) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
  };

  const startRecognition = () => {
    clearRestartTimer();
    hasDetectedSpeech = false;
    try {
      console.log('[webSpeech] start()');
      recognition.start();
    } catch (error: any) {
      const message = String(error?.message ?? error ?? 'start_failed');
      console.warn('[webSpeech] start failed:', message);
    }
  };

  const scheduleRestart = (reason: string) => {
    if (!shouldContinue || manuallyStopping) {
      return;
    }

    clearRestartTimer();
    console.log('[webSpeech] scheduling restart:', reason);
    restartTimer = setTimeout(() => {
      restartTimer = null;
      if (!shouldContinue || manuallyStopping) {
        return;
      }
      startRecognition();
    }, 250);
  };

  recognition.lang = lang;
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    console.log('[webSpeech] onstart - listening for audio...');
  };

  recognition.onresult = (event: any) => {
    console.log('[webSpeech] onresult event:', event.resultIndex, 'results.length:', event?.results?.length);
    let text = '';
    const startIndex = typeof event?.resultIndex === 'number' ? event.resultIndex : 0;
    const results = event?.results;
    if (results && typeof results.length === 'number') {
      for (let index = startIndex; index < results.length; index += 1) {
        const result = results[index];
        const transcript = result?.[0]?.transcript?.trim?.() ?? '';
        if (!transcript) {
          continue;
        }
        if (!hasDetectedSpeech) {
          hasDetectedSpeech = true;
          callbacks.onSpeechDetected?.();
        }
        console.log('[webSpeech] result[' + index + '] isFinal:', result?.isFinal, 'transcript:', transcript);
        if (result?.isFinal) {
          text += `${transcript} `;
        }
      }
    }

    text = text.trim();
    console.log('[webSpeech] final text:', text);
    if (text) {
      callbacks.onResult(text);
    }
  };

  recognition.onerror = (event: any) => {
    const errorMsg = String(event?.error ?? 'speech_error');
    console.error('[webSpeech] onerror event:', errorMsg);

    // recoverable errors are common with the browser speech API; keep the
    // session alive and let recognition restart instead of leaving the mic stuck.
    const shouldAutoRecover = errorMsg === 'no-speech' || errorMsg === 'aborted';

    // より詳しいエラーメッセージをコンソールに出力
    if (errorMsg === 'no-speech') {
      console.warn('[webSpeech] 音声開始前のタイムアウト、または無音判定です。以下を確認してください：');
      console.warn('  1. マイクが接続されているか');
      console.warn('  2. ブラウザがマイクの使用を許可しているか');
      console.warn('  3. マイク音量が十分か');
      console.warn('  4. 音声を入力し始めるのに遅延がないか');
      if (shouldContinue && !manuallyStopping) {
        scheduleRestart('onerror:no-speech');
      }
      return;
    } else if (errorMsg === 'not-allowed') {
      console.warn('[webSpeech] マイクの使用が許可されていません。ブラウザの設定を確認してください。');
    }

    if (shouldAutoRecover) {
      if (shouldContinue && !manuallyStopping) {
        scheduleRestart(`onerror:${errorMsg}`);
      }
      return;
    }
    
    callbacks.onError?.(errorMsg);
  };

  recognition.onend = () => {
    console.log('[webSpeech] onend event');
    if (shouldContinue && !manuallyStopping) {
      scheduleRestart('onend');
      return;
    }
    callbacks.onEnd?.();
  };

  return {
    start: () => {
      manuallyStopping = false;
      shouldContinue = true;
      void startAudioMonitor();
      startRecognition();
    },
    stop: () => {
      console.log('[webSpeech] stop()');
      shouldContinue = false;
      manuallyStopping = true;
      clearRestartTimer();
      cleanupAudioMonitor();
      recognition.stop();
    },
    abort: () => {
      console.log('[webSpeech] abort()');
      shouldContinue = false;
      manuallyStopping = true;
      clearRestartTimer();
      cleanupAudioMonitor();
      recognition.abort();
    },
  };
}
