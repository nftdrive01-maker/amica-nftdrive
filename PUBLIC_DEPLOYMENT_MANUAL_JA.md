# フロントアプリ 公開マニュアル

作成日: 2026-05-25

この文書は、フロントアプリを外部公開する際の推奨構成と作業手順をまとめた運用マニュアルです。

対象:
- フロントアプリ本体の外部公開
- Cloudflare を前段に置いた公開運用
- Ollama / TTS / Injection Tool と連携する構成

関連文書:
- [README.md](README.md)
- [CONFIG_MANUAL_JA.md](CONFIG_MANUAL_JA.md)
- [SYSTEM_SPEC_AND_CONFIG_MANUAL_JA.md](SYSTEM_SPEC_AND_CONFIG_MANUAL_JA.md)
- [SECURITY_AUDIT_CLOUDFLARE_JA.md](SECURITY_AUDIT_CLOUDFLARE_JA.md)

## 1. 結論

フロントアプリを公開する場合、推奨構成は次の通りです。

1. Cloudflare を前段に置く
2. ブラウザ利用者には Cloudflare Access を通す
3. フロントアプリ origin への直アクセスを遮断する
4. chat/TTS はアプリ側の既定保護を有効のまま運用する
5. `NEXT_PUBLIC_*` に秘密情報を入れない

この構成であれば、現在のフロントアプリ実装と整合しつつ、運用を壊さずに公開できます。

Cloudflare Access を使わない公開も可能ですが、その場合は認証の責任がすべてアプリ側または別の認証基盤側へ移ります。匿名公開のままでは `/api/chat` と `/api/tts` の不正利用リスクが上がります。

## 2. 現在の保護仕様

本番環境では、以下の API は既定で保護されます。

- `POST /api/chat`
- `POST /api/tts`
- `pages/api/dataHandler`
- `pages/api/amicaHandler`
- `pages/api/mediaHandler`
- `pages/api/openai/chat`

本番で保護された API が通る条件は次のいずれかです。

1. 開発環境である
2. 対象 API の `*_PUBLIC=true` を明示設定している
3. localhost 経由のアクセスである
4. `x-amica-api-key` または `Authorization: Bearer` が `AMICA_SERVER_API_KEY` か `AMICA_API_KEY` と一致する
5. `AMICA_TRUST_CLOUDFLARE_ACCESS=true` かつ Cloudflare Access ヘッダーが付いている

chat/TTS をブラウザから普通に使う公開構成では、Cloudflare Access を併用するのが最も安全です。

Cloudflare Access を使わない場合は、少なくとも次のどちらかが必要です。

1. アプリ側を `AMICA_SERVER_API_KEY` で保護し、利用者または中継サーバーが API key を付与する
2. 自前の認証付きトンネルまたは VPN の内側だけにフロントアプリを置く

## 3. 推奨公開構成

構成イメージ:

- 利用者ブラウザ → Cloudflare → フロントアプリ
- フロントアプリ → Ollama
- フロントアプリ → TTS
- フロントアプリ → Injection Tool

推奨ポイント:

1. フロントアプリは Cloudflare の背後に置く
2. `AMICA_TRUST_CLOUDFLARE_ACCESS=true` を有効にする
3. `AMICA_CHAT_PROXY_PUBLIC` と `AMICA_TTS_PROXY_PUBLIC` は設定しない
4. API key はサーバー間接続や保守用にだけ使う
5. Cloudflare WAF / Rate Limiting を `/api/chat`, `/api/tts`, `/api/injection/*` に設定する

## 4. 公開前チェック

次を満たしてから公開します。

1. フロントアプリが production build で起動できる
2. Ollama と TTS がフロントアプリから到達できる
3. Injection Tool を使う場合はフロントアプリから到達できる
4. origin に対して不要なポート公開をしていない
5. 本物の秘密情報を `NEXT_PUBLIC_*` に入れていない

特に注意:

- `NEXT_PUBLIC_OPENROUTER_APIKEY`
- `NEXT_PUBLIC_OPENAI_*`
- `NEXT_PUBLIC_ELEVENLABS_*`
- `NEXT_PUBLIC_TELEGRAM_*`

このような値に本物の秘密鍵を入れると、ブラウザへ配信される可能性があります。

## 5. 推奨 environment 設定

以下は公開運用の基本例です。

```env
NODE_ENV=production

# Amica route protection
AMICA_TRUST_CLOUDFLARE_ACCESS=true
AMICA_SERVER_API_KEY=replace-with-long-random-string

# Keep protected by default
AMICA_CHAT_PROXY_PUBLIC=false
AMICA_TTS_PROXY_PUBLIC=false
AMICA_DATA_HANDLER_PUBLIC=false
AMICA_LEGACY_EXTERNAL_API_PUBLIC=false
AMICA_OPENAI_PROXY_PUBLIC=false

# Upstream services
OLLAMA_URL=http://ollama:11434
STYLEBERTVITS2_URL=http://style-bert-vits2:5000

# If Injection Tool is used
NEXT_PUBLIC_INJECTION_TOOL_ENABLED=true
NEXT_PUBLIC_INJECTION_TOOL_URL=https://your-front-app-domain.example
```

補足:

1. `AMICA_SERVER_API_KEY` はランダムで長い文字列にする
2. ブラウザ利用を Cloudflare Access 配下に置くなら、chat/TTS を public に戻す必要はない
3. `NEXT_PUBLIC_INJECTION_TOOL_URL` は、ブラウザから見えるフロントアプリ側の URL と整合する値にする

## 6. Cloudflare 側の設定手順

### 6-1. DNS / Proxy

1. 公開ドメインを Cloudflare に登録する
2. フロントアプリの公開 FQDN を Proxied にする
3. origin IP を直接公開しない

### 6-2. Access

推奨です。

1. 公開 FQDN に対して Cloudflare Access policy を作成する
2. 許可対象のメールドメインまたはユーザーを絞る
3. Access 通過後のリクエストに Cloudflare Access ヘッダーが付くことを確認する
4. フロントアプリ側で `AMICA_TRUST_CLOUDFLARE_ACCESS=true` を設定する

これにより、ブラウザからの `/api/chat` と `/api/tts` は current 実装のまま通せます。

### 6-3. WAF / Rate Limiting

最低限、次の path にレート制限を設定します。

1. `/api/chat`
2. `/api/tts`
3. `/api/injection/*`
4. `/api/openai/chat`

考え方:

1. chat は短時間の連投を抑える
2. tts は文字数依存で負荷が高いため厳しめにする
3. injection の login/intercept/session は bot 試行を抑える

### 6-4. Cloudflare Access を使わない場合

Cloudflare Proxy だけで公開し、Access を使わない場合はリスクが上がります。

主な理由:

1. 公開 URL を知っていれば誰でも到達できる
2. `/api/chat` と `/api/tts` を匿名利用されやすい
3. bot やスクリプトによる連投をアプリ手前で止めにくい
4. 「誰が使ったか」の識別が IP とアプリ独自認証頼みになる

この構成にするなら、最低でも次を必須にしてください。

1. `AMICA_CHAT_PROXY_PUBLIC=false`
2. `AMICA_TTS_PROXY_PUBLIC=false`
3. `AMICA_SERVER_API_KEY` を設定する
4. 中継サーバーまたは管理用クライアントだけが API key を付ける
5. Cloudflare Rate Limiting を強く設定する

要するに、Cloudflare Access を使わない場合でも、何らかの認証ゲートは別途必要です。

## 7. origin 側の公開制御

Cloudflare を使っても origin 直打ちできると安全ではありません。

対策:

1. origin への直接アクセスをファイアウォールで制限する
2. 可能なら Cloudflare 送信元 IP のみ許可する
3. Docker / reverse proxy 側で不要ポートを公開しない
4. Ollama と TTS は外部へ直接 publish しない

最低でも、Ollama の `11434` と TTS の `5000` をインターネットへ直接開けないでください。

### 7-1. 自前トンネルで公開する場合

Cloudflare Access を使わず、自前のトンネルで公開する構成も可能です。

例:

1. 自前 reverse proxy + トンネル
2. SSH reverse tunnel
3. FRP 系トンネル
4. WireGuard / Tailscale / Headscale のような閉域ネットワーク

この場合の基本構成は次の通りです。

- 利用者ブラウザ → 自前トンネル入口 → フロントアプリ
- フロントアプリ → Ollama
- フロントアプリ → TTS
- 必要なら フロントアプリ → Injection Tool

重要なのは、トンネルがあること自体は認証ではない、という点です。単に穴を開けるだけのトンネルだと、URL を知っている相手が到達できてしまいます。

自前トンネル公開の推奨条件:

1. トンネル入口で認証をかける
2. 入口で IP 制限または VPN 制限をかける
3. フロントアプリ側では `AMICA_CHAT_PROXY_PUBLIC=false` と `AMICA_TTS_PROXY_PUBLIC=false` を維持する
4. 必要なら中継側で `x-amica-api-key` を付与する
5. origin 側で Ollama と TTS を外部公開しない
6. tunnel 側にも rate limiting と request size 制限を入れる

推奨しない構成:

1. 認証なしトンネルで 3000 番をそのまま公開する
2. さらに `AMICA_CHAT_PROXY_PUBLIC=true` と `AMICA_TTS_PROXY_PUBLIC=true` にする

この構成は、Cloudflare Access なしの匿名公開とほぼ同じで、第三者利用のリスクが高いです。

### 7-2. 自前トンネル公開の env 例

トンネル入口で認証し、フロントアプリ側でも API key を維持する例です。

```env
NODE_ENV=production

AMICA_TRUST_CLOUDFLARE_ACCESS=false
AMICA_SERVER_API_KEY=replace-with-long-random-string

AMICA_CHAT_PROXY_PUBLIC=false
AMICA_TTS_PROXY_PUBLIC=false
AMICA_DATA_HANDLER_PUBLIC=false
AMICA_LEGACY_EXTERNAL_API_PUBLIC=false
AMICA_OPENAI_PROXY_PUBLIC=false

OLLAMA_URL=http://ollama:11434
STYLEBERTVITS2_URL=http://style-bert-vits2:5000
```

この場合は、公開側トンネルまたは reverse proxy が利用者認証を担当し、必要ならフロントアプリへ API key を付けて中継します。

## 8. 匿名公開したい場合の扱い

Cloudflare Access を使わず、誰でもブラウザから使える公開にしたい場合は、保護と利便性の両立は弱くなります。

その場合のみ、必要に応じて次を設定します。

```env
AMICA_CHAT_PROXY_PUBLIC=true
AMICA_TTS_PROXY_PUBLIC=true
```

ただし、この構成では第三者利用のリスクが上がります。匿名公開にするなら次を必須にしてください。

1. Cloudflare Rate Limiting を強く設定する
2. request body サイズ上限を reverse proxy 側で設定する
3. origin 側監視を入れる
4. 使わない legacy API は引き続き閉じたままにする

補足:

自前トンネルで公開する場合でも、認証なしで一般公開するならこの節と同じリスクを負います。トンネル方式そのものは安全化要素ではなく、認証と制限をどう付けるかが本体です。

## 9. 動作確認手順

### 9-1. 公開前の基本確認

1. フロントアプリのトップ画面が表示される
2. 通常チャットが成功する
3. TTS が成功する
4. Injection Tool 連携を使う場合はドメイン一覧取得が成功する

### 9-2. 保護確認

Cloudflare Access を使う場合:

1. Access 未通過状態で `/api/chat` にアクセスし、拒否されることを確認する
2. Access 通過後に通常操作で chat/TTS が成功することを確認する

API key を使う場合:

```powershell
curl -X POST https://your-front-app-domain.example/api/chat ^
  -H "Content-Type: application/json" ^
  -H "x-amica-api-key: YOUR_API_KEY" ^
  -d "{\"model\":\"your-model\",\"messages\":[{\"role\":\"user\",\"content\":\"hello\"}]}"
```

期待値:

1. API key なしでは 403
2. API key ありでは成功

### 9-3. ログ確認

次を確認します。

1. 403 が大量発生していないか
2. `/api/chat` `/api/tts` の異常連投がないか
3. Injection login 失敗が急増していないか

## 10. 障害時の切り分け

### chat/TTS が 403 になる

確認項目:

1. `NODE_ENV=production` になっているか
2. `AMICA_TRUST_CLOUDFLARE_ACCESS=true` が入っているか
3. Cloudflare Access ヘッダーが origin まで届いているか
4. 代替として API key ヘッダーで通るか

自前トンネル構成では:

1. トンネル入口または reverse proxy が API key を落としていないか
2. tunnel 側認証は通っていても、フロントアプリ側保護条件を満たしているか

### chat/TTS が 502/500 になる

確認項目:

1. `OLLAMA_URL` が正しいか
2. `STYLEBERTVITS2_URL` が正しいか
3. upstream が起動しているか
4. reverse proxy が body サイズや timeout で切っていないか

### Injection Tool 連携だけ失敗する

確認項目:

1. `NEXT_PUBLIC_INJECTION_TOOL_ENABLED=true` になっているか
2. `NEXT_PUBLIC_INJECTION_TOOL_URL` がブラウザから見て正しいか
3. `/api/injection/*` への WAF 制御が厳しすぎないか

## 11. 運用ルール

1. 本物の秘密鍵は `NEXT_PUBLIC_*` に入れない
2. 新しい API を追加したら、公開前に保護対象かどうかを必ず確認する
3. Cloudflare 側だけに依存せず、アプリ側でも default closed を維持する
4. chat/TTS を public に戻す時は、期限と理由を明記する

## 12. 最小公開チェックリスト

以下をすべて満たしたら公開可能です。

- Cloudflare Proxy が有効
- origin 直アクセスを制限済み
- `AMICA_TRUST_CLOUDFLARE_ACCESS=true`
- `AMICA_CHAT_PROXY_PUBLIC=false`
- `AMICA_TTS_PROXY_PUBLIC=false`
- `AMICA_DATA_HANDLER_PUBLIC=false`
- `AMICA_LEGACY_EXTERNAL_API_PUBLIC=false`
- `AMICA_OPENAI_PROXY_PUBLIC=false`
- `AMICA_SERVER_API_KEY` 設定済み
- `NEXT_PUBLIC_*` に本物の秘密情報を入れていない
- `/api/chat` `/api/tts` の動作確認済み
- Cloudflare Rate Limiting 設定済み

Cloudflare Access を使わない場合の追加条件:

- トンネル入口または reverse proxy で認証済み
- API key 中継または VPN 制限がある

以上です。