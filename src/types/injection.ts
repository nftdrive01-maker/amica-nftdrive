/**
 * Injection Tool and Amica間で共有される型定義
 * 送信前インターセプト機能のリクエスト/レスポンス契約
 */

/**
 * Amicaがinjection-toolに送信するリクエスト
 */
export interface InjectionInterceptRequest {
  /** リクエストID（監査ログ相関用） */
  requestId?: string;

  /** ユーザーが入力したテキスト */
  userText: string;

  /** ユーザー入力由来か（自動発話・内部発話は false） */
  isUserInput?: boolean;

  /** セッションID（オプション）*/
  sessionId?: string;

  /** ドメイン識別子（複数知識ソースの切替に使用） */
  domainId?: string;

  /** クライアント申告のattach情報（サーバー側では信用しない） */
  attachedPackIds?: string[];

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

  /** DB検索結果の表示用ペイロード（system promptには生データを混ぜない） */
  dbResult?: {
    /** タイトル表示用ラベル */
    title?: string;

    /** データソース名 */
    sourceName?: string;

    /** ツール名 */
    toolName?: string;

    /** AIに見せる短い要約 */
    summary?: string;

    /** 検索条件として使った入力文 */
    queryText?: string;

    /** 並び順の簡易ラベル */
    sortLabel?: string;

    /** 総件数 */
    totalCount?: number;

    /** プレビュー列 */
    previewColumns?: string[];

    /** プレビュー行 */
    previewRows?: Array<Record<string, string | number | boolean | null>>;
  };

  /** CHRONICLEの応答（表示用。system promptには混ぜない） */
  chronicle?: {
    /** タイトルチップ表示用ラベル */
    title?: string;

    /** CHRONICLEの生応答 */
    content?: string;

    /** CHRONICLE名 */
    sourceName?: string;
  };

  /** メタデータ（アセット、キャッシュTTL等） */
  metadata?: {
    /** リクエストID（監査ログ相関用） */
    requestId?: string;

    /** セッションID */
    sessionId?: string;

    /** 参照したドメインID */
    domainId?: string;

    /** ビジュアルアセット（背景画像パス等） */
    assets?: Record<string, string>;

    /** キャッシュの有効期限（秒） */
    ttl?: number;

    /** バージョン識別（キャッシュヒット判定用） */
    version?: string;

    /** MCPを実行したか */
    mcpUsed?: boolean;

    /** 実行に利用したMCPサーバーID */
    mcpServerId?: string;

    /** 実行したMCPツール名 */
    mcpToolName?: string;

    /** MCP実行時のエラー */
    mcpError?: string;

    /** MCP実行時のエラーコード */
    mcpErrorCode?: string;

    guideAction?: {
      type: 'start';
      domainId: string;
      guideId: string;
      announcementText?: string;
      guide: {
        deck_id: string;
        version: string;
        title: string;
        description: string;
        tags: string[];
        slides: Array<{
          slide_no: number;
          type: 'web' | 'image' | 'qa';
          url?: string;
          title?: string;
          display_seconds?: number;
          notes: string;
          qa?: {
            keywords: string[];
            context: string;
          };
        }>;
        qa_context?: {
          enabled: boolean;
          source: string;
        };
        after_guide?: {
          mode: 'end' | 'qa' | 'loop';
          qa_behavior?: 'jump_to_related_slide';
          fallback?: 'end';
        };
      };
    };

    /** サーバー側で解決されたアタッチ済みPack */
    attachedPackIds?: string[];

    /** CHRONICLEを実行したか */
    chronicleUsed?: boolean;

    /** 実行したCHRONICLE名 */
    chronicleName?: string;

    /** CHRONICLE実行時のエラー */
    chronicleError?: string;

    /** ドメインに有効なCHRONICLEが接続されているか */
    chronicleAttached?: boolean;

    /** 今回の入力でCHRONICLE明示トリガーが検出されたか */
    chronicleTriggered?: boolean;

    /** 厳格なFetch形式を要求したか */
    strictFetchRequired?: boolean;

    /** 厳格なFetch形式の注入を行ったか */
    strictFetchInjected?: boolean;
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
