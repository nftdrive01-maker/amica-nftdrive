# フロントアプリ / injection-tool 設定解説マニュアル

最終更新: 2026-05-03

この文書は、運用時に実際によく使う設定を「どこで」「何を」「どう変えるか」に絞って解説します。

---

## 1. 設定の保存先

- フロントアプリ（ブラウザ）
  - `localStorage` の `chatvrm_*` キー
  - 初期値は `src/utils/config.ts` の `defaults`
- injection-tool（サーバー）
  - `./data/domains.json`（ドメイン/ナレッジ）
  - `./data/mcp-servers.json`（MCP）
  - `./data/public-settings.json`（公開管理）
  - `./data/pronunciations.json`（発音辞書ルール）
  - `./data/pronunciation-settings.json`（WanaKana補助変換設定）
- 環境変数
  - `d:\amica\.env.local`
  - `d:\injection-tool\.env.local`

---

## 2. フロントアプリ側の重要設定

## 2.1 Injection連携

- `NEXT_PUBLIC_INJECTION_TOOL_ENABLED`
  - `true`: injection-tool利用
  - `false`: 連携停止（通常チャットは継続）
- `NEXT_PUBLIC_INJECTION_TOOL_URL`
  - 例: `http://localhost:4001`
  - BFF利用時は `/api/injection`
- `NEXT_PUBLIC_INJECTION_TOOL_TIMEOUT_MS`
  - 推奨: `8000`
- `NEXT_PUBLIC_INJECTION_DEFAULT_DOMAIN`
  - 例: `default`, `consultation`

## 2.2 LLM

- `NEXT_PUBLIC_CHATBOT_BACKEND`
  - 例: `Ollama`, `OpenAI`
- `NEXT_PUBLIC_OLLAMA_URL`
  - 例: `http://localhost:11434`
- `NEXT_PUBLIC_OLLAMA_MODEL`
  - 例: `qwen2.5:7b`

## 2.3 TTS

- `NEXT_PUBLIC_TTS_BACKEND`
  - 実装上 `stylebertvits2` に正規化
- `NEXT_PUBLIC_STYLEBERTVITS2_SERVER_URL`
  - 例: `http://127.0.0.1:5000`
- `NEXT_PUBLIC_STYLEBERTVITS2_MODEL_ID`
  - グローバル既定モデル
- `NEXT_PUBLIC_STYLEBERTVITS2_STYLE`
  - 例: `Neutral`

## 2.4 UI/キャラ

- `NEXT_PUBLIC_BG_URL`
- `NEXT_PUBLIC_VRM_HASH`（実体は `vrm_url` 相当）
- `NEXT_PUBLIC_ANIMATION_URL`
- `NEXT_PUBLIC_NAME`
- `NEXT_PUBLIC_SYSTEM_PROMPT`

---

## 3. injection-tool 側の重要設定

## 3.1 認証・基本

- `INJECTION_ADMIN_USERNAME`
- `INJECTION_ADMIN_PASSWORD`
- `PORT`（既定 4001）

## 3.2 CORS/公開

- `NEXT_PUBLIC_AMICA_ORIGIN`
  - フロントアプリのオリジン（CORS）
- `NEXT_PUBLIC_INJECTION_TOOL_ORIGIN`
  - 外部公開時の正規オリジン（アセットURL生成に使用）

## 3.3 外部連携先

- `INJECTION_AMICA_URL`
- `INJECTION_OLLAMA_URL`
- `INJECTION_STYLEBERTVITS2_URL`

## 3.4 データ保存

- `INJECTION_DOMAINS_CONFIG`
- `INJECTION_PUBLIC_SETTINGS_CONFIG`

---

## 4. 管理画面で変更する設定

## 4.1 ドメイン管理

- ベースSystem Prompt / Context
- 追加ナレッジ紐付け
- MCPサーバー紐付け
- ドメイン別TTS設定
  - `stylebertvits2ModelId`
  - `stylebertvits2Style`

## 4.2 公開管理（グローバル）

- 同時接続数上限 `maxConcurrentSessions`
  - `0` = 無制限
  - ドメイン横断で適用

## 4.3 MCP管理

- サーバー登録（SSE/HTTP/stdio）
- ルーティングモード（rule/ai/hybrid）
- Allowed Tools / Fallback Tool / Timeout

## 4.4 発音辞書管理

- 変換ルール（from → to / 優先度 / 有効・無効 / 適用ドメイン）
- 発音辞書設定 `WanaKana で英字をかなへ補助変換する`（ON/OFF）

適用順序:

1. ユーザー定義の発音辞書ルール
2. WanaKana 補助変換（ON のときのみ）

> ユーザー定義ルールが常に優先されます。

---

## 5. 同時接続数制御の設定指針

- 小規模テスト: `2〜3`
- 小規模公開: `5〜10`
- 上限が低すぎる場合: 待機画面が増える
- 上限が高すぎる場合: LLM/TTS遅延が増える

運用の基本は、**GPUの推論能力に合わせて上限を調整**です。

---

## 6. トラブル時の設定確認順

1. フロントアプリ `.env.local`（Injection URL / Enabled）
2. injection-tool `.env.local`（CORS / 認証）
3. 公開管理の上限値
4. TTS URLとモデル一覧取得
5. MCPサーバー接続テスト
6. 発音辞書設定（WanaKana ON/OFF）と変換ルール優先度

---

## 7. 旧設定からの移行

- 旧ドメイン単位 `maxConcurrentSessions` を使っていた環境は、初回に `public-settings.json` へ自動移行
- 複数ドメインに値がある場合は最大値を採用

---

## 8. 参照ドキュメント

- 全体仕様: `SYSTEM_SPEC_AND_CONFIG_MANUAL_JA.md`
- MCP詳細: `d:\injection-tool\MCP_SETUP.md`
