import { Dispatch, PropsWithChildren, SetStateAction, createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from "react";
import { VrmData } from "./vrmData";
import { vrmList } from "@/paths";
import { thumbPrefix } from "@/components/settings/common";
import { AddItemCallbackType, VrmStoreActionType, vrmStoreReducer } from "./vrmStoreReducer";
import { Viewer } from "../vrmViewer/viewer";
import { config, defaultConfig, updateConfig } from "@/utils/config";
import { handleConfig } from "@/features/externalAPI/externalAPI";

interface VrmStoreContextType {
    getCurrentVrm: () => VrmData | undefined;
    vrmList: VrmData[];
    vrmListAddFile: (file: File, viewer: Viewer) => void;
    isLoadingVrmList: boolean;
    setIsLoadingVrmList: Dispatch<SetStateAction<boolean>>;
};

const vrmInitList = vrmList.map((url: string) => {
    return new VrmData(url, url, `${thumbPrefix(url)}.jpg`, 'web');
});

export const VrmStoreContext = createContext<VrmStoreContextType>({
    getCurrentVrm: () => {return undefined;},
    vrmList: vrmInitList,
    vrmListAddFile: () => {},
    isLoadingVrmList: false, setIsLoadingVrmList: () => {}
});

export const VrmStoreProvider = ({ children }: PropsWithChildren<{}>): JSX.Element => {
    const [isLoadingVrmList, setIsLoadingVrmList] = useState(true);
    const [configInitialized, setConfigInitialized] = useState(false);
    const [loadedVrmList, vrmListDispatch] = useReducer(vrmStoreReducer, vrmInitList);
    
    const vrmListAddFile = useCallback((file: File, viewer: Viewer) => {
        vrmListDispatch({ type: VrmStoreActionType.addItem, itemFile: file, callback: (callbackProp: AddItemCallbackType) => {
            viewer.loadVrm(callbackProp.url, (progress: string) => {
              // TODO handle loading progress
            })
              .then(() => {return new Promise(resolve => setTimeout(resolve, 300));})
              .then(() => {
                updateConfig("vrm_url", callbackProp.url);
                updateConfig("vrm_hash", callbackProp.hash);
                updateConfig("vrm_save_type", "local");
                viewer.getScreenshotBlob((thumbBlob: Blob | null) => {
                  if (!thumbBlob) return;
                  vrmListDispatch({ type: VrmStoreActionType.updateVrmThumb, url: callbackProp.url, thumbBlob, vrmList: callbackProp.vrmList, callback: (updatedThumbVrmList: VrmData[]) => {
                    vrmListDispatch({ type: VrmStoreActionType.setVrmList, vrmList: updatedThumbVrmList });
                  }});
                });
              });
        }});
    // vrmListDispatch は React の useReducer dispatch であり参照が安定している
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Wait for config initialization to complete before loading VRM list from storage
    useEffect(() => {
        (async () => {
            if (typeof window !== "undefined") {
                await handleConfig("init");
                
                // Domain-specific avatar/VRM config is applied from MessageInput.
                // Avoid writing the same keys here to prevent startup race conditions.
            }
            setConfigInitialized(true);
        })();
    }, []);

    useEffect(() => {
        if (!configInitialized) return;
        
        vrmListDispatch({ type: VrmStoreActionType.loadFromLocalStorage, vrmList: vrmInitList, callback: (updatedVmList: VrmData[]) => {
            vrmListDispatch({ type: VrmStoreActionType.setVrmList, vrmList: updatedVmList });
            setIsLoadingVrmList(false);
        }});
    }, [configInitialized]);

    const getCurrentVrm = useCallback(() => {
        if (config('vrm_save_type') == 'local') {
            return loadedVrmList.find((vrm) => vrm.getHash() == config('vrm_hash'));
        }

        const configuredUrl = config('vrm_url').trim();
        if (!configuredUrl) {
            return undefined;
        }

        const existingWebVrm = loadedVrmList.find((vrm) => vrm.url == configuredUrl);
        if (existingWebVrm) {
            return existingWebVrm;
        }

        return new VrmData(configuredUrl, configuredUrl, '/vrm/thumb-placeholder.jpg', 'web');
    }, [loadedVrmList]);

    const contextValue = useMemo(() => ({
        getCurrentVrm,
        vrmList: loadedVrmList,
        vrmListAddFile,
        isLoadingVrmList,
        setIsLoadingVrmList,
    }), [getCurrentVrm, loadedVrmList, vrmListAddFile, isLoadingVrmList]);

    return (
        <VrmStoreContext.Provider value={contextValue}>
            {children}
        </VrmStoreContext.Provider>
    );
};

export const useVrmStoreContext = () => {
    const context = useContext(VrmStoreContext);

    if (!context) {
        throw new Error("useVrmStoreContext must be used inside the VrmStoreProvider");
    }

    return context;
};
