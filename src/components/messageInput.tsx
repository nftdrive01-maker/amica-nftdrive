import * as ort from "onnxruntime-web"
ort.env.wasm.wasmPaths = '/_next/static/chunks/'

import { useCallback, useContext, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
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
import { alphaColor, normalizeThemeColor } from "@/utils/domainTheme";
import { WaveFile } from "wavefile";
import { AmicaLifeContext } from "@/features/amicaLife/amicaLifeContext";
import { AudioControlsContext } from "@/features/moshi/components/audioControlsContext";
import { fetchPublicDomainOptions, loginDomainAccess, type PublicDomainOption } from "@/lib/injectionClient";
import { hasDomainAccessSession, setDomainAccessSession } from "@/lib/domainAccessSession";
import { ViewerContext } from "@/features/vrmViewer/viewerContext";
import { buildUrl } from "@/utils/buildUrl";
import { createWebSpeechTranscriber, isWebSpeechSupported, WebSpeechAudioLevel, WebSpeechController } from "@/features/webSpeech/webSpeech";
import type { ChatImageAttachment } from "@/features/chat/messages";

type DomainOption = PublicDomainOption;

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

const DOMAIN_APPLIED_EVENT = 'amica:domain-applied';
const VRM_RELOAD_EVENT = 'amica:vrm-reload-request';

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

type PresentationSlide = {
  slide_no: number;
  type: 'web' | 'image' | 'qa';
  url?: string;
  title?: string;
  display_seconds?: number;
  notes: string;
  qa?: {
    keywords: string[];
    context: string;
  };
};

type PresentationDeck = {
  deck_id: string;
  version: string;
  title: string;
  description: string;
  tags: string[];
  slides: PresentationSlide[];
  qa_context?: {
    enabled: boolean;
    source: string;
  };
  after_guide?: {
    mode: 'end' | 'qa' | 'loop';
    qa_behavior?: 'jump_to_related_slide';
    fallback?: 'end';
  };
};

type GuideStartEventDetail = {
  type: 'start';
  domainId: string;
  guideId: string;
  announcementText?: string;
  guide: PresentationDeck;
};

const DEFAULT_PRESENTATION_SLIDE_SECONDS = 10;

function getPresentationSlideSeconds(slide: PresentationSlide | null): number {
  const seconds = slide?.display_seconds;
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
    ? seconds
    : DEFAULT_PRESENTATION_SLIDE_SECONDS;
}

function normalizeGuideQaText(text: string): string {
  return text.trim().toLowerCase();
}

function findRelatedGuideSlide(deck: PresentationDeck | null, query: string): { index: number; slide: PresentationSlide; score: number } | null {
  const normalizedQuery = normalizeGuideQaText(query);
  if (!deck || !normalizedQuery) {
    return null;
  }

  const candidates = deck.slides
    .map((slide, index) => {
      const keywords = slide.qa?.keywords || [];
      const searchableParts = [
        slide.title || '',
        slide.notes || '',
        slide.qa?.context || '',
        ...keywords,
      ].map(normalizeGuideQaText);

      const keywordScore = keywords.reduce((score, keyword) => {
        const normalizedKeyword = normalizeGuideQaText(keyword);
        return normalizedKeyword && normalizedQuery.includes(normalizedKeyword) ? score + 4 : score;
      }, 0);
      const textScore = searchableParts.reduce((score, part) => {
        return part && normalizedQuery.includes(part) ? score + 1 : score;
      }, 0);

      return {
        index,
        slide,
        score: keywordScore + textScore,
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  return candidates[0] || null;
}

function toAudioBufferBackedFloat32Array(audio: Float32Array): Float32Array {
  // VADなどの外部ライブラリ由来のTypedArrayはSharedArrayBufferを含む型として扱われることがある。
  // Web Audio APIへ渡す前にコピーして、通常のArrayBuffer-backed Float32Arrayへ揃える。
  return new Float32Array(audio);
}

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
  onDomainAccessDialogOpenChange,
  domainAccessPromptNonce,
}: {
  userMessage: string;
  setUserMessage: (message: string) => void;
  isChatProcessing: boolean;
  onChangeUserMessage: (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
  onDomainAccessDialogOpenChange?: (open: boolean) => void;
  domainAccessPromptNonce?: number;
}) {
  const { t } = useTranslation();
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
  const [domainAccessDialogDomain, setDomainAccessDialogDomain] = useState<DomainOption | null>(null);
  const [domainAccessUsername, setDomainAccessUsername] = useState('');
  const [domainAccessPassword, setDomainAccessPassword] = useState('');
  const [domainAccessPasswordVisible, setDomainAccessPasswordVisible] = useState(false);
  const [domainAccessError, setDomainAccessError] = useState('');
  const [domainAccessBusy, setDomainAccessBusy] = useState(false);
  const [dismissedDomainAccessDomainId, setDismissedDomainAccessDomainId] = useState('');
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [attachedImage, setAttachedImage] = useState<ChatImageAttachment | null>(null);
  const presentationSlideInputRef = useRef<HTMLInputElement>(null);
  const presentationTextInputRef = useRef<HTMLTextAreaElement>(null);
  const [presentationModalOpen, setPresentationModalOpen] = useState(false);
  const [presentationImageDataUrl, setPresentationImageDataUrl] = useState('');
  const [presentationImageName, setPresentationImageName] = useState('');
  const [presentationText, setPresentationText] = useState('');
  const [presentationQaQuestion, setPresentationQaQuestion] = useState('');
  const [presentationDeck, setPresentationDeck] = useState<PresentationDeck | null>(null);
  const [presentationSlideIndex, setPresentationSlideIndex] = useState(0);
  const [presentationAutoPlay, setPresentationAutoPlay] = useState(false);
  const [presentationGuideQaMode, setPresentationGuideQaMode] = useState(false);
  const [presentationChromeVisible, setPresentationChromeVisible] = useState(true);
  const lastSpokenPresentationSlideRef = useRef('');
  const handledPresentationEndRef = useRef('');
  const pendingGuideStartTimerRef = useRef<number | null>(null);
  const pendingGuideStartSeqRef = useRef(0);
  const presentationChromeTimerRef = useRef<number | null>(null);
  const gazeCalibrationRef = useRef<GazeCalibration | null>(null);
  const latestGazeMetricsRef = useRef<GazeMetrics | null>(null);
  const initialDomainConfigRef = useRef({
    name: config("name"),
    bgUrl: config("bg_url"),
    bgColor: config("bg_color"),
    themeColor: config("theme_color"),
    vrmUrl: config("vrm_url"),
    vrmHash: config("vrm_hash"),
    vrmSaveType: config("vrm_save_type"),
    imageAvatarIdleUrl: config('image_avatar_idle_url'),
    imageAvatarTalkUrl: config('image_avatar_talk_url'),
    imageAvatarTalkIntervalMs: parseInt(config('image_avatar_talk_interval_ms'), 10) || 180,
    ttsMuted: config("tts_muted"),
    amicaLifeEnabled: config('amica_life_enabled'),
    timeBeforeIdleSec: config('time_before_idle_sec'),
    minTimeIntervalSec: config('min_time_interval_sec'),
    maxTimeIntervalSec: config('max_time_interval_sec'),
    timeToSleepSec: config('time_to_sleep_sec'),
    stylebertvits2ModelId: config("stylebertvits2_model_id"),
    stylebertvits2Style: config("stylebertvits2_style"),
  });
  const appliedDomainConfigRef = useRef<string | null>(null);
  const domainApplyRequestIdRef = useRef(0);

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
        themeColor: '',
        characterName: '',
        vrmUrl: '',
        imageAvatarIdleUrl: '',
        imageAvatarTalkUrl: '',
        imageAvatarTalkIntervalMs: 180,
        ttsBackend: '',
        ttsMuted: undefined,
        amicaLifeEnabled: undefined,
        timeBeforeIdleSec: undefined,
        minTimeIntervalSec: undefined,
        maxTimeIntervalSec: undefined,
        timeToSleepSec: undefined,
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
          themeColor: String(item.themeColor ?? '').trim(),
          characterName: String(item.characterName ?? '').trim(),
          vrmEnabled: typeof item.vrmEnabled === 'boolean' ? item.vrmEnabled : true,
          vrmUrl: String(item.vrmUrl ?? '').trim(),
          imageAvatarIdleUrl: String(item.imageAvatarIdleUrl ?? '').trim(),
          imageAvatarTalkUrl: String(item.imageAvatarTalkUrl ?? '').trim(),
          imageAvatarTalkIntervalMs:
            typeof item.imageAvatarTalkIntervalMs === 'number' && item.imageAvatarTalkIntervalMs > 0
              ? item.imageAvatarTalkIntervalMs
              : 180,
          ttsBackend: String(item.ttsBackend ?? '').trim(),
          ttsMuted: typeof item.ttsMuted === 'boolean' ? item.ttsMuted : undefined,
          amicaLifeEnabled: typeof item.amicaLifeEnabled === 'boolean' ? item.amicaLifeEnabled : undefined,
          timeBeforeIdleSec:
            typeof item.timeBeforeIdleSec === 'number' && item.timeBeforeIdleSec > 0
              ? item.timeBeforeIdleSec
              : undefined,
          minTimeIntervalSec:
            typeof item.minTimeIntervalSec === 'number' && item.minTimeIntervalSec > 0
              ? item.minTimeIntervalSec
              : undefined,
          maxTimeIntervalSec:
            typeof item.maxTimeIntervalSec === 'number' && item.maxTimeIntervalSec > 0
              ? item.maxTimeIntervalSec
              : undefined,
          timeToSleepSec:
            typeof item.timeToSleepSec === 'number' && item.timeToSleepSec > 0
              ? item.timeToSleepSec
              : undefined,
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
  const selectedDomainThemeColor = normalizeThemeColor(selectedDomainOption?.themeColor || '');
  const accentButtonStyle = selectedDomainThemeColor
    ? {
        backgroundColor: selectedDomainThemeColor,
        boxShadow: `0 10px 24px ${alphaColor(selectedDomainThemeColor, 0.24)}`,
      }
    : undefined;
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
  const currentPresentationSlide = presentationDeck?.slides[presentationSlideIndex] || null;
  const presentationSlideCount = presentationDeck?.slides.length || 0;
  const currentPresentationSlideSeconds = getPresentationSlideSeconds(currentPresentationSlide);
  const presentationChromeActive = presentationGuideQaMode || presentationChromeVisible;

  const resetPresentationChromeTimer = useCallback(() => {
    if (presentationChromeTimerRef.current !== null) {
      window.clearTimeout(presentationChromeTimerRef.current);
      presentationChromeTimerRef.current = null;
    }

    setPresentationChromeVisible(true);
    if (!presentationModalOpen || presentationGuideQaMode) {
      return;
    }

    presentationChromeTimerRef.current = window.setTimeout(() => {
      setPresentationChromeVisible(false);
      presentationChromeTimerRef.current = null;
    }, 3000);
  }, [presentationGuideQaMode, presentationModalOpen]);

  useEffect(() => {
    if (!selectedDomainHasChronicle) {
      setChronicleEnabledForInput(false);
    }
  }, [selectedDomainHasChronicle]);

  useEffect(() => {
    if (!presentationModalOpen) {
      if (presentationChromeTimerRef.current !== null) {
        window.clearTimeout(presentationChromeTimerRef.current);
        presentationChromeTimerRef.current = null;
      }
      setPresentationChromeVisible(true);
      return;
    }

    resetPresentationChromeTimer();
    return () => {
      if (presentationChromeTimerRef.current !== null) {
        window.clearTimeout(presentationChromeTimerRef.current);
        presentationChromeTimerRef.current = null;
      }
    };
  }, [presentationGuideQaMode, presentationModalOpen, presentationSlideIndex, resetPresentationChromeTimer]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const shouldHideExternalChrome = presentationModalOpen && !presentationChromeActive;
    if (shouldHideExternalChrome) {
      document.body.dataset.amicaPresentationChromeHidden = 'true';
    } else {
      delete document.body.dataset.amicaPresentationChromeHidden;
    }

    return () => {
      delete document.body.dataset.amicaPresentationChromeHidden;
    };
  }, [presentationChromeActive, presentationModalOpen]);

  useEffect(() => {
    if (!presentationModalOpen) {
      return;
    }

    const timer = window.setTimeout(() => {
      presentationTextInputRef.current?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPresentationAutoPlay(false);
        setPresentationGuideQaMode(false);
        setPresentationModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [presentationModalOpen]);

  // ガイドモーダル（ガイド再生／質疑応答モード）表示中はAmicaLifeを停止する
  useEffect(() => {
    amicaLife.setPresentationActive(presentationModalOpen);
  }, [amicaLife, presentationModalOpen]);

  useEffect(() => {
    if (!presentationModalOpen || !presentationDeck || !currentPresentationSlide) {
      return;
    }

    const slideKey = `${presentationDeck.deck_id}:${presentationSlideIndex}:${currentPresentationSlide.slide_no}`;
    if (lastSpokenPresentationSlideRef.current === slideKey) {
      return;
    }

    lastSpokenPresentationSlideRef.current = slideKey;
    const notes = currentPresentationSlide.notes.trim();
    if (notes) {
      bot.speakPresentationText(notes, selectedDomain);
    }
  }, [currentPresentationSlide, presentationDeck, presentationModalOpen, presentationSlideIndex, selectedDomain]);

  useEffect(() => {
    if (!presentationModalOpen || !presentationAutoPlay || !presentationDeck || !currentPresentationSlide) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (presentationSlideIndex >= presentationDeck.slides.length - 1) {
        const endKey = `${presentationDeck.deck_id}:${presentationSlideIndex}:${presentationDeck.after_guide?.mode || 'end'}`;
        if (handledPresentationEndRef.current !== endKey) {
          handledPresentationEndRef.current = endKey;
          finishPresentationGuide();
        }
        return;
      }

      showPresentationSlide(presentationSlideIndex + 1);
    }, currentPresentationSlideSeconds * 1000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    currentPresentationSlide,
    currentPresentationSlideSeconds,
    presentationAutoPlay,
    presentationDeck,
    presentationModalOpen,
    presentationSlideIndex,
  ]);

  useEffect(() => {
    const handleGuideStart = (event: Event) => {
      const detail = (event as CustomEvent<GuideStartEventDetail>).detail;
      if (detail?.type !== 'start' || !detail.guide || !Array.isArray(detail.guide.slides)) {
        return;
      }

      if (pendingGuideStartTimerRef.current !== null) {
        window.clearTimeout(pendingGuideStartTimerRef.current);
        pendingGuideStartTimerRef.current = null;
      }

      const guideStartSeq = pendingGuideStartSeqRef.current + 1;
      pendingGuideStartSeqRef.current = guideStartSeq;
      const announcementText = (detail.announcementText || `ガイド「${detail.guide.title}」を開始します。`).trim();
      bot.bubbleMessage('assistant', announcementText);
      const fallbackDone = new Promise<void>((resolve) => {
        pendingGuideStartTimerRef.current = window.setTimeout(() => {
          pendingGuideStartTimerRef.current = null;
          resolve();
        }, 150);
      });

      void fallbackDone.then(() => {
        if (pendingGuideStartSeqRef.current !== guideStartSeq) {
          return;
        }
        if (pendingGuideStartTimerRef.current !== null) {
          window.clearTimeout(pendingGuideStartTimerRef.current);
        }
        pendingGuideStartTimerRef.current = null;
        startPresentationDeck(detail.guide);
      });
    };

    window.addEventListener('amica:guide-start', handleGuideStart);
    return () => {
      if (pendingGuideStartTimerRef.current !== null) {
        window.clearTimeout(pendingGuideStartTimerRef.current);
        pendingGuideStartTimerRef.current = null;
      }
      pendingGuideStartSeqRef.current++;
      window.removeEventListener('amica:guide-start', handleGuideStart);
    };
  }, [attachedImage, bot, presentationImageDataUrl, selectedDomain]);

  useEffect(() => {
    onDomainAccessDialogOpenChange?.(Boolean(domainAccessDialogDomain));

    return () => {
      onDomainAccessDialogOpenChange?.(false);
    };
  }, [domainAccessDialogDomain, onDomainAccessDialogOpenChange]);

  useEffect(() => {
    if (!selectedDomainOption?.accessControlEnabled) {
      return;
    }

    if (
      hasDomainAccessSession(selectedDomainOption.id) ||
      domainAccessDialogDomain ||
      dismissedDomainAccessDomainId === selectedDomainOption.id
    ) {
      return;
    }

    setDismissedDomainAccessDomainId('');
    setDomainAccessDialogDomain(selectedDomainOption);
    setDomainAccessUsername('');
    setDomainAccessPassword('');
    setDomainAccessPasswordVisible(false);
    setDomainAccessError('');
  }, [dismissedDomainAccessDomainId, domainAccessDialogDomain, selectedDomainOption]);

  useEffect(() => {
    if (!domainAccessPromptNonce) {
      return;
    }

    if (!selectedDomainOption?.accessControlEnabled || hasDomainAccessSession(selectedDomainOption.id)) {
      return;
    }

    setDismissedDomainAccessDomainId('');
    setDomainAccessDialogDomain(selectedDomainOption);
    setDomainAccessUsername('');
    setDomainAccessPassword('');
    setDomainAccessPasswordVisible(false);
    setDomainAccessError('');
  }, [domainAccessPromptNonce, selectedDomainOption]);

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

  const pendingVrmUrlRef = useRef<string | null>(null);

  const applyDomainOverrides = useCallback(async (
    domain: DomainOption | undefined,
    options?: { forceReloadVrm?: boolean },
  ) => {
    const requestId = ++domainApplyRequestIdRef.current;
    const baseline = initialDomainConfigRef.current;
    const previousVrmUrl = config('vrm_url');
    const nextVrmEnabled = domain?.vrmEnabled ?? true;
    const nextName = domain?.characterName?.trim() || baseline.name;
    const nextThemeColor = domain?.themeColor?.trim() || baseline.themeColor;
    const normalizedBaselineBgUrl = toRuntimeAssetUrl(baseline.bgUrl || '');
    const normalizedBaselineVrmUrl = toRuntimeAssetUrl(baseline.vrmUrl || '');
    const requestedBgUrl = domain
      ? toRuntimeAssetUrl(domain.bgUrl?.trim() || '')
      : normalizedBaselineBgUrl;
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
    const nextAmicaLifeEnabled =
      typeof domain?.amicaLifeEnabled === 'boolean'
        ? domain.amicaLifeEnabled
        : baseline.amicaLifeEnabled === 'true';
    const nextTimeBeforeIdleSec =
      typeof domain?.timeBeforeIdleSec === 'number' && domain.timeBeforeIdleSec > 0
        ? domain.timeBeforeIdleSec
        : parseInt(baseline.timeBeforeIdleSec, 10) || 20;
    const nextMinTimeIntervalSec =
      typeof domain?.minTimeIntervalSec === 'number' && domain.minTimeIntervalSec > 0
        ? domain.minTimeIntervalSec
        : parseInt(baseline.minTimeIntervalSec, 10) || 10;
    const nextMaxTimeIntervalSec =
      typeof domain?.maxTimeIntervalSec === 'number' && domain.maxTimeIntervalSec > 0
        ? domain.maxTimeIntervalSec
        : parseInt(baseline.maxTimeIntervalSec, 10) || 20;
    const nextTimeToSleepSec =
      typeof domain?.timeToSleepSec === 'number' && domain.timeToSleepSec > 0
        ? domain.timeToSleepSec
        : parseInt(baseline.timeToSleepSec, 10) || 90;
    const nextModelId = domain?.stylebertvits2ModelId?.trim() || baseline.stylebertvits2ModelId;
    const nextStyle = domain?.stylebertvits2Style?.trim() || baseline.stylebertvits2Style;

    if (typeof document !== 'undefined' && domain?.bgUrl?.trim()) {
      const bgOk = await checkImageAvailable(requestedBgUrl);
      if (requestId !== domainApplyRequestIdRef.current) {
        return;
      }

      if (!bgOk) {
        resolvedBgUrl = '';
        alert.warning(
          '背景画像の読み込みに失敗しました',
          `ドメイン「${domain.label}」の背景画像を読み込めなかったため、デフォルト背景へ戻しました。`
        );
      }
    }

    const configEntries: Array<[string, string]> = [
      ['name', nextName],
      ['bg_url', resolvedBgUrl],
      ['theme_color', nextThemeColor],
      ['vrm_enabled', nextVrmEnabled ? 'true' : 'false'],
      ['vrm_url', resolvedVrmUrl],
      ['vrm_hash', resolvedVrmHash],
      ['vrm_save_type', resolvedVrmSaveType],
      ['image_avatar_idle_url', nextImageAvatarIdleUrl],
      ['image_avatar_talk_url', nextImageAvatarTalkUrl],
      ['image_avatar_talk_interval_ms', String(nextImageAvatarTalkIntervalMs)],
      ['amica_life_enabled', nextAmicaLifeEnabled ? 'true' : 'false'],
      ['time_before_idle_sec', String(nextTimeBeforeIdleSec)],
      ['min_time_interval_sec', String(nextMinTimeIntervalSec)],
      ['max_time_interval_sec', String(nextMaxTimeIntervalSec)],
      ['time_to_sleep_sec', String(nextTimeToSleepSec)],
      ['stylebertvits2_model_id', nextModelId],
      ['stylebertvits2_style', nextStyle],
      ['tts_muted', nextTtsMuted ? 'true' : 'false'],
    ];

    if (requestId !== domainApplyRequestIdRef.current) {
      return;
    }

    await updateConfigBatch(configEntries);

    if (requestId !== domainApplyRequestIdRef.current) {
      return;
    }

    if (
      typeof window !== 'undefined' &&
      nextVrmEnabled &&
      resolvedVrmUrl &&
      (options?.forceReloadVrm || previousVrmUrl.trim() !== resolvedVrmUrl)
    ) {
      window.dispatchEvent(new CustomEvent(VRM_RELOAD_EVENT, {
        detail: {
          domainId: domain?.id,
          url: resolvedVrmUrl,
          force: options?.forceReloadVrm === true,
        },
      }));
    }

    if (typeof document !== 'undefined') {
      if (resolvedBgUrl) {
        document.body.style.backgroundColor = '';
        document.body.style.backgroundImage = `url(${toRenderableUrl(resolvedBgUrl)})`;
      } else if (baseline.bgColor) {
        document.body.style.backgroundImage = '';
        document.body.style.backgroundColor = baseline.bgColor;
      } else {
        document.body.style.backgroundColor = '';
        document.body.style.backgroundImage = '';
      }
    }

    if (nextVrmEnabled && !viewer.isReady && resolvedVrmUrl) {
      pendingVrmUrlRef.current = resolvedVrmUrl;
    }

    if (typeof window !== 'undefined' && domain?.id) {
      window.dispatchEvent(new CustomEvent(DOMAIN_APPLIED_EVENT, {
        detail: { domainId: domain.id },
      }));
    }

    // VRM の実ロードは VrmViewer が config を監視して一元管理する。
    // ここで直接 viewer.loadVrm() を呼ぶと loading/ready 状態が二重化して、
    // ローディング画面の早期終了や再表示を引き起こす。
  }, [alert, checkImageAvailable, viewer]);

  // selectedDomain を ref で保持し、callback の依存から除外することで
  // ドメイン選択時に useEffect が再発火するのを防ぐ
  const selectedDomainRef = useRef(selectedDomain);
  const missingDomainWarningRef = useRef('');
  useEffect(() => {
    selectedDomainRef.current = selectedDomain;
  }, [selectedDomain]);

  const applySelectedDomain = useCallback((domainId: string) => {
    setSelectedDomain(domainId);
    if (typeof window !== 'undefined') {
      localStorage.setItem('amica_selected_domain_id', domainId);
      window.dispatchEvent(new CustomEvent('amica:domain-changed', { detail: { domainId } }));
    }
  }, []);

  const openDomainAccessDialog = useCallback((domain: DomainOption) => {
    setDismissedDomainAccessDomainId('');
    setDomainAccessDialogDomain(domain);
    setDomainAccessUsername('');
    setDomainAccessPassword('');
    setDomainAccessPasswordVisible(false);
    setDomainAccessError('');
  }, []);

  const ensureDomainAccessOrPrompt = useCallback((domainId: string) => {
    const normalizedDomainId = String(domainId || '').trim();
    if (!normalizedDomainId) {
      return true;
    }

    const domain = domainOptions.find((item) => item.id === normalizedDomainId);
    if (!domain?.accessControlEnabled || hasDomainAccessSession(normalizedDomainId)) {
      return true;
    }

    openDomainAccessDialog(domain);
    setDomainMenuOpen(false);
    return false;
  }, [domainOptions, openDomainAccessDialog]);

  const closeDomainAccessDialog = useCallback((dismissCurrentDomain: boolean) => {
    if (dismissCurrentDomain && domainAccessDialogDomain) {
      setDismissedDomainAccessDomainId(domainAccessDialogDomain.id);
    }
    setDomainAccessDialogDomain(null);
    setDomainAccessUsername('');
    setDomainAccessPassword('');
    setDomainAccessPasswordVisible(false);
    setDomainAccessError('');
  }, [domainAccessDialogDomain]);

  const submitDomainAccessLogin = useCallback(async () => {
    const domain = domainAccessDialogDomain;
    if (!domain) {
      return;
    }

    if (!domainAccessUsername.trim() || !domainAccessPassword) {
      setDomainAccessError('ユーザー名とパスワードを入力してください');
      return;
    }

    setDomainAccessBusy(true);
    setDomainAccessError('');
    try {
      const result = await loginDomainAccess(domain.id, domainAccessUsername.trim(), domainAccessPassword);
      if (!result.ok || !result.accessToken) {
        setDomainAccessError(result.error || '認証に失敗しました');
        return;
      }

      setDomainAccessSession(domain.id, {
        username: result.username || domainAccessUsername.trim(),
        accessToken: result.accessToken,
      });
      if (selectedDomainRef.current === domain.id) {
        appliedDomainConfigRef.current = null;
        await applyDomainOverrides(domain, { forceReloadVrm: true });
      }
      applySelectedDomain(domain.id);
      closeDomainAccessDialog(false);
    } finally {
      setDomainAccessBusy(false);
    }
  }, [
    applySelectedDomain,
    applyDomainOverrides,
    closeDomainAccessDialog,
    domainAccessDialogDomain,
    domainAccessPassword,
    domainAccessUsername,
  ]);

  const handleDomainOptionClick = useCallback((domain: DomainOption) => {
    if (domain.accessControlEnabled && !hasDomainAccessSession(domain.id)) {
      openDomainAccessDialog(domain);
      setDomainMenuOpen(false);
      return;
    }

    applySelectedDomain(domain.id);
    setDomainMenuOpen(false);
  }, [applySelectedDomain, openDomainAccessDialog]);

  useEffect(() => {
    const domain = domainOptions.find((item) => item.id === selectedDomain);

    // ドメインが一覧に見つからない場合はまだ API データ未着のため何もしない
    // (applyDomainOverrides(undefined) でデフォルトにリセットされるのを防ぐ)
    if (!domain) return;

    const signature = JSON.stringify({
      domainId: selectedDomain,
      bgUrl: domain?.bgUrl || '',
      characterName: domain?.characterName || '',
      themeColor: domain?.themeColor || '',
      vrmEnabled: domain?.vrmEnabled ?? true,
      vrmUrl: domain?.vrmUrl || '',
      imageAvatarIdleUrl: domain?.imageAvatarIdleUrl || '',
      imageAvatarTalkUrl: domain?.imageAvatarTalkUrl || '',
      imageAvatarTalkIntervalMs: domain?.imageAvatarTalkIntervalMs ?? 180,
      ttsMuted: domain?.ttsMuted,
      amicaLifeEnabled: domain?.amicaLifeEnabled,
      timeBeforeIdleSec: domain?.timeBeforeIdleSec,
      minTimeIntervalSec: domain?.minTimeIntervalSec,
      maxTimeIntervalSec: domain?.maxTimeIntervalSec,
      timeToSleepSec: domain?.timeToSleepSec,
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

  // viewer.isReady のポーリング: pendingVrmUrl は viewer 準備前の印としてだけ使う。
  // 実際の VRM 読み込みは VrmViewer 側が canvasReady 後に現在 config を見て行うため、
  // ここでドメイン設定を再適用すると no-op の config 更新だけが走って
  // ローディング状態を再点火してしまう。
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (!viewer.isReady || !pendingVrmUrlRef.current) {
        return;
      }
      clearInterval(intervalId);
      pendingVrmUrlRef.current = null;
    }, 500);

    return () => clearInterval(intervalId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer]);

  const refreshDomainOptions = useCallback(async (preferCurrent: boolean) => {
    const defaultDomainId = config("injection_default_domain");

    try {
      const optionsFromApi = await fetchPublicDomainOptions();
      if (optionsFromApi.length === 0) {
        return;
      }

      setDomainOptions(optionsFromApi);

      const currentDomainId = selectedDomainRef.current;
      const hasCurrent = optionsFromApi.some((domain) => domain.id === currentDomainId);

      if (hasCurrent) {
        missingDomainWarningRef.current = '';
      }

      if (preferCurrent) {
        // メニュー展開時: 現在の選択が選択肢にあればそのまま維持
        if (hasCurrent) {
          return;
        }
      }

      // localStorageに保存済みの選択を優先して復元
      const savedId = typeof window !== 'undefined' ? localStorage.getItem('amica_selected_domain_id') : null;
      const hasSaved = savedId && optionsFromApi.some((domain) => domain.id === savedId);

      const applyFallbackSelection = (id: string) => {
        applySelectedDomain(id);
      };

      const fallbackDomainId = (() => {
        const hasDefault = optionsFromApi.some((domain) => domain.id === defaultDomainId);
        if (hasDefault) {
          return defaultDomainId;
        }

        return optionsFromApi[0]?.id ?? '';
      })();

      if (currentDomainId && !hasCurrent && fallbackDomainId) {
        if (missingDomainWarningRef.current !== currentDomainId) {
          missingDomainWarningRef.current = currentDomainId;
          const fallbackLabel =
            optionsFromApi.find((domain) => domain.id === fallbackDomainId)?.label || fallbackDomainId;
          alert.warning(
            'ドメインを読み込めませんでした',
            `選択中のドメイン「${currentDomainId}」が見つからなかったため、「${fallbackLabel}」へ切り替えました。`
          );
        }

        applyFallbackSelection(fallbackDomainId);
        return;
      }

      if (hasSaved) {
        applyFallbackSelection(savedId!);
      } else {
        // 保存済みも現在選択中も存在しない場合は default → 先頭の順で決定し、起動時の揺れを防ぐ
        if (fallbackDomainId) {
          applyFallbackSelection(fallbackDomainId);
        }
      }
    } catch {
      // API失敗時は既存の選択肢/選択値を維持
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alert, applySelectedDomain]); // 初回マウント後に再生成しない

  useEffect(() => {
    void refreshDomainOptions(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // マウント時1回のみ

  function interruptAssistantForUserInput() {
    if (config("amica_life_enabled") === "true") {
      void amicaLife.pause();
    } else {
      void bot.interrupt();
    }
    bot.updateAwake();
  }

  const vad = useMicVAD({
    startOnLoad: false,
    onSpeechStart: () => {
      console.debug('vad', 'on_speech_start');
      interruptAssistantForUserInput();
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
        const audioForApi = toAudioBufferBackedFloat32Array(audio);
        switch (config("stt_backend")) {
          case 'whisper_browser': {
            console.debug('whisper_browser attempt');
            // since VAD sample rate is same as whisper we do nothing here
            // both are 16000
            const audioCtx = new AudioContext();
            const buffer = audioCtx.createBuffer(1, audioForApi.length, 16000);
            buffer.copyToChannel(audioForApi, 0, 0);
            transcriber.start(buffer);
            break;
          }
          case 'whisper_openai': {
            console.debug('whisper_openai attempt');
            const wav = new WaveFile();
            wav.fromScratch(1, 16000, '32f', audioForApi);
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
            wav.fromScratch(1, 16000, '32f', audioForApi);
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
        if (!ensureDomainAccessOrPrompt(selectedDomain)) {
          setUserMessage(text);
          console.timeEnd('performance_transcribe');
          return;
        }
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
    interruptAssistantForUserInput();
  }

  function stripDataUrlPrefix(dataUrl: string): string {
    return dataUrl.replace(/^data:[^;]+;base64,/, '');
  }

  function clearAttachment() {
    setAttachedImage(null);
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = '';
    }
  }

  function openAttachmentPicker() {
    attachmentInputRef.current?.click();
  }

  function handleAttachmentChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl) {
        return;
      }

      setAttachedImage({
        kind: 'image',
        dataUrl,
        fileName: file.name,
        mimeType: file.type,
      });
    };
    reader.readAsDataURL(file);
  }

  function startPresentationDeck(deck: PresentationDeck) {
    const firstSlide = deck.slides[0];
    setPresentationDeck(deck);
    setPresentationSlideIndex(0);
    setPresentationText(firstSlide?.notes || '');
    setPresentationQaQuestion('');
    setPresentationImageDataUrl('');
    setPresentationImageName('');
    setPresentationAutoPlay(true);
    setPresentationGuideQaMode(false);
    lastSpokenPresentationSlideRef.current = '';
    handledPresentationEndRef.current = '';
    if (attachedImage && !presentationImageDataUrl) {
      setPresentationImageDataUrl(attachedImage.dataUrl);
      setPresentationImageName(attachedImage.fileName || attachedImage.mimeType || 'attached image');
    }
    setPresentationModalOpen(true);
    setFeatureMenuOpen(false);
    setDomainMenuOpen(false);
  }

  function openPresentationSlidePicker() {
    presentationSlideInputRef.current?.click();
  }

  function handlePresentationSlideChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl) {
        return;
      }

      setPresentationImageDataUrl(dataUrl);
      setPresentationImageName(file.name || file.type || 'slide image');
    };
    reader.readAsDataURL(file);
  }

  function showPresentationSlide(nextIndex: number) {
    if (!presentationDeck || presentationDeck.slides.length === 0) {
      return;
    }

    const boundedIndex = Math.min(Math.max(nextIndex, 0), presentationDeck.slides.length - 1);
    const slide = presentationDeck.slides[boundedIndex];
    setPresentationSlideIndex(boundedIndex);
    setPresentationText(slide.notes || '');
  }

  function finishPresentationGuide() {
    if (!presentationDeck) {
      return;
    }

    const afterMode = presentationDeck.after_guide?.mode || 'end';
    if (afterMode === 'loop') {
      setPresentationGuideQaMode(false);
      handledPresentationEndRef.current = '';
      showPresentationSlide(0);
      setPresentationAutoPlay(true);
      return;
    }

    if (afterMode === 'qa') {
      const qaIndex = presentationDeck.slides.findIndex((slide) => slide.type === 'qa');
      setPresentationAutoPlay(false);
      setPresentationGuideQaMode(true);
      setPresentationQaQuestion('');
      if (qaIndex >= 0) {
        showPresentationSlide(qaIndex);
      }
      bot.speakAssistantReaction('質疑応答モードに入りました。ガイドについて質問してください。', selectedDomain);
      return;
    }

    setPresentationAutoPlay(false);
    setPresentationGuideQaMode(false);
    setPresentationModalOpen(false);
    bot.speakAssistantReaction('ガイドを終了しました。通常チャットへ戻ります。', selectedDomain);
  }

  function speakPresentationTextFromModal() {
    const trimmedText = presentationText.trim();
    if (!trimmedText) {
      presentationTextInputRef.current?.focus();
      return;
    }

    bot.speakPresentationText(trimmedText, selectedDomain);
    setPresentationText('');
  }

  function submitGuideQaQuestion(question: string): boolean {
    const trimmedQuestion = question.trim();
    if (!presentationGuideQaMode || !presentationDeck || !trimmedQuestion) {
      return false;
    }

    bot.bubbleMessage('user', trimmedQuestion);
    setPresentationAutoPlay(false);
    setPresentationQaQuestion('');

    const match = findRelatedGuideSlide(presentationDeck, trimmedQuestion);

    if (match) {
      // 関連ページへ切り替える（切替時の自動読み上げは抑止する）
      const slideTitle = match.slide.title || `ページ ${match.slide.slide_no}`;
      lastSpokenPresentationSlideRef.current = `${presentationDeck.deck_id}:${match.index}:${match.slide.slide_no}`;
      showPresentationSlide(match.index);

      const guideContext = [
        presentationDeck.title ? `ガイド: ${presentationDeck.title}` : '',
        presentationDeck.description ? `概要: ${presentationDeck.description}` : '',
        `関連ページ: ${slideTitle}`,
        match.slide.qa?.context ? `ページの補足: ${match.slide.qa.context}` : '',
        match.slide.notes ? `ページの説明: ${match.slide.notes}` : '',
      ].filter(Boolean).join('\n');
      // コンテキストをそのまま読み上げず、説明する側として回答させる
      void bot.receiveGuideQaQuestion(trimmedQuestion, guideContext, selectedDomain);
      return true;
    }

    // 関連ページが見つからない場合も、モーダルは閉じずに質疑応答モードのまま。
    // 表示中ページとガイド全体を根拠に、説明する側として回答させる。
    // 終了は「閉じる」ボタンまたは Esc キーでのみ行う。
    const currentSlide = presentationDeck.slides[presentationSlideIndex] || null;
    const fallbackContext = [
      presentationDeck.title ? `ガイド: ${presentationDeck.title}` : '',
      presentationDeck.description ? `概要: ${presentationDeck.description}` : '',
      currentSlide?.title ? `表示中ページ: ${currentSlide.title}` : '',
      currentSlide?.qa?.context ? `表示中ページの補足: ${currentSlide.qa.context}` : '',
      currentSlide?.notes ? `表示中ページの説明: ${currentSlide.notes}` : '',
    ].filter(Boolean).join('\n');
    void bot.receiveGuideQaQuestion(trimmedQuestion, fallbackContext, selectedDomain);
    return true;
  }

  function submitGuideQaQuestionFromModal() {
    if (!submitGuideQaQuestion(presentationQaQuestion)) {
      presentationTextInputRef.current?.focus();
    }
  }

  function handlePasteIntoInput(event: React.ClipboardEvent<HTMLInputElement>) {
    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find((item) => item.type.startsWith('image/'));
    if (!imageItem) {
      return;
    }

    const file = imageItem.getAsFile();
    if (!file) {
      return;
    }

    event.preventDefault();

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl) {
        return;
      }

      setAttachedImage({
        kind: 'image',
        dataUrl,
        fileName: file.name || 'clipboard-image.png',
        mimeType: file.type,
      });
    };
    reader.readAsDataURL(file);
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
        onSpeechDetected: () => {
          console.log('[toggleWebSpeech] onSpeechDetected');
          interruptAssistantForUserInput();
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
    if (!ensureDomainAccessOrPrompt(selectedDomain)) {
      return;
    }

    const trimmedMessage = userMessage.trim();
    if (!trimmedMessage && !attachedImage) {
      return;
    }

    if (presentationGuideQaMode && presentationDeck && trimmedMessage && !attachedImage) {
      submitGuideQaQuestion(trimmedMessage);
      if (!vad.listening && !hasOnScreenKeyboard()) {
        inputRef.current?.focus();
      }
      setUserMessage('');
      return;
    }

    if (attachedImage) {
      const userBubbleText = trimmedMessage || "画像を添付しました";
      bot.setChatProcessing?.(true);
      bot.bubbleMessage("user", userBubbleText, attachedImage);
      void bot.getVisionResponse(
        stripDataUrlPrefix(attachedImage.dataUrl),
        trimmedMessage || undefined,
        selectedDomain,
      );
      clearAttachment();
    } else {
      const messageToSend = chronicleEnabledForInput ? `[[USE_CHRONICLE]] ${userMessage}` : userMessage;
      bot.receiveMessageFromUser(messageToSend, false, selectedDomain);
    }
    // only if we are using non-VAD mode should we focus on the input
    if (! vad.listening) {
      if (! hasOnScreenKeyboard()) {
        inputRef.current?.focus();
      }
    }
    setUserMessage("");
  }

  return (
    <div className={clsx("fixed bottom-2 w-full", domainAccessDialogDomain ? "z-[130]" : "z-20")}>
      <div className="mx-auto max-w-4xl rounded-lg border border-white/70 bg-white/82 p-2 shadow-lg shadow-slate-900/10 backdrop-blur-md">
        {selectedDomainGazeDebugUiEnabled && (
          <div className="mb-1 px-1 text-[10px] text-slate-600">
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
        <div
          className={clsx(
            "grid grid-flow-col gap-[8px]",
            selectedDomainGazeEnabled
              ? "grid-cols-[min-content_min-content_min-content_min-content_1fr_min-content]"
              : "grid-cols-[min-content_min-content_min-content_1fr_min-content]"
          )}
        >
          {selectedDomainGazeEnabled && (
            <div className="flex flex-col justify-center items-center">
              <button
                type="button"
                className={`h-8 w-8 rounded-lg text-white active:scale-[0.98] flex items-center justify-center disabled:cursor-not-allowed disabled:opacity-50 ${gazeWakeEnabled ? 'hover:brightness-110 active:brightness-95' : 'bg-secondary hover:bg-secondary-hover active:bg-secondary-press'}`}
                onClick={() => setGazeWakeEnabled((prev) => !prev)}
                title={gazeWakeEnabled ? '視線起動: ON' : '視線起動: OFF'}
                aria-label={gazeWakeEnabled ? '視線起動をオフ' : '視線起動をオン'}
                style={gazeWakeEnabled ? accentButtonStyle : undefined}
              >
                👀
              </button>
            </div>
          )}

          <div className="flex flex-col justify-center items-center">
              {config("chatbot_backend") === "moshi" ? (
                <IconButton
                iconName={!moshiMuted ? "24/PauseAlt" : "24/Microphone"}
                className={selectedDomainThemeColor ? "hover:brightness-110 active:brightness-95 disabled:opacity-50" : "bg-secondary hover:bg-secondary-hover active:bg-secondary-press disabled:bg-secondary-disabled"}
                isProcessing={moshiMuted && moshi.getRecorder() != null}
                disabled={!moshi.getRecorder()}
                style={accentButtonStyle}
                onClick={() => {
                  moshi.toggleMute();
                  setMoshiMuted(!moshiMuted);
                }}
              />
              ) : (
                <IconButton
                iconName={(isWebSpeechBackend ? webSpeechListening : vad.listening) ? "24/PauseAlt" : "24/Microphone"}
                className={selectedDomainThemeColor ? "hover:brightness-110 active:brightness-95 disabled:opacity-50" : "bg-secondary hover:bg-secondary-hover active:bg-secondary-press disabled:bg-secondary-disabled"}
                isProcessing={isWebSpeechBackend ? webSpeechListening : vad.userSpeaking}
                disabled={
                  config('stt_backend') === 'none' ||
                  (isWebSpeechBackend ? !isWebSpeechSupported() : (vad.loading || Boolean(vad.errored)))
                }
                style={accentButtonStyle}
                onClick={isWebSpeechBackend ? toggleWebSpeech : vad.toggle}
              />
              )}
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
              title={`ドメイン: ${selectedDomainLabel}`}
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
                {domainOptions.map((domain: DomainOption) => (
                  <button
                    key={domain.id}
                    type="button"
                    className={`block w-full px-3 py-2 text-left text-sm hover:bg-gray-100 ${selectedDomain === domain.id ? 'font-bold' : ''}`}
                    onClick={() => handleDomainOptionClick(domain)}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="truncate">{domain.label}</span>
                      {domain.accessControlEnabled && !hasDomainAccessSession(domain.id) ? (
                        <span className="shrink-0 text-[11px] font-semibold text-amber-700">認証</span>
                      ) : null}
                    </span>
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

          <div className="flex w-full flex-col gap-1">
            {isChatProcessing && (
              <div
                className="flex items-center gap-2 pl-1 text-[11px] font-medium text-slate-600"
                role="status"
                aria-live="polite"
              >
                <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-cyan-500" />
                <span>{t("ai_waiting_for_response", "AIの回答を待機中")}</span>
                <span className="inline-flex text-cyan-600" aria-hidden="true">
                  {[0, 180, 360].map((delay) => (
                    <span
                      key={delay}
                      className="inline-block animate-pulse"
                      style={{ animationDelay: `${delay}ms`, animationDuration: '1.2s' }}
                    >
                      .
                    </span>
                  ))}
                </span>
              </div>
            )}

            <div className="flex w-full items-center gap-2 rounded-md border border-slate-200/90 bg-white px-2 py-1 shadow-sm ring-1 ring-inset ring-white/80 focus-within:border-cyan-300 focus-within:ring-cyan-200/80">
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
              placeholder={config("chatbot_backend") === "moshi" ? "Disabled in moshi chatbot" : "質問してみましょう"}
              onChange={handleInputChange}
              onPaste={handlePasteIntoInput}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (hasOnScreenKeyboard()) {
                    inputRef.current?.blur();
                  }

                  if (userMessage === "" && !attachedImage) {
                    return false;
                  }

                  clickedSendButton();
                }
              }}
              disabled={config("chatbot_backend") === "moshi"}
              className="disabled block w-full border-0 bg-transparent py-0.5 text-slate-800 placeholder:text-slate-400 focus:ring-0 sm:text-sm sm:leading-6"
              value={userMessage}
              autoComplete="off"
            />
            </div>
          </div>

          <div className='flex flex-row items-center justify-center gap-2'>
            <IconButton
              iconName="24/UploadAlt"
              className={selectedDomainThemeColor ? "hover:brightness-110 active:brightness-95 disabled:opacity-50" : "bg-secondary hover:bg-secondary-hover active:bg-secondary-press disabled:bg-secondary-disabled"}
              isProcessing={false}
              disabled={isChatProcessing || transcriber.isModelLoading || config("chatbot_backend") === "moshi"}
              style={accentButtonStyle}
              onClick={openAttachmentPicker}
            />
            <IconButton
              iconName="24/Send"
              className={selectedDomainThemeColor ? "hover:brightness-110 active:brightness-95 disabled:opacity-50" : "bg-secondary hover:bg-secondary-hover active:bg-secondary-press disabled:bg-secondary-disabled"}
              isProcessing={isChatProcessing || transcriber.isBusy}
              disabled={isChatProcessing || (!userMessage && !attachedImage) || transcriber.isModelLoading || config("chatbot_backend") === "moshi"}
              style={accentButtonStyle}
              onClick={clickedSendButton}
            />
          </div>
        </div>

        {attachedImage && (
          <div className="mt-2 rounded-md border border-slate-200/90 bg-white/88 px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-cyan-700">添付画像</div>
                <div className="truncate text-[11px] text-slate-500">
                  {attachedImage.fileName || attachedImage.mimeType || "clipboard image"}
                </div>
              </div>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                onClick={clearAttachment}
              >
                削除
              </button>
            </div>
            <img
              src={attachedImage.dataUrl}
              alt={attachedImage.fileName || "attached image"}
              className="mt-2 max-h-24 w-full rounded-md border border-slate-200 object-contain"
            />
          </div>
        )}

        <input
          ref={attachmentInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleAttachmentChange}
        />

        <input
          ref={presentationSlideInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePresentationSlideChange}
        />
      </div>

      {presentationModalOpen && (
        <div
          className="fixed inset-0 z-[140] flex flex-col bg-black/95 text-white"
          role="dialog"
          aria-modal="true"
          aria-label="プレゼンテーションスライド"
          onMouseMove={resetPresentationChromeTimer}
          onTouchStart={resetPresentationChromeTimer}
        >
          <div className={`absolute left-4 top-4 z-10 flex max-w-[calc(100vw-8rem)] flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 shadow-2xl backdrop-blur-md transition-opacity duration-300 ${presentationChromeActive ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-white">
                {presentationDeck?.title || 'Presentation'}
              </div>
              <div className="truncate text-xs text-slate-400">
                {currentPresentationSlide
                  ? `${currentPresentationSlide.slide_no} / ${presentationSlideCount} ・ ${currentPresentationSlide.type}`
                  : 'No slide'}
              </div>
            </div>
            {currentPresentationSlide?.type === 'image' ? (
              <button
                type="button"
                className="rounded-full bg-white/12 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20"
                onClick={openPresentationSlidePicker}
              >
                画像差し替え
              </button>
            ) : null}
            {currentPresentationSlide?.type === 'web' && currentPresentationSlide.url ? (
              <a
                href={currentPresentationSlide.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-white/12 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20"
              >
                外部で開く
              </a>
            ) : null}
            {presentationImageName ? (
              <span className="max-w-[min(52vw,520px)] truncate text-xs text-slate-300">
                {presentationImageName}
              </span>
            ) : null}
          </div>

          <button
            type="button"
            className={`absolute right-4 top-4 z-10 rounded-full bg-white/12 px-4 py-2 text-sm font-semibold text-white transition-opacity duration-300 hover:bg-white/20 ${presentationChromeActive ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
            onClick={() => {
              setPresentationAutoPlay(false);
              setPresentationGuideQaMode(false);
              setPresentationModalOpen(false);
            }}
            aria-label="スライドモーダルを閉じる"
          >
            閉じる
          </button>

          <div className={`flex min-h-0 flex-1 items-center justify-center transition-[padding] duration-300 ${presentationChromeActive ? 'px-4 py-20' : 'px-0 py-0'}`}>
            {currentPresentationSlide?.type === 'web' && currentPresentationSlide.url ? (
              <div className="relative h-full w-full">
                <iframe
                  src={currentPresentationSlide.url}
                  title={currentPresentationSlide.title || presentationDeck?.title || 'web slide'}
                  className="h-full w-full rounded-2xl border border-white/10 bg-white shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                />
                <div className="pointer-events-none absolute bottom-4 left-1/2 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-full bg-slate-950/72 px-4 py-2 text-xs text-slate-200 shadow-xl backdrop-blur-md">
                  サイト側の制限で表示されない場合は、左上の「外部で開く」を使ってください。
                </div>
              </div>
            ) : currentPresentationSlide?.type === 'image' && (presentationImageDataUrl || currentPresentationSlide.url) ? (
              <img
                src={presentationImageDataUrl || currentPresentationSlide.url}
                alt={presentationImageName || currentPresentationSlide.title || 'presentation slide'}
                className={`${presentationChromeActive ? 'max-h-full max-w-full shadow-[0_24px_80px_rgba(0,0,0,0.45)]' : 'h-full w-full shadow-none'} object-contain transition-all duration-300`}
              />
            ) : currentPresentationSlide?.type === 'qa' ? (
              <div className="flex h-full w-full max-w-5xl items-center justify-center rounded-3xl border border-cyan-300/20 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.22),transparent_38%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(8,47,73,0.88))] px-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-[0.5em] text-cyan-200/80">Q&A</div>
                  <h2 className="mt-5 text-5xl font-black tracking-tight text-white md:text-7xl">
                    {currentPresentationSlide.title || '質疑応答'}
                  </h2>
                  <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-cyan-50/82">
                    {currentPresentationSlide.notes}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex h-full w-full max-w-5xl items-center justify-center rounded-3xl border border-dashed border-white/20 bg-white/[0.03] text-center">
                <div>
                  <div className="text-lg font-semibold text-white">表示できるスライドがありません</div>
                  <div className="mt-2 text-sm text-slate-400">画像スライドの場合は画像を差し替えることもできます。</div>
                </div>
              </div>
            )}
          </div>

          <div className={`absolute inset-x-0 bottom-0 z-10 border-t border-white/10 bg-slate-950/82 px-4 py-3 backdrop-blur-md transition-opacity duration-300 ${presentationChromeActive ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
            <div className="mx-auto mb-3 flex max-w-5xl flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/16 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => showPresentationSlide(presentationSlideIndex - 1)}
                  disabled={presentationSlideIndex <= 0}
                >
                  前へ
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/16 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => showPresentationSlide(presentationSlideIndex + 1)}
                  disabled={!presentationDeck || presentationSlideIndex >= presentationSlideCount - 1}
                >
                  次へ
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-950 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => setPresentationAutoPlay((value) => !value)}
                  disabled={!presentationDeck || presentationGuideQaMode || presentationSlideIndex >= presentationSlideCount - 1}
                >
                  {presentationAutoPlay ? '自動送り停止' : '自動送り再開'}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-100">
                  表示時間: {currentPresentationSlideSeconds}秒
                </div>
                {presentationDeck?.qa_context?.enabled ? (
                  <div className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-100">
                    QA context: {presentationDeck.qa_context.source}
                  </div>
                ) : null}
                {presentationGuideQaMode ? (
                  <div className="rounded-full border border-amber-300/30 bg-amber-300/15 px-3 py-1 text-xs font-bold text-amber-100">
                    質疑応答モード
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-end">
              <label className="min-w-0 flex-1 text-sm font-semibold text-slate-200">
                {presentationGuideQaMode ? '質疑応答の質問入力' : '読み上げプロンプト'}
                <textarea
                  ref={presentationTextInputRef}
                  value={presentationGuideQaMode ? presentationQaQuestion : presentationText}
                  onChange={(event) => {
                    if (presentationGuideQaMode) {
                      setPresentationQaQuestion(event.target.value);
                    } else {
                      setPresentationText(event.target.value);
                    }
                  }}
                  onKeyDown={(event) => {
                    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                      event.preventDefault();
                      if (presentationGuideQaMode) {
                        submitGuideQaQuestionFromModal();
                      } else {
                        speakPresentationTextFromModal();
                      }
                    }
                  }}
                  placeholder={presentationGuideQaMode ? '例: MCPとBEYOND-Coreの関係を教えてください' : 'Amicaに読み上げさせるテキストを入力してください'}
                  className="mt-1 h-24 w-full resize-none rounded-xl border border-white/10 bg-slate-900/90 px-3 py-2 text-sm font-normal text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/70 focus:ring-2 focus:ring-cyan-300/20"
                />
              </label>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/16"
                  onClick={() => {
                    if (presentationGuideQaMode) {
                      setPresentationQaQuestion('');
                    } else {
                      setPresentationText('');
                    }
                  }}
                >
                  クリア
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-950/40 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={presentationGuideQaMode ? submitGuideQaQuestionFromModal : speakPresentationTextFromModal}
                  disabled={presentationGuideQaMode ? !presentationQaQuestion.trim() : !presentationText.trim()}
                >
                  {presentationGuideQaMode ? '質問する' : '発話'}
                </button>
              </div>
            </div>
            <div className="mx-auto mt-2 max-w-5xl text-xs text-slate-500">
              {presentationGuideQaMode
                ? 'Ctrl+Enter でも質問できます。関連ページへ切り替えてから説明します。'
                : 'Ctrl+Enter でも発話できます。発話中もスライドは表示されたままです。'}
            </div>
          </div>
        </div>
      )}

      {domainAccessDialogDomain && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="domain-access-dialog-title">
            <div className="mb-4">
              <h3 id="domain-access-dialog-title" className="text-lg font-bold text-slate-900">ドメイン認証</h3>
              <p className="mt-1 text-sm text-slate-600">
                {domainAccessDialogDomain.label} にアクセスするにはユーザー名とパスワードが必要です。
              </p>
            </div>

            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void submitDomainAccessLogin();
              }}
            >
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                <span>ユーザー名</span>
                <input
                  type="text"
                  value={domainAccessUsername}
                  onChange={(e) => setDomainAccessUsername(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                />
              </label>

              <label className="grid gap-1 text-sm font-medium text-slate-700">
                <span>パスワード</span>
                <div className="relative">
                  <input
                    type={domainAccessPasswordVisible ? 'text' : 'password'}
                    value={domainAccessPassword}
                    onChange={(e) => setDomainAccessPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-14 text-sm outline-none focus:border-slate-500"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-2 my-auto inline-flex h-7 items-center rounded-md px-2 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    onClick={() => setDomainAccessPasswordVisible((prev) => !prev)}
                    aria-label={domainAccessPasswordVisible ? 'パスワードを隠す' : 'パスワードを表示'}
                    title={domainAccessPasswordVisible ? 'パスワードを隠す' : 'パスワードを表示'}
                  >
                    {domainAccessPasswordVisible ? '隠す' : '表示'}
                  </button>
                </div>
              </label>

              {domainAccessError ? (
                <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {domainAccessError}
                </div>
              ) : null}
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                  onClick={() => closeDomainAccessDialog(true)}
                  disabled={domainAccessBusy}
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:bg-slate-400"
                  disabled={domainAccessBusy}
                >
                  {domainAccessBusy ? '認証中...' : 'ログイン'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
