# Amica VPN/外部公開 デプロイ手順書

> 作成日: 2026-04-27  
> 対象: Amica を VPN トンネル or 外向きドメインで外部公開する場合の手順と注意事項

---

## 1. システム構成図

```
【外部ユーザーのブラウザ】
        │
        │ HTTPS (VPN/リバースプロキシ経由)
        ▼
┌──────────────────────────────────────────────┐
│  サーバーマシン (VPN エンドポイント)          │
│                                              │
│  ★公開対象★                                 │
│  ┌────────────────┐                          │
│  │  Amica         │ :3000                    │
│  │  (Next.js)     │                          │
│  └───────┬────────┘                          │
│          │ サーバーサイド (localhost内部通信) │
│    ┌─────┼──────────────┐                    │
│    ▼     ▼              ▼                    │
│  Ollama  injection-tool  Style-Bert-VITS2    │
│  :11434  :4001           :5000               │
│  ★非公開★ ★非公開★     ★非公開★            │
└──────────────────────────────────────────────┘
```

**公開するのは Amica (ポート 3000) のみ。**  
Ollama / injection-tool / Style-Bert-VITS2 はサーバーマシンの localhost に留め、外部から直接アクセスできないようにする。

---

## 2. 通信経路の危険度チェック

### 2-1. Amica → Ollama

| 項目 | 内容 |
|------|------|
| 呼び出し元 | `src/app/api/chat/route.ts`（Next.js API Route = **サーバーサイド**） |
| 宛先 | `http://127.0.0.1:11434/api/chat` |
| ブラウザへの露出 | なし |
| **判定** | ✅ **安全** — Amica サーバーから localhost への通信のみ |

### 2-2. Amica → Style-Bert-VITS2 (TTS)

| 項目 | 内容 |
|------|------|
| 呼び出し元 | `src/features/stylebertvits2/stylebertvits2.ts` が `/api/tts` (相対パス) に POST |
| 宛先 | Amica の BFF (`/api/tts/route.ts`) → サーバーサイドで `http://127.0.0.1:5000` に転送 |
| ブラウザへの露出 | `server_url` が `NEXT_PUBLIC_STYLEBERTVITS2_SERVER_URL` として環境変数に乗るが、**fetch 先は `/api/tts` (相対パス)** のため実際の SBV2 URL はブラウザから直接叩かれない |
| **判定** | ✅ **安全** — BFF プロキシ経由 |

> **注意**: `NEXT_PUBLIC_STYLEBERTVITS2_SERVER_URL` の値はブラウザの JS バンドルに含まれる（開発者ツールで閲覧可能）。  
> 公開時は `http://127.0.0.1:5000` をそのまま残しても機能上は問題ないが、情報開示を避けたい場合は省略可。

### 2-3. Amica → injection-tool ⚠️ **要対処**

| 項目 | 内容 |
|------|------|
| 呼び出し元 | `src/lib/injectionClient.ts` — `typeof document !== 'undefined'` = **クライアントサイド（ブラウザ）** で直接 fetch |
| 宛先 | `config('injection_tool_url')` = `http://localhost:4001` |
| ブラウザへの露出 | **あり** — ブラウザから `http://localhost:4001/api/intercept` に直接リクエストを送信 |
| **判定** | 🚨 **危険** — 外部ユーザーのブラウザは自分の `localhost:4001` を叩こうとするため通信失敗 |

#### 対処方法（いずれか選択）

**Option A（推奨）: injection-tool を無効化して env-fallback を使用**

```dotenv
# amica/.env.local
NEXT_PUBLIC_INJECTION_TOOL_ENABLED=false
NEXT_PUBLIC_INJECTION_FALLBACK_SYSTEM_PROMPT=<外部公開時の固定システムプロンプト>
NEXT_PUBLIC_INJECTION_FALLBACK_USER_CONTEXT=<外部公開時の固定コンテキスト>
```

`injectionClient.ts` は `enabled === false` のとき env-fallback を返して早期リターンするため、injection-tool への通信は発生しない。

**Option B: Amica に injection-tool の BFF プロキシを追加**

`amica/src/app/api/injection-proxy/route.ts` を作成し、クライアントの fetch 先を `/api/injection-proxy` に書き換える。  
injection-tool はサーバーマシン内部でのみアクセス可能なまま維持できる。  
※ 実装コストあり。injection-tool の認証トークンをサーバーサイドで保持できるメリットもある。

**Option C: injection-tool も外部公開（非推奨）**

```dotenv
NEXT_PUBLIC_INJECTION_TOOL_URL=https://injection.example.com
```

injection-tool 自体を HTTPS で公開しリバースプロキシを設定する。  
injection-tool の管理画面（`/admin`）も外部に晒されるため、認証を強化しない限り非推奨。

---

## 3. 外部公開時の環境変数設定

### `amica/.env.local`（外部公開用）

```dotenv
# ===== 外部公開時の必須設定 =====

# Ollama はサーバー内部で通信するため変更不要（/api/chat/route.ts がサーバーサイドで叩く）
# NEXT_PUBLIC_OLLAMA_URL はクライアントに露出するが fetch には使われない
NEXT_PUBLIC_OLLAMA_URL=http://127.0.0.1:11434
NEXT_PUBLIC_OLLAMA_MODEL=pakachan/elyza-llama3-8b

# TTS: Style-Bert-VITS2（BFF経由のため直接叩かれないが、server_url は JSON に含まれる）
NEXT_PUBLIC_STYLEBERTVITS2_SERVER_URL=http://127.0.0.1:5000

# injection-tool: ブラウザから直接呼ばれるため外部公開時は無効化を推奨
NEXT_PUBLIC_INJECTION_TOOL_ENABLED=false
NEXT_PUBLIC_INJECTION_FALLBACK_SYSTEM_PROMPT=あなたは日本語で話す親切なAIアシスタントです。
NEXT_PUBLIC_INJECTION_FALLBACK_USER_CONTEXT=

# Amica 公開 URL（CORS・リダイレクト等に使用する場合）
NEXT_PUBLIC_BASE_URL=https://amica.example.com
```

---

## 4. VPN / リバースプロキシの設定手順

### 4-1. Nginx リバースプロキシ設定例

```nginx
server {
    listen 443 ssl;
    server_name amica.example.com;

    ssl_certificate     /etc/letsencrypt/live/amica.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/amica.example.com/privkey.pem;

    # WebSocket（Amica がリアルタイム通信に使う場合）
    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;

        # 音声ファイルのバッファリングを無効化（TTS レスポンスが大きい場合）
        proxy_buffering    off;
        proxy_read_timeout 120s;
    }
}

# HTTP → HTTPS リダイレクト
server {
    listen 80;
    server_name amica.example.com;
    return 301 https://$host$request_uri;
}
```

### 4-2. ファイアウォール設定

```bash
# 外部に公開するポートは 80/443 のみ
# Ollama, injection-tool, SBV2 のポートは外部から遮断

# 例: UFW (Ubuntu)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw deny 11434/tcp   # Ollama
sudo ufw deny 4001/tcp    # injection-tool
sudo ufw deny 5000/tcp    # Style-Bert-VITS2
```

### 4-3. Amica の起動（本番モード）

```powershell
cd d:\amica
npm run build
npm start
# または PM2 を使う場合:
# pm2 start "npm start" --name amica --cwd d:\amica
```

---

## 5. 動作確認チェックリスト

外部ブラウザ（または VPN 外のデバイス）から以下を確認する。

### 基本動作

- [ ] `https://amica.example.com` にアクセスして Amica の UI が表示される
- [ ] VRM キャラクターが表示される（3D モデルの読み込み成功）
- [ ] テキスト入力でチャットが返答する（Ollama 連携成功）
- [ ] 音声合成が再生される（Style-Bert-VITS2 BFF 経由成功）

### セキュリティ確認

- [ ] ブラウザの開発者ツール → Network タブで `localhost:4001` へのリクエストが**発生しない**ことを確認
- [ ] ブラウザの開発者ツール → Network タブで `127.0.0.1:11434` へのリクエストが**発生しない**ことを確認
- [ ] ブラウザの開発者ツール → Network タブで `127.0.0.1:5000` へのリクエストが**発生しない**ことを確認
- [ ] `https://amica.example.com:11434` にアクセスして **接続拒否**されることを確認（Ollama が外部に漏れていない）
- [ ] `https://amica.example.com:4001` にアクセスして **接続拒否**されることを確認（injection-tool が外部に漏れていない）

### エラーログ確認

- [ ] Amica サーバーのコンソールに `ECONNREFUSED` などの接続エラーが出ていない
- [ ] ブラウザコンソールに CORS エラーがない

---

## 6. よくある問題と対処

| 症状 | 原因 | 対処 |
|------|------|------|
| 外部からアクセスすると注入コンテキストが空になる | injection-tool が localhost:4001 に到達できない | `NEXT_PUBLIC_INJECTION_TOOL_ENABLED=false` を設定し env-fallback を使用 |
| TTS が動作しない | SBV2 の URL が localhost 固定になっている | SBV2 は `/api/tts` BFF 経由なので通常は問題なし。SBV2 が起動しているか確認 |
| Ollama が返答しない | Amica サーバーから 127.0.0.1:11434 に到達できない | Ollama が起動しているか確認: `Invoke-RestMethod http://127.0.0.1:11434/api/tags` |
| CORS エラーが発生する | Amica の `NEXT_PUBLIC_BASE_URL` が実際の URL と一致していない | `.env.local` の `NEXT_PUBLIC_BASE_URL` を公開 URL に合わせる |
| WebSocket が切断される | リバースプロキシのタイムアウト設定が短い | Nginx の `proxy_read_timeout` を延長（300s 以上推奨） |

---

## 7. セキュリティ補足

- **Amica の管理設定ページ**（`/settings`）は認証なしでアクセス可能。VPN のアクセス制御で信頼できるユーザーのみに制限することを強く推奨。
- **`NEXT_PUBLIC_*` 環境変数**はすべてクライアントの JS バンドルに含まれる。API キーや秘密情報は絶対に `NEXT_PUBLIC_` プレフィックスで設定しない。
- **injection-tool の `/admin` ページ**（ポート 4001）はファイアウォールで外部から遮断すること。injection-tool 自体に認証機能はあるが、管理ページが漏れると設定を書き換えられるリスクがある。

---

*以上*
