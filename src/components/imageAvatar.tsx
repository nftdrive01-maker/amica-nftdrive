import { useEffect, useMemo, useState } from "react";
import { CONFIG_UPDATED_EVENT, config } from "@/utils/config";

const AVATAR_STATUS_EVENT = 'amica:avatar-status';

function dispatchAvatarStatus(state: 'idle' | 'loading' | 'ready' | 'error', assetType: 'image', url?: string, message?: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(AVATAR_STATUS_EVENT, {
    detail: { state, assetType, url, message },
  }));
}

type ImageAvatarProps = {
  speaking: boolean;
};

export function ImageAvatar({ speaking }: ImageAvatarProps) {
  const [vrmEnabled, setVrmEnabled] = useState(config("vrm_enabled") === "true");
  const [idleUrl, setIdleUrl] = useState(config("image_avatar_idle_url").trim());
  const [talkUrl, setTalkUrl] = useState(config("image_avatar_talk_url").trim());
  const [intervalMsRaw, setIntervalMsRaw] = useState(
    Number(config("image_avatar_talk_interval_ms")),
  );
  const intervalMs = Number.isFinite(intervalMsRaw) ? Math.max(60, intervalMsRaw) : 180;

  const canAnimate = speaking && talkUrl.length > 0;
  const [isTalkFrame, setIsTalkFrame] = useState(false);

  useEffect(() => {
    const handleConfigUpdated = () => {
      setVrmEnabled(config("vrm_enabled") === "true");
      setIdleUrl(config("image_avatar_idle_url").trim());
      setTalkUrl(config("image_avatar_talk_url").trim());
      setIntervalMsRaw(Number(config("image_avatar_talk_interval_ms")));
    };

    window.addEventListener(CONFIG_UPDATED_EVENT, handleConfigUpdated);
    return () => {
      window.removeEventListener(CONFIG_UPDATED_EVENT, handleConfigUpdated);
    };
  }, []);

  useEffect(() => {
    if (!canAnimate) {
      setIsTalkFrame(false);
      return;
    }

    const timer = window.setInterval(() => {
      setIsTalkFrame((prev) => !prev);
    }, intervalMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [canAnimate, intervalMs]);

  const currentSrc = useMemo(() => {
    if (!idleUrl) {
      return "";
    }
    if (!canAnimate) {
      return idleUrl;
    }
    return isTalkFrame ? talkUrl : idleUrl;
  }, [canAnimate, idleUrl, isTalkFrame, talkUrl]);

  useEffect(() => {
    if (vrmEnabled || !idleUrl) {
      return;
    }

    let cancelled = false;
    dispatchAvatarStatus('loading', 'image', idleUrl);

    const img = new Image();
    img.onload = () => {
      if (cancelled) {
        return;
      }
      dispatchAvatarStatus('ready', 'image', idleUrl);
    };
    img.onerror = () => {
      if (cancelled) {
        return;
      }
      dispatchAvatarStatus('error', 'image', idleUrl, `Failed to load image avatar: ${idleUrl}`);
    };
    img.src = idleUrl;

    return () => {
      cancelled = true;
    };
  }, [idleUrl, vrmEnabled]);

  if (vrmEnabled || !currentSrc) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed left-0 top-0 z-0 h-full w-full flex items-center justify-center">
      <img
        src={currentSrc}
        alt="Custom avatar"
        className="max-h-[78vh] max-w-[75vw] object-contain"
      />
    </div>
  );
}
