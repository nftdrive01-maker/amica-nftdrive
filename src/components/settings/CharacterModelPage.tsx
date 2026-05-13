import { useTranslation } from 'react-i18next';
import { clsx } from "clsx";
import { useState } from 'react';
import { BasicPage } from "./common";
import { updateConfig, config } from "@/utils/config";
import { TextButton } from "@/components/textButton";
import { VrmData } from '@/features/vrmStore/vrmData';
import { Viewer } from '@/features/vrmViewer/viewer';

export function CharacterModelPage({
  viewer,
  vrmHash,
  vrmUrl,
  vrmSaveType,
  vrmList,
  imageAvatarIdleUrl,
  imageAvatarTalkUrl,
  imageAvatarTalkIntervalMs,
  setVrmHash,
  setVrmUrl,
  setVrmSaveType,
  setImageAvatarIdleUrl,
  setImageAvatarTalkUrl,
  setImageAvatarTalkIntervalMs,
  setSettingsUpdated,
  handleClickOpenVrmFile,
  handleClickOpenImageAvatarIdleFile,
  handleClickOpenImageAvatarTalkFile,
}: {
  viewer: Viewer;
  vrmHash: string;
  vrmUrl: string;
  vrmSaveType: string;
  vrmList: VrmData[],
  imageAvatarIdleUrl: string;
  imageAvatarTalkUrl: string;
  imageAvatarTalkIntervalMs: number;
  setVrmHash: (hash: string) => void;
  setVrmUrl: (url: string) => void;
  setVrmSaveType: (saveType: string) => void;
  setImageAvatarIdleUrl: (url: string) => void;
  setImageAvatarTalkUrl: (url: string) => void;
  setImageAvatarTalkIntervalMs: (value: number) => void;
  setSettingsUpdated: (updated: boolean) => void;
  handleClickOpenVrmFile: () => void;
  handleClickOpenImageAvatarIdleFile: () => void;
  handleClickOpenImageAvatarTalkFile: () => void;
}) {
  const { t } = useTranslation();
  const [vrmEnabled, setVrmEnabled] = useState(config('vrm_enabled') === 'true');

  const handleToggleVrm = async (enabled: boolean) => {
    setVrmEnabled(enabled);
    await updateConfig('vrm_enabled', enabled ? 'true' : 'false');
  };

  return (
    <BasicPage
      title={t("Character Model")}
      description={t("character_desc", "Select the Character to play, currently only default Amica has full range of emotions. Load your own VRMs here.")}
      >
        <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-4">
          <div className="flex items-center space-x-2">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={vrmEnabled}
                onChange={(e) => void handleToggleVrm(e.target.checked)}
                className="rounded"
              />
              <span className="ml-2 text-sm font-medium text-gray-700">
                {t('Show VRM Avatar', 'VRMアバターを表示する')}
              </span>
            </label>
          </div>
        </div>

        {!vrmEnabled && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
            <p className="text-sm text-gray-700">
              {t('VRM avatar is hidden. Enable above to show it.', 'VRMアバターは非表示です。上のチェックを入れると表示されます。')}
            </p>
          </div>
        )}

        <div className="bg-indigo-50 border-l-4 border-indigo-400 p-4 mb-4 space-y-3">
          <div className="text-sm font-medium text-gray-800">{t('2D Avatar (Image)', '2Dアバター（画像）')}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded bg-white p-3 border border-indigo-100">
              <div className="text-xs text-gray-600 mb-2">{t('Default image', 'デフォルト画像')}</div>
              {imageAvatarIdleUrl ? (
                <img src={imageAvatarIdleUrl} alt="avatar default" className="w-full h-32 object-contain bg-gray-50 rounded border" />
              ) : (
                <div className="w-full h-32 bg-gray-50 rounded border flex items-center justify-center text-xs text-gray-400">{t('No image', '未設定')}</div>
              )}
              <div className="mt-2 flex gap-2">
                <TextButton
                  className="text-sm px-3 py-1 bg-secondary hover:bg-secondary-hover active:bg-secondary-active"
                  onClick={handleClickOpenImageAvatarIdleFile}
                >
                  {t('Upload', 'アップロード')}
                </TextButton>
                <TextButton
                  className="text-sm px-3 py-1 bg-gray-400 hover:bg-gray-500 active:bg-gray-600"
                  onClick={() => {
                    setImageAvatarIdleUrl('');
                    void updateConfig('image_avatar_idle_url', '');
                    setSettingsUpdated(true);
                  }}
                >
                  {t('Clear', 'クリア')}
                </TextButton>
              </div>
            </div>

            <div className="rounded bg-white p-3 border border-indigo-100">
              <div className="text-xs text-gray-600 mb-2">{t('Speaking image (optional)', '発話中画像（任意）')}</div>
              {imageAvatarTalkUrl ? (
                <img src={imageAvatarTalkUrl} alt="avatar speaking" className="w-full h-32 object-contain bg-gray-50 rounded border" />
              ) : (
                <div className="w-full h-32 bg-gray-50 rounded border flex items-center justify-center text-xs text-gray-400">{t('Not set (no animation)', '未設定（アニメーションなし）')}</div>
              )}
              <div className="mt-2 flex gap-2">
                <TextButton
                  className="text-sm px-3 py-1 bg-secondary hover:bg-secondary-hover active:bg-secondary-active"
                  onClick={handleClickOpenImageAvatarTalkFile}
                >
                  {t('Upload', 'アップロード')}
                </TextButton>
                <TextButton
                  className="text-sm px-3 py-1 bg-gray-400 hover:bg-gray-500 active:bg-gray-600"
                  onClick={() => {
                    setImageAvatarTalkUrl('');
                    void updateConfig('image_avatar_talk_url', '');
                    setSettingsUpdated(true);
                  }}
                >
                  {t('Clear', 'クリア')}
                </TextButton>
              </div>
            </div>
          </div>

          <div className="rounded bg-white p-3 border border-indigo-100">
            <label className="text-xs text-gray-600 block mb-1">{t('Speaking animation speed (ms)', '発話中アニメーション速度(ms)')}</label>
            <input
              type="number"
              min={60}
              max={2000}
              step={10}
              value={imageAvatarTalkIntervalMs}
              onChange={(event) => {
                const next = Math.max(60, Math.min(2000, Number(event.target.value) || 180));
                setImageAvatarTalkIntervalMs(next);
                void updateConfig('image_avatar_talk_interval_ms', String(next));
                setSettingsUpdated(true);
              }}
              className="block w-full rounded-md border-0 py-1.5 pl-3 pr-3 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-indigo-600 sm:text-sm"
            />
            <div className="mt-1 text-xs text-gray-500">{t('Used only when speaking image is set', '発話中画像を設定したときのみ使用されます')}</div>
          </div>
        </div>

        <div className="rounded-lg shadow-lg bg-white flex flex-wrap justify-center space-x-4 space-y-4 p-4">
          { vrmList.map((vrm) =>
            <button
              key={vrm.url}
              onClick={() => {
                viewer.loadVrm(vrm.url, (progress: string) => {
                  // TODO handle loading progress
                });
                setVrmSaveType(vrm.saveType);
                updateConfig('vrm_save_type', vrm.saveType);
                if (vrm.saveType == 'local') {
                  updateConfig('vrm_hash', vrm.getHash());
                  updateConfig('vrm_url', vrm.url);
                  setVrmUrl(vrm.url);
                  setVrmHash(vrm.getHash());
                } else {
                  updateConfig('vrm_hash', '');
                  updateConfig('vrm_url', vrm.url);
                  setVrmUrl(vrm.url);
                }
                setSettingsUpdated(true);
              }}
              className={clsx(
                "mx-4 py-2 rounded-4 transition-all bg-gray-100 hover:bg-white active:bg-gray-100 rounded-xl",
                ( vrm.saveType === 'web' && vrm.url === vrmUrl) || ( vrm.saveType === 'local' && vrm.getHash() === vrmHash) ? "opacity-100 shadow-md" : "opacity-60 hover:opacity-100"
              )}
              >
                <img
                  src={vrm.thumbUrl}
                  alt={vrm.url}
                  width="160"
                  height="93"
                  className="m-0 rounded mx-4 pt-0 pb-0 pl-0 pr-0 shadow-sm shadow-black hover:shadow-md hover:shadow-black rounded-4 transition-all bg-gray-100 hover:bg-white active:bg-gray-100"
                />
            </button>
          )}
        </div>
        <TextButton
          className="rounded-t-none text-lg ml-4 px-8 shadow-lg bg-secondary hover:bg-secondary-hover active:bg-secondary-active"
          onClick={handleClickOpenVrmFile}
        >
          {t("Load VRM")}
        </TextButton>
      </BasicPage>
  
  );
}

