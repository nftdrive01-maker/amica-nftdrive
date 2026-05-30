import * as THREE from "three";
import { useContext, useCallback, useState, useEffect, useRef } from "react";
import { ViewerContext } from "@/features/vrmViewer/viewerContext";
import { buildUrl } from "@/utils/buildUrl";
import { CONFIG_UPDATED_EVENT, config } from "@/utils/config";
import { useVrmStoreContext } from "@/features/vrmStore/vrmStoreContext";
import isTauri from "@/utils/isTauri";
import { invoke } from "@tauri-apps/api/tauri";
import { ChatContext } from "@/features/chat/chatContext";
import clsx from "clsx";

const VRM_STATUS_EVENT = 'amica:vrm-status';
const AVATAR_STATUS_EVENT = 'amica:avatar-status';

function dispatchVrmStatus(state: 'idle' | 'loading' | 'ready' | 'error', url?: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(VRM_STATUS_EVENT, { detail: { state, url } }));
}

function dispatchAvatarStatus(state: 'idle' | 'loading' | 'ready' | 'error', url?: string, message?: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(AVATAR_STATUS_EVENT, {
    detail: { state, assetType: 'vrm', url, message },
  }));
}

function formatVrmErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }

  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== '{}') {
      return serialized;
    }
  } catch {
    // ignore serialization errors and fall back to the default message
  }

  return 'Unknown VRM loading error';
}

export default function VrmViewer({ chatMode }: { chatMode: boolean }) {
  const { chat: bot } = useContext(ChatContext);
  const { viewer } = useContext(ViewerContext);
  const { getCurrentVrm, vrmList, vrmListAddFile, isLoadingVrmList } =
    useVrmStoreContext();
  const [vrmEnabled, setVrmEnabled] = useState(config("vrm_enabled") === 'true');
  const [isVrmLocal, setIsVrmLocal] = useState("local" == config("vrm_save_type"));
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState("");
  const [loadingError, setLoadingError] = useState(false);
  const [loadingErrorMessage, setLoadingErrorMessage] = useState("");
  const [configuredVrmUrl, setConfiguredVrmUrl] = useState(config("vrm_url").trim());

  // キャンバスが viewer にアタッチされたことを追跡するフラグ
  const [canvasReady, setCanvasReady] = useState(false);
  // 読み込み完了済み URL と進行中 URL を分離して、promise 解決前に ready 扱いしないようにする
  const loadedUrlRef = useRef<string | null>(null);
  const loadingUrlRef = useRef<string | null>(null);
  const loadRequestIdRef = useRef(0);
  // getCurrentVrm を ref で保持し、useEffect の deps から外すことで
  // VRM リスト変化ごとの無用な再実行を防ぐ
  const getCurrentVrmRef = useRef(getCurrentVrm);
  useEffect(() => {
    getCurrentVrmRef.current = getCurrentVrm;
  }, [getCurrentVrm]);

  useEffect(() => {
    viewer.resizeChatMode(chatMode);
    const onResize = () => {
      viewer.resizeChatMode(chatMode);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [viewer, chatMode]);

  useEffect(() => {
    const handleConfigUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail as { key?: string; batch?: boolean; keys?: string[] };
      // VRM に無関係なキー更新（system_prompt, name 等）では反応しない
      const vrmKeys = new Set(['vrm_enabled', 'vrm_save_type', 'vrm_url', 'vrm_hash']);
      let hasVrmKey = false;
      if (detail.batch && detail.keys) {
        hasVrmKey = detail.keys.some((k) => vrmKeys.has(k));
      } else if (detail.key) {
        hasVrmKey = vrmKeys.has(detail.key);
      }
      if (!hasVrmKey) return;

      setVrmEnabled(config("vrm_enabled") === 'true');
      setIsVrmLocal("local" == config("vrm_save_type"));
      setConfiguredVrmUrl(config("vrm_url").trim());
    };

    window.addEventListener(CONFIG_UPDATED_EVENT, handleConfigUpdated);
    return () => {
      window.removeEventListener(CONFIG_UPDATED_EVENT, handleConfigUpdated);
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // canvasRef: キャンバスを viewer に一度だけアタッチする。
  // 依存配列を [viewer, vrmListAddFile] に限定し、
  // chatSpeaking などの無関係な state 変化で再実行されないようにする。
  // ─────────────────────────────────────────────────────────────────────────
  const canvasRef = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (!canvas) return;

      viewer.setup(canvas).then(() => {
        setCanvasReady(true);
      }).catch((e) => {
        console.error("viewer setup error", e);
      });

      // ドラッグ & ドロップで VRM ファイルを交換できるようにする
      canvas.addEventListener("dragover", function (event) {
        event.preventDefault();
      });

      canvas.addEventListener("drop", function (event) {
        event.preventDefault();

        const files = event.dataTransfer?.files;
        if (!files) return;

        const file = files[0];
        if (!file) return;

        const file_type = file.name.split(".").pop();
        if (file_type === "vrm") {
          vrmListAddFile(file, viewer);
        }
      });
    },
    // viewer と vrmListAddFile はいずれもモジュールレベルのシングルトンまたは
    // useCallback([]) で安定した参照のため、このコールバックは mount 後に変化しない
    [viewer, vrmListAddFile],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // VRM 読込みエフェクト:
  //   canvasReady / vrmEnabled / isVrmLocal / isLoadingVrmList / getCurrentVrm
  //   のいずれかが変化したときだけ実行する。
  //   chatSpeaking など VRM に無関係な state 変化では実行されない。
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!canvasReady) return;

    if (!vrmEnabled || !configuredVrmUrl) {
      loadRequestIdRef.current += 1;
      viewer.unloadVRM();
      loadedUrlRef.current = null;
      loadingUrlRef.current = null;
      setLoadingError(false);
      setLoadingErrorMessage("");
      setIsLoading(false);
      dispatchVrmStatus('idle');
      dispatchAvatarStatus('idle');
      return;
    }

    if (!isVrmLocal || !isLoadingVrmList) {
      // getCurrentVrm を ref 経由で参照し、deps への追加を避ける
      const currentVrm = getCurrentVrmRef.current();
      if (!currentVrm) {
        loadRequestIdRef.current += 1;
        loadedUrlRef.current = null;
        loadingUrlRef.current = null;
        setIsLoading(false);
        setLoadingError(true);
        setLoadingErrorMessage(`Configured VRM was not found in the loaded VRM list: ${configuredVrmUrl}`);
        dispatchVrmStatus('error', configuredVrmUrl);
        dispatchAvatarStatus('error', configuredVrmUrl, `Configured VRM was not found in the loaded VRM list: ${configuredVrmUrl}`);
        if (isTauri()) invoke("close_splashscreen");
        return;
      }

      const resolvedVrmUrl = buildUrl(currentVrm.url);

      if (loadedUrlRef.current === resolvedVrmUrl) {
        setIsLoading(false);
        setLoadingError(false);
        setLoadingErrorMessage("");
        dispatchVrmStatus('ready', resolvedVrmUrl);
        dispatchAvatarStatus('ready', resolvedVrmUrl);
        return;
      }

      if (loadingUrlRef.current === resolvedVrmUrl) {
        setIsLoading(true);
        setLoadingError(false);
        setLoadingErrorMessage("");
        dispatchVrmStatus('loading', resolvedVrmUrl);
        dispatchAvatarStatus('loading', resolvedVrmUrl);
        return;
      }

      loadingUrlRef.current = resolvedVrmUrl;
      loadedUrlRef.current = null;
      const requestId = ++loadRequestIdRef.current;

      setIsLoading(true);
      setLoadingError(false);
      setLoadingErrorMessage("");
      dispatchVrmStatus('loading', resolvedVrmUrl);
      dispatchAvatarStatus('loading', resolvedVrmUrl);

      viewer.loadVrm(resolvedVrmUrl, (progress) => {
        console.log(`loading model ${progress}`);
      })
        .then(() => {
          if (requestId !== loadRequestIdRef.current) {
            return;
          }

          console.log("vrm loaded");
          loadingUrlRef.current = null;
          loadedUrlRef.current = resolvedVrmUrl;
          setLoadingError(false);
          setLoadingErrorMessage("");
          setIsLoading(false);
          dispatchVrmStatus('ready', resolvedVrmUrl);
          dispatchAvatarStatus('ready', resolvedVrmUrl);
          if (isTauri()) invoke("close_splashscreen");
        })
        .catch((e) => {
          if (requestId !== loadRequestIdRef.current) {
            return;
          }

          console.error("vrm loading error", e);
          loadingUrlRef.current = null;
          loadedUrlRef.current = null;
          setLoadingError(true);
          setLoadingErrorMessage(formatVrmErrorMessage(e));
          setIsLoading(false);
          dispatchVrmStatus('error', resolvedVrmUrl);
          dispatchAvatarStatus('error', resolvedVrmUrl, formatVrmErrorMessage(e));
          if (isTauri()) invoke("close_splashscreen");
        });
    }
  // getCurrentVrm は ref 経由で参照するため deps に含めない
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasReady, vrmEnabled, configuredVrmUrl, isVrmLocal, isLoadingVrmList, viewer]);

  return (
    <div
      className={clsx(
        "fixed top-0 h-full w-full",
        chatMode ? "left-0 pointer-events-none z-0 lg:-left-[10vw]" : "left-0 z-0",
      )}>
      <canvas
        ref={canvasRef}
        className={"h-full w-full"}
        style={{ display: vrmEnabled && configuredVrmUrl ? "block" : "none" }}
      ></canvas>
      {isLoading && (
        <div
          className={
            "absolute left-0 top-0 flex h-full w-full items-center justify-center bg-black bg-opacity-50"
          }>
          <div className={"text-2xl text-white"}>{loadingProgress}</div>
        </div>
      )}
      {loadingError && (
        <div
          className={
            "absolute left-0 top-0 flex h-full w-full items-center justify-center bg-black bg-opacity-50"
          }>
          <div className={"max-w-[min(90vw,56rem)] rounded-lg bg-black/60 px-6 py-4 text-center text-white"}>
            <div className={"text-2xl"}>Error loading VRM model...</div>
            <div className={"mt-3 break-words whitespace-pre-wrap text-sm text-red-100"}>
              {loadingErrorMessage || 'Unknown VRM loading error'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
