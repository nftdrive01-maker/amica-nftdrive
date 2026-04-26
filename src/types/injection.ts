/**
 * Injection Tool and Amica間で共有される型定義
 * 送信前インターセプト機能のリクエスト/レスポンス契約
 */

/**
 * Amicaがinjection-toolに送信するリクエスト
 */
export interface InjectionInterceptRequest {
  /** ユーザーが入力したテキスト */
  userText: string;

  /** セッションID（オプション）*/
  sessionId?: string;

  /** ドメイン識別子（複数知識ソースの切替に使用） */
  domainId?: string;

  /** メッセージ履歴（コンテキスト含む） */
  messageHistory?: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;

  /** リクエストタイムスタンプ */
  timestamp?: number;
}

/**
 * injection-toolがAmicaに返すレスポンス
 */
export interface InjectionInterceptResponse {
  /** LLMのシステムプロンプトに追加するテキスト */
  injectedSystemPrompt?: string;

  /** ユーザーの入力テキストに追加するコンテキスト */
  injectedUserContext?: string;

  /** メタデータ（アセット、キャッシュTTL等） */
  metadata?: {
    /** 参照したドメインID */
    domainId?: string;

    /** ビジュアルアセット（背景画像パス等） */
    assets?: Record<string, string>;

    /** キャッシュの有効期限（秒） */
    ttl?: number;

    /** バージョン識別（キャッシュヒット判定用） */
    version?: string;
  };

  /** エラー時のメッセージ（内部ログ用） */
  error?: string;
}

/**
 * Fail-open条件の定義（Amica側での実装ガイド）
 *
 * 以下の場合、injection-toolの呼び出しをスキップし、ユーザー入力をそのまま処理する：
 * - エンドポイントURLが未設定（NEXT_PUBLIC_INJECTION_TOOL_URL/INJECTION_TOOL_INTERNAL_URL 両方不在）
 * - HTTP 5xx エラー
 * - ネットワークタイムアウト（推奨: 2秒以内）
 * - JSON解析エラー
 * - レスポンス不正フォーマット
 *
 * 目的: injection-tool停止・障害時にも Amica本体が確実に稼働継続する
 */

/**
 * ヘルス チェック用レスポンス
 */
export interface HealthCheckResponse {
  status: 'ok' | 'error';
  timestamp: number;
  version?: string;
}
