import * as ort from "onnxruntime-web"
ort.env.wasm.wasmPaths = '/_next/static/chunks/'

import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useMicVAD } from "@ricky0123/vad-react"
import { IconButton } from "./iconButton";
import { useTranscriber } from "@/hooks/useTranscriber";
import { cleanTranscript, cleanFromPunctuation, cleanFromWakeWord } from "@/utils/stringProcessing";
import { hasOnScreenKeyboard } from "@/utils/hasOnScreenKeyboard";
import { AlertContext } from "@/features/alert/alertContext";
import { ChatContext } from "@/features/chat/chatContext";
import { openaiWhisper  } from "@/features/openaiWhisper/openaiWhisper";
import { whispercpp  } from "@/features/whispercpp/whispercpp";
import { config, defaultConfig, updateConfig, updateConfigBatch } from "@/utils/config";
import { WaveFile } from "wavefile";
import { AmicaLifeContext } from "@/features/amicaLife/amicaLifeContext";
import { AudioControlsContext } from "@/features/moshi/components/audioControlsContext";
import { fetchPublicDomainOptions } from "@/lib/injectionClient";
import { ViewerContext } from "@/features/vrmViewer/viewerContext";
import { buildUrl } from "@/utils/buildUrl";
import { createWebSpeechTranscriber, isWebSpeechSupported, WebSpeechAudioLevel, WebSpeechController } from "@/features/webSpeech/webSpeech";

type DomainOption = {
  id: string;
  label: string;
  chronicleAttached?: boolean;
  bgUrl?: string;
  characterName?: string;
  vrmEnabled?: boolean;
  vrmUrl?: string;
  imageAvatarIdleUrl?: string;
  imageAvatarTalkUrl?: string;
  imageAvatarTalkIntervalMs?: number;
  ttsMuted?: boolean;
  stylebertvits2ModelId?: string;
  stylebertvits2Style?: string;
  gazeWakeEnabled?: boolean;
  gazeHoldMs?: number;
  gazeReleaseMs?: number;
  gazeCooldownMs?: number;
  gazeGreetings?: string[];
  gazeDebugUiEnabled?: boolean;
};

type GazeDebugState = {
  status: string;
  holdProgress: number;
  cooldownRemainingMs: number;
  faceAreaRatio: number;
  centered: boolean;
  errorName: string;
  errorMessage: string;
};

type GazeCalibration = {
  centerXDiff: number;
  centerYDiff: number;
  yawAsymmetry: number;
  rollRadians: number;
  faceAreaRatio: number;
  capturedAt: number;
};

type GazeMetrics = {
  hasFace: boolean;
  centerXDiff: number;
  centerYDiff: number;
  yawAsymmetry: number;
  rollRadians: number;
  faceAreaRatio: number;
};

const DEFAULT_GAZE_HOLD_MS = 1500;
const DEFAULT_GAZE_RELEASE_MS = 300;
const DEFAULT_GAZE_COOLDOWN_MS = 10000;
const GAZE_CALIBRATION_STORAGE_KEY = 'amica_gaze_calibration_v1';
const DEFAULT_GAZE_GREETINGS = [
  '何か御用がありますか？',
  'お待ちしていました。どうしましたか？',
  'こんにちは。必要なことがあれば教えてください。',
  '目が合いましたね。今日は何をお手伝いしましょうか？',
];

const sttBackendLabels: Record<string, string> = {
  none: 'None',
  whisper_browser: 'Whisper (Browser)',
  web_speech: 'Web Speech API',
  whisper_openai: 'Whisper (OpenAI)',
  whispercpp: 'Whisper.cpp',
};

const ttsBackendLabels: Record<string, string> = {
  none: 'None',
  elevenlabs: 'ElevenLabs',
  speecht5: 'SpeechT5',
  openai_tts: 'OpenAI TTS',
  localXTTS: 'Alltalk TTS',
  piper: 'Piper',
  coquiLocal: 'Coqui Local',
  kokoro: 'Kokoro',
  stylebertvits2: 'Style-Bert-VITS2',
};

const chatbotBackendLabels: Record<string, string> = {
  echo: 'Echo',
  arbius_llm: 'Arbius',
  chatgpt: 'ChatGPT',
  llamacpp: 'Llama.cpp',
  windowai: 'Window.ai',
  ollama: 'Ollama',
  koboldai: 'KoboldAI',
  moshi: 'Moshi',
  openrouter: 'OpenRouter',
};

function toRuntimeAssetUrl(raw: string): string {
  const value = (raw || '').trim();
  if (!value) {
    return '';
  }

  if (value.startsWith('/bgimage/')) {
    return `/api/injection-assets${value}`;
  }

  if (value.startsWith('http://') || value.startsWith('https://')) {
    try {
      const parsed = new URL(value);
      if (parsed.pathname.startsWith('/bgimage/') || parsed.pathname.startsWith('/vrm/')) {
        return `/api/injection-assets${parsed.pathname}${parsed.search}`;
      }
    } catch {
      return value;
    }
  }

  return value;
}

function toRenderableUrl(raw: string): string {
  const value = (raw || '').trim();
  if (!value) {
    return '';
  }
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }
  return buildUrl(value);
}


export default function MessageInput({
  userMessage,
  setUserMessage,
  isChatProcessing,
  onChangeUserMessage,
}: {
  userMessage: string;
  setUserMessage: (message: string) => void;
  isChatProcessing: boolean;
  onChangeUserMessage: (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
}) {
  const transcriber = useTranscriber();
  const inputRef = useRef<HTMLInputElement>(null);
  const [whisperOpenAIOutput, setWhisperOpenAIOutput] = useState<any | null>(null);
  const [whisperCppOutput, setWhisperCppOutput] = useState<any | null>(null);
  const { chat: bot } = useContext(ChatContext);
  const { alert } = useContext(AlertContext);
  const { amicaLife } = useContext(AmicaLifeContext);
  const { audioControls: moshi } = useContext(AudioControlsContext);
  const { viewer } = useContext(ViewerContext);
  const [ moshiMuted, setMoshiMuted] = useState(moshi.isMuted());
  const [webSpeechListening, setWebSpeechListening] = useState(false);
  const webSpeechControllerRef = useRef<WebSpeechController | null>(null);
  const webSpeechFallbackNotifiedRef = useRef(false);
  const webSpeechMaxRmsRef = useRef(0);
  const webSpeechLastLevelLogAtRef = useRef(0);
  const [domainMenuOpen, setDomainMenuOpen] = useState(false);
  const [featureMenuOpen, setFeatureMenuOpen] = useState(false);
  const [gazeWakeEnabled, setGazeWakeEnabled] = useState(false);
  const [hasGazeCalibration, setHasGazeCalibration] = useState(false);
  const [gazeDebug, setGazeDebug] = useState<GazeDebugState>({
    status: 'idle',
    holdProgress: 0,
    cooldownRemainingMs: 0,
    faceAreaRatio: 0,
    centered: false,
    errorName: '',
    errorMessage: '',
  });
  const [selectedDomain, setSelectedDomain] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('amica_selected_domain_id');
      if (saved) return saved;
    }
    return config("injection_default_domain");
  });
  const lastVadErrorMessageRef = useRef<string | null>(null);
  const gazeCalibrationRef = useRef<GazeCalibration | null>(null);
  const latestGazeMetricsRef = useRef<GazeMetrics | null>(null);
  const initialDomainConfigRef = useRef({
    name: config("name"),
    bgUrl: defaultConfig("bg_url"),
    bgColor: config("bg_color"),
    vrmUrl: defaultConfig("vrm_url"),
    vrmHash: defaultConfig("vrm_hash"),
    vrmSaveType: defaultConfig("vrm_save_type"),
    imageAvatarIdleUrl: defaultConfig('image_avatar_idle_url'),
    imageAvatarTalkUrl: defaultConfig('image_avatar_talk_url'),
    imageAvatarTalkIntervalMs: parseInt(defaultConfig('image_avatar_talk_interval_ms'), 10) || 180,
    ttsMuted: config("tts_muted"),
    stylebertvits2ModelId: config("stylebertvits2_model_id"),
    stylebertvits2Style: config("stylebertvits2_style"),
  });
  const appliedDomainConfigRef = useRef<string | null>(null);

  useEffect(() => {
    const migrateLegacyAssetConfig = async () => {
      const currentBgUrl = config('bg_url');
      const currentVrmUrl = config('vrm_url');

      const normalizedBgUrl = toRuntimeAssetUrl(currentBgUrl);
      const normalizedVrmUrl = toRuntimeAssetUrl(currentVrmUrl);

      const updates: Array<Promise<void>> = [];
      if (currentBgUrl !== normalizedBgUrl) {
        updates.push(updateConfig('bg_url', normalizedBgUrl));
      }
      if (currentVrmUrl !== normalizedVrmUrl) {
        updates.push(updateConfig('vrm_url', normalizedVrmUrl));
      }

      if (updates.length > 0) {
        await Promise.all(updates);
      }
    };

    void migrateLegacyAssetConfig();
  }, []);

  const [domainOptions, setDomainOptions] = useState<Array<DomainOption>>(() => {
    const fallback = [
      {
        id: config("injection_default_domain"),
        label: config("injection_default_domain_label"),
        chronicleAttached: false,
        bgUrl: '',
        characterName: '',
        vrmUrl: '',
        imageAvatarIdleUrl: '',
        imageAvatarTalkUrl: '',
        imageAvatarTalkIntervalMs: 180,
        ttsMuted: undefined,
        stylebertvits2ModelId: '',
        stylebertvits2Style: '',
        gazeWakeEnabled: true,
        gazeHoldMs: DEFAULT_GAZE_HOLD_MS,
        gazeReleaseMs: DEFAULT_GAZE_RELEASE_MS,
        gazeCooldownMs: DEFAULT_GAZE_COOLDOWN_MS,
        gazeGreetings: [...DEFAULT_GAZE_GREETINGS],
        gazeDebugUiEnabled: false,
      },
    ];

    try {
      const parsed = JSON.parse(config("injection_domain_options"));
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return fallback;
      }

      const normalized = parsed
        .filter((item: any) => item && typeof item === 'object' && typeof item.id === 'string')
        .map((item: any) => ({
          id: String(item.id).trim(),
          label: String(item.label ?? item.name ?? item.id).trim(),
          chronicleAttached: Boolean(item.chronicleAttached),
          bgUrl: String(item.bgUrl ?? '').trim(),
          characterName: String(item.characterName ?? '').trim(),
          vrmEnabled: typeof item.vrmEnabled === 'boolean' ? item.vrmEnabled : true,
          vrmUrl: String(item.vrmUrl ?? '').trim(),
          imageAvatarIdleUrl: String(item.imageAvatarIdleUrl ?? '').trim(),
          imageAvatarTalkUrl: String(item.imageAvatarTalkUrl ?? '').trim(),
          imageAvatarTalkIntervalMs:
            typeof item.imageAvatarTalkIntervalMs === 'number' && item.imageAvatarTalkIntervalMs > 0
              ? item.imageAvatarTalkIntervalMs
              : 180,
          ttsMuted: typeof item.ttsMuted === 'boolean' ? item.ttsMuted : undefined,
          stylebertvits2ModelId: String(item.stylebertvits2ModelId ?? '').trim(),
          stylebertvits2Style: String(item.stylebertvits2Style ?? '').trim(),
          gazeWakeEnabled: typeof item.gazeWakeEnabled === 'boolean' ? item.gazeWakeEnabled : true,
          gazeHoldMs:
            typeof item.gazeHoldMs === 'number' && item.gazeHoldMs > 0
              ? item.gazeHoldMs
              : DEFAULT_GAZE_HOLD_MS,
          gazeReleaseMs:
            typeof item.gazeReleaseMs === 'number' && item.gazeReleaseMs > 0
              ? item.gazeReleaseMs
              : DEFAULT_GAZE_RELEASE_MS,
          gazeCooldownMs:
            typeof item.gazeCooldownMs === 'number' && item.gazeCooldownMs > 0
              ? item.gazeCooldownMs
              : DEFAULT_GAZE_COOLDOWN_MS,
          gazeGreetings: Array.isArray(item.gazeGreetings)
            ? item.gazeGreetings
                .filter((phrase: unknown) => typeof phrase === 'string')
                .map((phrase: string) => phrase.trim())
                .filter(Boolean)
            : [...DEFAULT_GAZE_GREETINGS],
          gazeDebugUiEnabled:
            typeof item.gazeDebugUiEnabled === 'boolean' ? item.gazeDebugUiEnabled : false,
        }))
        .filter((item: DomainOption) => item.id.length > 0 && item.label.length > 0);

      return normalized.length > 0 ? normalized : fallback;
    } catch {
      return fallback;
    }
  });

  const selectedDomainLabel =
    domainOptions.find((domain: DomainOption) => domain.id === selectedDomain)?.label ||
    config("injection_default_domain_label");
  const selectedDomainOption = domainOptions.find((domain: DomainOption) => domain.id === selectedDomain);
  const selectedDomainGazeEnabled = selectedDomainOption?.gazeWakeEnabled ?? true;
  const selectedDomainGazeDebugUiEnabled = selectedDomainOption?.gazeDebugUiEnabled ?? false;
  const selectedDomainGazeHoldMs = selectedDomainOption?.gazeHoldMs ?? DEFAULT_GAZE_HOLD_MS;
  const selectedDomainGazeReleaseMs = selectedDomainOption?.gazeReleaseMs ?? DEFAULT_GAZE_RELEASE_MS;
  const selectedDomainGazeCooldownMs = selectedDomainOption?.gazeCooldownMs ?? DEFAULT_GAZE_COOLDOWN_MS;
  const selectedDomainGazeGreetings =
    selectedDomainOption?.gazeGreetings && selectedDomainOption.gazeGreetings.length > 0
      ? selectedDomainOption.gazeGreetings
      : DEFAULT_GAZE_GREETINGS;
  const selectedDomainHasChronicle = Boolean(selectedDomainOption?.chronicleAttached);
  const [chronicleEnabledForInput, setChronicleEnabledForInput] = useState(false);

  useEffect(() => {
    if (!selectedDomainHasChronicle) {
      setChronicleEnabledForInput(false);
    }
  }, [selectedDomainHasChronicle]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const key = `amica_gaze_wake_enabled:${selectedDomain}`;
    const saved = localStorage.getItem(key);
    if (saved === null) {
      setGazeWakeEnabled(selectedDomainGazeEnabled);
      return;
    }

    setGazeWakeEnabled(saved === 'true');
  }, [selectedDomain, selectedDomainGazeEnabled]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const key = `amica_gaze_wake_enabled:${selectedDomain}`;
    localStorage.setItem(key, gazeWakeEnabled ? 'true' : 'false');
  }, [selectedDomain, gazeWakeEnabled]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const saved = localStorage.getItem(GAZE_CALIBRATION_STORAGE_KEY);
      if (!saved) {
        gazeCalibrationRef.current = null;
        setHasGazeCalibration(false);
        return;
      }

      const parsed = JSON.parse(saved) as Partial<GazeCalibration>;
      if (
        typeof parsed.centerXDiff !== 'number' ||
        typeof parsed.centerYDiff !== 'number' ||
        typeof parsed.yawAsymmetry !== 'number' ||
        typeof parsed.rollRadians !== 'number' ||
        typeof parsed.faceAreaRatio !== 'number'
      ) {
        gazeCalibrationRef.current = null;
        setHasGazeCalibration(false);
        return;
      }

      gazeCalibrationRef.current = {
        centerXDiff: parsed.centerXDiff,
        centerYDiff: parsed.centerYDiff,
        yawAsymmetry: parsed.yawAsymmetry,
        rollRadians: parsed.rollRadians,
        faceAreaRatio: parsed.faceAreaRatio,
        capturedAt: typeof parsed.capturedAt === 'number' ? parsed.capturedAt : 0,
      };
      setHasGazeCalibration(true);
    } catch {
      gazeCalibrationRef.current = null;
      setHasGazeCalibration(false);
    }
  }, []);

  const calibrateGaze = useCallback(() => {
    const metrics = latestGazeMetricsRef.current;
    if (!metrics?.hasFace) {
      alert.warning('キャリブレーションできません', '顔が安定して映っている状態で、正面を向いてから再実行してください。');
      return;
    }

    const calibration: GazeCalibration = {
      centerXDiff: metrics.centerXDiff,
      centerYDiff: metrics.centerYDiff,
      yawAsymmetry: metrics.yawAsymmetry,
      rollRadians: metrics.rollRadians,
      faceAreaRatio: metrics.faceAreaRatio,
      capturedAt: Date.now(),
    };

    gazeCalibrationRef.current = calibration;
    setHasGazeCalibration(true);

    if (typeof window !== 'undefined') {
      localStorage.setItem(GAZE_CALIBRATION_STORAGE_KEY, JSON.stringify(calibration));
    }

    alert.success('視線基準を保存しました', 'この端末の正面姿勢を基準に更新しました。必要ならいつでも再実行できます。');
  }, [alert]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const onCalibrateRequest = () => {
      calibrateGaze();
    };

    window.addEventListener('amica:gaze-calibrate', onCalibrateRequest);
    return () => {
      window.removeEventListener('amica:gaze-calibrate', onCalibrateRequest);
    };
  }, [calibrateGaze]);

  const currentSTTBackend = config('stt_backend');
  const currentTTSBackend = config('tts_backend');
  const currentChatbotBackend = config('chatbot_backend');

  const currentSTTLabel = sttBackendLabels[currentSTTBackend] ?? currentSTTBackend;
  const currentTTSLabel = ttsBackendLabels[currentTTSBackend] ?? currentTTSBackend;
  const currentChatbotLabel = chatbotBackendLabels[currentChatbotBackend] ?? currentChatbotBackend;

  const currentAIModel = (() => {
    switch (currentChatbotBackend) {
      case 'arbius_llm':
        return config('arbius_llm_model_id');
      case 'chatgpt':
        return config('openai_model');
      case 'ollama':
        return config('ollama_model');
      case 'openrouter':
        return config('openrouter_model');
      case 'llamacpp':
        return 'server-default';
      case 'windowai':
        return 'browser-model';
      case 'koboldai':
        return 'server-model';
      case 'moshi':
        return 'realtime';
      case 'echo':
        return 'echo';
      default:
        return '-';
    }
  })();

  const checkImageAvailable = useCallback((url: string): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!url) {
        resolve(false);
        return;
      }

      const img = new Image();
      const timeoutId = window.setTimeout(() => {
        img.onload = null;
        img.onerror = null;
        resolve(false);
      }, 7000);

      img.onload = () => {
        clearTimeout(timeoutId);
        resolve(true);
      };

      img.onerror = () => {
        clearTimeout(timeoutId);
        resolve(false);
      };

      img.src = toRenderableUrl(url);
    });
  }, []);

  const applyDomainOverrides = useCallback(async (domain: DomainOption | undefined) => {
    const baseline = initialDomainConfigRef.current;
    const previousVrmUrl = config('vrm_url');
    const nextVrmEnabled = domain?.vrmEnabled ?? true;
    const nextName = domain?.characterName?.trim() || baseline.name;
    const normalizedBaselineBgUrl = toRuntimeAssetUrl(baseline.bgUrl || '');
    const normalizedBaselineVrmUrl = toRuntimeAssetUrl(baseline.vrmUrl || '');
    const requestedBgUrl = toRuntimeAssetUrl(domain?.bgUrl?.trim() || normalizedBaselineBgUrl);
    const requestedVrmUrl = toRuntimeAssetUrl(domain?.vrmUrl?.trim() || normalizedBaselineVrmUrl);
    let resolvedBgUrl = requestedBgUrl;
    let resolvedVrmUrl = requestedVrmUrl;
    let resolvedVrmHash = domain?.vrmUrl?.trim() ? '' : baseline.vrmHash;
    let resolvedVrmSaveType = domain?.vrmUrl?.trim() ? 'web' : baseline.vrmSaveType;
    const nextImageAvatarIdleUrl = toRuntimeAssetUrl(domain?.imageAvatarIdleUrl?.trim() || baseline.imageAvatarIdleUrl || '');
    const nextImageAvatarTalkUrl = toRuntimeAssetUrl(domain?.imageAvatarTalkUrl?.trim() || baseline.imageAvatarTalkUrl || '');
    const nextImageAvatarTalkIntervalMs =
      typeof domain?.imageAvatarTalkIntervalMs === 'number' && domain.imageAvatarTalkIntervalMs > 0
        ? domain.imageAvatarTalkIntervalMs
        : baseline.imageAvatarTalkIntervalMs;
    const nextTtsMuted =
      typeof domain?.ttsMuted === 'boolean'
        ? domain.ttsMuted
        : baseline.ttsMuted === 'true';
    const nextModelId = domain?.stylebertvits2ModelId?.trim() || baseline.stylebertvits2ModelId;
    const nextStyle = domain?.stylebertvits2Style?.trim() || baseline.stylebertvits2Style;

    const configEntries: Array<[string, string]> = [
      ['name', nextName],
      ['bg_url', resolvedBgUrl],
      ['vrm_enabled', nextVrmEnabled ? 'true' : 'false'],
      ['vrm_url', resolvedVrmUrl],
      ['vrm_hash', resolvedVrmHash],
      ['vrm_save_type', resolvedVrmSaveType],
      ['image_avatar_idle_url', nextImageAvatarIdleUrl],
      ['image_avatar_talk_url', nextImageAvatarTalkUrl],
      ['image_avatar_talk_interval_ms', String(nextImageAvatarTalkIntervalMs)],
      ['stylebertvits2_model_id', nextModelId],
      ['stylebertvits2_style', nextStyle],
    ];

    configEntries.push(['tts_muted', nextTtsMuted ? 'true' : 'false']);

    if (typeof document !== 'undefined' && domain?.bgUrl?.trim()) {
      const bgOk = await checkImageAvailable(requestedBgUrl);
      if (!bgOk) {
        resolvedBgUrl = normalizedBaselineBgUrl;
        alert.warning(
          '背景画像の読み込みに失敗しました',
          `ドメイン「${domain.label}」の背景画像を読み込めなかったため、デフォルト背景へ戻しました。`
        );
      }
    }

    await updateConfigBatch(configEntries);

    if (typeof document !== 'undefined') {
      if (resolvedBgUrl) {
        document.body.style.backgroundColor = '';
        document.body.style.backgroundImage = `url(${toRenderableUrl(resolvedBgUrl)})`;
      } else if (baseline.bgColor) {
        document.body.style.backgroundImage = '';
        document.body.style.backgroundColor = baseline.bgColor;
      } else {
        document.body.style.backgroundColor = '';
        document.body.style.backgroundImage = normalizedBaselineBgUrl ? `url(${toRenderableUrl(normalizedBaselineBgUrl)})` : '';
      }
    }

    if (nextVrmEnabled && viewer.isReady && resolvedVrmUrl && previousVrmUrl !== resolvedVrmUrl) {
      try {
        await viewer.loadVrm(toRenderableUrl(resolvedVrmUrl), () => {});
        // VrmViewer の lastLoadedUrlRef と同期して二重ロードを防ぐ
        window.dispatchEvent(new CustomEvent('amica:vrm-externally-loaded', { detail: { url: toRenderableUrl(resolvedVrmUrl) } }));
      } catch (error) {
        console.error('Failed to switch VRM for selected domain:', error);

        const fallbackVrmUrl = normalizedBaselineVrmUrl;
        resolvedVrmUrl = fallbackVrmUrl;
        resolvedVrmHash = baseline.vrmHash;
        resolvedVrmSaveType = baseline.vrmSaveType;

        await Promise.all([
          updateConfig('vrm_url', resolvedVrmUrl),
          updateConfig('vrm_hash', resolvedVrmHash),
          updateConfig('vrm_save_type', resolvedVrmSaveType),
        ]);

        alert.warning(
          'VRMの読み込みに失敗しました',
          `ドメイン「${domain?.label ?? domain?.id ?? 'unknown'}」のVRMを読み込めなかったため、デフォルトVRMへ戻しました。`
        );

        if (nextVrmEnabled && viewer.isReady && fallbackVrmUrl && previousVrmUrl !== fallbackVrmUrl) {
          try {
            await viewer.loadVrm(toRenderableUrl(fallbackVrmUrl), () => {});
            window.dispatchEvent(new CustomEvent('amica:vrm-externally-loaded', { detail: { url: toRenderableUrl(fallbackVrmUrl) } }));
          } catch (fallbackError) {
            console.error('Failed to load fallback VRM:', fallbackError);
          }
        }
      }
    }
  }, [alert, checkImageAvailable, viewer]);

  // selectedDomain を ref で保持し、callback の依存から除外することで
  // ドメイン選択時に useEffect が再発火するのを防ぐ
  const selectedDomainRef = useRef(selectedDomain);
  useEffect(() => {
    selectedDomainRef.current = selectedDomain;
  }, [selectedDomain]);

  // viewer が ready になったあとに VRM を再ロードするための ref
  const pendingVrmUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const domain = domainOptions.find((item) => item.id === selectedDomain);

    // ドメインが一覧に見つからない場合はまだ API データ未着のため何もしない
    // (applyDomainOverrides(undefined) でデフォルトにリセットされるのを防ぐ)
    if (!domain) return;

    const signature = JSON.stringify({
      domainId: selectedDomain,
      bgUrl: domain?.bgUrl || '',
      characterName: domain?.characterName || '',
      vrmEnabled: domain?.vrmEnabled ?? true,
      vrmUrl: domain?.vrmUrl || '',
      imageAvatarIdleUrl: domain?.imageAvatarIdleUrl || '',
      imageAvatarTalkUrl: domain?.imageAvatarTalkUrl || '',
      imageAvatarTalkIntervalMs: domain?.imageAvatarTalkIntervalMs ?? 180,
      ttsMuted: domain?.ttsMuted,
      stylebertvits2ModelId: domain?.stylebertvits2ModelId || '',
      stylebertvits2Style: domain?.stylebertvits2Style || '',
    });

    if (appliedDomainConfigRef.current === signature) {
      return;
    }

    appliedDomainConfigRef.current = signature;

    // viewer がまだ準備できていない場合は VRM URL を pending に積んでおく
    if ((domain.vrmEnabled ?? true) && domain.vrmUrl?.trim() && !viewer.isReady) {
      pendingVrmUrlRef.current = domain.vrmUrl.trim();
    }

    void applyDomainOverrides(domain);
  }, [applyDomainOverrides, domainOptions, selectedDomain, viewer]);

  // viewer.isReady のポーリング: pendingVrmUrl があり viewer が ready になったら再適用
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (!viewer.isReady || !pendingVrmUrlRef.current) {
        return;
      }
      clearInterval(intervalId);
      const pendingUrl = pendingVrmUrlRef.current;
      pendingVrmUrlRef.current = null;
      // appliedDomainConfigRef をリセットせず、直接 VRM だけロードする
      // (設定は既に applyDomainOverrides で書き込み済みのため)
      const domain = domainOptions.find((item) => item.id === selectedDomainRef.current);
      if (domain && (domain.vrmEnabled ?? true) && pendingUrl) {
        void viewer.loadVrm(toRenderableUrl(pendingUrl), () => {});
      }
    }, 500);

    return () => clearInterval(intervalId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, domainOptions]);

  const refreshDomainOptions = useCallback(async (preferCurrent: boolean) => {
    const defaultDomainId = config("injection_default_domain");

    try {
      const optionsFromApi = await fetchPublicDomainOptions();
      if (optionsFromApi.length === 0) {
        return;
      }

      setDomainOptions(optionsFromApi);

      if (preferCurrent) {
        // メニュー展開時: 現在の選択が選択肢にあればそのまま維持
        const hasCurrent = optionsFromApi.some((domain) => domain.id === selectedDomainRef.current);
        if (hasCurrent) {
          return;
        }
      }

      // localStorageに保存済みの選択を優先して復元
      const savedId = typeof window !== 'undefined' ? localStorage.getItem('amica_selected_domain_id') : null;
      const hasSaved = savedId && optionsFromApi.some((domain) => domain.id === savedId);

      const applyFallbackSelection = (id: string) => {
        setSelectedDomain(id);
        if (typeof window !== 'undefined') {
          localStorage.setItem('amica_selected_domain_id', id);
        }
      };

      if (hasSaved) {
        applyFallbackSelection(savedId!);
      } else {
        // 保存済みも現在選択中も存在しない場合は default → 先頭の順で決定し、起動時の揺れを防ぐ
        const hasDefault = optionsFromApi.some((domain) => domain.id === defaultDomainId);
        if (hasDefault) {
          applyFallbackSelection(defaultDomainId);
        } else {
          const firstDomainId = optionsFromApi[0]?.id ?? '';
          if (firstDomainId) {
            applyFallbackSelection(firstDomainId);
          }
        }
      }
    } catch {
      // API失敗時は既存の選択肢/選択値を維持
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 初回マウント後に再生成しない

  useEffect(() => {
    void refreshDomainOptions(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // マウント時1回のみ

  const vad = useMicVAD({
    startOnLoad: false,
    onSpeechStart: () => {
      console.debug('vad', 'on_speech_start');
      console.time('performance_speech');
    },
    onSpeechEnd: (audio: Float32Array) => {
      // Web Speech API is handled separately, skip VAD callback
      if (isWebSpeechBackend) {
        return;
      }

      console.debug('vad', 'on_speech_end');
      console.timeEnd('performance_speech');
      console.time('performance_transcribe');
      (window as any).chatvrm_latency_tracker = {
        start: +Date.now(),
        active: true,
      };

      try {
        switch (config("stt_backend")) {
          case 'whisper_browser': {
            console.debug('whisper_browser attempt');
            // since VAD sample rate is same as whisper we do nothing here
            // both are 16000
            const audioCtx = new AudioContext();
            const buffer = audioCtx.createBuffer(1, audio.length, 16000);
            buffer.copyToChannel(audio, 0, 0);
            transcriber.start(buffer);
            break;
          }
          case 'whisper_openai': {
            console.debug('whisper_openai attempt');
            const wav = new WaveFile();
            wav.fromScratch(1, 16000, '32f', audio);
            const file = new File([wav.toBuffer()], "input.wav", { type: "audio/wav" });

            let prompt;
            // TODO load prompt if it exists

            (async () => {
              try {
                const transcript = await openaiWhisper(file, prompt);
                setWhisperOpenAIOutput(transcript);
              } catch (e: any) {
                console.error('whisper_openai error', e);
                alert.error('whisper_openai error', e.toString());
              }
            })();
            break;
          }
          case 'whispercpp': {
            console.debug('whispercpp attempt');
            const wav = new WaveFile();
            wav.fromScratch(1, 16000, '32f', audio);
            wav.toBitDepth('16');
            const file = new File([wav.toBuffer()], "input.wav", { type: "audio/wav" });

            let prompt;
            // TODO load prompt if it exists

            (async () => {
              try {
                const transcript = await whispercpp(file, prompt);
                setWhisperCppOutput(transcript);
              } catch (e: any) {
                console.error('whispercpp error', e);
                alert.error('whispercpp error', e.toString());
              }
            })();
            break;
          }
        }
      } catch (e: any) {
        console.error('stt_backend error', e);
        alert.error('STT backend error', e.toString());
      }
    },
  });

  useEffect(() => {
    if (!vad.errored) {
      lastVadErrorMessageRef.current = null;
      return;
    }

    const message = vad.errored.message ?? JSON.stringify(vad.errored);
    if (lastVadErrorMessageRef.current === message) {
      return;
    }

    lastVadErrorMessageRef.current = message;
    console.error('vad error', vad.errored);
  }, [vad.errored]);

  function handleTranscriptionResult(preprocessed: string) {
    const cleanText = cleanTranscript(preprocessed);
    const wakeWordEnabled = config("wake_word_enabled") === 'true';
    const textStartsWithWakeWord = wakeWordEnabled && cleanFromPunctuation(cleanText).startsWith(cleanFromPunctuation(config("wake_word")));
    const text = wakeWordEnabled && textStartsWithWakeWord ? cleanFromWakeWord(cleanText, config("wake_word")) : cleanText;

    if (wakeWordEnabled) {
      // Text start with wake word
      if (textStartsWithWakeWord) {
        // Pause amicaLife and update bot's awake status when speaking
        if (config("amica_life_enabled") === "true") {
          amicaLife.pause();
        }
        bot.updateAwake();
      // Case text doesn't start with wake word and not receive trigger message in amica life
      } else {
        if (config("amica_life_enabled") === "true" && amicaLife.triggerMessage !== true && !bot.isAwake()) {
          bot.updateAwake();
        }
      }
    } else {
      // If wake word off, update bot's awake when speaking
      if (config("amica_life_enabled") === "true") {
        amicaLife.pause();
        bot.updateAwake();
      }
    }


    if (text === "") {
      return;
    }


    if (config("autosend_from_mic") === 'true') {
      if (!wakeWordEnabled || bot.isAwake()) {
        bot.receiveMessageFromUser(text, false, selectedDomain);
      } else {
        setUserMessage(text);
      }
    } else {
      setUserMessage(text);
    }
    console.timeEnd('performance_transcribe');
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    onChangeUserMessage(event); 
  
    // Pause amicaLife and update bot's awake status when typing
    if (config("amica_life_enabled") === "true") {
      amicaLife.pause();
      bot.updateAwake();
    }
  }

  const isWebSpeechBackend = config('stt_backend') === 'web_speech';
  const gazeSupportWarnedRef = useRef(false);
  const gazePermissionWarnedRef = useRef(false);
  const micListeningRef = useRef(false);
  const chatProcessingRef = useRef(isChatProcessing);
  const micStarterRef = useRef<() => void>(() => {});
  const micStopperRef = useRef<() => void>(() => {});

  function toggleWebSpeech() {
    console.log('[toggleWebSpeech] START - webSpeechListening:', webSpeechListening);
    
    if (!isWebSpeechSupported()) {
      console.error('[toggleWebSpeech] Web Speech API not supported');
      alert.error('Web Speech API is not supported', 'このブラウザでは Web Speech API が使えません。');
      return;
    }

    if (webSpeechListening) {
      console.log('[toggleWebSpeech] Stopping listening');
      webSpeechControllerRef.current?.stop();
      setWebSpeechListening(false);
      return;
    }

    try {
      console.log('[toggleWebSpeech] Creating transcriber...');
      webSpeechMaxRmsRef.current = 0;
      webSpeechLastLevelLogAtRef.current = 0;
      webSpeechControllerRef.current = createWebSpeechTranscriber('ja-JP', {
        onResult: (text: string) => {
          console.log('[toggleWebSpeech] onResult:', text);
          handleTranscriptionResult(text);
        },
        onAudioLevel: (level: WebSpeechAudioLevel) => {
          if (level.rms > webSpeechMaxRmsRef.current) {
            webSpeechMaxRmsRef.current = level.rms;
          }

          const now = Date.now();
          if (now - webSpeechLastLevelLogAtRef.current >= 1000) {
            webSpeechLastLevelLogAtRef.current = now;
            console.log(
              '[webSpeech][mic] rms=', level.rms.toFixed(4),
              'peak=', level.peak.toFixed(4),
              'db=', level.db.toFixed(1),
              'muted=', level.muted,
              'maxRms=', webSpeechMaxRmsRef.current.toFixed(4),
            );
          }
        },
        onError: (message: string) => {
          console.error('[toggleWebSpeech] onError:', message);
          
          let userMessage = 'Web Speech APIエラー：' + message;
          if (message === 'no-speech') {
            userMessage = '音声が検出されませんでした。\n\n確認事項：\n• マイクが接続されているか\n• ブラウザがマイクを許可しているか\n• マイク音量が十分か\n• ボタンをクリック後、すぐに話し始めたか';
          } else if (message === 'not-allowed') {
            userMessage = 'マイクの使用が許可されていません。\n\nブラウザ設定でマイクアクセスを許可してください。';
          }
          
          alert.error('Web Speech API', userMessage);
        },
        onEnd: () => {
          console.log('[toggleWebSpeech] onEnd maxRms=', webSpeechMaxRmsRef.current.toFixed(4));
          webSpeechMaxRmsRef.current = 0;
          setWebSpeechListening(false);
        },
      });

      console.log('[toggleWebSpeech] Starting recognition...');
      setWebSpeechListening(true);
      webSpeechControllerRef.current.start();
      console.log('[toggleWebSpeech] Recognition started');
    } catch (error: any) {
      console.error('[toggleWebSpeech] Exception:', error);
      setWebSpeechListening(false);
      alert.error('web_speech init error', error?.message ?? String(error));
    }
  }

  useEffect(() => {
    micListeningRef.current = isWebSpeechBackend ? webSpeechListening : vad.listening;
  }, [isWebSpeechBackend, webSpeechListening, vad.listening]);

  useEffect(() => {
    chatProcessingRef.current = isChatProcessing;
  }, [isChatProcessing]);

  useEffect(() => {
    micStarterRef.current = () => {
      if (isWebSpeechBackend) {
        if (!webSpeechListening) {
          toggleWebSpeech();
        }
        return;
      }
      if (!vad.listening) {
        vad.toggle();
      }
    };
    micStopperRef.current = () => {
      if (isWebSpeechBackend) {
        if (webSpeechListening) {
          webSpeechControllerRef.current?.stop();
          setWebSpeechListening(false);
        }
        return;
      }
      if (vad.listening) {
        vad.toggle();
      }
    };
  }, [isWebSpeechBackend, webSpeechListening, vad, toggleWebSpeech]);

  useEffect(() => {
    return () => {
      webSpeechControllerRef.current?.abort();
      webSpeechControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (config('stt_backend') !== 'web_speech') {
      webSpeechFallbackNotifiedRef.current = false;
      return;
    }

    if (isWebSpeechSupported()) {
      return;
    }

    if (webSpeechFallbackNotifiedRef.current) {
      return;
    }

    webSpeechFallbackNotifiedRef.current = true;
    void updateConfig('stt_backend', 'whisper_browser');
    alert.warning('STTバックエンドを自動切替しました', 'このブラウザは Web Speech API 非対応のため Whisper (Browser) に切り替えました。');
  }, [alert]);

  useEffect(() => {
    if (!isWebSpeechBackend && webSpeechListening) {
      webSpeechControllerRef.current?.abort();
      webSpeechControllerRef.current = null;
      setWebSpeechListening(false);
    }
  }, [isWebSpeechBackend, webSpeechListening]);

  useEffect(() => {
    if (!gazeWakeEnabled || !selectedDomainGazeEnabled || config("chatbot_backend") === "moshi") {
      setGazeDebug((prev) => ({ ...prev, status: 'off', holdProgress: 0, cooldownRemainingMs: 0, centered: false }));
      return;
    }

    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return;
    }

    let stopped = false;
    let stream: MediaStream | null = null;
    let timerId: number | null = null;
    let mpDetector: {
      detectForVideo: (videoEl: HTMLVideoElement, timestampMs: number) => {
        faceLandmarks?: Array<Array<{ x: number; y: number; z: number }>>;
      };
      close: () => void;
    } | null = null;
    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;

    // hold% を積算方式で管理 (0 〜 selectedDomainGazeHoldMs ms)
    let holdAccumulatedMs = 0;
    let lastTickAt: number | null = null;
    let lostSince: number | null = null;
    let waitingForRelease = false;
    let lastTriggeredAt = 0;
    let lastDebugUiUpdateAt = 0;
    const tick = () => {
      if (stopped || video.readyState < 2 || !mpDetector) {
        return;
      }

      try {
        const result = mpDetector.detectForVideo(video, Date.now());
        const landmarks = result.faceLandmarks?.[0] ?? null;
        const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

        const now = Date.now();
        let bestBox: { originX: number; originY: number; width: number; height: number } | null = null;
        if (landmarks && landmarks.length > 0 && video.videoWidth > 0 && video.videoHeight > 0) {
          let minX = 1;
          let minY = 1;
          let maxX = 0;
          let maxY = 0;
          for (const lm of landmarks) {
            minX = Math.min(minX, lm.x);
            minY = Math.min(minY, lm.y);
            maxX = Math.max(maxX, lm.x);
            maxY = Math.max(maxY, lm.y);
          }
          bestBox = {
            originX: minX * video.videoWidth,
            originY: minY * video.videoHeight,
            width: Math.max(0, (maxX - minX) * video.videoWidth),
            height: Math.max(0, (maxY - minY) * video.videoHeight),
          };
        }

        let lookingForward = false;
        let gazeScore = 0; // 0.0〜1.0: 正面向き強度
        let faceAreaRatio = 0;
        if (bestBox && landmarks && video.videoWidth > 0 && video.videoHeight > 0) {
          const centerX = bestBox.originX + bestBox.width / 2;
          const centerY = bestBox.originY + bestBox.height / 2;
          const centerXDiff = Math.abs(centerX - video.videoWidth / 2) / video.videoWidth;
          const centerYDiff = Math.abs(centerY - video.videoHeight / 2) / video.videoHeight;
          faceAreaRatio = (bestBox.width * bestBox.height) / (video.videoWidth * video.videoHeight);

          const xScore = clamp01(1 - centerXDiff / 0.32);
          const yScore = clamp01(1 - centerYDiff / 0.38);
          const sizeScore = clamp01(faceAreaRatio / 0.08);

          // FaceLandmarker の主要点: 33/133(左目), 263/362(右目), 1(鼻)
          const leftEyeOuter = landmarks[33];
          const leftEyeInner = landmarks[133];
          const rightEyeOuter = landmarks[263];
          const rightEyeInner = landmarks[362];
          const noseTip = landmarks[1];

          let orientationScore = 0;
          let yawAsymmetry = 1;
          let rollRadians = Math.PI / 2;
          if (leftEyeOuter && leftEyeInner && rightEyeOuter && rightEyeInner && noseTip) {
            const leftEyeX = (leftEyeOuter.x + leftEyeInner.x) / 2;
            const leftEyeY = (leftEyeOuter.y + leftEyeInner.y) / 2;
            const rightEyeX = (rightEyeOuter.x + rightEyeInner.x) / 2;
            const rightEyeY = (rightEyeOuter.y + rightEyeInner.y) / 2;
            const interEyeDistance = Math.hypot(rightEyeX - leftEyeX, rightEyeY - leftEyeY);

            if (interEyeDistance > 1e-4) {
              rollRadians = Math.abs(Math.atan2(rightEyeY - leftEyeY, rightEyeX - leftEyeX));
              const rollScore = clamp01(1 - rollRadians / 0.35);

              const noseLeftDistance = Math.hypot(noseTip.x - leftEyeX, noseTip.y - leftEyeY);
              const noseRightDistance = Math.hypot(noseTip.x - rightEyeX, noseTip.y - rightEyeY);
              yawAsymmetry =
                Math.abs(noseLeftDistance - noseRightDistance) /
                Math.max(1e-4, noseLeftDistance + noseRightDistance);
              const yawScore = clamp01(1 - yawAsymmetry / 0.18);

              orientationScore = 0.65 * yawScore + 0.35 * rollScore;
            }
          }

          latestGazeMetricsRef.current = {
            hasFace: true,
            centerXDiff,
            centerYDiff,
            yawAsymmetry,
            rollRadians,
            faceAreaRatio,
          };

          const calibration = gazeCalibrationRef.current;
          const centerScore = calibration
            ? clamp01(1 - Math.abs(centerXDiff - calibration.centerXDiff) / 0.1) *
              clamp01(1 - Math.abs(centerYDiff - calibration.centerYDiff) / 0.12)
            : xScore * yScore;
          const calibratedOrientationScore = calibration
            ? 0.7 * clamp01(1 - Math.abs(yawAsymmetry - calibration.yawAsymmetry) / 0.08) +
              0.3 * clamp01(1 - Math.abs(rollRadians - calibration.rollRadians) / 0.18)
            : orientationScore;
          const calibratedSizeScore = calibration
            ? clamp01(1 - Math.abs(faceAreaRatio - calibration.faceAreaRatio) / Math.max(0.02, calibration.faceAreaRatio * 0.8))
            : sizeScore;

          // 厳しめ設定。キャリブレーションがある場合は現在の端末配置を優先する。
          gazeScore = 0.4 * centerScore + 0.15 * calibratedSizeScore + 0.45 * calibratedOrientationScore;
          lookingForward =
            gazeScore >= (calibration ? 0.66 : 0.59) &&
            centerXDiff <= (calibration ? calibration.centerXDiff + 0.14 : 0.32) &&
            centerYDiff <= (calibration ? calibration.centerYDiff + 0.16 : 0.36) &&
            faceAreaRatio >= Math.max(0.015, calibration ? calibration.faceAreaRatio * 0.5 : 0.018);
        } else {
          latestGazeMetricsRef.current = {
            hasFace: false,
            centerXDiff: 1,
            centerYDiff: 1,
            yawAsymmetry: 1,
            rollRadians: Math.PI / 2,
            faceAreaRatio: 0,
          };
        }

        // tickInterval を計算して holdAccumulatedMs を増減
        const tickInterval = lastTickAt !== null ? now - lastTickAt : 250;
        lastTickAt = now;

        if (lookingForward) {
          lostSince = null;
          // スコアに比例して蓄積 (score=1 なら tickInterval 分加算, 0.3 なら 30% だけ加算)
          holdAccumulatedMs = Math.min(
            selectedDomainGazeHoldMs,
            holdAccumulatedMs + tickInterval * Math.max(0.3, gazeScore)
          );
        } else {
          // 視線が外れたら 2× 速で減少
          holdAccumulatedMs = Math.max(0, holdAccumulatedMs - tickInterval * 2);
          if (lostSince === null) {
            lostSince = now;
          }
        }

        const holdProgress = holdAccumulatedMs / selectedDomainGazeHoldMs;

        if (now - lastDebugUiUpdateAt >= 200) {
          const cooldownRemainingMs = Math.max(0, selectedDomainGazeCooldownMs - (now - lastTriggeredAt));
          const status = waitingForRelease
            ? 'waiting-release'
            : lookingForward
              ? 'tracking'
              : bestBox
                ? 'face-detected'
                : 'no-face';

          setGazeDebug({
            status,
            holdProgress,
            cooldownRemainingMs,
            faceAreaRatio,
            centered: lookingForward,
            errorName: '',
            errorMessage: '',
          });
          lastDebugUiUpdateAt = now;
        }

        // 視線が外れた場合の処理
        if (!lookingForward) {
          // waitingForRelease 中に視線が外れたらマイクを停止
          if (waitingForRelease && lostSince !== null && now - lostSince >= selectedDomainGazeReleaseMs) {
            micStopperRef.current();
            waitingForRelease = false;
          } else if (!waitingForRelease && lostSince !== null && now - lostSince >= selectedDomainGazeReleaseMs) {
            // hold リセット
            holdAccumulatedMs = 0;
            lostSince = null;
          }
          return;
        }

        // 以下 lookingForward === true
        lostSince = null;

        if (waitingForRelease) {
          return;
        }

        if (holdProgress < 1) {
          return;
        }

        if (now - lastTriggeredAt < selectedDomainGazeCooldownMs) {
          return;
        }

        if (chatProcessingRef.current || micListeningRef.current || bot.isSpeaking()) {
          return;
        }

        waitingForRelease = true;
        lastTriggeredAt = now;
        holdAccumulatedMs = selectedDomainGazeHoldMs;
        setGazeDebug((prev) => ({ ...prev, status: 'triggered', holdProgress: 1 }));

        amicaLife.pause();
        bot.updateAwake();
        micStarterRef.current();

        const randomIndex = Math.floor(Math.random() * selectedDomainGazeGreetings.length);
        const greeting = selectedDomainGazeGreetings[randomIndex] || DEFAULT_GAZE_GREETINGS[0];
        bot.speakAssistantReaction(greeting, selectedDomain);
      } catch (error) {
        const errorName = (error as any)?.name ?? 'UnknownError';
        const errorMessage = (error as any)?.message ?? '';
        console.warn('[gaze] mediapipe detect error', errorName, errorMessage);
        setGazeDebug((prev) => ({
          ...prev,
          status: 'detector-error',
          holdProgress: 0,
          centered: false,
          faceAreaRatio: 0,
          errorName,
          errorMessage,
        }));
      }
    };

    const start = async () => {
      try {
        setGazeDebug((prev) => ({ ...prev, status: 'loading', holdProgress: 0, centered: false, errorName: '', errorMessage: '' }));

        const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
        if (stopped) return;

        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
        );
        if (stopped) return;

        mpDetector = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        if (stopped) { mpDetector.close(); mpDetector = null; return; }

        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false,
        });

        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          mpDetector.close();
          mpDetector = null;
          return;
        }

        video.srcObject = stream;
        await video.play().catch(() => undefined);
        timerId = window.setInterval(tick, 250);
      } catch (err: any) {
        if (stopped) return;
        const name: string = err?.name ?? '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          if (!gazePermissionWarnedRef.current) {
            gazePermissionWarnedRef.current = true;
            alert.warning('視線起動を開始できませんでした', 'カメラ権限が必要なため、視線起動をオフにしました。');
          }
          setGazeDebug((prev) => ({ ...prev, status: 'camera-denied', holdProgress: 0, centered: false }));
          setGazeWakeEnabled(false);
        } else {
          if (!gazeSupportWarnedRef.current) {
            gazeSupportWarnedRef.current = true;
            alert.warning('視線起動の初期化に失敗しました', err?.message ?? String(err));
          }
          setGazeDebug((prev) => ({
            ...prev,
            status: 'detector-error',
            holdProgress: 0,
            centered: false,
            errorName: err?.name ?? '',
            errorMessage: err?.message ?? '',
          }));
        }
      }
    };

    void start();

    return () => {
      stopped = true;
      if (timerId !== null) {
        window.clearInterval(timerId);
      }
      mpDetector?.close();
      mpDetector = null;
      const currentStream = video.srcObject as MediaStream | null;
      currentStream?.getTracks().forEach((track) => track.stop());
      stream?.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
      setGazeDebug((prev) => ({ ...prev, status: 'stopped', holdProgress: 0, centered: false }));
    };
  }, [
    alert,
    amicaLife,
    bot,
    gazeWakeEnabled,
    selectedDomain,
    selectedDomainGazeCooldownMs,
    selectedDomainGazeEnabled,
    selectedDomainGazeGreetings,
    selectedDomainGazeHoldMs,
    selectedDomainGazeReleaseMs,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ]);

  // for whisper_browser
  useEffect(() => {
    if (transcriber.output && ! transcriber.isBusy) {
      const output = transcriber.output?.text;
      handleTranscriptionResult(output);
    }
  }, [transcriber]);

  // for whisper_openai
  useEffect(() => {
    if (whisperOpenAIOutput) {
      const output = whisperOpenAIOutput?.text;
      handleTranscriptionResult(output);
    }
  }, [whisperOpenAIOutput]);

  // for whispercpp
  useEffect(() => {
    if (whisperCppOutput) {
      const output = whisperCppOutput?.text;
      handleTranscriptionResult(output);
    }
  }, [whisperCppOutput]);

  function clickedSendButton() {
    const messageToSend = chronicleEnabledForInput ? `[[USE_CHRONICLE]] ${userMessage}` : userMessage;
    bot.receiveMessageFromUser(messageToSend, false, selectedDomain);
    // only if we are using non-VAD mode should we focus on the input
    if (! vad.listening) {
      if (! hasOnScreenKeyboard()) {
        inputRef.current?.focus();
      }
    }
    setUserMessage("");
  }

  return (
    <div className="fixed bottom-2 z-20 w-full">
      <div className="mx-auto max-w-4xl p-2 backdrop-blur-lg border-0 rounded-lg">
        <div className="mb-1 px-1 text-xs text-white/90">
          ナレッジ：{selectedDomainLabel}
          {selectedDomainHasChronicle ? ' • CHRONICLE接続' : ' • CHRONICLE未接続'}
        </div>
        <div className="mb-1 px-1 text-[11px] text-white/80">
          STT: {currentSTTLabel} | TTS: {currentTTSLabel} | AI: {currentChatbotLabel} ({currentAIModel})
        </div>
        {selectedDomainGazeDebugUiEnabled && (
          <div className="mb-1 px-1 text-[10px] text-white/70">
            視線: {gazeWakeEnabled ? 'ON' : 'OFF'} / {gazeDebug.status}
            {' '}| hold: {Math.round(gazeDebug.holdProgress * 100)}%
            {' '}| cooldown: {Math.max(0, Math.round(gazeDebug.cooldownRemainingMs))}ms
            {' '}| centered: {gazeDebug.centered ? 'yes' : 'no'}
            {' '}| face: {gazeDebug.faceAreaRatio.toFixed(3)}
            {' '}| calib: {hasGazeCalibration ? 'yes' : 'no'}
            {(gazeDebug.status === 'detector-error' || gazeDebug.status === 'unsupported') && (
              <>
                {' '}| err: {gazeDebug.errorName || '-'}
                {gazeDebug.errorMessage ? ` (${gazeDebug.errorMessage})` : ''}
              </>
            )}
          </div>
        )}
        <div className="grid grid-flow-col grid-cols-[min-content_min-content_min-content_min-content_1fr_min-content] gap-[8px]">
          <div className="flex flex-col justify-center items-center">
            <button
              type="button"
              className={`h-8 w-8 rounded-lg text-white active:scale-[0.98] flex items-center justify-center disabled:cursor-not-allowed disabled:opacity-50 ${gazeWakeEnabled ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-secondary hover:bg-secondary-hover active:bg-secondary-press'}`}
              onClick={() => setGazeWakeEnabled((prev) => !prev)}
              disabled={!selectedDomainGazeEnabled}
              title={!selectedDomainGazeEnabled ? 'このドメインでは視線起動が無効です' : gazeWakeEnabled ? '視線起動: ON' : '視線起動: OFF'}
              aria-label={gazeWakeEnabled ? '視線起動をオフ' : '視線起動をオン'}
            >
              👀
            </button>
          </div>

          <div>
            <div className='flex flex-col justify-center items-center'>
              {config("chatbot_backend") === "moshi" ? (
                <IconButton
                iconName={!moshiMuted ? "24/PauseAlt" : "24/Microphone"}
                className="bg-secondary hover:bg-secondary-hover active:bg-secondary-press disabled:bg-secondary-disabled"
                isProcessing={moshiMuted && moshi.getRecorder() != null}
                disabled={!moshi.getRecorder()}
                onClick={() => {
                  moshi.toggleMute();
                  setMoshiMuted(!moshiMuted);
                }}
              />
              ) : (
                <IconButton
                iconName={(isWebSpeechBackend ? webSpeechListening : vad.listening) ? "24/PauseAlt" : "24/Microphone"}
                className="bg-secondary hover:bg-secondary-hover active:bg-secondary-press disabled:bg-secondary-disabled"
                isProcessing={isWebSpeechBackend ? webSpeechListening : vad.userSpeaking}
                disabled={
                  config('stt_backend') === 'none' ||
                  (isWebSpeechBackend ? !isWebSpeechSupported() : (vad.loading || Boolean(vad.errored)))
                }
                onClick={isWebSpeechBackend ? toggleWebSpeech : vad.toggle}
              />
              )}
            </div>
          </div>

          <div className="relative flex flex-col justify-center items-center">
            <button
              type="button"
              className="relative h-8 w-8 rounded-lg bg-secondary text-white hover:bg-secondary-hover active:bg-secondary-press flex items-center justify-center"
              onClick={() => {
                const next = !domainMenuOpen;
                setDomainMenuOpen(next);
                setFeatureMenuOpen(false);
                if (next) {
                  void refreshDomainOptions(true);
                }
              }}
              title={`ナレッジ: ${selectedDomainLabel}`}
            >
              {/* 本（ナレッジ）アイコン */}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M11.25 4.533A9.707 9.707 0 006 3a9.735 9.735 0 00-3.25.555.75.75 0 00-.5.707v14.25a.75.75 0 001 .707A8.237 8.237 0 016 18.75c1.995 0 3.823.707 5.25 1.886V4.533zM12.75 20.636A8.214 8.214 0 0118 18.75c.966 0 1.89.166 2.75.47a.75.75 0 001-.708V4.262a.75.75 0 00-.5-.707A9.735 9.735 0 0018 3a9.707 9.707 0 00-5.25 1.533v16.103z" />
              </svg>
              {selectedDomainHasChronicle && (
                <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[#0f172a]" aria-label="Chronicle connected" />
              )}
            </button>

            {domainMenuOpen && (
              <div className="absolute bottom-10 left-0 z-30 min-w-[160px] rounded-md bg-white shadow-md ring-1 ring-gray-200">
                {domainOptions.map((domain: { id: string; label: string }) => (
                  <button
                    key={domain.id}
                    type="button"
                    className={`block w-full px-3 py-2 text-left text-sm hover:bg-gray-100 ${selectedDomain === domain.id ? 'font-bold' : ''}`}
                    onClick={() => {
                      setSelectedDomain(domain.id);
                      if (typeof window !== 'undefined') {
                        localStorage.setItem('amica_selected_domain_id', domain.id);
                      }
                      setDomainMenuOpen(false);
                    }}
                  >
                    {domain.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative flex flex-col justify-center items-center">
            <button
              type="button"
              className="h-8 w-8 rounded-lg bg-secondary text-white hover:bg-secondary-hover active:bg-secondary-press flex items-center justify-center text-lg leading-none"
              onClick={() => {
                const next = !featureMenuOpen;
                setFeatureMenuOpen(next);
                setDomainMenuOpen(false);
              }}
              title="追加アクション"
              aria-label="追加アクション"
            >
              +
            </button>

            {featureMenuOpen && (
              <div className="absolute bottom-10 left-0 z-30 min-w-[180px] rounded-md bg-white shadow-md ring-1 ring-gray-200">
                <button
                  type="button"
                  disabled={!selectedDomainHasChronicle}
                  className={`block w-full px-3 py-2 text-left text-sm ${selectedDomainHasChronicle ? 'hover:bg-gray-100 text-gray-900' : 'text-gray-400 cursor-not-allowed'}`}
                  onClick={() => {
                    if (!selectedDomainHasChronicle) {
                      return;
                    }
                    setChronicleEnabledForInput(true);
                    setFeatureMenuOpen(false);
                  }}
                  title={selectedDomainHasChronicle ? 'CHRONICLEを選択' : 'このドメインにはCHRONICLEが未接続です'}
                >
                  CHRONICLEを使用
                </button>
              </div>
            )}
          </div>

          <div className="flex w-full items-center gap-2 rounded-md bg-white px-2 py-1 shadow-sm ring-1 ring-inset ring-gray-300 focus-within:ring-1 focus-within:ring-inset focus-within:ring-gray-400">
            {selectedDomainHasChronicle && chronicleEnabledForInput && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                  CHRONICLE
                  <button
                    type="button"
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full text-emerald-800 hover:bg-emerald-200"
                    onClick={() => setChronicleEnabledForInput(false)}
                    title="CHRONICLEを解除"
                    aria-label="CHRONICLEを解除"
                  >
                    ×
                  </button>
                </span>
            )}

            <input
              type="text"
              ref={inputRef}
              placeholder={config("chatbot_backend") === "moshi" ? "Disabled in moshi chatbot" : "Write message here..."}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (hasOnScreenKeyboard()) {
                    inputRef.current?.blur();
                  }

                  if (userMessage === "") {
                    return false;
                  }

                  clickedSendButton();
                }
              }}
              disabled={config("chatbot_backend") === "moshi"}
              className="disabled block w-full border-0 bg-transparent py-0.5 text-gray-900 placeholder:text-gray-400 focus:ring-0 sm:text-sm sm:leading-6"
              value={userMessage}
              autoComplete="off"
            />
          </div>

          <div className='flex flex-col justify-center items-center'>
            <IconButton
              iconName="24/Send"
              className="ml-2 bg-secondary hover:bg-secondary-hover active:bg-secondary-press disabled:bg-secondary-disabled"
              isProcessing={isChatProcessing || transcriber.isBusy}
              disabled={isChatProcessing || !userMessage || transcriber.isModelLoading || config("chatbot_backend") === "moshi"}
              onClick={clickedSendButton}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
