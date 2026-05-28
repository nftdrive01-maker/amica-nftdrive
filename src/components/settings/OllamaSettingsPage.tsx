import { useTranslation } from 'react-i18next';

import { BasicPage, FormRow, NotUsingAlert } from "./common";
import { TextInput } from "@/components/textInput";
import { config, isManagedConfigKey, updateConfig } from "@/utils/config";

export function OllamaSettingsPage({
  ollamaUrl,
  setOllamaUrl,
  ollamaModel,
  setOllamaModel,
  setSettingsUpdated,
}: {
  ollamaUrl: string;
  setOllamaUrl: (url: string) => void;
  ollamaModel: string;
  setOllamaModel: (url: string) => void;
  setSettingsUpdated: (updated: boolean) => void;
}) {
  const { t } = useTranslation();
  const ollamaUrlManaged = isManagedConfigKey("ollama_url");
  const ollamaModelManaged = isManagedConfigKey("ollama_model");
  const hasManagedField = ollamaUrlManaged || ollamaModelManaged;

  const description = <>{t("ollama_desc", "Ollama lets you get up and running with large language models locally. Download from")} <a href="https://ollama.ai/">{t("ollama.ai")}</a></>;

  return (
    <BasicPage
      title={t("Ollama") + " " + t("Settings")}
      description={description}
    >
      {hasManagedField && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Ollama 設定の一部は環境変数で固定されているため、クライアント側から変更できません。
        </p>
      )}
      { config("chatbot_backend") !== "ollama" && (
        <NotUsingAlert>
          {t("not_using_alert", "You are not currently using {{name}} as your {{what}} backend. These settings will not be used.", {name: t("Ollama"), what: t("ChatBot")})}
        </NotUsingAlert>
      ) }
      <ul role="list" className="divide-y divide-gray-100 max-w-xs">
        <li className="py-4">
          <FormRow label={t("API URL")}>
            <TextInput
              value={ollamaUrl}
              readOnly={ollamaUrlManaged}
              onChange={(event: React.ChangeEvent<any>) => {
                setOllamaUrl(event.target.value);
                updateConfig("ollama_url", event.target.value);
                setSettingsUpdated(true);
              }}
            />
          </FormRow>
        </li>
        <li className="py-4">
          <FormRow label={t("Model")}>
            <TextInput
              value={ollamaModel}
              readOnly={ollamaModelManaged}
              onChange={(event: React.ChangeEvent<any>) => {
                setOllamaModel(event.target.value);
                updateConfig("ollama_model", event.target.value);
                setSettingsUpdated(true);
              }}
            />
          </FormRow>
        </li>
      </ul>
    </BasicPage>
  );
}
