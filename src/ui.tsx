import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle, TextStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from './theme';

/* ---------------- Pressable with a subtle scale/opacity press animation ---------------- */
export function PressableScale({ onPress, disabled, style, children }: {
  onPress?: () => void; disabled?: boolean; style?: StyleProp<ViewStyle>; children: React.ReactNode;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) => Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      onPressIn={() => !disabled && to(0.97)}
      onPressOut={() => to(1)}
      style={{ opacity: disabled ? 0.45 : 1 }}
    >
      <Animated.View style={[{ transform: [{ scale }] }, style]}>{children}</Animated.View>
    </Pressable>
  );
}

/* ---------------- Button ---------------- */
export function Button({ label, onPress, variant = 'primary', busy, disabled }: {
  label: string; onPress?: () => void; variant?: 'primary' | 'ghost'; busy?: boolean; disabled?: boolean;
}) {
  const ghost = variant === 'ghost';
  return (
    <PressableScale onPress={onPress} disabled={disabled || busy} style={[bs.btn, ghost && bs.ghost]}>
      <Text style={[bs.txt, ghost && bs.ghostTxt]}>{(busy ? 'Working…' : label).toUpperCase()}</Text>
    </PressableScale>
  );
}
const bs = StyleSheet.create({
  btn: { backgroundColor: t.primary, borderRadius: 10, paddingVertical: 15, alignItems: 'center' },
  ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: t.line },
  txt: { color: t.primaryInk, fontWeight: '700', fontSize: 12.5, letterSpacing: 1 },
  ghostTxt: { color: t.ink },
});

/* ---------------- Layout primitives ---------------- */
export function Screen({ title, onBack, children, scroll }: {
  title?: string; onBack?: () => void; children: React.ReactNode; scroll?: boolean;
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg2 }} edges={['top', 'left', 'right']}>
      {(title || onBack) && (
        <View style={us.header}>
          {onBack ? (
            <PressableScale onPress={onBack} style={us.back}><Text style={us.backTxt}>‹</Text></PressableScale>
          ) : <View style={us.back} />}
          <Text style={us.title} numberOfLines={1}>{title}</Text>
          <View style={us.back} />
        </View>
      )}
      {children}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[us.card, style]}>{children}</View>;
}
export function Spacer({ h = 12 }: { h?: number }) { return <View style={{ height: h }} />; }
export function Mono({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<TextStyle>; onPress?: () => void }) {
  return <Text onPress={onPress} style={[{ fontFamily: t.mono, color: t.ink2, fontSize: 11, letterSpacing: 0.6 }, style]}>{children}</Text>;
}
export function Pill({ text, color = t.ink }: { text: string; color?: string }) {
  return <View style={[us.pill, { backgroundColor: color }]}><Text style={us.pillTxt}>{text.toUpperCase()}</Text></View>;
}
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={{ marginBottom: 12 }}><Mono style={{ marginBottom: 6 }}>{label.toUpperCase()}</Mono>{children}</View>;
}

const us = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backTxt: { fontSize: 30, color: t.ink, marginTop: -4 },
  title: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: t.ink },
  card: { backgroundColor: t.bg, borderWidth: 1, borderColor: t.line, borderRadius: 8, padding: 16 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  pillTxt: { color: '#fff', fontFamily: t.mono, fontWeight: '700', fontSize: 10, letterSpacing: 0.6 },
});

/* ---------------- Toast (context) ---------------- */
type Kind = 'error' | 'success' | 'info';
const ToastCtx = createContext<(msg: string, kind?: Kind) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; kind: Kind } | null>(null);
  const y = useRef(new Animated.Value(80)).current;
  const show = useCallback((text: string, kind: Kind = 'error') => setMsg({ text, kind }), []);

  useEffect(() => {
    if (!msg) return;
    Animated.spring(y, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 8 }).start();
    const timer = setTimeout(() => {
      Animated.timing(y, { toValue: 80, duration: 200, useNativeDriver: true }).start(() => setMsg(null));
    }, 3600);
    return () => clearTimeout(timer);
  }, [msg, y]);

  const dot = msg?.kind === 'success' ? t.success : msg?.kind === 'info' ? t.info : t.danger;
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <Animated.View pointerEvents="none" style={[ts.wrap, { transform: [{ translateY: y }] }]}>
          <View style={ts.toast}>
            <View style={[ts.dot, { backgroundColor: dot }]} />
            <Text style={ts.txt}>{msg.text}</Text>
          </View>
        </Animated.View>
      )}
    </ToastCtx.Provider>
  );
}
const ts = StyleSheet.create({
  wrap: { position: 'absolute', left: 20, right: 20, bottom: 34, alignItems: 'center' },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.ink, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, maxWidth: 460 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  txt: { color: '#fff', fontSize: 13.5, flexShrink: 1 },
});
