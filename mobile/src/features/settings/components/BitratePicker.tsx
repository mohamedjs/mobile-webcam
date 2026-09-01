import { Slider } from '@/shared/ui';
import { useDebouncedCallback } from '@/shared/hooks/useDebouncedCallback';
import { useSettingsStore } from '../store/settingsStore';

export function BitratePicker() {
  const settings = useSettingsStore((s) => s.settings);
  const patch = useSettingsStore((s) => s.patch);
  const apply = useDebouncedCallback((mbps: number) => void patch({ bitrate: mbps * 1_000_000 }));
  if (!settings) return null;

  return (
    <Slider
      value={settings.bitrate / 1_000_000}
      min={1}
      max={40}
      step={1}
      onChange={apply}
      format={(v) => `${v.toFixed(0)} Mbps`}
    />
  );
}
