import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleProp, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle, TextStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from './theme';

/* ---------------- Keyboard-aware scroll container ----------------
 * Wrap any form in this so the on-screen keyboard never hides the field being typed:
 *  - KeyboardAvoidingView lifts content above the keyboard (iOS 'padding').
 *  - keyboardShouldPersistTaps="handled" lets a tap on empty space dismiss the keyboard while
 *    taps on buttons still fire (so you can submit without dismissing first).
 *  - keyboardDismissMode="on-drag" dismisses when the user scrolls the form.
 */
export function KeyboardScreen({ children, contentContainerStyle, offset = 0, scrollRef }: {
  children: React.ReactNode; contentContainerStyle?: StyleProp<ViewStyle>; offset?: number;
  scrollRef?: React.RefObject<ScrollView | null>;
}) {
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={offset}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={contentContainerStyle}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

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
      <Text style={[bs.txt, ghost && bs.ghostTxt]}>{label.toUpperCase()}</Text>
    </PressableScale>
  );
}
const bs = StyleSheet.create({
  // rf-btn: full-width, mono, uppercase, radius lg(8), padding 14/16.
  btn: { backgroundColor: t.primary, borderRadius: t.radius.lg, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center' },
  ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: t.line },
  txt: { color: t.primaryInk, fontFamily: t.mono, fontWeight: '700', fontSize: 13, letterSpacing: 0.8 },
  ghostTxt: { color: t.ink },
});

/* ---------------- Text input (rf-input) + labelled Field ---------------- */
export function Input(props: TextInputProps) {
  return <TextInput placeholderTextColor={t.mid} {...props} style={[is.input, props.style]} />;
}
const is = StyleSheet.create({
  input: {
    borderWidth: 1, borderColor: t.line, borderRadius: t.radius.md,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: t.size.body, color: t.ink, backgroundColor: t.bg,
  },
});

/* ---------------- Segmented toggle (DELIVERY / RIDE etc.) ---------------- */
export function Segmented<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  // Plain Pressable (not PressableScale) so flex:1 is on the pressable itself and each option
  // stretches to an equal share of the row.
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[sg.seg, { borderColor: on ? t.ink : t.line }]}>
            <Text style={[sg.txt, { color: on ? t.ink : t.mid }]}>{o.label.toUpperCase()}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
const sg = StyleSheet.create({
  seg: { flex: 1, borderWidth: 1, borderRadius: t.radius.md, paddingVertical: 12, paddingHorizontal: 12, alignItems: 'center', backgroundColor: t.bg },
  txt: { fontFamily: t.mono, fontSize: 12, fontWeight: '700', letterSpacing: 0.7 },
});

export function Divider() { return <View style={{ height: 1, backgroundColor: t.line, marginVertical: 8 }} />; }
export function H1({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontSize: t.size.title, fontWeight: '700', color: t.ink, letterSpacing: -0.4 }}>{children}</Text>;
}

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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {children}
      </KeyboardAvoidingView>
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
  card: { backgroundColor: t.bg, borderWidth: 1, borderColor: t.line, borderRadius: t.radius.md, padding: 16 },
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
