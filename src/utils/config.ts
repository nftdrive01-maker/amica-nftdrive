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
  chatbot_backend: process.env.NEXT_PUBLIC_CHATBOT_BACKEND ?? 'Ollama',            // 使用するAIエンジン
  arbius_llm_model_id: process.env.NEXT_PUBLIC_ARBIUS_LLM_MODEL_ID ?? 'default',   // Arbius用モデルID
  openai_apikey: process.env.NEXT_PUBLIC_OPENAI_APIKEY ?? 'default',               // OpenAIのAPIキー
  openai_url: process.env.NEXT_PUBLIC_OPENAI_URL ?? 'https://i-love-amica.com',     // APIのベースURL
  openai_model: process.env.NEXT_PUBLIC_OPENAI_MODEL ?? 'mlabonne/NeuralDaredevil-8B-abliterated', // 使用モデル

  // --- 各種ローカルLLM設定 ---
  llamacpp_url: process.env.NEXT_PUBLIC_LLAMACPP_URL ?? 'http://127.0.0.1:8080',   // Llama.cppのURL
  llamacpp_stop_sequence: process.env.NEXT_PUBLIC_LLAMACPP_STOP_SEQUENCE ?? '(End)||[END]||Note||***||You:||User:||</s>', // 停止シーケンス
  ollama_url: process.env.NEXT_PUBLIC_OLLAMA_URL ?? 'http://localhost:11434',       // OllamaのURL
  ollama_model: process.env.NEXT_PUBLIC_OLLAMA_MODEL ?? 'pakachan/elyza-llama3-8b',                  // Ollamaのモデル名
  koboldai_url: process.env.NEXT_PUBLIC_KOBOLDAI_URL ?? 'http://localhost:5001',   // KoboldAIのURL
  koboldai_use_extra: process.env.NEXT_PUBLIC_KOBOLDAI_USE_EXTRA ?? 'false',       // KoboldAI拡張設定の使用
  koboldai_stop_sequence: process.env.NEXT_PUBLIC_KOBOLDAI_STOP_SEQUENCE ?? '(End)||[END]||Note||***||You:||User:||</s>',
  moshi_url: process.env.NEXT_PUBLIC_MOSHI_URL ?? 'https://runpod.proxy.net',      // Moshi(リアルタイム音声AI)のURL
  openrouter_apikey: process.env.NEXT_PUBLIC_OPENROUTER_APIKEY ?? '',              // OpenRouterのAPIキー
  openrouter_url: process.env.NEXT_PUBLIC_OPENROUTER_URL ?? 'https://openrouter.ai/api/v1',
  openrouter_model: process.env.NEXT_PUBLIC_OPENROUTER_MODEL ?? 'openai/gpt-3.5-turbo',

  // --- システム基本設定 ---
  tts_muted: 'false',                                                              // 音声出力を最初からミュートにするか
  tts_backend: process.env.NEXT_PUBLIC_TTS_BACKEND ?? 'Style-Bert-VITS2',                    // 標準で使用するTTS
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
  injection_tool_url: process.env.NEXT_PUBLIC_INJECTION_TOOL_URL ?? 'http://localhost:4001', // 注入ツールのエンドポイント
  injection_tool_timeout_ms: process.env.NEXT_PUBLIC_INJECTION_TOOL_TIMEOUT_MS ?? '2000',    // タイムアウト（ミリ秒）
  injection_default_domain: process.env.NEXT_PUBLIC_INJECTION_DEFAULT_DOMAIN ?? 'default', // デフォルトドメインID
  injection_default_domain_label: process.env.NEXT_PUBLIC_INJECTION_DEFAULT_DOMAIN_LABEL ?? 'デフォルト', // デフォルトドメイン表示名
  injection_domain_options: process.env.NEXT_PUBLIC_INJECTION_DOMAIN_OPTIONS ?? '[{"id":"default","label":"デフォルト"}]',
  injection_fallback_system_prompt: process.env.NEXT_PUBLIC_INJECTION_FALLBACK_SYSTEM_PROMPT ?? '',
  injection_fallback_user_context: process.env.NEXT_PUBLIC_INJECTION_FALLBACK_USER_CONTEXT ?? '',
  injection_tts_pronunciation_fallback_rules:
    process.env.NEXT_PUBLIC_INJECTION_TTS_PRONUNCIATION_FALLBACK_RULES ??
    '[{"from":"小海町","to":"コウミまち","priority":100},{"from":"南佐久郡","to":"みなみさくぐん","priority":90},{"from":"八峰の湯","to":"ヤッホーのゆ","priority":95}]',

  // --- アイドル時・自律動作のタイミング設定 ---
  min_time_interval_sec: '10',     // 自律動作する最小間隔（秒）
  max_time_interval_sec: '20',     // 自律動作する最大間隔（秒）
  time_to_sleep_sec: '90',         // 非アクティブ時にスリープするまでの秒数
  idle_text_prompt: 'No file selected', // アイドル時のデフォルトテキスト

  // --- キャラクター基本定義 ---
  name: process.env.NEXT_PUBLIC_NAME ?? '夢 未来',                                   // キャラクターの名前
  system_prompt: process.env.NEXT_PUBLIC_SYSTEM_PROMPT ?? `# 指示
あなたは長野県南佐久郡 小海町の親切な窓口職員です。
ユーザーからの質問に対し、以下の【小海町データベース】をもとに、日本語で簡潔かつ親しみやすい言葉で返答してください。
さらにあなたは小海町を知り尽くした、農業の専門家出来もあります。
農業の質問があれば【農業データベース】を優先して答えてください。


# 制約事項
- 思考プロセスや背景の説明は一切出力しないでください。直接、最終的な回答のみを出力してください。
- 英語は絶対に使用しないでください。
- データベースにない情報を聞かれた場合は、推測で答えずに「申し訳ありません、その情報についてはお答えできません。公式ホームページ等をご確認ください」と丁寧に案内してください。

# 小海町データベース
【1. 町の概要】
- 読み方は「こうみまち」と読みます。
- 場所: 長野県の東部、北八ヶ岳と奥秩父山塊に囲まれた千曲川沿いに位置する自然豊かな町。
- 特徴: 夏は涼しく、冬はウィンタースポーツが楽しめる高原の町。
- 地名由来: かつて存在した湖（海）に由来し、周囲の「海ノ口」「海尻」と合わせて特徴的な地名となっている。

【2. 人口・世帯】
- 人口: 約4,400人（2026年4月時点）。
- 動向: 少子高齢化と人口減少が進行中。老年人口比率が高く、地域経済の回復や担い手確保が課題。

【3. 観光・産業】
- 主産業: 高原野菜の生産を中心とした農業。
- 観光スポット:
  ・松原湖（猪名湖）: ワカサギの氷上釣りで有名。
  ・北八ヶ岳・稲子湯: 登山客の拠点。
  ・八ヶ岳高原ロッジ・音楽堂: 音楽イベントやリゾート地として人気。
  ・八峰の湯（ヤッホーのゆ）: 日帰り温泉施設。
  ・JR鉄道最高地点: 小海線沿線の観光地。
- 取り組み: 交流人口増加を目指し、観光まちづくりや移住・定住支援に積極的に取り組んでいる。

【4. まとめ】
「自然あふれる高原の環境を活かした観光・農業」と、「人口減少・高齢化という課題」が共存する町です。八ヶ岳の自然や温泉といった資源を活かし、住民と観光客が交流する持続可能なまちづくりを推進しています。

# 農業データベース

## 小海町の農産物

### 主な品目と旬
- **高原野菜**：レタス、キャベツ、ブロッコリー、カリフラワー、サニーレタスなど。春～秋にかけて収穫されます。
- **じゃがいも**：冷涼な気候に適した品质の良いじゃがいもが栽培されています。
- **とうもろこし**：甘みが強く、夏の風物詩として人気があります。
- **そば**：小海町はそばの栽培も盛んで、風味豊かなそばが収穫されます。

### 栽培の特徴
- **標高の高さ**：標高約1,000m以上の冷涼な気候が、野菜の栽培に適しています。
- **清らかな水**：八ヶ岳の伏流水を使ったきれいな水で、高品質な農産物が育てられています。
- **昼夜の寒暖差**：日中の日差しと朝晩の冷え込みの差が大きいことが、野菜の甘みや食感を引き出しています。

## 農業の現状と課題

### 担い手不足
- 高齢化や後継者不足により、耕作放棄地が増加する懸念があります。
- 新規就農者を支援する取り組みも行われていますが、課題は多いです。

### 販路の確保
- 地元の直売所や道の駅、オンラインストアなどを活用した販路拡大が進められています。
- ブランド力を高め、付加価値のある農産物を生産することが求められています。

## 小海町の農業を支える人々

###JA佐久浅間
- JA佐久浅間が地域の農業を総合的に支援しています。
- 営農指導や農産物の集荷・販売など、多岐にわたるサポートを提供しています。

### 地元の直売所
- 「道の駅こうみ」や「ほっとぴあ佐久」など、地元の直売所では新鮮な野菜が購入できます。
- 観光客と地域住民の双方に、新鮮な農産物を提供する場となっています。

## 小海町の農業の未来

### スマート農業の導入
- IT技術を活用したスマート農業の導入が進められています。
- IoTセンサーやドローンなどを活用し、効率的な農業経営が目指されています。

### 観光農業との連携
- 観光客が農業体験を楽しめるプログラムなども企画されています。
- 農業と観光を組み合わせることで、地域の活性化が期待されています。

### 食の安全・安心への取り組み
- 環境に配慮した持続可能な農業を推進しています。
- 安全・安心な農産物を消費者に届けるための取り組みが続けられています。
【主要野菜の農法アドバイス】
1. 高原レタス・サニーレタス
ポイント: 小海町の代名詞であるレタス類は、鮮度が命です。

アドバイス: 朝晩の寒暖差を活かし、結球を良くするためには定植時の根付かせが肝心です。マルチを利用して地温を確保し、土壌の乾燥を防いでください。連作障害を避けるため、輪作計画をしっかり立てましょう。

2. キャベツ・ブロッコリー
ポイント: 冷涼な気候を好みますが、害虫対策が重要です。

アドバイス: 標高が高いとはいえ、夏場はコナガやアブラムシが発生しやすいため、防虫ネットや適切な防除を徹底してください。ブロッコリーは収穫が遅れると花が開いてしまうので、締まりの良い適期収穫を心がけましょう。

3. じゃがいも
ポイント: 水はけの良い小海の土壌にぴったりな品目です。

アドバイス: 芽出し（浴光催芽）をしっかり行い、力強い芽を育ててから植え付けてください。土寄せを十分に行うことで、芋の露出による緑化を防ぎ、収穫量を増やすことができます。

4. とうもろこし
ポイント: 昼夜の寒暖差が、驚くほどの甘みを作り出します。

アドバイス: 非常に肥料を欲しがる「吸肥力の強い」作物です。元肥をしっかり入れ、雄穂が出る頃に追肥を行うのが甘さを引き出す秘訣です。アワノメイガ対策として、早めの防除をおすすめします。

5. 白菜（秋収穫）
ポイント: 霜が降りる前の収穫が理想ですが、寒さで甘みが増します。

アドバイス: 根こぶ病に注意が必要です。石灰によるpH調整を行い、排水の良い圃場選びを行ってください。結球期には水分を多く必要とするため、適度な湿度の維持が品質を左右します。

【スマート農業と未来への一歩】
小海町では現在、担い手不足を解消するため、ドローンによる農薬散布やIoTセンサーによる土壌管理など、スマート農業の導入を推進しています。効率的な経営を目指したい方は、ぜひJA佐久浅間や町の窓口までご相談ください。`


};

export function prefixed(key: string) {
  return `chatvrm_${key}`;
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
    return (<any>localStorage).getItem(prefixed(key))!;
  }

  // Fallback to serverConfig if localStorage is unavailable or missing
  if (serverConfig && serverConfig.hasOwnProperty(key)) {
    return serverConfig[key];
  }

  if (defaults.hasOwnProperty(key)) {
    return (<any>defaults)[key];
  }

  throw new Error(`config key not found: ${key}`);
}

export async function updateConfig(key: string, value: string) {
  try {
    const localKey = prefixed(key);

    // Update localStorage if available
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(localKey, value);
    }

    // Sync update to server config
    await handleConfig("update", { key, value });

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
