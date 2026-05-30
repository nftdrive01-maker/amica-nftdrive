import { useTranslation } from 'react-i18next';

import { BasicPage, FormRow } from './common';
import { updateConfig } from '@/utils/config';
import { SwitchBox } from '@/components/switchBox';

export function LauncherPage({
  launcherEnabled,
  setLauncherEnabled,
  setSettingsUpdated,
}: {
  launcherEnabled: boolean;
  setLauncherEnabled: (enabled: boolean) => void;
  setSettingsUpdated: (updated: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <BasicPage
      title={`${t('Launcher')} ${t('Settings')}`}
      description="トップ画面でドメインランチャーを表示するか切り替えます。オフの場合は従来どおり直接チャットに入ります。"
    >
      <ul role="list" className="divide-y divide-gray-100 max-w-xs">
        <li className="py-4">
          <FormRow label="ドメインランチャー">
            <SwitchBox
              value={launcherEnabled}
              label="起動時にランチャーを表示する"
              onChange={(value: boolean) => {
                setLauncherEnabled(value);
                void updateConfig('injection_launcher_enabled', value.toString());
                setSettingsUpdated(true);
              }}
            />
          </FormRow>
        </li>
      </ul>
    </BasicPage>
  );
}