import { handleConfig, serverConfig } from "@/features/externalAPI/externalAPI";

export const defaults = {
  // --- AllTalk TTS (ローカル実行可能な高品質TTS) 設定 ---
  localXTTS_url: process.env.NEXT_PUBLIC_LOCALXTTS_URL ?? 'http://127.0.0.1:7851', // AllTalkサーバーのURL
  alltalk_version: process.env.NEXT_PUBLIC_ALLTALK_VERSION ?? 'v2',              // AllTalkのバージョン
  alltalk_voice: process.env.NEXT_PUBLIC_ALLTALK_VOICE ?? 'female_01.wav',       // 使用する音声サンプル
  alltalk_language: process.env.NEXT_PUBLIC_ALLTALK_LANGUAGE ?? 'en',            // 読み上げ言語
  alltalk_rvc_voice: process.env.NEXT_PUBLIC_ALLTALK_RVC_VOICE ?? 'Disabled',    // RVC(音声変換)の有効化設定
  alltalk_rvc_pitch: process.env.NEXT_PUBLIC_ALLTALK_RVC_PITCH ?? '0',           // RVCのピッチ調整

  // --- 音声入力 (STT)・操作設定 ---
  autosend_from_mic: 'true',       // 音声認識後、自動でチャット送信するか
  wake_word_enabled: 'false',      // ウェイクワード（起動句）を有効にするか
  wake_word: 'Hello',              // 起動させるための言葉
  time_before_idle_sec: '20',      // 放置状態(Idle)と判定するまでの秒数

  // --- グラフィックス・描画設定 ---
  debug_gfx: 'false',              // グラフィック関連のデバッグ情報を表示するか
  use_webgpu: 'false',             // WebGPU（次世代描画規格）を使用するか
  mtoon_debug_mode: 'none',        // MToonシェーダーのデバッグモード
  mtoon_material_type: 'mtoon',    // キャラクターの質感（シェーダー）設定

  // --- 全般・UI設定 ---
  language: process.env.NEXT_PUBLIC_LANGUAGE ?? 'ja',                              // アプリ全体の言語
  show_introduction: process.env.NEXT_PUBLIC_SHOW_INTRODUCTION ?? 'false',          // 導入ガイドを表示するか
  show_arbius_introduction: process.env.NEXT_PUBLIC_SHOW_ARBIUS_INTRODUCTION ?? 'false', // Arbius関連のガイド表示
  show_add_to_homescreen: process.env.NEXT_PUBLIC_SHOW_ADD_TO_HOMESCREEN ?? 'true', // PWA(ホーム画面追加)の案内
  bg_color: process.env.NEXT_PUBLIC_BG_COLOR ?? '',                                // 背景色
  bg_url: process.env.NEXT_PUBLIC_BG_URL ?? '/bg/bg-room2.jpg',                    // 背景画像のパス
  // vrm_url: process.env.NEXT_PUBLIC_VRM_HASH ?? '/vrm/AvatarSample_A.vrm', 
  vrm_url: process.env.NEXT_PUBLIC_VRM_HASH ?? '/vrm/mirai-yukata.vrm',          // キャラクター(VRM)のパス
  vrm_hash: '1',                                                                    // VRMファイルのハッシュ値
  vrm_save_type: 'web',                                                            // モデルデータの保存方法
  youtube_videoid: '',                                                             // 背景等で流すYouTube動画ID
  animation_url: process.env.NEXT_PUBLIC_ANIMATION_URL ?? '/animations/idle_loop.vrma', // 待機モーションのパス
  animation_procedural: process.env.NEXT_PUBLIC_ANIMATION_PROCEDURAL ?? 'false',   // プロシージャル（自動生成）アニメの有効化
  voice_url: process.env.NEXT_PUBLIC_VOICE_URL ?? '',                              // 外部音声ファイルのURL

  // --- チャットバックエンド (LLM) 設定 ---
  chatbot_backend: process.env.NEXT_PUBLIC_CHATBOT_BACKEND ?? 'ollama',            // 使用するAIエンジン
  arbius_llm_model_id: process.env.NEXT_PUBLIC_ARBIUS_LLM_MODEL_ID ?? 'default',   // Arbius用モデルID
  openai_apikey: process.env.NEXT_PUBLIC_OPENAI_APIKEY ?? 'default',               // OpenAIのAPIキー
  openai_url: process.env.NEXT_PUBLIC_OPENAI_URL ?? 'https://i-love-amica.com',     // APIのベースURL
  openai_model: process.env.NEXT_PUBLIC_OPENAI_MODEL ?? 'mlabonne/NeuralDaredevil-8B-abliterated', // 使用モデル

  // --- 各種ローカルLLM設定 ---
  llamacpp_url: process.env.NEXT_PUBLIC_LLAMACPP_URL ?? 'http://127.0.0.1:8080',   // Llama.cppのURL
  llamacpp_stop_sequence: process.env.NEXT_PUBLIC_LLAMACPP_STOP_SEQUENCE ?? '(End)||[END]||Note||***||You:||User:||</s>', // 停止シーケンス
  ollama_url: process.env.NEXT_PUBLIC_OLLAMA_URL ?? 'http://localhost:11434',       // OllamaのURL
  // ollama_model: process.env.NEXT_PUBLIC_OLLAMA_MODEL ?? 'pakachan/elyza-llama3-8b',      
  ollama_model: process.env.NEXT_PUBLIC_OLLAMA_MODEL ?? 'qwen2.5:7b',                  // Ollamaのモデル名
              // Ollamaのモデル名
  koboldai_url: process.env.NEXT_PUBLIC_KOBOLDAI_URL ?? 'http://localhost:5001',   // KoboldAIのURL
  koboldai_use_extra: process.env.NEXT_PUBLIC_KOBOLDAI_USE_EXTRA ?? 'false',       // KoboldAI拡張設定の使用
  koboldai_stop_sequence: process.env.NEXT_PUBLIC_KOBOLDAI_STOP_SEQUENCE ?? '(End)||[END]||Note||***||You:||User:||</s>',
  moshi_url: process.env.NEXT_PUBLIC_MOSHI_URL ?? 'https://runpod.proxy.net',      // Moshi(リアルタイム音声AI)のURL
  openrouter_apikey: process.env.NEXT_PUBLIC_OPENROUTER_APIKEY ?? '',              // OpenRouterのAPIキー
  openrouter_url: process.env.NEXT_PUBLIC_OPENROUTER_URL ?? 'https://openrouter.ai/api/v1',
  openrouter_model: process.env.NEXT_PUBLIC_OPENROUTER_MODEL ?? 'openai/gpt-3.5-turbo',

  // --- システム基本設定 ---
  tts_muted: 'false',                                                              // 音声出力を最初からミュートにするか
  tts_backend: process.env.NEXT_PUBLIC_TTS_BACKEND ?? 'stylebertvits2',                    // 標準で使用するTTS
  stt_backend: process.env.NEXT_PUBLIC_STT_BACKEND ?? 'whisper_browser',          // 標準で使用する音声認識

  // --- 画像認識 (Vision) 設定 ---
  vision_backend: process.env.NEXT_PUBLIC_VISION_BACKEND ?? 'vision_openai',       // 画像解析エンジン
  vision_system_prompt: process.env.NEXT_PUBLIC_VISION_SYSTEM_PROMPT ?? `Look at the image as you would if you are a human, be concise, witty and charming.`, // 画像解析時のAIへの指示
  vision_openai_apikey: process.env.NEXT_PUBLIC_VISION_OPENAI_APIKEY ?? 'default',
  vision_openai_url: process.env.NEXT_PUBLIC_VISION_OPENAI_URL ?? 'https://api-01.heyamica.com',
  vision_openai_model: process.env.NEXT_PUBLIC_VISION_OPENAI_URL ?? 'gpt-4-vision-preview',
  vision_llamacpp_url: process.env.NEXT_PUBLIC_VISION_LLAMACPP_URL ?? 'http://127.0.0.1:8081',
  vision_ollama_url: process.env.NEXT_PUBLIC_VISION_OLLAMA_URL ?? 'http://localhost:11434',
  vision_ollama_model: process.env.NEXT_PUBLIC_VISION_OLLAMA_MODEL ?? 'llava',

  // --- Whisper (音声認識) 設定 ---
  whispercpp_url: process.env.NEXT_PUBLIC_WHISPERCPP_URL ?? 'http://localhost:8080',
  stt_language: process.env.NEXT_PUBLIC_STT_LANGUAGE ?? 'ja',
  openai_whisper_apikey: process.env.NEXT_PUBLIC_OPENAI_WHISPER_APIKEY ?? '',
  openai_whisper_url: process.env.NEXT_PUBLIC_OPENAI_WHISPER_URL ?? 'https://api.openai.com',
  openai_whisper_model: process.env.NEXT_PUBLIC_OPENAI_WHISPER_MODEL ?? 'whisper-1',

  // --- 各種TTSエンジン (OpenAI, RVC, Coqui, Kokoro等) の詳細設定 ---
  openai_tts_apikey: process.env.NEXT_PUBLIC_OPENAI_TTS_APIKEY ?? '',
  openai_tts_url: process.env.NEXT_PUBLIC_OPENAI_TTS_URL ?? 'https://api.openai.com',
  openai_tts_model: process.env.NEXT_PUBLIC_OPENAI_TTS_MODEL ?? 'tts-1',
  openai_tts_voice: process.env.NEXT_PUBLIC_OPENAI_TTS_VOICE ?? 'nova',
  rvc_url: process.env.NEXT_PUBLIC_RVC_URL ?? 'http://localhost:8001/voice2voice', // RVCサーバーURL
  rvc_enabled: process.env.NEXT_PUBLIC_RVC_ENABLED ?? 'false',
  rvc_model_name: process.env.NEXT_PUBLIC_RVC_MODEL_NAME ?? 'model_name.pth',
  rvc_f0_upkey: process.env.NEXT_PUBLIC_RVC_F0_UPKEY ?? '0',                       // ピッチ変更
  rvc_f0_method: process.env.NEXT_PUBLIC_RVC_METHOD ?? 'pm',                      // ピッチ抽出アルゴリズム
  rvc_index_path: process.env.NEXT_PUBLIC_RVC_INDEX_PATH ?? 'none',
  rvc_index_rate: process.env.NEXT_PUBLIC_RVC_INDEX_RATE ?? '0.66',
  rvc_filter_radius: process.env.NEXT_PUBLIC_RVC_FILTER_RADIUS ?? '3',
  rvc_resample_sr: process.env.NEXT_PUBLIC_RVC_RESAMPLE_SR ?? '0',
  rvc_rms_mix_rate: process.env.NEXT_PUBLIC_RVC_RMS_MIX_RATE ?? '1',
  rvc_protect: process.env.NEXT_PUBLIC_RVC_PROTECT ?? '0.33',
  coquiLocal_url: process.env.NEXT_PUBLIC_COQUILOCAL_URL ?? 'http://127.0.0.1:5000',
  coquiLocal_voiceid: process.env.NEXT_PUBLIC_COQUILOCAL_VOICEID ?? 'p240',
  kokoro_url: process.env.NEXT_PUBLIC_KOKORO_URL ?? 'http://localhost:8080',        // Kokoro TTSサーバーURL
  kokoro_voice: process.env.NEXT_PUBLIC_KOKORO_VOICE ?? 'af_bella',
  stylebertvits2_server_url: process.env.NEXT_PUBLIC_STYLEBERTVITS2_SERVER_URL ?? 'http://127.0.0.1:5000', // Style-Bert-VITS2 URL
  stylebertvits2_model_id: process.env.NEXT_PUBLIC_STYLEBERTVITS2_MODEL_ID ?? '0',
  stylebertvits2_style: process.env.NEXT_PUBLIC_STYLEBERTVITS2_STYLE ?? 'Neutral',
  piper_url: process.env.NEXT_PUBLIC_PIPER_URL ?? 'https://i-love-amica.com:5000/tts',
  elevenlabs_apikey: process.env.NEXT_PUBLIC_ELEVENLABS_APIKEY ?? '',
  elevenlabs_voiceid: process.env.NEXT_PUBLIC_ELEVENLABS_VOICEID ?? '21m00Tcm4TlvDq8ikWAM',
  elevenlabs_model: process.env.NEXT_PUBLIC_ELEVENLABS_MODEL ?? 'eleven_monolingual_v1',
  speecht5_speaker_embedding_url: process.env.NEXT_PUBLIC_SPEECHT5_SPEAKER_EMBEDDING_URL ?? '/speecht5_speaker_embeddings/cmu_us_slt_arctic-wav-arctic_a0001.bin',
  coqui_apikey: process.env.NEXT_PUBLIC_COQUI_APIKEY ?? "",
  coqui_voice_id: process.env.NEXT_PUBLIC_COQUI_VOICEID ?? "71c6c3eb-98ca-4a05-8d6b-f8c2b5f9f3a3",

  // --- 自律動作 (Life) & 高度な推論設定 ---
  amica_life_enabled: process.env.NEXT_PUBLIC_AMICA_LIFE_ENABLED ?? 'true',        // 自律発言機能の有効化
  reasoning_engine_enabled: process.env.NEXT_PUBLIC_REASONING_ENGINE_ENABLED ?? 'false', // 推論エンジンを使用するか
  reasoning_engine_url: process.env.NEXT_PUBLIC_REASONING_ENGINE_URL ?? 'https://i-love-amica.com:3000/reasoning/v1/chat/completions',

  // --- 外部API (X/Telegram) 連携設定 ---
  external_api_enabled: process.env.NEXT_PUBLIC_EXTERNAL_API_ENABLED ?? 'false',   // 外部APIを有効にするか
  x_api_key: process.env.NEXT_PUBLIC_X_API_KEY ?? '',
  x_api_secret: process.env.NEXT_PUBLIC_X_API_SECRET ?? '',
  x_access_token: process.env.NEXT_PUBLIC_X_ACCESS_TOKEN ?? '',
  x_access_secret: process.env.NEXT_PUBLIC_X_ACCESS_SECRET ?? '',
  x_bearer_token: process.env.NEXT_PUBLIC_X_BEARER_TOKEN ?? '',
  telegram_bot_token: process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN ?? '',

  // --- 動的知識注入設定（injection-tool） ---
  injection_tool_enabled: process.env.NEXT_PUBLIC_INJECTION_TOOL_ENABLED ?? 'true',   // 動的知識注入を有効にするか
  injection_tool_url: process.env.NEXT_PUBLIC_INJECTION_TOOL_URL ?? '/api/injection', // 注入ツールのエンドポイント
  injection_tool_timeout_ms: process.env.NEXT_PUBLIC_INJECTION_TOOL_TIMEOUT_MS ?? '8000',    // タイムアウト（ミリ秒）
  injection_default_domain: process.env.NEXT_PUBLIC_INJECTION_DEFAULT_DOMAIN ?? 'default', // デフォルトドメインID
  injection_default_domain_label: process.env.NEXT_PUBLIC_INJECTION_DEFAULT_DOMAIN_LABEL ?? 'デフォルト', // デフォルトドメイン表示名
  injection_domain_options: process.env.NEXT_PUBLIC_INJECTION_DOMAIN_OPTIONS ?? '[{"id":"default","label":"デフォルト"}]',
  injection_fallback_system_prompt: process.env.NEXT_PUBLIC_INJECTION_FALLBACK_SYSTEM_PROMPT ?? '',
  injection_fallback_user_context: process.env.NEXT_PUBLIC_INJECTION_FALLBACK_USER_CONTEXT ?? '',
  injection_tts_pronunciation_fallback_rules:
    process.env.NEXT_PUBLIC_INJECTION_TTS_PRONUNCIATION_FALLBACK_RULES ??
    '[{"from":"NFTDrive","to":"エヌエフティ　ドライブ","priority":100},{"from":"VRChat","to":"ブイアールチャット","priority":100},{"from":"中島理男","to":"なかしま　みちお","priority":100}]',

  // --- アイドル時・自律動作のタイミング設定 ---
  min_time_interval_sec: '10',     // 自律動作する最小間隔（秒）
  max_time_interval_sec: '20',     // 自律動作する最大間隔（秒）
  time_to_sleep_sec: '90',         // 非アクティブ時にスリープするまでの秒数
  idle_text_prompt: 'No file selected', // アイドル時のデフォルトテキスト

  // --- キャラクター基本定義 ---
  name: process.env.NEXT_PUBLIC_NAME ?? '夢 未来',                                   // キャラクターの名前
  system_prompt: process.env.NEXT_PUBLIC_SYSTEM_PROMPT ?? `あなたは丁寧で信頼できる案内役です。共通ナレッジを活用し、簡潔かつ正確に回答してください。`, // システムプロンプト（キャラクターの基本設定）

};

export function prefixed(key: string) {
  return `chatvrm_${key}`;
}

function normalizeConfigValue(key: string, value: string): string {
  if (key === "tts_backend") {
    return "stylebertvits2";
  }

  return value;
}

// Ensure syncLocalStorage runs only on the server side and once
if (typeof window !== "undefined") {
  (async () => {
    await handleConfig("init");
  })();
} else {
  (async () => {
    await handleConfig("fetch");
  })();
}

export function config(key: string): string {
  if (typeof localStorage !== "undefined" && localStorage.hasOwnProperty(prefixed(key))) {
    const value = (<any>localStorage).getItem(prefixed(key))!;
    return normalizeConfigValue(key, value);
  }

  // Fallback to serverConfig if localStorage is unavailable or missing
  if (serverConfig && serverConfig.hasOwnProperty(key)) {
    return normalizeConfigValue(key, serverConfig[key]);
  }

  if (defaults.hasOwnProperty(key)) {
    const value = (<any>defaults)[key];
    return normalizeConfigValue(key, value);
  }

  throw new Error(`config key not found: ${key}`);
}

export async function updateConfig(key: string, value: string) {
  try {
    const normalizedValue = normalizeConfigValue(key, value);
    const localKey = prefixed(key);

    // Update localStorage if available
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(localKey, normalizedValue);
    }

    // Sync update to server config
    await handleConfig("update", { key, value: normalizedValue });

  } catch (e) {
    console.error(`Error updating config for key "${key}": ${e}`);
  }
}

export function defaultConfig(key: string): string {
  if (defaults.hasOwnProperty(key)) {
    return (<any>defaults)[key];
  }

  throw new Error(`config key not found: ${key}`);
}

export async function resetConfig() {
  for (const [key, value] of Object.entries(defaults)) {
    await updateConfig(key, value);
  }
}
