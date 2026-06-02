import {
  Fragment,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { Menu, Transition } from '@headlessui/react'
import { clsx } from "clsx";
import { M_PLUS_2, Montserrat } from "next/font/google";
import { useTranslation, Trans } from 'react-i18next';
import {
  Bars3Icon,
  ChatBubbleLeftIcon,
  ChatBubbleLeftRightIcon,
  ChevronLeftIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClockIcon,
  CloudArrowDownIcon,
  CodeBracketSquareIcon,
  CubeIcon,
  CubeTransparentIcon,
  InformationCircleIcon,
  LanguageIcon,
  ShareIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  Squares2X2Icon,
  SquaresPlusIcon,
  VideoCameraIcon,
  VideoCameraSlashIcon,
  WrenchScrewdriverIcon,
  SignalIcon,
  AcademicCapIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { IconBrain } from '@tabler/icons-react';

import { MenuButton } from "@/components/menuButton";
import { AssistantText } from "@/components/assistantText";
import { SubconciousText } from "@/components/subconciousText";
import { AddToHomescreen } from "@/components/addToHomescreen";
import { Alert } from "@/components/alert";
import { UserText } from "@/components/userText";
import { ChatLog } from "@/components/chatLog";
import VrmViewer from "@/components/vrmViewer";
import { MessageInputContainer } from "@/components/messageInputContainer";
import { Introduction } from "@/components/introduction";
import { ArbiusIntroduction } from "@/components/arbiusIntroduction";
import { LoadingProgress } from "@/components/loadingProgress";
import { DebugPane } from "@/components/debugPane";
import { Settings } from "@/components/settings";
import { EmbeddedWebcam } from "@/components/embeddedWebcam";
import { Moshi } from "@/features/moshi/components/Moshi";

import { ViewerContext } from "@/features/vrmViewer/viewerContext";
import { Message, Role } from "@/features/chat/messages";
import { ChatContext } from "@/features/chat/chatContext";
import { AlertContext } from "@/features/alert/alertContext";

import { CONFIG_UPDATED_EVENT, config, defaultConfig, updateConfig, updateConfigBatch } from '@/utils/config';
import { isTauri } from '@/utils/isTauri';
import { langs } from '@/i18n/langs';
import { VrmStoreProvider } from "@/features/vrmStore/vrmStoreContext";
import { AmicaLifeContext } from "@/features/amicaLife/amicaLifeContext";
import { ChatModeText } from "@/components/chatModeText";
import { HistoryPanel } from "@/components/historyPanel";
import { ImageAvatar } from "@/components/imageAvatar";
import { DefaultArkCoreBackground } from "@/components/defaultArkCoreBackground";
import { DefaultArkCoreAvatar } from "@/components/defaultArkCoreAvatar";
import { DomainLauncher } from '@/components/domainLauncher';

import { TimestampedPrompt } from "@/features/amicaLife/eventHandler";
import { handleChatLogs } from "@/features/externalAPI/externalAPI";
import { chatHistoryStore, mapMessagesToHistoryEntries } from "@/features/chatHistory/chatHistoryStore";
import { ThoughtText } from "@/components/thoughtText";
import { WaitingScreen } from "@/components/waitingScreen";
import { acquireSession, sessionManager } from "@/lib/sessionManager";
import { fetchPublicAppSettings, fetchPublicDomainOptions, getDomainVoiceConfig, getServerAttachedPackDetails, syncServerChatHistory } from "@/lib/injectionClient";
import { getPersistentUserId } from "@/lib/userIdentity";
import { clearDomainAccessSession, hasDomainAccessSession } from '@/lib/domainAccessSession';
import { buildUrl } from "@/utils/buildUrl";

const m_plus_2 = M_PLUS_2({
  variable: "--font-m-plus-2",
  display: "swap",
  preload: false,
});

const montserrat = Montserrat({
  variable: "--font-montserrat",
  display: "swap",
  subsets: ["latin"],
});

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

const VRM_STATUS_EVENT = 'amica:vrm-status';
const AVATAR_STATUS_EVENT = 'amica:avatar-status';
const DOMAIN_APPLIED_EVENT = 'amica:domain-applied';
const MCP_TRIGGERED_EVENT = 'amica:mcp-triggered';
const MCP_INTERCEPTED_EVENT = 'amica:mcp-intercepted';

const LICENSE_NOTICES = [
  {
    name: 'Amica',
    license: 'MIT',
    copyright: 'Copyright (c) 2023 Semper AI, pixiv Inc.',
  },
  {
    name: 'Next.js',
    license: 'MIT',
  },
  {
    name: 'React',
    license: 'MIT',
  },
  {
    name: 'Three.js',
    license: 'MIT',
  },
  {
    name: '@pixiv/three-vrm',
    license: 'MIT',
  },
  {
    name: '@headlessui/react',
    license: 'MIT',
  },
  {
    name: '@heroicons/react',
    license: 'MIT',
  },
  {
    name: '@tabler/icons-react',
    license: 'MIT',
  },
  {
    name: 'wanakana',
    license: 'MIT',
  },
  {
    name: '@ducanh2912/next-pwa',
    license: 'MIT',
  },
  {
    name: '@mediapipe/tasks-vision',
    license: 'Apache-2.0',
  },
] as const;

const FONT_LICENSE_NOTICES = [
  {
    name: 'Google Fonts: M PLUS 2',
    license: 'SIL Open Font License 1.1',
  },
  {
    name: 'Google Fonts: Montserrat',
    license: 'SIL Open Font License 1.1',
  },
] as const;

const AUDIO_LICENSE_SECTIONS = {
  engines: [
    {
      name: 'Style-Bert-VITS2',
      license: 'AGPL-3.0',
      description: 'Copyright (c) Style-Bert-VITS2 Contributors',
      url: 'https://github.com/litagin02/Style-Bert-VITS2',
    },
    {
      name: 'JP-Extra',
      license: 'AGPL-3.0',
      description: '日本語向け学習済みベースモデル',
      url: 'https://huggingface.co/litagin/Style-Bert-VITS2-2.0-base-JP-Extra',
    },
    {
      name: 'Piper',
      license: 'MIT',
      description: '利用する音声モデルのライセンスは各モデル配布元に従います。',
      url: 'https://github.com/rhasspy/piper',
    },
  ],
  models: [
    {
      name: 'yume-mirai-v0.1.0',
      description: 'NFTDrive が独自に作成した学習済み音声モデルです。',
      copyright: 'Copyright © NFTDrive',
    },
    {
      name: 'amitaro',
      description: 'Voice Source: あみたろの声素材工房',
      provider: '学習済みモデル提供: Style-Bert-VITS2 Project',
    },
    {
      name: 'jvnv-F1-jp',
      license: 'CC BY-SA 4.0',
      description: 'JVNVコーパスを利用したサンプル音声モデルです。',
    },
    {
      name: 'jvnv-F2-jp',
      license: 'CC BY-SA 4.0',
      description: 'JVNVコーパスを利用したサンプル音声モデルです。',
    },
    {
      name: 'jvnv-M1-jp',
      license: 'CC BY-SA 4.0',
      description: 'JVNVコーパスを利用したサンプル音声モデルです。',
    },
    {
      name: 'jvnv-M2-jp',
      license: 'CC BY-SA 4.0',
      description: 'JVNVコーパスを利用したサンプル音声モデルです。',
    },
  ],
  usage:
    'JVNVコーパス由来モデルおよび各音声モデルの利用条件は、それぞれの配布元ライセンスに従います。Style-Bert-VITS2 および JP-Extra は AGPL-3.0 ライセンスに基づき提供され、Piper で利用する音声モデルのライセンスは各モデル配布元に従います。',
  acknowledgment:
    'Ark-i は多数のオープンソースソフトウェアおよびコミュニティによって支えられています。開発者およびコミュニティの皆様に深く感謝いたします。',
} as const;

type InformationView = 'menu' | 'terms' | 'privacy' | 'about' | 'license';

const INFORMATION_MENU_ITEMS = [
  {
    id: 'terms',
    title: '利用規約',
    summary: 'ご利用前に確認いただきたい基本条件です。',
  },
  {
    id: 'privacy',
    title: 'プライバシー',
    summary: '会話や端末情報の取り扱いに関する案内です。',
  },
  {
    id: 'about',
    title: 'About',
    summary: 'Amica / Ark-i の概要と構成について記載します。',
  },
  {
    id: 'license',
    title: 'ライセンス',
    summary: 'OSS、音声モデル、フォントのライセンス情報です。',
  },
] as const satisfies ReadonlyArray<{
  id: Exclude<InformationView, 'menu'>;
  title: string;
  summary: string;
}>;

const INFORMATION_COPY = {
  terms: {
    eyebrow: 'Terms of Use',
    title: '利用規約',
    description:
      '以下は暫定の簡易版です。正式な利用規約が確定した際は、この画面の文面を差し替えてください。',
    sections: [
      {
        heading: '1. 利用範囲',
        body:
          '本システムは、会話、音声合成、アバター表示、外部サービス連携を含む対話機能を提供します。利用者は、適用される法令および各連携サービスの利用条件を遵守したうえで利用してください。',
      },
      {
        heading: '2. 禁止事項',
        body:
          '不正アクセス、第三者の権利侵害、違法・有害な用途、過度な負荷を与える行為、または本システムの運用を妨げる行為を禁止します。',
      },
      {
        heading: '3. 外部サービス',
        body:
          '音声エンジン、AI モデル、MCP サーバー、その他の外部サービスを利用する場合、それぞれの提供元の利用条件、ライセンス、料金体系が適用されることがあります。',
      },
      {
        heading: '4. 免責',
        body:
          '本システムは現状有姿で提供されます。出力内容、可用性、継続性、特定目的適合性について保証するものではありません。',
      },
    ],
  },
  privacy: {
    eyebrow: 'Privacy Notice',
    title: 'プライバシー',
    description:
      '以下は暫定の簡易版です。正式なプライバシーポリシーが確定した際は、この画面の文面を差し替えてください。',
    sections: [
      {
        heading: '1. 取得される情報',
        body:
          '本システムは、会話入力、音声入出力に関連する設定、接続先サーバー情報、利用するドメインやモデル設定など、機能提供に必要な範囲の情報を扱うことがあります。',
      },
      {
        heading: '2. 利用目的',
        body:
          '取得した情報は、会話機能の提供、音声生成、接続状態の維持、利用履歴の同期、障害調査、品質改善のために利用されます。',
      },
      {
        heading: '3. 外部送信',
        body:
          '利用する AI、音声、MCP、解析系サービスの構成によっては、入力テキストや関連メタデータが外部サービスへ送信される場合があります。送信先の取り扱いは各提供元の方針に従います。',
      },
      {
        heading: '4. 見直し',
        body:
          '実運用に合わせて本案内を更新する場合があります。正式版の策定後は、その内容が優先されます。',
      },
    ],
  },
  about: {
    eyebrow: 'About Ark-i',
    title: 'About',
    description:
      'Ark-i',
    sections: [
      {
        heading: 'Version',
        body: '0.1.0',
      },
      {
        heading: 'Copyright',
        body: 'Copyright © 2026 NFTDrive',
      },
      {
        heading: 'Developed by',
        body: 'NFTDrive',
      },
      {
        heading: '概要',
        body:
          'Ark-i は、組織や個人が独自の知識や役割をAIへ注入し、専用AIアシスタントを構築するためのAIプラットフォームです。',
      },
      {
        heading: '適用分野',
        body:
          '病院、学校、自治体、企業、コミュニティなど、さまざまな分野に特化したAIを構築し、ローカル環境またはクラウド環境で運用できます。',
      },
      {
        heading: 'ライセンス',
        body:
          '個人利用: 無料\n\n法人・団体利用: ライセンス契約が必要です。\n\n商用利用、組織利用、再配布、OEM提供等については、別途ライセンス契約が必要となる場合があります。\n\n詳細は NFTDrive までお問い合わせください。',
      },
      {
        heading: '著作権',
        body:
          'Ark-i\n\nCopyright © 2026 NFTDrive\n\nAll Rights Reserved.',
      },
      {
        heading: 'ウェブサイト',
        body: 'https://nftdrive.net',
      },
      {
        heading: 'OSSライセンス情報',
        body:
          '本製品は複数のオープンソースソフトウェアを利用しています。\n\n詳細は「Open Source Notices」をご確認ください。',
      },
    ],
  },
} as const;

const LAUNCHER_DOMAIN_RESET_KEYS = [
  'name',
  'bg_url',
  'bg_color',
  'theme_color',
  'vrm_enabled',
  'vrm_url',
  'vrm_hash',
  'vrm_save_type',
  'image_avatar_idle_url',
  'image_avatar_talk_url',
  'image_avatar_talk_interval_ms',
  'tts_muted',
  'amica_life_enabled',
  'time_before_idle_sec',
  'min_time_interval_sec',
  'max_time_interval_sec',
  'time_to_sleep_sec',
  'stylebertvits2_model_id',
  'stylebertvits2_style',
] as const;

function resolveCustomBackgroundColor(value: string): string {
  const normalized = value.trim();
  if (normalized === '' || normalized.toLowerCase() === 'transparent') {
    return '';
  }

  return normalized;
}

function detectVRHeadset() {
  const userAgent = navigator.userAgent.toLowerCase();

  // Meta Quest detection
  // Quest 2 and 3 both use "oculus" in their user agent
  const isQuest = userAgent.includes('oculus') ||
                  userAgent.includes('quest 2') ||
                  userAgent.includes('quest 3');

  // Vision Pro detection
  // visionOS is the specific identifier for Apple Vision Pro
  const isVisionPro = userAgent.includes('visionos') ||
                      userAgent.includes('xros');

  // Detailed device information
  let deviceInfo = {
    isVRDevice: isQuest || isVisionPro,
    deviceType: '',
    browserInfo: userAgent
  };

  if (isQuest) {
    deviceInfo.deviceType = 'quest-3';
    if (userAgent.includes('quest 3')) {
      deviceInfo.deviceType = 'quest-3';
    } else if (userAgent.includes('quest 2')) {
      deviceInfo.deviceType = 'quest-2';
    }
  } else if (isVisionPro) {
    deviceInfo.deviceType = 'vision-pro';
  }

  return deviceInfo;
}


export default function Home() {
  const { t, i18n } = useTranslation();
  const currLang = i18n.resolvedLanguage;
  const { viewer } = useContext(ViewerContext);
  const { alert } = useContext(AlertContext);
  const { chat: bot } = useContext(ChatContext);
  const { amicaLife: amicaLife } = useContext(AmicaLifeContext);

  const [chatSpeaking, setChatSpeaking] = useState(false);
  const [chatProcessing, setChatProcessing] = useState(false);
  const [chatLog, setChatLog] = useState<Message[]>([]);
  const [assistantMessage, setAssistantMessage] = useState("");
  const [assistantDbResult, setAssistantDbResult] = useState<Message["dbResult"] | undefined>(undefined);
  const [userMessage, setUserMessage] = useState("");
  const [thoughtMessage, setThoughtMessage] = useState("");
  const [shownMessage, setShownMessage] = useState<Role>("system");
  const [subconciousLogs, setSubconciousLogs] = useState<TimestampedPrompt[]>([]);

  // showContent exists to allow ssr
  // otherwise issues from usage of localStorage and window will occur
  const [showContent, setShowContent] = useState(false);

  const [showArbiusIntroduction, setShowArbiusIntroduction] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showChatLog, setShowChatLog] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [showChatMode, setShowChatMode] = useState(() => config("show_chat_mode") === "true");
  const showSettingsUi = config("show_settings_ui") === "true";
  const [showHistory, setShowHistory] = useState(false);
  const [showSubconciousText, setShowSubconciousText] = useState(false);
  const [showMainMenu, setShowMainMenu] = useState(false);
  const [informationView, setInformationView] = useState<InformationView | null>(null);

  useEffect(() => {
    void updateConfig("show_chat_mode", showChatMode ? "true" : "false");
  }, [showChatMode]);

  useEffect(() => {
    if (!showSettingsUi && showSettings) {
      setShowSettings(false);
    }
    if (!showSettingsUi && showDebug) {
      setShowDebug(false);
    }
    if (!showSettingsUi && showMainMenu) {
      setShowMainMenu(false);
    }
  }, [showDebug, showMainMenu, showSettings, showSettingsUi]);

  useEffect(() => {
    if (!informationView) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setInformationView(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [informationView]);

  const [showMoshi, setShowMoshi] = useState(false);
  const [lastMcpTrigger, setLastMcpTrigger] = useState<{
    at: number;
    serverId: string;
    toolName: string;
  } | null>(null);
  const [lastInterceptAt, setLastInterceptAt] = useState<number | null>(null);
  const lastMcpTriggerKeyRef = useRef('');
  const mainMenuRef = useRef<HTMLDivElement>(null);
  const [selectedDomainId, setSelectedDomainId] = useState(() => config('injection_default_domain') || 'default');
  const selectedDomainIdRef = useRef(selectedDomainId);
  const [selectedDomainGazeEnabled, setSelectedDomainGazeEnabled] = useState(true);
  const [selectedDomainLabel, setSelectedDomainLabel] = useState(() => config('injection_default_domain_label') || 'デフォルト');
  const [selectedDomainChronicleAttached, setSelectedDomainChronicleAttached] = useState(false);
  const [effectiveTTSBackend, setEffectiveTTSBackend] = useState(() => config('tts_backend'));
  const [domainDisplayVersion, setDomainDisplayVersion] = useState(0);
  const [vrmDisplayState, setVrmDisplayState] = useState<'idle' | 'loading' | 'ready' | 'error'>(() => {
    const hasVrmConfig = config('vrm_enabled') === 'true' && config('vrm_url').trim() !== '';
    return hasVrmConfig ? 'loading' : 'idle';
  });
  const [avatarDisplayState, setAvatarDisplayState] = useState<'idle' | 'loading' | 'ready' | 'error'>(() => {
    const hasVrmConfig = config('vrm_enabled') === 'true' && config('vrm_url').trim() !== '';
    const hasImageAvatar =
      config('image_avatar_idle_url').trim() !== '' ||
      config('image_avatar_talk_url').trim() !== '';
    return hasVrmConfig || hasImageAvatar ? 'loading' : 'ready';
  });
  const vrmConfigSnapshotRef = useRef(`${config('vrm_enabled')}::${config('vrm_url').trim()}`);
  const avatarConfigSnapshotRef = useRef(
    `${config('vrm_enabled')}::${config('vrm_url').trim()}::${config('image_avatar_idle_url').trim()}::${config('image_avatar_talk_url').trim()}`,
  );
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isConnectionIndicatorExpanded, setIsConnectionIndicatorExpanded] = useState(true);
  const [showCompactMobileChatCard, setShowCompactMobileChatCard] = useState(
    () => config("show_compact_mobile_chat_card") === "true"
  );

  useEffect(() => {
    void updateConfig("show_compact_mobile_chat_card", showCompactMobileChatCard ? "true" : "false");
  }, [showCompactMobileChatCard]);

  // null indicates havent loaded config yet
  const [muted, setMuted] = useState<boolean|null>(null);
  const [webcamEnabled, setWebcamEnabled] = useState(false);
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);

  const [showStreamWindow, setShowStreamWindow] = useState(false);
  const videoRef = useRef(null);

  const [isARSupported, setIsARSupported] = useState(false);
  const [isVRSupported, setIsVRSupported] = useState(false);

  const [isVRHeadset, setIsVRHeadset] = useState(false);

  const [sessionBlocked, setSessionBlocked] = useState(false);
  const [domainAuthDialogOpen, setDomainAuthDialogOpen] = useState(false);
  const [domainAccessPromptNonce, setDomainAccessPromptNonce] = useState(0);
  const [launcherEnabled, setLauncherEnabled] = useState(() => config('injection_launcher_enabled') !== 'false');
  const [termsOfUseUrl, setTermsOfUseUrl] = useState('');
  const [privacyPolicyUrl, setPrivacyPolicyUrl] = useState('');
  const [launcherEntered, setLauncherEntered] = useState(() => config('injection_launcher_enabled') === 'false');
  const [launcherStartingDomainId, setLauncherStartingDomainId] = useState<string | null>(null);
  const [attachedPackDetails, setAttachedPackDetails] = useState<{
    mcpServers: string[];
    knowledges: string[];
    isReachable: boolean;
  }>({
    mcpServers: [],
    knowledges: [],
    isReachable: true,
  });

  const currentSTTBackend = config('stt_backend');
  const currentChatbotBackend = config('chatbot_backend');
  const currentSTTLabel = sttBackendLabels[currentSTTBackend] ?? currentSTTBackend;
  const currentTTSLabel = ttsBackendLabels[effectiveTTSBackend] ?? effectiveTTSBackend;
  const currentChatbotLabel = chatbotBackendLabels[currentChatbotBackend] ?? currentChatbotBackend;
  const currentAIModel = (() => {
    switch (currentChatbotBackend) {
      case 'arbius_llm':
        return config('arbius_llm_model_id');
      case 'openai':
        return config('openai_model');
      case 'ollama':
        return config('ollama_model');
      case 'llamacpp':
        return config('llamacpp_url');
      case 'koboldai':
        return config('koboldai_url');
      case 'moshi':
        return config('moshi_url');
      default:
        return '';
    }
  })();

  const checkImageAvailable = (url: string): Promise<boolean> => {
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

      img.src = url;
    });
  };


  useEffect(() => {
    if (!domainAuthDialogOpen) {
      return;
    }

    setShowHistory(false);
    setShowMainMenu(false);
  }, [domainAuthDialogOpen]);

  useEffect(() => {
    let cancelled = false;

    const resolveEffectiveTTSBackend = async () => {
      const fallbackBackend = config('tts_backend');
      const domainId = (selectedDomainId || config('injection_default_domain') || 'default').trim();

      if (!domainId) {
        if (!cancelled) {
          setEffectiveTTSBackend(fallbackBackend);
        }
        return;
      }

      try {
        const domainVoiceConfig = await getDomainVoiceConfig(domainId);
        if (!cancelled) {
          setEffectiveTTSBackend(domainVoiceConfig.ttsBackend?.trim() || fallbackBackend);
        }
      } catch {
        if (!cancelled) {
          setEffectiveTTSBackend(fallbackBackend);
        }
      }
    };

    void resolveEffectiveTTSBackend();

    const handleConfigUpdated = () => {
      void resolveEffectiveTTSBackend();
    };

    window.addEventListener(CONFIG_UPDATED_EVENT, handleConfigUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener(CONFIG_UPDATED_EVENT, handleConfigUpdated);
    };
  }, [selectedDomainId]);

  useEffect(() => {
    amicaLife.checkSettingOff(!showSettings);
  }, [showSettings, amicaLife]);

  useEffect(() => {
    if (muted === null) {
      setMuted(config('tts_muted') === 'true');
    }

    setShowArbiusIntroduction(config("show_arbius_introduction") === 'true');

    const applyInitialBackground = async () => {
      const bgColor = resolveCustomBackgroundColor(config("bg_color"));
      const bgUrl = config("bg_url").trim();

      if (bgColor !== '') {
        document.body.style.backgroundImage = '';
        document.body.style.backgroundColor = bgColor;
        return;
      }

      if (bgUrl) {
        const bgOk = await checkImageAvailable(bgUrl);
        if (bgOk) {
          document.body.style.backgroundColor = '';
          document.body.style.backgroundImage = `url(${bgUrl})`;
          return;
        }

        await updateConfig('bg_url', '');
        document.body.style.backgroundColor = '';
        document.body.style.backgroundImage = '';
        alert.warning(
          '背景画像の読み込みに失敗しました',
          '削除済みまたは到達不能な背景画像設定を解除し、デフォルト背景へフォールバックしました。'
        );
        return;
      }

      document.body.style.backgroundColor = '';
      document.body.style.backgroundImage = '';
    };

    void applyInitialBackground();
    // Temp Disable : WebXR
    // if (window.navigator.xr && window.navigator.xr.isSessionSupported) {
    //   let deviceInfo = detectVRHeadset();
    //   setIsVRHeadset(deviceInfo.isVRDevice);
    //   window.navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
    //     console.log('vr supported', supported);
    //     setIsVRSupported(supported);
    //   });
    // }
  }, [alert, muted]);

  useEffect(() => {
    if (viewer && videoRef.current && showStreamWindow) {
      viewer.startStreaming(videoRef.current);
    } else {
      viewer.stopStreaming();
    }
  }, [viewer, videoRef, showStreamWindow]);

  function toggleTTSMute() {
    updateConfig('tts_muted', config('tts_muted') === 'true' ? 'false' : 'true')
    setMuted(config('tts_muted') === 'true')
  }

  const toggleState = (
    setFunc: React.Dispatch<React.SetStateAction<boolean>>, 
    deps: React.Dispatch<React.SetStateAction<boolean>>[],
  ) => {
    setFunc(prev => {
      if (!prev) {
        deps.forEach(dep => dep(false));
      } 
      return !prev;
    });
  };
  
  const toggleChatLog = () => {
    toggleState(setShowChatLog, [setShowSubconciousText, setShowChatMode, setShowHistory]);
  };
  
  const toggleShowSubconciousText = () => {
    if (subconciousLogs.length !== 0) {
      toggleState(setShowSubconciousText, [setShowChatLog, setShowChatMode]);
      setShowHistory(false);
    }
  };
  
  const toggleChatMode = () => {
    if (isMobileViewport) {
      setShowChatMode(false);
      return;
    }

    toggleState(setShowChatMode, [setShowChatLog, setShowSubconciousText, setShowHistory]);
  };

  const toggleCompactMobileChatCard = () => {
    if (!isMobileViewport) {
      return;
    }

    setShowCompactMobileChatCard((prev) => !prev);
  };

  const toggleHistory = () => {
    toggleState(setShowHistory, [setShowChatLog, setShowSubconciousText]);
  };

  const toggleXR = async (immersiveType: XRSessionMode) => {
    console.log('Toggle XR', immersiveType);

    if (! window.navigator.xr) {
      console.error("WebXR not supported");
      return;
    }
    if (! await window.navigator.xr.isSessionSupported(immersiveType)) {
      console.error("Session not supported");
      return;
    }

    if (! viewer.isReady) {
      console.error("Viewer not ready");
      return;
    }

    // TODO should hand tracking be required?
    let optionalFeatures: string[] = [
      'hand-tracking',
      'local-floor',
    ];
    if (immersiveType === 'immersive-ar') {
      optionalFeatures.push('dom-overlay');
    }

    const sessionInit = {
      optionalFeatures,
      domOverlay: { root: document.body },
    };

    if (viewer.currentSession) {
      viewer.onSessionEnded();

      try {
        await viewer.currentSession.end();
      } catch (err) {
        // some times session already ended not due to user interaction
        console.warn(err);
      }

      // @ts-ignore
      if (window.navigator.xr.offerSession !== undefined) {
        // @ts-ignore
        const session = await navigator.xr?.offerSession(immersiveType, sessionInit);
        viewer.onSessionStarted(session, immersiveType);
      }
      return;
    }

    // @ts-ignore
    if (window.navigator.xr.offerSession !== undefined ) {
      // @ts-ignore
      const session = await navigator.xr?.offerSession(immersiveType, sessionInit);
      viewer.onSessionStarted(session, immersiveType);
      return;
    }

    try {
      const session = await window.navigator.xr.requestSession(immersiveType, sessionInit);

      viewer.onSessionStarted(session, immersiveType);
    } catch (err) {
      console.error(err);
    }

  }


  useEffect(() => {
    bot.initialize(
      amicaLife,
      viewer,
      alert,
      setChatLog,
      setUserMessage,
      setAssistantMessage,
      setAssistantDbResult,
      setThoughtMessage,
      setShownMessage,
      setChatProcessing,
      setChatSpeaking,
    );

    // TODO remove in future
    // this change was just to make naming cleaner
    if (config("tts_backend") === 'openai') {
      updateConfig("tts_backend", "openai_tts");
    }
  }, [alert, amicaLife, bot, viewer]);

  useEffect(() => {
    amicaLife.initialize(
      viewer,
      bot,
      setSubconciousLogs,
      chatSpeaking,
    );
  }, [amicaLife, bot, chatSpeaking, viewer]);

  useEffect(() => {
    handleChatLogs(chatLog);
  }, [chatLog]);

  useEffect(() => {
    selectedDomainIdRef.current = selectedDomainId;
  }, [selectedDomainId]);

  useEffect(() => {
    void chatHistoryStore.upsertMessages(
      chatLog,
      sessionManager.getSessionId() || undefined,
      getPersistentUserId(),
    );
  }, [chatLog]);

  useEffect(() => {
    if (chatLog.length === 0) {
      return;
    }

    const latestMessage = chatLog[chatLog.length - 1];
    if (!latestMessage || latestMessage.role !== 'assistant') {
      return;
    }

    const usedByMcpInfo = Boolean(latestMessage.mcpInfo?.used);
    const toolNameFromDbResult = latestMessage.dbResult?.toolName || '';
    if (!usedByMcpInfo && !toolNameFromDbResult) {
      return;
    }

    const triggerAt = typeof latestMessage.createdAt === 'number' ? latestMessage.createdAt : Date.now();
    const serverId = latestMessage.mcpInfo?.serverId || '';
    const toolName = latestMessage.mcpInfo?.toolName || toolNameFromDbResult;
    const triggerKey = `${triggerAt}:${serverId}:${toolName}`;

    if (lastMcpTriggerKeyRef.current === triggerKey) {
      return;
    }

    lastMcpTriggerKeyRef.current = triggerKey;
    setLastMcpTrigger({
      at: triggerAt,
      serverId,
      toolName,
    });
  }, [chatLog]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleMcpTriggered = (event: Event) => {
      const customEvent = event as CustomEvent<{ at?: number; serverId?: string; toolName?: string }>;
      const triggerAt = typeof customEvent.detail?.at === 'number' ? customEvent.detail.at : Date.now();
      const serverId = customEvent.detail?.serverId || '';
      const toolName = customEvent.detail?.toolName || '';
      const triggerKey = `${triggerAt}:${serverId}:${toolName}`;

      if (lastMcpTriggerKeyRef.current === triggerKey) {
        return;
      }

      lastMcpTriggerKeyRef.current = triggerKey;
      setLastMcpTrigger({
        at: triggerAt,
        serverId,
        toolName,
      });
    };

    window.addEventListener(MCP_TRIGGERED_EVENT, handleMcpTriggered as EventListener);
    return () => {
      window.removeEventListener(MCP_TRIGGERED_EVENT, handleMcpTriggered as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!lastMcpTrigger) {
      return;
    }

    const remainingMs = 15000 - (Date.now() - lastMcpTrigger.at);
    if (remainingMs <= 0) {
      setLastMcpTrigger(null);
      return;
    }

    const timerId = window.setTimeout(() => {
      setLastMcpTrigger(null);
    }, remainingMs);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [lastMcpTrigger]);

  useEffect(() => {
    if (lastInterceptAt === null) {
      return;
    }

    const remainingMs = 8000 - (Date.now() - lastInterceptAt);
    if (remainingMs <= 0) {
      setLastInterceptAt(null);
      return;
    }

    const timerId = window.setTimeout(() => {
      setLastInterceptAt(null);
    }, remainingMs);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [lastInterceptAt]);

  useEffect(() => {
    const entries = mapMessagesToHistoryEntries(
      chatLog,
      sessionManager.getSessionId() || undefined,
      getPersistentUserId(),
    );
    if (entries.length === 0) {
      return;
    }

    const timerId = window.setTimeout(() => {
      void syncServerChatHistory(entries);
    }, 300);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [chatLog]);

  useEffect(() => {
    if (!showMainMenu) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (!mainMenuRef.current) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (!mainMenuRef.current.contains(target)) {
        setShowMainMenu(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowMainMenu(false);
      }
    };

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [showMainMenu]);

  useEffect(() => setShowContent(true), []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let cancelled = false;

    const loadPublicAppSettings = async () => {
      const settings = await fetchPublicAppSettings();
      if (cancelled) {
        return;
      }

      setLauncherEnabled(settings.launcherEnabled);
      setTermsOfUseUrl(settings.termsOfUseUrl);
      setPrivacyPolicyUrl(settings.privacyPolicyUrl);
      setLauncherEntered(!settings.launcherEnabled);
    };

    void loadPublicAppSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleIntercepted = (event: Event) => {
      const customEvent = event as CustomEvent<{ at?: number }>;
      const triggerAt = typeof customEvent.detail?.at === 'number' ? customEvent.detail.at : Date.now();
      setLastInterceptAt(triggerAt);
    };

    window.addEventListener(MCP_INTERCEPTED_EVENT, handleIntercepted as EventListener);
    return () => {
      window.removeEventListener(MCP_INTERCEPTED_EVENT, handleIntercepted as EventListener);
    };
  }, []);

  const enterDomainFromLauncher = async (domainId: string) => {
    if (launcherStartingDomainId) {
      return;
    }

    setLauncherStartingDomainId(domainId);

    try {
      await updateConfigBatch(
        LAUNCHER_DOMAIN_RESET_KEYS.map((key) => [key, defaultConfig(key)]),
      );

      if (typeof window !== 'undefined') {
        localStorage.setItem('amica_selected_domain_id', domainId);
        window.dispatchEvent(new CustomEvent('amica:domain-changed', { detail: { domainId } }));
      }

      setSelectedDomainId(domainId);
      setLauncherEntered(true);
    } catch (error) {
      setLauncherStartingDomainId(null);
      throw error;
    }
  };

  const handleInformationMenuSelect = (view: Exclude<InformationView, 'menu'>) => {
    if (view === 'terms') {
      if (!termsOfUseUrl) {
        return;
      }
      window.open(termsOfUseUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    if (view === 'privacy') {
      if (!privacyPolicyUrl) {
        return;
      }
      window.open(privacyPolicyUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    setInformationView(view);
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleDomainApplied = (event: Event) => {
      const customEvent = event as CustomEvent<{ domainId?: string }>;
      if (!customEvent.detail?.domainId) {
        return;
      }

      if (customEvent.detail.domainId === launcherStartingDomainId) {
        setLauncherStartingDomainId(null);
      }
    };

    window.addEventListener(DOMAIN_APPLIED_EVENT, handleDomainApplied as EventListener);

    return () => {
      window.removeEventListener(DOMAIN_APPLIED_EVENT, handleDomainApplied as EventListener);
    };
  }, [launcherStartingDomainId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const resetConversationState = () => {
      bot.setMessageList([]);
      setThoughtMessage("");
      setShownMessage("system");
      setChatProcessing(false);
      setChatSpeaking(false);
    };

    const syncSelectedDomain = (domainId?: string) => {
      const nextDomainId = domainId || localStorage.getItem('amica_selected_domain_id') || config('injection_default_domain') || 'default';
      if (selectedDomainIdRef.current !== nextDomainId) {
        resetConversationState();
      }

      setVrmDisplayState('loading');
      setAvatarDisplayState('loading');
      setSelectedDomainId(nextDomainId);
      setDomainDisplayVersion((prev) => prev + 1);
    };

    syncSelectedDomain();

    const handleDomainChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ domainId?: string }>;
      if (customEvent.detail?.domainId) {
        setLauncherStartingDomainId(customEvent.detail.domainId);
      }
      syncSelectedDomain(customEvent.detail?.domainId);
    };

    window.addEventListener('amica:domain-changed', handleDomainChanged as EventListener);

    return () => {
      window.removeEventListener('amica:domain-changed', handleDomainChanged as EventListener);
    };
  }, [bot]);

  useEffect(() => {
    if (isMobileViewport && showChatMode) {
      setShowChatMode(false);
    }
  }, [isMobileViewport, showChatMode]);

  useEffect(() => {
    if (!isMobileViewport && showCompactMobileChatCard) {
      setShowCompactMobileChatCard(false);
    }
  }, [isMobileViewport, showCompactMobileChatCard]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(max-width: 767px)');

    const applyViewportMode = (matches: boolean) => {
      setIsMobileViewport(matches);
      setIsConnectionIndicatorExpanded(!matches);
    };

    applyViewportMode(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      applyViewportMode(event.matches);
    };

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleConfigUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ key?: string; keys?: string[]; batch?: boolean }>;
      const updatedKeys = customEvent.detail?.batch
        ? customEvent.detail?.keys || []
        : customEvent.detail?.key
          ? [customEvent.detail.key]
          : [];
      const hasDisplayKey = updatedKeys.some((key) => ['name', 'theme_color', 'bg_url', 'bg_color', 'vrm_enabled', 'vrm_url', 'image_avatar_idle_url', 'image_avatar_talk_url'].includes(key));
      const hasVrmConfigKey = updatedKeys.some((key) => ['vrm_enabled', 'vrm_url'].includes(key));
      const hasAvatarConfigKey = updatedKeys.some((key) => ['vrm_enabled', 'vrm_url', 'image_avatar_idle_url', 'image_avatar_talk_url'].includes(key));

      if (hasDisplayKey) {
        setDomainDisplayVersion((prev) => prev + 1);
      }

      if (hasVrmConfigKey) {
        const currentVrmEnabled = config('vrm_enabled');
        const currentVrmUrl = config('vrm_url').trim();
        const nextSnapshot = `${currentVrmEnabled}::${currentVrmUrl}`;

        if (vrmConfigSnapshotRef.current !== nextSnapshot) {
          vrmConfigSnapshotRef.current = nextSnapshot;
          const hasVrmConfig = currentVrmEnabled === 'true' && currentVrmUrl !== '';
          setVrmDisplayState(hasVrmConfig ? 'loading' : 'idle');
        }
      }

      if (hasAvatarConfigKey) {
        const currentVrmEnabled = config('vrm_enabled');
        const currentVrmUrl = config('vrm_url').trim();
        const currentImageIdleUrl = config('image_avatar_idle_url').trim();
        const currentImageTalkUrl = config('image_avatar_talk_url').trim();
        const nextSnapshot = `${currentVrmEnabled}::${currentVrmUrl}::${currentImageIdleUrl}::${currentImageTalkUrl}`;

        if (avatarConfigSnapshotRef.current !== nextSnapshot) {
          avatarConfigSnapshotRef.current = nextSnapshot;
          setAvatarDisplayState('loading');
        }
      }
    };

    window.addEventListener(CONFIG_UPDATED_EVENT, handleConfigUpdated as EventListener);

    return () => {
      window.removeEventListener(CONFIG_UPDATED_EVENT, handleConfigUpdated as EventListener);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleVrmStatusChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ state?: 'idle' | 'loading' | 'ready' | 'error' }>;
      const nextState = customEvent.detail?.state;
      if (!nextState) {
        return;
      }

      setVrmDisplayState(nextState);
    };

    window.addEventListener(VRM_STATUS_EVENT, handleVrmStatusChanged as EventListener);

    return () => {
      window.removeEventListener(VRM_STATUS_EVENT, handleVrmStatusChanged as EventListener);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleAvatarStatusChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{
        state?: 'idle' | 'loading' | 'ready' | 'error';
        assetType?: 'vrm' | 'image';
        url?: string;
      }>;
      const nextState = customEvent.detail?.state;
      const assetType = customEvent.detail?.assetType;
      const eventUrl = customEvent.detail?.url?.trim() || '';
      if (!nextState) {
        return;
      }

      const currentVrmEnabled = config('vrm_enabled') === 'true';
      const currentVrmUrl = config('vrm_url').trim();
      const hasConfiguredVrm = currentVrmEnabled && currentVrmUrl !== '';
      const currentImageIdleUrl = config('image_avatar_idle_url').trim();
      const currentImageTalkUrl = config('image_avatar_talk_url').trim();
      const hasConfiguredImageAvatar = currentImageIdleUrl !== '' || currentImageTalkUrl !== '';

      if (hasConfiguredVrm) {
        if (assetType !== 'vrm') {
          return;
        }

        if (eventUrl && eventUrl !== buildUrl(currentVrmUrl)) {
          return;
        }

        setAvatarDisplayState(nextState);
        return;
      }

      if (hasConfiguredImageAvatar) {
        if (assetType !== 'image') {
          return;
        }

        if (eventUrl && eventUrl !== currentImageIdleUrl && eventUrl !== currentImageTalkUrl) {
          return;
        }

        setAvatarDisplayState(nextState);
        return;
      }

      if (assetType) {
        return;
      }

      setAvatarDisplayState(nextState);
    };

    window.addEventListener(AVATAR_STATUS_EVENT, handleAvatarStatusChanged as EventListener);

    return () => {
      window.removeEventListener(AVATAR_STATUS_EVENT, handleAvatarStatusChanged as EventListener);
    };
  }, []);

  // 同時接続数制限: injection-tool が有効なときのみセッションを取得
  useEffect(() => {
    if (!showContent) return;
    if (!launcherEntered) return;
    const enabled = config('injection_tool_enabled')?.toLowerCase() === 'true';
    if (!enabled) return;
    if (sessionManager.getSessionId()) return;
    const domainId = selectedDomainId || config('injection_default_domain') || 'default';
    acquireSession(domainId).then((result) => {
      if (result.acquired && !result.errorCode) {
        if (result.sessionId) sessionManager.start(result.sessionId, domainId);
        setSessionBlocked(false);
      } else if (result.errorCode === 'DOMAIN_AUTH_REQUIRED') {
        clearDomainAccessSession(domainId);
        setSessionBlocked(false);
        setDomainAccessPromptNonce((prev) => prev + 1);
      } else {
        setSessionBlocked(true);
      }
    });
  }, [launcherEntered, selectedDomainId, showContent]);

  useEffect(() => {
    if (!showContent) return;
    if (!launcherEntered) return;
    if (domainAuthDialogOpen) return;

    let cancelled = false;

    setAttachedPackDetails({
      mcpServers: [],
      knowledges: [],
      isReachable: true,
    });


    const refreshAttachedPackDetails = async () => {
      if (!selectedDomainId) return;

      try {
        const sessionId = sessionManager.getSessionId() || '';
        const domains = await fetchPublicDomainOptions();
        const domain = domains.find((item) => item.id === selectedDomainId);
        const requiresDomainAccess = domain?.accessControlEnabled === true;
        const hasDomainAccess = hasDomainAccessSession(selectedDomainId);

        if (requiresDomainAccess && !hasDomainAccess && !sessionId) {
          if (!cancelled) {
            setSelectedDomainGazeEnabled(domain?.gazeWakeEnabled ?? true);
            setSelectedDomainLabel(domain?.label || config('injection_default_domain_label') || 'デフォルト');
            setSelectedDomainChronicleAttached(Boolean(domain?.chronicleAttached));
            setAttachedPackDetails({
              mcpServers: domain?.mcpServerIds ?? [],
              knowledges: domain?.knowledgeIds ?? [],
              isReachable: true,
            });
          }
          return;
        }

        const attached = await getServerAttachedPackDetails(sessionId, selectedDomainId);
        const nextGazeEnabled = domain?.gazeWakeEnabled ?? true;
        const nextDomainLabel = domain?.label || config('injection_default_domain_label') || 'デフォルト';
        const nextChronicleAttached = Boolean(domain?.chronicleAttached);
        const fallbackMcp = domain?.mcpServerIds ?? [];
        const fallbackKnowledge = domain?.knowledgeIds ?? [];
        const nextMcp = attached.mcpServers.length > 0
          ? attached.mcpServers.map((item) => item.name || item.id)
          : fallbackMcp;
        const nextKnowledge = attached.knowledges.length > 0
          ? attached.knowledges.map((item) => item.name || item.id)
          : fallbackKnowledge;

        if (!cancelled) {
          if (attached.errorCode === 'DOMAIN_AUTH_REQUIRED') {
            clearDomainAccessSession(selectedDomainId);
            setDomainAccessPromptNonce((prev) => prev + 1);
          }
          setSelectedDomainGazeEnabled(nextGazeEnabled);
          setSelectedDomainLabel(nextDomainLabel);
          setSelectedDomainChronicleAttached(nextChronicleAttached);
          setAttachedPackDetails({
            mcpServers: nextMcp,
            knowledges: nextKnowledge,
            isReachable: attached.isReachable,
          });
        }
      } catch {
        if (!cancelled) {
          setSelectedDomainGazeEnabled(true);
          setSelectedDomainLabel(config('injection_default_domain_label') || 'デフォルト');
          setSelectedDomainChronicleAttached(false);
          setAttachedPackDetails(prev => ({ ...prev, isReachable: false }));
        }
      }
    };

    void refreshAttachedPackDetails();
    const timerId = window.setInterval(() => {
      void refreshAttachedPackDetails();
    }, 5000);

    window.addEventListener('focus', refreshAttachedPackDetails);

    return () => {
      cancelled = true;
      window.clearInterval(timerId);
      window.removeEventListener('focus', refreshAttachedPackDetails);
    };
  }, [domainAuthDialogOpen, launcherEntered, selectedDomainId, showContent]);

  const hasConfiguredVrm = config("vrm_enabled") === "true" && config("vrm_url").trim() !== "";
  const hasConfiguredImageAvatar =
    config("image_avatar_idle_url").trim() !== "" || config("image_avatar_talk_url").trim() !== "";

  useEffect(() => {
    if (launcherStartingDomainId) {
      return;
    }

    if (avatarDisplayState !== 'loading') {
      return;
    }

    if (hasConfiguredVrm || hasConfiguredImageAvatar) {
      return;
    }

    const timerId = window.setTimeout(() => {
      setAvatarDisplayState('ready');
    }, 300);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [avatarDisplayState, hasConfiguredImageAvatar, hasConfiguredVrm, launcherStartingDomainId]);

  if (!showContent) return <></>;

  if (launcherEnabled && !launcherEntered) {
    return (
      <div className={clsx(m_plus_2.variable, montserrat.variable)}>
        <DomainLauncher
          selectedDomainId={selectedDomainId}
          startingDomainId={launcherStartingDomainId}
          onEnter={(domainId) => {
            void enterDomainFromLauncher(domainId);
          }}
        />
      </div>
    );
  }

  if (sessionBlocked) {
    const domainId = selectedDomainId || config('injection_default_domain') || 'default';
    return (
      <WaitingScreen
        domainId={domainId}
        onAcquired={(sessionId) => {
          sessionManager.start(sessionId, domainId);
          setSessionBlocked(false);
        }}
        onSelectDomain={(nextDomainId) => {
          if (typeof window !== 'undefined') {
            localStorage.setItem('amica_selected_domain_id', nextDomainId);
            window.dispatchEvent(new CustomEvent('amica:domain-changed', { detail: { domainId: nextDomainId } }));
          }
          setSessionBlocked(false);
        }}
        onDismiss={() => setSessionBlocked(false)}
      />
    );
  }

  const showDefaultArkCoreAvatar =
    (!hasConfiguredImageAvatar || avatarDisplayState === 'error') &&
    (!hasConfiguredVrm || vrmDisplayState !== 'ready');
  const isMcpRecentlyTriggered = Boolean(lastMcpTrigger);
  const isInterceptRecentlyTriggered = Boolean(lastInterceptAt);
  const isMcpChecking = chatProcessing && config('injection_tool_enabled')?.toLowerCase() === 'true';
  const activeMcpServerKey = (lastMcpTrigger?.serverId || '').trim().toLowerCase();
  const activeMcpToolName = (lastMcpTrigger?.toolName || '').trim();
  const isActiveMcpServerName = (name: string) => {
    const normalized = name.trim().toLowerCase();
    if (!activeMcpServerKey || !normalized) {
      return false;
    }

    return normalized.includes(activeMcpServerKey) || activeMcpServerKey.includes(normalized);
  };
  const activeMcpDisplayName = (() => {
    if (!activeMcpServerKey) {
      return '';
    }

    const matched = attachedPackDetails.mcpServers.find((name) => isActiveMcpServerName(name));
    return matched || lastMcpTrigger?.serverId || '';
  })();
  const showAvatarLoadingScreen =
    launcherStartingDomainId !== null ||
    (hasConfiguredVrm ? vrmDisplayState === 'loading' : avatarDisplayState === 'loading');
  const hasConfiguredBackgroundColor = resolveCustomBackgroundColor(config("bg_color")) !== '';
  const showDefaultArkCoreBackground =
    config("bg_url").trim() === '' &&
    !hasConfiguredBackgroundColor;

  return (
    <div className={clsx(
      m_plus_2.variable,
      montserrat.variable,
    )}>
      <DefaultArkCoreBackground visible={showDefaultArkCoreBackground} />
      {showStreamWindow && 

      <div className="fixed top-1/3 right-4 w-[200px] h-[150px] z-0">
        <video
          ref={videoRef} 
          autoPlay
          muted
          playsInline
          className="w-full h-full object-cover rounded-lg shadow-lg outline outline-2 outline-red-500"
        />
      </div> }

      { config("youtube_videoid") !== '' && (
        <div className="fixed video-container w-full h-full z-0">
          <iframe
            className="w-full h-full"
            src={`https://www.youtube.com/embed/${config("youtube_videoid")}?&autoplay=1&mute=1&playsinline=1&loop=1&controls=0&disablekb=1&fs=0&playlist=${config("youtube_videoid")}`}
            frameBorder="0"></iframe>
        </div>
      )}

      <Introduction open={config("show_introduction") === 'true'} />
      <ArbiusIntroduction open={showArbiusIntroduction} close={() => setShowArbiusIntroduction(false)} />

      <LoadingProgress />

      { webcamEnabled && <EmbeddedWebcam setWebcamEnabled={setWebcamEnabled} /> }
      { showDebug && <DebugPane onClickClose={() => setShowDebug(false) }/> }
      { config("chatbot_backend") === "moshi" && <Moshi setAssistantText={setAssistantMessage}/>  }

      <VrmStoreProvider>
        <DefaultArkCoreAvatar visible={showDefaultArkCoreAvatar} speaking={chatSpeaking} />
        <ImageAvatar speaking={chatSpeaking} />
        <VrmViewer chatMode={showChatMode}/>
        {showSettingsUi && showSettings && (
          <Settings
            onClickClose={() => setShowSettings(false)}
          />
        )}
      </VrmStoreProvider>
      
      <MessageInputContainer
        isChatProcessing={chatProcessing}
        onDomainAccessDialogOpenChange={setDomainAuthDialogOpen}
        domainAccessPromptNonce={domainAccessPromptNonce}
      />

      {showAvatarLoadingScreen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/88 backdrop-blur-md">
          <div className="mx-6 flex w-full max-w-lg flex-col items-center rounded-3xl border border-cyan-400/20 bg-slate-900/85 px-8 py-10 text-center shadow-2xl shadow-cyan-950/40">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/15 border-t-cyan-300" />
            <div className="mt-6 text-xs font-semibold uppercase tracking-[0.35em] text-cyan-300/90">
              AI Startup
            </div>
            <div className="mt-3 text-2xl font-semibold text-white">
              AI を起動しています
            </div>
            <div className="mt-3 max-w-md text-sm leading-6 text-slate-300">
              アバターと会話 UI の準備が完了するまで、そのままお待ちください。
            </div>
            <div className="mt-5 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-slate-300">
              ドメイン: {selectedDomainLabel}
            </div>
          </div>
        </div>
      )}

      <div
        className={clsx(
          "fixed left-2 top-2 z-20 rounded-lg bg-slate-900/80 backdrop-blur-md shadow-lg border border-slate-700/60 overflow-hidden",
          isMobileViewport ? "max-w-[220px]" : "max-w-[320px]"
        )}
      >
        {/* ヘッダーバー */}
        <div
          className={clsx(
            "flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold tracking-wide",
            attachedPackDetails.isReachable
              ? isMcpRecentlyTriggered
                ? "bg-amber-500/35 text-amber-100"
                : isMcpChecking
                  ? "bg-sky-500/30 text-sky-100"
                : isInterceptRecentlyTriggered
                  ? "bg-cyan-500/30 text-cyan-100"
                : "bg-emerald-600/30 text-emerald-300"
              : "bg-red-600/30 text-red-300"
          )}
        >
          <span
            className={clsx(
              "inline-block h-1.5 w-1.5 rounded-full",
              attachedPackDetails.isReachable
                ? isMcpRecentlyTriggered
                  ? "bg-amber-300 animate-pulse"
                  : isMcpChecking
                    ? "bg-sky-300 animate-pulse"
                  : isInterceptRecentlyTriggered
                    ? "bg-cyan-300 animate-pulse"
                  : "bg-emerald-400"
                : "bg-red-400"
            )}
          />
          <span className="min-w-0 flex-1 truncate">
            {!attachedPackDetails.isReachable
              ? "サーバー停止中"
              : isMcpRecentlyTriggered
                ? "接続中 ! MCP実行"
                : isMcpChecking
                  ? "接続中 • MCP確認中"
                : isInterceptRecentlyTriggered
                  ? "接続中 • MCP検出"
                  : "接続中"}
          </span>
          {isMcpRecentlyTriggered && (
            <span className="animate-pulse rounded bg-amber-300/30 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-100">
              !
            </span>
          )}
          {!isMcpRecentlyTriggered && isInterceptRecentlyTriggered && (
            <span className="animate-pulse rounded bg-cyan-300/30 px-1.5 py-0.5 text-[10px] font-extrabold text-cyan-100">
              *
            </span>
          )}
          {!isMcpRecentlyTriggered && !isInterceptRecentlyTriggered && isMcpChecking && (
            <span className="animate-pulse rounded bg-sky-300/30 px-1.5 py-0.5 text-[10px] font-extrabold text-sky-100">
              ...
            </span>
          )}
          {isMobileViewport && (
            <button
              type="button"
              className="-mr-1 inline-flex h-5 w-5 items-center justify-center rounded text-current/90 transition hover:bg-black/10 hover:text-current"
              onClick={() => setIsConnectionIndicatorExpanded((prev) => !prev)}
              aria-label={isConnectionIndicatorExpanded ? '接続情報を折りたたむ' : '接続情報を展開する'}
              aria-expanded={isConnectionIndicatorExpanded}
            >
              {isConnectionIndicatorExpanded ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
            </button>
          )}
        </div>

        {/* コンテンツ */}
        {isConnectionIndicatorExpanded && (
        <div className="px-3 py-2 space-y-2">
          <div className="space-y-1 rounded-md border border-slate-700/50 bg-slate-950/25 px-2 py-2">
            <div className="text-[11px] font-semibold text-white/90">
              ドメイン: <span className="text-white">{selectedDomainLabel}</span>
            </div>
            <div className="text-[10px] text-white/75">
              {selectedDomainChronicleAttached ? 'CHRONICLE接続' : 'CHRONICLE未接続'}
            </div>
            <div className="text-[10px] leading-relaxed text-white/75">
              STT: {currentSTTLabel} | TTS: {currentTTSLabel}
            </div>
            <div className="text-[10px] leading-relaxed text-white/75 break-all">
              AI: {currentChatbotLabel}{currentAIModel ? ` (${currentAIModel})` : ''}
            </div>
            {isMcpRecentlyTriggered && (
              <div className="text-[10px] font-semibold leading-relaxed text-amber-200/95 break-all">
                MCP発火: {lastMcpTrigger?.toolName || 'tool unknown'}
                {lastMcpTrigger?.serverId ? ` @ ${lastMcpTrigger.serverId}` : ''}
              </div>
            )}
          </div>

          {/* MCP セクション */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
              MCP
            </div>
            {isMcpRecentlyTriggered && (activeMcpDisplayName || activeMcpToolName) && (
              <div className="mb-1 rounded border border-amber-300/30 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-100">
                実行: {activeMcpDisplayName || '不明なMCP'}{activeMcpToolName ? ` / ${activeMcpToolName}` : ''}
              </div>
            )}
            {attachedPackDetails.mcpServers.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {attachedPackDetails.mcpServers.map((name) => (
                  <span
                    key={name}
                    className={clsx(
                      "inline-block rounded px-1.5 py-0.5 text-[11px] font-medium leading-tight",
                      isMcpRecentlyTriggered && isActiveMcpServerName(name)
                        ? "animate-pulse border border-amber-300/50 bg-amber-400/25 text-amber-100"
                        :
                      attachedPackDetails.isReachable
                        ? "bg-emerald-500/20 text-emerald-200"
                        : "bg-red-500/20 text-red-200"
                    )}
                  >
                    {name}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-[11px] text-slate-500 italic">なし</span>
            )}
          </div>

          {/* ナレッジ セクション */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
              ナレッジ
            </div>
            {attachedPackDetails.knowledges.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {attachedPackDetails.knowledges.map((name) => (
                  <span
                    key={name}
                    className={clsx(
                      "inline-block rounded px-1.5 py-0.5 text-[11px] font-medium leading-tight",
                      attachedPackDetails.isReachable
                        ? "bg-emerald-500/20 text-emerald-200"
                        : "bg-red-500/20 text-red-200"
                    )}
                  >
                    {name}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-[11px] text-slate-500 italic">なし</span>
            )}
          </div>
        </div>
        )}
      </div>

      {/* main menu */}
      <div
        className={clsx(
          "fixed right-2 top-2 z-20",
          domainAuthDialogOpen && "pointer-events-none opacity-0"
        )}
        ref={mainMenuRef}
        aria-hidden={domainAuthDialogOpen}
      >
        {showSettingsUi && (
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-900/70 text-white backdrop-blur-md hover:bg-slate-800/80"
            onClick={() => setShowMainMenu((prev) => !prev)}
            aria-label="メニューを開閉"
            aria-expanded={showMainMenu}
          >
            {showMainMenu ? <XMarkIcon className="h-6 w-6" /> : <Bars3Icon className="h-6 w-6" />}
          </button>
        )}

        {selectedDomainGazeEnabled && (
          <button
            type="button"
            className="mt-1 flex h-8 w-10 items-center justify-center rounded-md bg-slate-900/60 text-white backdrop-blur-md hover:bg-slate-800/80"
            title="視線キャリブレーション"
            aria-label="視線キャリブレーション"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('amica:gaze-calibrate'));
              }
            }}
          >
            👀
          </button>
        )}

        {launcherEnabled && (
          <button
            type="button"
            className={clsx(
              "mt-1 flex h-8 w-10 items-center justify-center rounded-md text-white backdrop-blur-md",
              launcherEntered
                ? "bg-slate-900/60 hover:bg-slate-800/80"
                : "bg-sky-700/70 hover:bg-sky-600/80"
            )}
            title="ランチャーへ戻る"
            aria-label="ランチャーへ戻る"
            onClick={() => setLauncherEntered(false)}
          >
            <AcademicCapIcon className="h-5 w-5" />
          </button>
        )}

        {!isMobileViewport && (
          <button
            type="button"
            className={clsx(
              "mt-1 flex h-8 w-10 items-center justify-center rounded-md text-white backdrop-blur-md",
              showChatMode
                ? "bg-emerald-700/70 hover:bg-emerald-600/80"
                : "bg-slate-900/60 hover:bg-slate-800/80"
            )}
            title={showChatMode ? "チャットモードをオフ" : "チャットモードをオン"}
            aria-label={showChatMode ? "チャットモードをオフ" : "チャットモードをオン"}
            aria-pressed={showChatMode}
            onClick={toggleChatMode}
          >
            {showChatMode ? <Squares2X2Icon className="h-5 w-5" /> : <SquaresPlusIcon className="h-5 w-5" />}
          </button>
        )}

        {isMobileViewport && (
          <button
            type="button"
            className={clsx(
              "mt-1 flex h-8 w-10 items-center justify-center rounded-md text-white backdrop-blur-md",
              showCompactMobileChatCard
                ? "bg-emerald-700/70 hover:bg-emerald-600/80"
                : "bg-slate-900/60 hover:bg-slate-800/80"
            )}
            title={showCompactMobileChatCard ? "対話優先表示をオフ" : "対話優先表示をオン"}
            aria-label={showCompactMobileChatCard ? "対話優先表示をオフ" : "対話優先表示をオン"}
            aria-pressed={showCompactMobileChatCard}
            onClick={toggleCompactMobileChatCard}
          >
            {showCompactMobileChatCard ? <ChatBubbleLeftRightIcon className="h-5 w-5" /> : <ChatBubbleLeftIcon className="h-5 w-5" />}
          </button>
        )}

        <button
          type="button"
          className={clsx(
            "mt-1 flex h-8 w-10 items-center justify-center rounded-md text-white backdrop-blur-md",
            showHistory
              ? "bg-cyan-700/70 hover:bg-cyan-600/80"
              : "bg-slate-900/60 hover:bg-slate-800/80"
          )}
          title={showHistory ? "履歴を閉じる" : "履歴を開く"}
          aria-label={showHistory ? "履歴を閉じる" : "履歴を開く"}
          aria-pressed={showHistory}
          onClick={toggleHistory}
        >
          <ClockIcon className="h-5 w-5" />
        </button>

        {muted !== null && (
          <button
            type="button"
            className={clsx(
              "mt-1 flex h-8 w-10 items-center justify-center rounded-md text-white backdrop-blur-md",
              muted
                ? "bg-amber-700/70 hover:bg-amber-600/80"
                : "bg-slate-900/60 hover:bg-slate-800/80"
            )}
            title={muted ? "ミュートを解除" : "ミュートにする"}
            aria-label={muted ? "ミュートを解除" : "ミュートにする"}
            aria-pressed={muted}
            onClick={toggleTTSMute}
          >
            {muted ? <SpeakerXMarkIcon className="h-5 w-5" /> : <SpeakerWaveIcon className="h-5 w-5" />}
          </button>
        )}

        <button
          type="button"
          className={clsx(
            "mt-1 flex h-8 w-10 items-center justify-center rounded-md text-white backdrop-blur-md",
            informationView
              ? "bg-violet-700/70 hover:bg-violet-600/80"
              : "bg-slate-900/60 hover:bg-slate-800/80"
          )}
          title={informationView ? "インフォメーションを閉じる" : "インフォメーションを開く"}
          aria-label={informationView ? "インフォメーションを閉じる" : "インフォメーションを開く"}
          aria-pressed={Boolean(informationView)}
          onClick={() => {
            setShowMainMenu(false);
            setInformationView((prev) => (prev ? null : 'menu'));
          }}
        >
          <InformationCircleIcon className="h-5 w-5" />
        </button>

        {showMainMenu && (
        <div className="grid grid-flow-col gap-[8px] place-content-end mt-2 bg-slate-800/40 rounded-md backdrop-blur-md shadow-sm">
          <div className='flex flex-col justify-center items-center p-1 space-y-3'>
            {showSettingsUi && (
              <MenuButton
                large={isVRHeadset}
                icon={WrenchScrewdriverIcon}
                onClick={() => setShowSettings(true)}
                label="show settings"
              />
            )}

            {showChatLog ? (
              <MenuButton
                large={isVRHeadset}
                icon={ChatBubbleLeftIcon}
                onClick={toggleChatLog}
                label="hide chat log"
              />
            ) : (
              <MenuButton
                large={isVRHeadset}
                icon={ChatBubbleLeftRightIcon}
                onClick={toggleChatLog}
                label="show chat log"
              />
            )}

            { muted ? (
              <MenuButton
                large={isVRHeadset}
                icon={SpeakerXMarkIcon}
                onClick={toggleTTSMute}
                label="unmute"
              />
            ) : (
              <MenuButton
                large={isVRHeadset}
                icon={SpeakerWaveIcon}
                onClick={toggleTTSMute}
                label="mute"
              />
            )}

            { webcamEnabled ? (
              <MenuButton
                large={isVRHeadset}
                icon={VideoCameraIcon}
                onClick={() => setWebcamEnabled(false)}
                label="disable webcam"
              />
            ) : (
              <MenuButton
                large={isVRHeadset}
                icon={VideoCameraSlashIcon}
                onClick={() => setWebcamEnabled(true)}
                label="enable webcam"
              />
            )}

            {showSettingsUi && (
              <MenuButton
                large={isVRHeadset}
                icon={ShareIcon}
                href="/share"
                target={isTauri() ? '' : '_blank'}
                label="share"
              />
            )}
            {showSettingsUi && (
              <MenuButton
                large={isVRHeadset}
                icon={CloudArrowDownIcon}
                href="/import"
                label="import"
              />
            )}

            { showSubconciousText ? (
              <MenuButton
                large={isVRHeadset}
                icon={IconBrain}
                onClick={toggleShowSubconciousText}
                label="hide subconscious"
              />
            ) : (
              <MenuButton
                large={isVRHeadset}
                icon={IconBrain}
                onClick={toggleShowSubconciousText}
                label="show subconscious"
              />
            )}

            {/* Temp Disable : WebXR */}
            {/*<MenuButton
              large={isVRHeadset}
              icon={CubeTransparentIcon}
              disabled={!isARSupported}
              onClick={() => toggleXR('immersive-ar')}
              label="Augmented Reality"
            />

            <MenuButton
              large={isVRHeadset}
              icon={CubeIcon}
              disabled={!isVRSupported}
              onClick={() => toggleXR('immersive-vr')}
              label="Virtual Reality"
            />*/}

            {showSettingsUi && (
              <MenuButton
                large={isVRHeadset}
                icon={CodeBracketSquareIcon}
                onClick={() => setShowDebug(true)}
                label="debug"
              />
            )}

            {/* Temp Disable : WebXR */}
            {/* { showChatMode ? (
              <MenuButton
                large={isVRHeadset}
                icon={Squares2X2Icon}
                disabled={viewer.currentSession !== null}
                onClick={toggleChatMode}
                label="hide chat mode"
              />
            ) : (
              <MenuButton
                large={isVRHeadset}
                icon={SquaresPlusIcon}
                disabled={viewer.currentSession !== null}
                onClick={toggleChatMode}
                label="show chat mode"
              />
            )} */}

            <div className="flex flex-row items-center space-x-2">
              { showStreamWindow ? (
                <SignalIcon
                  className="h-7 w-7 text-white opacity-100 hover:opacity-50 active:opacity-100 hover:cursor-pointer"
                  aria-hidden="true"
                  onClick={() => setShowStreamWindow(false)}
                />
              ) : (
                <SignalIcon
                  className="h-7 w-7 text-white opacity-50 hover:opacity-100 active:opacity-100 hover:cursor-pointer"
                  aria-hidden="true"
                  onClick={() => setShowStreamWindow(true)}
                />
              )}
            </div>
            
          </div>
        </div>
        )}
      </div>

      {showChatLog && <ChatLog key={`chat-log-${domainDisplayVersion}`} messages={chatLog} />}

      {/* Normal chat text */}
      {!showSubconciousText && ! showChatLog && ! showChatMode && (
        <>
          { shownMessage === 'assistant' && (
            <AssistantText
              key={`assistant-${domainDisplayVersion}`}
              message={assistantMessage}
              dbResult={assistantDbResult}
              compact={isMobileViewport && showCompactMobileChatCard}
            />
          )}
          { shownMessage === 'user' && (
            <UserText message={userMessage} compact={isMobileViewport && showCompactMobileChatCard} />
          )}
        </>
      )}

      {/* Thought text */}
      {thoughtMessage !== "" && <ThoughtText key={`thought-${domainDisplayVersion}`} message={thoughtMessage}/>}

      {/* Chat mode text */}
      {showChatMode && <ChatModeText key={`chat-mode-${domainDisplayVersion}`} messages={chatLog}/>}

      {showHistory && !domainAuthDialogOpen && <HistoryPanel open={showHistory} onClose={() => setShowHistory(false)} />}

      {informationView && !domainAuthDialogOpen ? (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/82 px-4 py-6 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label="インフォメーション"
          onClick={() => setInformationView(null)}
        >
          <div
            className="flex max-h-[min(80vh,720px)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-700/70 bg-slate-900/95 shadow-2xl shadow-slate-950/50"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-6 py-5">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300/85">
                  {informationView === 'menu' ? 'Information' : informationView === 'license' ? 'Open Source Notices' : INFORMATION_COPY[informationView].eyebrow}
                </div>
                <h2 className="mt-2 text-xl font-semibold text-white">
                  {informationView === 'menu' ? 'インフォメーション' : informationView === 'license' ? 'ライセンス情報' : INFORMATION_COPY[informationView].title}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                  {informationView === 'menu'
                    ? 'ご利用前に確認できる情報をまとめています。項目を選ぶと詳細を表示します。'
                    : informationView === 'license'
                      ? '本システムでは、配布物に表示が必要な主要なオープンソースソフトウェア、音声モデル、およびフォントのライセンス情報を以下に記載しています。各ソフトウェアおよびモデルは、それぞれのライセンス条件に従って提供されています。'
                      : informationView === 'about'
                        ? '本システムの概要について記載します。'
                        : INFORMATION_COPY[informationView].description}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {informationView !== 'menu' ? (
                  <button
                    type="button"
                    className="inline-flex h-10 items-center gap-2 rounded-full bg-slate-800 px-4 text-sm font-medium text-slate-200 hover:bg-slate-700"
                    onClick={() => setInformationView('menu')}
                  >
                    <ChevronLeftIcon className="h-4 w-4" />
                    戻る
                  </button>
                ) : null}
                <button
                  type="button"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800 text-slate-200 hover:bg-slate-700"
                  onClick={() => setInformationView(null)}
                  aria-label="インフォメーションを閉じる"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto px-6 py-5">
              {informationView === 'menu' ? (
                <div className="grid gap-3">
                  {INFORMATION_MENU_ITEMS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleInformationMenuSelect(item.id)}
                      disabled={
                        (item.id === 'terms' && !termsOfUseUrl) ||
                        (item.id === 'privacy' && !privacyPolicyUrl)
                      }
                      className={clsx(
                        "rounded-2xl border px-5 py-4 text-left transition",
                        (item.id === 'terms' && !termsOfUseUrl) || (item.id === 'privacy' && !privacyPolicyUrl)
                          ? "cursor-not-allowed border-slate-800 bg-slate-950/30 text-slate-500"
                          : "border-slate-800 bg-slate-950/45 hover:border-cyan-400/30 hover:bg-slate-900/70"
                      )}
                    >
                      <div className={clsx("text-base font-semibold", ((item.id === 'terms' && !termsOfUseUrl) || (item.id === 'privacy' && !privacyPolicyUrl)) ? "text-slate-400" : "text-white")}>
                        {item.title}
                      </div>
                      <p className={clsx("mt-2 text-sm leading-6", ((item.id === 'terms' && !termsOfUseUrl) || (item.id === 'privacy' && !privacyPolicyUrl)) ? "text-slate-500" : "text-slate-300")}>
                        {item.id === 'terms'
                          ? termsOfUseUrl
                            ? `設定URLを開きます: ${termsOfUseUrl}`
                            : '公開設定で URL を指定すると開けます。'
                          : item.id === 'privacy'
                            ? privacyPolicyUrl
                              ? `設定URLを開きます: ${privacyPolicyUrl}`
                              : '公開設定で URL を指定すると開けます。'
                            : item.summary}
                      </p>
                    </button>
                  ))}
                </div>
              ) : informationView === 'license' ? (
                <>
                  <div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/5 px-4 py-3 text-sm leading-6 text-slate-200">
                    <div className="font-semibold text-cyan-200">表示対象</div>
                    <p className="mt-1">
                      Amica 本体、UI・描画・ランタイムに直接組み込まれている主要ライブラリ、音声合成エンジン、音声モデル、および配布フォントを掲載しています。
                    </p>
                  </div>

                  <div className="mt-5 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/85">
                    フロントエンド・ランタイム
                  </div>
                  <div className="mt-3 grid gap-3">
                    {LICENSE_NOTICES.map((notice) => (
                      <div
                        key={`${notice.name}-${notice.license}`}
                        className="rounded-2xl border border-slate-800 bg-slate-950/45 px-4 py-4"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-base font-semibold text-white">{notice.name}</div>
                          <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-200">
                            {notice.license}
                          </span>
                        </div>
                        {'copyright' in notice && notice.copyright ? (
                          <div className="mt-2 text-sm leading-6 text-slate-300">{notice.copyright}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/85">
                    フォント
                  </div>
                  <div className="mt-3 grid gap-3">
                    {FONT_LICENSE_NOTICES.map((notice) => (
                      <div
                        key={`${notice.name}-${notice.license}`}
                        className="rounded-2xl border border-slate-800 bg-slate-950/45 px-4 py-4"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-base font-semibold text-white">{notice.name}</div>
                          <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-200">
                            {notice.license}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/45 px-4 py-4 text-sm leading-6 text-slate-300">
                    <div className="font-semibold text-white">Ark-i OSSライセンス情報（音声関連）</div>

                    <div className="mt-4 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/85">
                      音声合成エンジン
                    </div>
                    <div className="mt-3 grid gap-3">
                      {AUDIO_LICENSE_SECTIONS.engines.map((engine) => (
                        <div
                          key={`${engine.name}-${engine.license}`}
                          className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-4"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-base font-semibold text-white">{engine.name}</div>
                            <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-200">
                              {engine.license}
                            </span>
                          </div>
                          <div className="mt-2 text-sm leading-6 text-slate-300">{engine.description}</div>
                          <a
                            href={engine.url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex text-sm text-cyan-300 underline underline-offset-4 hover:text-cyan-200"
                          >
                            {engine.url}
                          </a>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/85">
                      音声モデル
                    </div>
                    <div className="mt-3 grid gap-3">
                      {AUDIO_LICENSE_SECTIONS.models.map((model) => (
                        <div
                          key={model.name}
                          className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-4"
                        >
                          <div className="text-base font-semibold text-white">{model.name}</div>
                          {'license' in model && model.license ? (
                            <div className="mt-2">
                              <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-200">
                                {model.license}
                              </span>
                            </div>
                          ) : null}
                          {model.copyright ? (
                            <div className="mt-2 text-sm leading-6 text-slate-300">{model.copyright}</div>
                          ) : null}
                          <div className="mt-2 text-sm leading-6 text-slate-300">{model.description}</div>
                          {'provider' in model && model.provider ? (
                            <div className="mt-2 text-sm leading-6 text-slate-300">{model.provider}</div>
                          ) : null}
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-4">
                      <div className="font-semibold text-white">利用条件</div>
                      <p className="mt-2 text-sm leading-6 text-slate-300">
                        {AUDIO_LICENSE_SECTIONS.usage}
                      </p>
                    </div>

                    <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-4">
                      <div className="font-semibold text-white">謝辞</div>
                      <p className="mt-2 text-sm leading-6 text-slate-300">
                        {AUDIO_LICENSE_SECTIONS.acknowledgment}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/45 px-4 py-4 text-sm leading-6 text-slate-300">
                    <div className="font-semibold text-white">補足</div>
                    <p className="mt-2">
                      上記以外の依存パッケージについても、それぞれのライセンス条件に従います。
                    </p>
                    <p className="mt-2">
                      詳細については、配布物に同梱されたライセンス文書、パッケージメタデータ、および各プロジェクトの公式サイトをご参照ください。
                    </p>
                  </div>
                </>
              ) : (
                <div className="grid gap-4">
                  {INFORMATION_COPY[informationView].sections.map((section) => (
                    <section
                      key={section.heading}
                      className="rounded-2xl border border-slate-800 bg-slate-950/45 px-4 py-4"
                    >
                      <h3 className="text-base font-semibold text-white">{section.heading}</h3>
                      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-300">{section.body}</p>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {domainAuthDialogOpen ? <div className="fixed inset-0 z-[110] bg-slate-950" aria-hidden="true" /> : null}

      {/* Subconcious stored prompt text */}
      {showSubconciousText && <SubconciousText messages={subconciousLogs}/>}

      <AddToHomescreen />

      <Alert />
    </div>
  );
}