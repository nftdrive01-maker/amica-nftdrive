# Amica + injection-tool システム全体仕様書 / 設定解説マニュアル

最終更新: 2026-05-03  
対象構成: `d:\amica` / `d:\injection-tool` / `d:\sbv2\Style-Bert-VITS2` / `d:\mcp-server`

---

## 1. 目的と適用範囲

本書は、以下を1つにまとめた実運用向けドキュメントです。

- システム構成（Amica / injection-tool / TTS / MCP）
- APIとデータフロー仕様
- 環境変数と設定項目の意味
- 起動・監視・障害時対応
- 同時接続数制御（公開管理）の仕様

---

## 2. システム構成（全体像）

### 2.1 コンポーネント

1. **Amica**（Next.js, ポート3000想定）
   - 3D UI、チャットUI、LLM/TTS 呼び出し
   - injection-tool 連携（知識注入 / 公開セッション制御）

2. **injection-tool (Ark-i)**（Next.js, ポート4001想定）
   - 管理画面（ドメイン、ナレッジ、MCP、公開管理）
   - `/api/intercept` で知識をAmicaに注入
   - `/api/public/sessions` で同時接続制御

3. **Style-Bert-VITS2 (SBV2)**（FastAPI, ポート5000想定）
   - 音声合成 `/voice`
   - モデル一覧 `/models/info`

4. **MCPサーバー**（例: ポート8000, SSE）
   - injection-tool からツール実行
   - `get_server_metadata` による自動インポート対応

### 2.2 論理フロー

#### チャット応答

1. ユーザー入力（Amica）
2. Amica → injection-tool `/api/intercept`
3. ドメイン/ナレッジ/MCP結果を system prompt に合成
4. Amica → LLM
5. 応答表示（URLはリンク表示）
6. 応答文をTTS前処理（URL除去）
7. Amica → SBV2（model_id / style 指定）

#### 同時接続制御（公開管理）

1. Amica起動時に `/api/public/sessions` へ acquire
2. 満席なら待機画面表示（自動再試行）
3. 入場後は heartbeat を定期送信
4. 離脱時は release

---

## 3. 主要機能仕様

## 3.1 動的知識注入（Injection）

- エンドポイント: `POST /api/intercept`
- 返却内容:
  - `injectedSystemPrompt`
  - `injectedUserContext`
  - `metadata`（domainId, ttl, version, mcpUsed など）
- **fail-open**: 例外時は空レスポンス返却（Amicaは通常応答を継続）

## 3.2 MCPルーティング

- モード: `rule` / `ai` / `hybrid`
- ドメインに `mcpServerIds` を紐付けて有効化
- `get_server_metadata` 実装済みサーバーは管理画面から自動インポート可能

## 3.3 ドメイン別TTSモデル

- ドメイン設定の `stylebertvits2ModelId` / `stylebertvits2Style` を優先
- 未設定時は Amica グローバル設定へフォールバック
- `coquiLocal` と `stylebertvits2` の双方で適用

## 3.4 URLのUI/TTS挙動

- チャット表示: URLは `🔗` アイコンリンクとして表示（titleにURL）
- TTS: URL文字列は読み上げ前に除去

## 3.5 発音辞書（WanaKana補助変換）

- 管理画面「発音辞書」で `WanaKana で英字をかなへ補助変換する` を ON/OFF 可能
- 適用順序は **ユーザー定義ルール → WanaKana補助変換**
- そのため、ユーザーが設定した発音辞書が常に優先される

## 3.6 同時接続数制御（グローバル）

- 設定箇所: injection-tool 管理画面「公開管理」タブ
- 保存先: `public-settings.json`（`maxConcurrentSessions`）
- `0` は無制限
- カウント対象: 同一 injection-tool インスタンスに接続する全クライアント（ローカル/VPNを問わず）
- TTL:
  - heartbeat間隔: 20秒（Amica）
  - セッションTTL: 60秒（injection-tool）
  - 掃除周期: 30秒（injection-tool）

### 旧設定からの移行

- `public-settings.json` が未作成の場合のみ、旧 `domains.json` の `maxConcurrentSessions` を自動検出
- 複数ドメインに旧値がある場合は**最大値**を採用して移行

---

## 4. API仕様（抜粋）

## 4.1 injection-tool 公開API

### `POST /api/intercept`

- 用途: LLM送信前の知識注入
- 認証: 不要（CORS制御）
- 主要入力:
  - `userText`
  - `domainId`
  - `messageHistory`

### `GET /api/public/domains`

- 用途: Amica側のドメイン選択/資産URL解決
- 認証: 不要
- 返却: ドメイン一覧 + `defaultDomainId`

### `GET /api/public/pronunciations`

- 用途: TTS前の発音辞書ルールと補助変換設定の取得
- 認証: 不要
- 返却: `rules[]`, `settings.wanaKanaEnabled`, `updatedAt`

### `GET /api/public/sessions`

- 用途: 現在接続状態取得
- 返却: `{ current, max, available }`

### `POST /api/public/sessions`

- 用途: セッション取得（acquire）
- 入力: `{ domainId?: string }`
- 返却: `{ acquired, sessionId, current, max }`

### `POST /api/public/sessions?action=heartbeat`

- 用途: セッション維持
- 入力: `{ sessionId }`

### `DELETE /api/public/sessions`

- 用途: セッション解放
- 入力: `{ sessionId }`

## 4.2 injection-tool 管理API（認証必須）

- `/api/domains`
- `/api/knowledges`
- `/api/pronunciations`
- `/api/pronunciations/settings`
- `/api/mcp-servers`
- `/api/public-management`（同時接続上限）

---

## 5. データ保存仕様

## 5.1 injection-tool

- `INJECTION_DOMAINS_CONFIG`（既定: `./data/domains.json`）
  - ドメイン・ナレッジ・関連設定
- `./data/mcp-servers.json`
  - MCPサーバー定義
- `./data/pronunciations.json`
  - 発音辞書ルール（from/to/priority/domainId など）
- `./data/pronunciation-settings.json`
  - 発音辞書設定（`wanaKanaEnabled`）
- `INJECTION_PUBLIC_SETTINGS_CONFIG`（既定: `./data/public-settings.json`）
  - 公開管理設定（`maxConcurrentSessions`）

## 5.2 Amica

- ブラウザ `localStorage`
  - `chatvrm_*` キーで設定保存
- injectionキャッシュ
  - ドメイン単位でTTLキャッシュ

---

## 6. 設定解説（環境変数）

## 6.1 Amica 側（代表項目）

### Injection連携

- `NEXT_PUBLIC_INJECTION_TOOL_ENABLED`
  - `true` で injection-tool を利用
- `NEXT_PUBLIC_INJECTION_TOOL_URL`
  - 例: `http://localhost:4001` または BFF の `/api/injection`
- `NEXT_PUBLIC_INJECTION_TOOL_TIMEOUT_MS`
  - injection呼び出しタイムアウト
- `NEXT_PUBLIC_INJECTION_DEFAULT_DOMAIN`
  - 初期ドメインID

### LLM

- `NEXT_PUBLIC_CHATBOT_BACKEND`
- `NEXT_PUBLIC_OLLAMA_URL`
- `NEXT_PUBLIC_OLLAMA_MODEL`
- `NEXT_PUBLIC_OPENAI_URL` / `NEXT_PUBLIC_OPENAI_APIKEY` など

### TTS

- `NEXT_PUBLIC_TTS_BACKEND`
- `NEXT_PUBLIC_STYLEBERTVITS2_SERVER_URL`
- `NEXT_PUBLIC_STYLEBERTVITS2_MODEL_ID`
- `NEXT_PUBLIC_STYLEBERTVITS2_STYLE`

> 補足: 現在 `tts_backend` は正規化処理で `stylebertvits2` に統一される実装です。

## 6.2 injection-tool 側（代表項目）

### 認証

- `INJECTION_ADMIN_USERNAME`
- `INJECTION_ADMIN_PASSWORD`

### ドメイン初期化

- `INJECTION_DEFAULT_DOMAIN_ID`
- `INJECTION_DEFAULT_DOMAIN_NAME`
- `INJECTION_DEFAULT_DOMAIN_BASE_SYSTEM_PROMPT`
- `INJECTION_DEFAULT_DOMAIN_BASE_CONTEXT`

### 接続先

- `NEXT_PUBLIC_AMICA_ORIGIN`
- `NEXT_PUBLIC_INJECTION_TOOL_ORIGIN`
- `INJECTION_AMICA_URL`
- `INJECTION_OLLAMA_URL`
- `INJECTION_STYLEBERTVITS2_URL`

### ストレージ

- `INJECTION_DOMAINS_CONFIG`
- `INJECTION_PUBLIC_SETTINGS_CONFIG`

---

## 7. 起動手順（ローカル）

1. SBV2 起動
   - `d:\sbv2\Style-Bert-VITS2\Server.bat`
2. MCPサーバー起動（使用時）
   - `d:\mcp-server\Start-Server.bat`
3. injection-tool 起動
   - `cd d:\injection-tool && npm run dev`
4. Amica 起動
   - `cd d:\amica && npm run dev`

確認URL:

- Amica: `http://localhost:3000`
- injection-tool: `http://localhost:4001`
- SBV2: `http://127.0.0.1:5000/models/info`

---

## 8. VPN公開時の運用ポイント

- CORS許可元 (`NEXT_PUBLIC_AMICA_ORIGIN`) を実URLに合わせる
- injection-tool の公開URLが変わる場合は `NEXT_PUBLIC_INJECTION_TOOL_ORIGIN` を設定
- 同時接続数は「公開管理」で調整
- 入口で制限し、SBV2/LLMの過負荷を回避

---

## 9. 障害時チェックリスト

1. **Amicaのみ正常で注入されない**
   - `NEXT_PUBLIC_INJECTION_TOOL_ENABLED=true` を確認
   - `/api/health` 疎通確認

2. **待機画面から進まない**
   - 公開管理の `maxConcurrentSessions` を確認
   - heartbeat/releaseが送れているかNetworkで確認

3. **TTSが想定と違うモデル**
   - ドメインの `stylebertvits2ModelId` 設定確認
   - 未設定時はグローバル設定へフォールバックされる

4. **MCPが動かない**
   - ドメインにMCP紐付け済みか
   - サーバー接続テスト結果
   - ルーティングモード/allowedTools の整合

---

## 10. 変更管理ポリシー（推奨）

- まず staging 環境で同時接続上限をテスト
- `public-settings.json` と `domains.json` をバックアップ
- 本番変更は以下順序:
  1. injection-tool設定更新
  2. 接続数監視
  3. 問題なければ Amicaへ反映

---

## 11. 参考ファイル

- Amica設定: `d:\amica\src\utils\config.ts`
- 同時接続制御(Amica): `d:\amica\src\lib\sessionManager.ts`
- 待機画面: `d:\amica\src\components\waitingScreen.tsx`
- 注入API: `d:\injection-tool\src\app\api\intercept\route.ts`
- 公開セッションAPI: `d:\injection-tool\src\app\api\public\sessions\route.ts`
- 公開管理API: `d:\injection-tool\src\app\api\public-management\route.ts`
- 公開管理ストア: `d:\injection-tool\src\lib\public-management.ts`
- MCP手順: `d:\injection-tool\MCP_SETUP.md`

---

必要に応じて次版で、以下を追加できます。

- 項目別の「推奨値テンプレート（小規模/中規模/本番）」
- 運用チェックシート（毎日/毎週）
- 障害対応フローチャート
