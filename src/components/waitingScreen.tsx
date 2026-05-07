import { useEffect, useState, useCallback } from 'react';
import { fetchSessionStatus, acquireSession, POLL_INTERVAL_MS } from '@/lib/sessionManager';
import type { SessionStatus } from '@/lib/sessionManager';

interface WaitingScreenProps {
  domainId: string;
  onAcquired: (sessionId: string) => void;
}

export function WaitingScreen({ domainId, onAcquired }: WaitingScreenProps) {
  const [status, setStatus] = useState<SessionStatus>({ current: 0, max: 0, available: false });
  const [dots, setDots] = useState('');

  const tryAcquire = useCallback(async () => {
    const result = await acquireSession(domainId);
    if (result.acquired && result.sessionId) {
      onAcquired(result.sessionId);
      return true;
    }
    setStatus({ current: result.current, max: result.max, available: false });
    return false;
  }, [domainId, onAcquired]);

  // ポーリング
  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      const acquired = await tryAcquire();
      if (!acquired && !cancelled) {
        setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    poll();
    return () => { cancelled = true; };
  }, [tryAcquire]);

  // ドット点滅アニメーション
  useEffect(() => {
    const timer = setInterval(() => {
      setDots((d) => (d.length >= 3 ? '' : d + '。'));
    }, 600);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.82)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        color: 'white',
        fontFamily: 'var(--font-m-plus-2), sans-serif',
        textAlign: 'center',
        padding: '24px',
      }}
    >
      {/* スピナー */}
      <div
        style={{
          width: 56,
          height: 56,
          border: '5px solid rgba(255,255,255,0.2)',
          borderTop: '5px solid #ec4899',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginBottom: 28,
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* 接続数バッジ */}
      {status.max > 0 && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            backgroundColor: 'rgba(236,72,153,0.25)',
            border: '1px solid rgba(236,72,153,0.6)',
            borderRadius: 9999,
            padding: '6px 18px',
            marginBottom: 16,
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: '0.05em',
          }}
        >
          <span style={{ color: '#f9a8d4' }}>{status.current}</span>
          <span style={{ opacity: 0.6 }}>/</span>
          <span style={{ color: '#f9a8d4' }}>{status.max}</span>
          <span style={{ marginLeft: 6, opacity: 0.8 }}>接続中</span>
        </div>
      )}

      <h2
        style={{
          fontSize: 22,
          fontWeight: 700,
          marginBottom: 10,
          lineHeight: 1.5,
        }}
      >
        現在空きがありません
      </h2>

      <p
        style={{
          fontSize: 15,
          opacity: 0.7,
          marginBottom: 4,
          lineHeight: 1.8,
        }}
      >
        しばらくお待ちください{dots}
      </p>
      <p style={{ fontSize: 12, opacity: 0.45 }}>
        空きが出ると自動的に接続されます
      </p>
    </div>
  );
}
