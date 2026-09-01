import { Toggle } from '@/shared/ui';
import { useSettingsStore } from '@/features/settings';

export function TorchButton() {
  const settings = useSettingsStore((s) => s.settings);
  const patch = useSettingsStore((s) => s.patch);
  if (!settings) return null;
  return <Toggle value={settings.torch} onChange={(torch) => void patch({ torch })} />;
}
