import { Switch } from 'react-native';
import { colors } from '../theme/tokens';

export function Toggle({
  value, onChange, disabled = false,
}: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <Switch
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      trackColor={{ false: colors.line, true: colors.accent }}
      thumbColor="#fff"
    />
  );
}
