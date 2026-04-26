import { useTranslation } from 'react-i18next';
import { BasicPage, FormRow } from './common';
import { updateConfig } from "@/utils/config";

export function StyleBertVits2SettingsPage({
  stylebertvits2ServerUrl,
  setStylebertvits2ServerUrl,
  stylebertvits2ModelId,
  setStylebertvits2ModelId,
  stylebertvits2Style,
  setStylebertvits2Style,
  setSettingsUpdated,
}: {
  stylebertvits2ServerUrl: string;
  setStylebertvits2ServerUrl: (val: string) => void;
  stylebertvits2ModelId: string;
  setStylebertvits2ModelId: (val: string) => void;
  stylebertvits2Style: string;
  setStylebertvits2Style: (val: string) => void;
  setSettingsUpdated: (updated: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <BasicPage
      title={t("Style-Bert-VITS2 Settings")}
      description={t("Style-Bert-VITS2はBFF（/api/tts）経由で通信します。ここで指定したモデルIDとスタイルが音声生成に使用されます。")}
    >
      <ul role="list" className="divide-y divide-gray-100 max-w-xs">
        <li className="py-4">
          <FormRow label={t("Server URL")}>
            <input
              type="text"
              className="mt-2 block w-full rounded-md border-0 py-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-indigo-600 sm:text-sm sm:leading-6"
              value={stylebertvits2ServerUrl}
              onChange={(e) => {
                setStylebertvits2ServerUrl(e.target.value);
                updateConfig("stylebertvits2_server_url", e.target.value);
                setSettingsUpdated(true);
              }}
            />
          </FormRow>
        </li>
        <li className="py-4">
          <FormRow label={t("Model ID")}>
            <input
              type="text"
              className="mt-2 block w-full rounded-md border-0 py-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-indigo-600 sm:text-sm sm:leading-6"
              value={stylebertvits2ModelId}
              onChange={(e) => {
                setStylebertvits2ModelId(e.target.value);
                updateConfig("stylebertvits2_model_id", e.target.value);
                setSettingsUpdated(true);
              }}
            />
          </FormRow>
        </li>
        <li className="py-4">
          <FormRow label={t("Style (e.g. Neutral, Happy)")}>
            <input
              type="text"
              className="mt-2 block w-full rounded-md border-0 py-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-indigo-600 sm:text-sm sm:leading-6"
              value={stylebertvits2Style}
              onChange={(e) => {
                setStylebertvits2Style(e.target.value);
                updateConfig("stylebertvits2_style", e.target.value);
                setSettingsUpdated(true);
              }}
            />
          </FormRow>
        </li>
      </ul>
    </BasicPage>
  );
}
