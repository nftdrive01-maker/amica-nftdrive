/**
 * Hybrid Cache Logic with TTL
 * ブラウザ側で注入コンテキストをTTL付きでキャッシュ
 * オフライン時や注入APIが利用不可時のフォールバック用
 */

import { InjectionInterceptResponse } from '@/types/injection';

const CACHE_KEY_PREFIX = 'amica_injection_cache_';
const CACHE_METADATA_KEY = 'amica_injection_metadata_';

interface CachedInjection {
  data: InjectionInterceptResponse;
  timestamp: number;
  ttl: number; // 秒
}

/**
 * キャッシュから注入データを取得
 * @param domainId ドメインID
 * @returns キャッシュ内のデータが有効時は返す、無効時は null
 */
export function getCachedInjection(domainId: string): InjectionInterceptResponse | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  try {
    const cacheKey = CACHE_KEY_PREFIX + domainId;
    const cached = localStorage.getItem(cacheKey);

    if (!cached) {
      return null;
    }

    const injection: CachedInjection = JSON.parse(cached);
    const age = Date.now() - injection.timestamp;
    const isExpired = age > injection.ttl * 1000;

    if (isExpired) {
      // 有効期限切れ → 削除
      localStorage.removeItem(cacheKey);
      return null;
    }

    return injection.data;
  } catch (err) {
    console.warn('Error retrieving injection cache:', err);
    return null;
  }
}

/**
 * 注入データをキャッシュに保存
 * @param domainId ドメインID
 * @param data レスポンスデータ
 */
export function cacheInjection(
  domainId: string,
  data: InjectionInterceptResponse
): void {
  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    const ttl = data.metadata?.ttl || 3600; // デフォルト1時間
    const cached: CachedInjection = {
      data,
      timestamp: Date.now(),
      ttl,
    };

    const cacheKey = CACHE_KEY_PREFIX + domainId;
    localStorage.setItem(cacheKey, JSON.stringify(cached));
  } catch (err) {
    console.warn('Error caching injection data:', err);
  }
}

/**
 * 注入キャッシュをクリア（管理用）
 */
export function clearInjectionCache(): void {
  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (key.startsWith(CACHE_KEY_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  } catch (err) {
    console.warn('Error clearing injection cache:', err);
  }
}

/**
 * キャッシュの統計情報を取得（デバッグ用）
 */
export function getInjectionCacheStats(): {
  entries: number;
  cacheKeys: string[];
} {
  if (typeof localStorage === 'undefined') {
    return { entries: 0, cacheKeys: [] };
  }

  try {
    const keys = Object.keys(localStorage).filter((key) =>
      key.startsWith(CACHE_KEY_PREFIX)
    );
    return { entries: keys.length, cacheKeys: keys };
  } catch (err) {
    console.warn('Error getting cache stats:', err);
    return { entries: 0, cacheKeys: [] };
  }
}
