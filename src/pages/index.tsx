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
  ChevronDownIcon,
  ChevronUpIcon,
  ClockIcon,
  CloudArrowDownIcon,
  CodeBracketSquareIcon,
  CubeIcon,
  CubeTransparentIcon,
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

import { CONFIG_UPDATED_EVENT, config, updateConfig } from '@/utils/config';
import { isTauri } from '@/utils/isTauri';
import { langs } from '@/i18n/langs';
import { VrmStoreProvider } from "@/features/vrmStore/vrmStoreContext";
import { AmicaLifeContext } from "@/features/amicaLife/amicaLifeContext";
import { ChatModeText } from "@/components/chatModeText";
import { HistoryPanel } from "@/components/historyPanel";
import { ImageAvatar } from "@/components/imageAvatar";
import { DefaultArkCoreBackground } from "@/components/defaultArkCoreBackground";
import { DefaultArkCoreAvatar } from "@/components/defaultArkCoreAvatar";

import { TimestampedPrompt } from "@/features/amicaLife/eventHandler";
import { handleChatLogs } from "@/features/externalAPI/externalAPI";
import { chatHistoryStore, mapMessagesToHistoryEntries } from "@/features/chatHistory/chatHistoryStore";
import { ThoughtText } from "@/components/thoughtText";
import { WaitingScreen } from "@/components/waitingScreen";
import { acquireSession, sessionManager } from "@/lib/sessionManager";
import { fetchPublicDomainOptions, getServerAttachedPackDetails, syncServerChatHistory } from "@/lib/injectionClient";
import { getPersistentUserId } from "@/lib/userIdentity";
import { clearDomainAccessSession } from '@/lib/domainAccessSession';

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
  const [showHistory, setShowHistory] = useState(false);
  const [showSubconciousText, setShowSubconciousText] = useState(false);
  const [showMainMenu, setShowMainMenu] = useState(false);

  useEffect(() => {
    void updateConfig("show_chat_mode", showChatMode ? "true" : "false");
  }, [showChatMode]);
  const [showMoshi, setShowMoshi] = useState(false);
  const mainMenuRef = useRef<HTMLDivElement>(null);
  const [selectedDomainId, setSelectedDomainId] = useState(() => config('injection_default_domain') || 'default');
  const [selectedDomainGazeEnabled, setSelectedDomainGazeEnabled] = useState(true);
  const [selectedDomainLabel, setSelectedDomainLabel] = useState(() => config('injection_default_domain_label') || 'デフォルト');
  const [selectedDomainChronicleAttached, setSelectedDomainChronicleAttached] = useState(false);
  const [domainDisplayVersion, setDomainDisplayVersion] = useState(0);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isConnectionIndicatorExpanded, setIsConnectionIndicatorExpanded] = useState(true);

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
  const currentTTSBackend = config('tts_backend');
  const currentChatbotBackend = config('chatbot_backend');
  const currentSTTLabel = sttBackendLabels[currentSTTBackend] ?? currentSTTBackend;
  const currentTTSLabel = ttsBackendLabels[currentTTSBackend] ?? currentTTSBackend;
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
    amicaLife.checkSettingOff(!showSettings);
  }, [showSettings, amicaLife]);

  useEffect(() => {
    if (muted === null) {
      setMuted(config('tts_muted') === 'true');
    }

    setShowArbiusIntroduction(config("show_arbius_introduction") === 'true');

    const applyInitialBackground = async () => {
      const bgColor = config("bg_color");
      const bgUrl = config("bg_url");

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
    toggleState(setShowChatMode, [setShowChatLog, setShowSubconciousText, setShowHistory]);
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
    void chatHistoryStore.upsertMessages(
      chatLog,
      sessionManager.getSessionId() || undefined,
      getPersistentUserId(),
    );
  }, [chatLog]);

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

    const syncSelectedDomain = (domainId?: string) => {
      setSelectedDomainId(domainId || localStorage.getItem('amica_selected_domain_id') || config('injection_default_domain') || 'default');
      setDomainDisplayVersion((prev) => prev + 1);
    };

    syncSelectedDomain();

    const handleDomainChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ domainId?: string }>;
      syncSelectedDomain(customEvent.detail?.domainId);
    };

    window.addEventListener('amica:domain-changed', handleDomainChanged as EventListener);

    return () => {
      window.removeEventListener('amica:domain-changed', handleDomainChanged as EventListener);
    };
  }, []);

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

      if (updatedKeys.some((key) => ['name', 'theme_color', 'bg_url', 'bg_color', 'vrm_enabled', 'vrm_url', 'image_avatar_idle_url', 'image_avatar_talk_url'].includes(key))) {
        setDomainDisplayVersion((prev) => prev + 1);
      }
    };

    window.addEventListener(CONFIG_UPDATED_EVENT, handleConfigUpdated as EventListener);

    return () => {
      window.removeEventListener(CONFIG_UPDATED_EVENT, handleConfigUpdated as EventListener);
    };
  }, []);

  // 同時接続数制限: injection-tool が有効なときのみセッションを取得
  useEffect(() => {
    if (!showContent) return;
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
  }, [selectedDomainId, showContent]);

  useEffect(() => {
    if (!showContent) return;

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
        const [attached, domains] = await Promise.all([
          getServerAttachedPackDetails(sessionId, selectedDomainId),
          fetchPublicDomainOptions(),
        ]);
        const domain = domains.find((item) => item.id === selectedDomainId);
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
  }, [selectedDomainId, showContent]);

  if (!showContent) return <></>;

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

  const hasConfiguredVrm = config("vrm_enabled") === "true" && config("vrm_url").trim() !== "";
  const hasConfiguredImageAvatar =
    config("image_avatar_idle_url").trim() !== "" || config("image_avatar_talk_url").trim() !== "";
  const showDefaultArkCoreAvatar = !hasConfiguredVrm && !hasConfiguredImageAvatar;
  const showDefaultArkCoreBackground =
    config("bg_url") === '' &&
    config("bg_color") === '' &&
    config("vrm_enabled") !== "true";

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
        {showSettings && (
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
              ? "bg-emerald-600/30 text-emerald-300"
              : "bg-red-600/30 text-red-300"
          )}
        >
          <span
            className={clsx(
              "inline-block h-1.5 w-1.5 rounded-full",
              attachedPackDetails.isReachable
                ? "bg-emerald-400"
                : "bg-red-400"
            )}
          />
          <span className="min-w-0 flex-1 truncate">
            {!attachedPackDetails.isReachable ? "サーバー停止中" : "接続中"}
          </span>
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
          </div>

          {/* MCP セクション */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
              MCP
            </div>
            {attachedPackDetails.mcpServers.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {attachedPackDetails.mcpServers.map((name) => (
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
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-900/70 text-white backdrop-blur-md hover:bg-slate-800/80"
          onClick={() => setShowMainMenu((prev) => !prev)}
          aria-label="メニューを開閉"
          aria-expanded={showMainMenu}
        >
          {showMainMenu ? <XMarkIcon className="h-6 w-6" /> : <Bars3Icon className="h-6 w-6" />}
        </button>

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

        {showMainMenu && (
        <div className="grid grid-flow-col gap-[8px] place-content-end mt-2 bg-slate-800/40 rounded-md backdrop-blur-md shadow-sm">
          <div className='flex flex-col justify-center items-center p-1 space-y-3'>
            <MenuButton
              large={isVRHeadset}
              icon={WrenchScrewdriverIcon}
              onClick={() => setShowSettings(true)}
              label="show settings"
            />

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

            <MenuButton
              large={isVRHeadset}
              icon={ShareIcon}
              href="/share"
              target={isTauri() ? '' : '_blank'}
              label="share"
            />
            <MenuButton
              large={isVRHeadset}
              icon={CloudArrowDownIcon}
              href="/import"
              label="import"
            />

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

            <MenuButton
              large={isVRHeadset}
              icon={CodeBracketSquareIcon}
              onClick={() => setShowDebug(true)}
              label="debug"
            />

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
            <AssistantText key={`assistant-${domainDisplayVersion}`} message={assistantMessage} dbResult={assistantDbResult} />
          )}
          { shownMessage === 'user' && (
            <UserText message={userMessage} />
          )}
        </>
      )}

      {/* Thought text */}
      {thoughtMessage !== "" && <ThoughtText key={`thought-${domainDisplayVersion}`} message={thoughtMessage}/>}

      {/* Chat mode text */}
      {showChatMode && <ChatModeText key={`chat-mode-${domainDisplayVersion}`} messages={chatLog}/>}

      {showHistory && !domainAuthDialogOpen && <HistoryPanel open={showHistory} onClose={() => setShowHistory(false)} />}

      {domainAuthDialogOpen ? <div className="fixed inset-0 z-[110] bg-slate-950" aria-hidden="true" /> : null}

      {/* Subconcious stored prompt text */}
      {showSubconciousText && <SubconciousText messages={subconciousLogs}/>}

      <AddToHomescreen />

      <Alert />
    </div>
  );
}