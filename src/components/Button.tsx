import { Pressable, Text, StyleSheet } from 'react-native';
import { t } from '../theme';

export function Button({ label, onPress, variant = 'primary' }: {
  label: string; onPress?: () => void; variant?: 'primary' | 'ghost';
}) {
  const ghost = variant === 'ghost';
  return (
    <Pressable onPress={onPress} style={[s.btn, ghost && s.ghost]}>
      <Text style={[s.txt, ghost && s.ghostTxt]}>{label.toUpperCase()}</Text>
    </Pressable>
  );
}
const s = StyleSheet.create({
  btn: { backgroundColor: t.primary, borderRadius: 8, paddingVertical: 13, alignItems: 'center' },
  ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: t.line },
  txt: { color: t.primaryInk, fontFamily: t.mono, fontWeight: '700', fontSize: 12, letterSpacing: 1 },
  ghostTxt: { color: t.ink },
});
