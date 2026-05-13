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
};

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
  const [selectedDomain, setSelectedDomain] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('amica_selected_domain_id');
      if (saved) return saved;
    }
    return config("injection_default_domain");
  });
  const lastVadErrorMessageRef = useRef<string | null>(null);
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
            typeof item.imageAvatarTalkIntervalMs === 'number' ? item.imageAvatarTalkIntervalMs : 180,
          ttsMuted: typeof item.ttsMuted === 'boolean' ? item.ttsMuted : undefined,
          stylebertvits2ModelId: String(item.stylebertvits2ModelId ?? '').trim(),
          stylebertvits2Style: String(item.stylebertvits2Style ?? '').trim(),
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
  const selectedDomainHasChronicle = Boolean(selectedDomainOption?.chronicleAttached);
  const [chronicleEnabledForInput, setChronicleEnabledForInput] = useState(false);

  useEffect(() => {
    if (!selectedDomainHasChronicle) {
      setChronicleEnabledForInput(false);
    }
  }, [selectedDomainHasChronicle]);

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
        <div className="grid grid-flow-col grid-cols-[min-content_min-content_min-content_1fr_min-content] gap-[8px]">
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
