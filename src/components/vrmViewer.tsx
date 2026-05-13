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

  // キャンバスが viewer にアタッチされたことを追跡するフラグ
  const [canvasReady, setCanvasReady] = useState(false);
  // 直前にロードした VRM の URL を保持し、同じ URL の二重ロードを防ぐ
  const lastLoadedUrlRef = useRef<string | null>(null);
  // getCurrentVrm を ref で保持し、useEffect の deps から外すことで
  // VRM リスト変化ごとの無用な再実行を防ぐ
  const getCurrentVrmRef = useRef(getCurrentVrm);
  useEffect(() => {
    getCurrentVrmRef.current = getCurrentVrm;
  }, [getCurrentVrm]);

  // messageInput.tsx の applyDomainOverrides が VRM を直接ロードした場合に
  // lastLoadedUrlRef を同期して useEffect による二重ロードを防ぐ
  useEffect(() => {
    const handler = (e: Event) => {
      const url = (e as CustomEvent).detail?.url as string | undefined;
      if (url) lastLoadedUrlRef.current = url;
    };
    window.addEventListener('amica:vrm-externally-loaded', handler);
    return () => window.removeEventListener('amica:vrm-externally-loaded', handler);
  }, []);

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

      // viewer.setup() 内でも isReady ガードを行っているが、
      // コンポーネント側でも guard して不要な async 処理を起動しない
      if (viewer.isReady) {
        // キャンバスは既に設定済み。drag & drop リスナーだけ付け直す必要はないが
        // 安全のため canvasReady フラグだけ確認する。
        setCanvasReady(true);
        return;
      }

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

    if (!vrmEnabled) {
      setIsLoading(false);
      return;
    }

    if (!isVrmLocal || !isLoadingVrmList) {
      // getCurrentVrm を ref 経由で参照し、deps への追加を避ける
      const currentVrm = getCurrentVrmRef.current();
      if (!currentVrm) {
        setIsLoading(true);
        if (isTauri()) invoke("close_splashscreen");
        return;
      }

      const vrmUrl = buildUrl(currentVrm.url);

      // 同じ URL を連続してロードしないようにガード
      if (lastLoadedUrlRef.current === vrmUrl) {
        return;
      }
      lastLoadedUrlRef.current = vrmUrl;

      setIsLoading(true);
      setLoadingError(false);

      viewer.loadVrm(vrmUrl, (progress) => {
        console.log(`loading model ${progress}`);
      })
        .then(() => {
          console.log("vrm loaded");
          setLoadingError(false);
          setIsLoading(false);
          if (isTauri()) invoke("close_splashscreen");
        })
        .catch((e) => {
          console.error("vrm loading error", e);
          lastLoadedUrlRef.current = null;
          setLoadingError(true);
          setIsLoading(false);
          if (isTauri()) invoke("close_splashscreen");
        });
    }
  // getCurrentVrm は ref 経由で参照するため deps に含めない
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasReady, vrmEnabled, isVrmLocal, isLoadingVrmList, viewer]);

  return (
    <div
      className={clsx(
        "z-1 fixed left-0 top-0 h-full w-full",
        chatMode ? "left-[65%] top-[50%]" : "left-0 top-0",
      )}>
      <canvas
        ref={canvasRef}
        className={"h-full w-full"}
        style={{ display: vrmEnabled ? "block" : "none" }}
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
          <div className={"text-2xl text-white"}>
            Error loading VRM model...
          </div>
        </div>
      )}
    </div>
  );
}
