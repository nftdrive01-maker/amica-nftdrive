# Amica Cloudflare 公開セキュリティ監査レポート

作成日: 2026-05-25

対象:
- Amica 本体の外部公開面
- Cloudflare 越しに到達する Next.js Pages API / App Router API / BFF
- injection-tool 連携用の公開経路

前提:
- Cloudflare はリバースプロキシ/WAF として前段に置かれる
- Amica origin は外部から到達可能な状態を想定する
- 本レポートは Amica 側コードを対象とし、Cloudflare ダッシュボード設定値までは監査対象外

## 結論

現状の Amica は、以前より大きく安全になっていますが、Cloudflare 公開を「安全」と断言できる状態ではありません。

特に以下が残存高リスクです。

1. `/api/chat` が無認証の Ollama proxy のまま公開されている
2. `/api/tts` が無認証の Style-Bert-VITS2 proxy のまま公開されている
3. 運用ミスで `NEXT_PUBLIC_*` に秘密情報を入れると、クライアントへ露出し得る設計が残っている

一方で、以前危険だった legacy API 群と `pages/api/openai/chat.ts` は既定で保護されるよう改善済みです。

## 主要 findings

### High: `/api/chat` が無認証のまま内部 Ollama への公開 proxy になっている

根拠:
- [amica/src/app/api/chat/route.ts](src/app/api/chat/route.ts#L3)
- [amica/src/app/api/chat/route.ts](src/app/api/chat/route.ts#L45)

内容:
- `POST /api/chat` は認証・API key 検証・レート制限なしで利用可能です。
- 内部の Ollama に対してそのままリクエストを転送しています。
- Cloudflare 公開時には第三者がこの endpoint を LLM 推論窓口として使えます。

影響:
- GPU/CPU 資源の消費
- 推論待ちによる正規利用者への性能劣化
- origin 側の高負荷・DoS 的悪用

評価:
- Cloudflare WAF だけでは不十分です。
- アプリ側の認証または厳格なレート制限が必要です。

### High: `/api/tts` が無認証のまま内部 TTS への公開 proxy になっている

根拠:
- [amica/src/app/api/tts/route.ts](src/app/api/tts/route.ts#L3)
- [amica/src/app/api/tts/route.ts](src/app/api/tts/route.ts#L13)

内容:
- `POST /api/tts` は認証なしで音声合成要求を内部 TTS へ転送します。
- text パラメータの長さ制限、利用者認証、レート制限がコード上ありません。

影響:
- TTS サーバー資源の枯渇
- 公開音声生成 API としての不正利用
- origin 側の帯域/CPU 使用量増大

評価:
- `/api/chat` と同等に高リスクです。

### Medium: グローバル middleware は実質無効で、ルート追加時の露出事故を防げない

根拠:
- [amica/src/middleware.ts](src/middleware.ts#L6)
- [amica/src/middleware.ts](src/middleware.ts#L11)

内容:
- `AMICA_AUTH_ENABLED !== "true"` なら素通しです。
- さらに true の場合も現在の実装断片では `NextResponse.next()` を返しており、実効的な防御層として機能していません。

影響:
- 今後 API や管理ページが追加された際、個別ガード漏れで公開される可能性があります。
- Cloudflare 設定依存の運用ミスに弱いです。

評価:
- 直ちに exploitable な 1 点ではなく、構造的リスクです。

### Medium: `NEXT_PUBLIC_*` 系に秘密情報を入れるとクライアント露出し得る設計が残っている

根拠:
- [amica/src/utils/config.ts](src/utils/config.ts#L85)
- [amica/src/utils/config.ts](src/utils/config.ts#L107)
- [amica/src/utils/config.ts](src/utils/config.ts#L112)
- [amica/src/utils/config.ts](src/utils/config.ts#L135)
- [amica/src/utils/config.ts](src/utils/config.ts#L149)
- [amica/src/utils/config.ts](src/utils/config.ts#L154)

内容:
- `openrouter_apikey`, `openai_whisper_apikey`, `openai_tts_apikey`, `elevenlabs_apikey`, `coqui_apikey`, `x_api_secret`, `telegram_bot_token` などの初期値が `NEXT_PUBLIC_*` 由来です。
- `secretConfigKeys` で UI 表示はある程度隠していますが、`NEXT_PUBLIC_*` 自体は Next.js の性質上クライアント配信対象です。

影響:
- 運用者が本物の秘密鍵を `NEXT_PUBLIC_...` に入れると、ブラウザ配信で漏えいする可能性があります。

評価:
- コード即時脆弱性というより、設計上の重大な footgun です。

### Medium: `/api/injection/*` は絞られたが、依然として外部公開 BFF 面である

根拠:
- [amica/src/app/api/injection/[...path]/route.ts](src/app/api/injection/[...path]/route.ts)

内容:
- 以前より安全化され、許可経路は限定されています。
- ただし `intercept`, `public/domains`, `public/pronunciations`, `public/chat-history`, `public/domain-access/login`, `public/sessions` は Cloudflare 越しに公開されます。

影響:
- injection-tool の public 面が Amica 側公開面にも現れます。
- 認証試行、セッション取得、intercept 呼び出しなどは引き続き WAF/レート制限対象です。

評価:
- これは設計上必要な公開面ですが、監視・制限前提です。

## 確認できた改善点

### Positive: 旧危険 API 群は既定で保護されている

根拠:
- [amica/src/pages/api/dataHandler.ts](src/pages/api/dataHandler.ts#L13)
- [amica/src/pages/api/amicaHandler.ts](src/pages/api/amicaHandler.ts#L19)
- [amica/src/pages/api/mediaHandler.ts](src/pages/api/mediaHandler.ts#L25)
- [amica/src/pages/api/openai/chat.ts](src/pages/api/openai/chat.ts#L23)
- [amica/src/lib/apiSecurity.ts](src/lib/apiSecurity.ts)

内容:
- 以前は無認証で危険だった `dataHandler`, `amicaHandler`, `mediaHandler`, `openai/chat` は、本番で既定閉塞になっています。
- `x-amica-api-key` または `Authorization: Bearer` による明示解放方式が入りました。

### Positive: asset proxy の返却ヘッダー処理は改善済み

根拠:
- [amica/src/app/api/injection-assets/[...path]/route.ts](src/app/api/injection-assets/[...path]/route.ts)

内容:
- `accept-encoding` を upstream に渡さず、`content-encoding` と `content-length` を除外して返しています。
- これにより asset 404 時のブラウザ側デコード失敗リスクは下がっています。

## Cloudflare 公開時の推奨設定

### 必須

1. `/api/chat` と `/api/tts` にアプリ側保護を追加する
2. Cloudflare WAF / Rate Limiting を `/api/chat`, `/api/tts`, `/api/injection/*` に設定する
3. origin 直アクセスを防ぐ
4. `NEXT_PUBLIC_*` に秘密情報を入れない運用ルールを徹底する

### 推奨

1. `/api/chat` と `/api/tts` へ `AMICA_SERVER_API_KEY` 型の保護を適用する
2. Cloudflare Access または mTLS で管理系経路を追加保護する
3. `middleware.ts` を将来の fail-safe として実装し直す
4. origin 側でリクエストサイズ上限とタイムアウトを厳格化する
5. `intercept` と `public/domain-access/login` に監査ログと失敗回数監視を入れる

## 公開可否の判断

### そのまま全面公開

非推奨です。

理由:
- `/api/chat`
- `/api/tts`
- `/api/injection/*`

が依然として実運用上の攻撃面だからです。

### 条件付き公開

以下を満たすなら実運用は可能です。

1. `/api/chat` と `/api/tts` に認証または強いレート制限を導入
2. Cloudflare 側で API 別ポリシーを設定
3. origin 直アクセスを遮断
4. `NEXT_PUBLIC_*` に秘密を置かない

## 総評

Amica 側は以前より明確に改善しています。特に legacy API と OpenAI proxy の既定閉塞は有効です。

ただし、Cloudflare 公開時の残存本命リスクは `/api/chat` と `/api/tts` の無認証 proxy です。ここを塞がない限り、「安全に公開できる」とは評価しません。