import { Slider } from '@/shared/ui';
import { useDebouncedCallback } from '@/shared/hooks/useDebouncedCallback';
import { useSettingsStore } from '@/features/settings';

export function ZoomSlider() {
  const settings = useSettingsStore((s) => s.settings);
  const caps = useSettingsStore((s) => s.capabilities);
  const patch = useSettingsStore((s) => s.patch);
  const apply = useDebouncedCallback((zoom: number) => void patch({ zoom }));
  if (!settings || !caps) return null;

  const lens = caps.lenses.find((l) => l.id === settings.lens);
  return (
    <Slider
      value={settings.zoom}
      min={lens?.minZoom ?? 1}
      max={lens?.maxZoom ?? 8}
      step={0.1}
      onChange={apply}
      format={(v) => `${v.toFixed(1)}x`}
    />
  );
}
