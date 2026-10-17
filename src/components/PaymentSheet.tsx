import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { t } from '../theme';

// Loose alias: react-native-webview's JSX prop types don't line up with this React version's
// overloads; the runtime component is correct, so we render it via a permissive alias (same pattern
// as Map.tsx / JobsMap.tsx).
const WV = WebView as unknown as React.ComponentType<Record<string, unknown>>;

/** Query params parsed off the Flutterwave redirect (e.g. status, tx_ref, transaction_id), or `null`
 *  if the customer closed the sheet without completing. */
export type PayResult = Record<string, string> | null;

interface PaymentCtx {
  /**
   * Show the Flutterwave hosted checkout INSIDE the app (an embedded WebView sheet — no Chrome/Safari
   * tab). Resolves with the redirect's query params the moment Flutterwave sends the customer back to
   * `returnUrl`, or with `null` if they close the sheet first. Keeps the processor's PCI-hosted page
   * (card entry never touches the app) while staying visually in-app.
   */
  pay: (link: string, returnUrl: string) => Promise<PayResult>;
}

const Ctx = createContext<PaymentCtx | null>(null);

export function usePayment(): PaymentCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePayment must be used within PaymentSheetProvider');
  return c;
}

/** Parse a URL's query string into a flat string map (handles `+` and percent-encoding). */
function parseQuery(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const qi = url.indexOf('?');
  if (qi < 0) return out;
  for (const pair of url.slice(qi + 1).split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const k = eq < 0 ? pair : pair.slice(0, eq);
    const v = eq < 0 ? '' : pair.slice(eq + 1);
    try { out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' ')); }
    catch { out[k] = v; }
  }
  return out;
}

/**
 * Hosts the in-app payment sheet once, near the root, so any screen can call `usePayment().pay(...)`.
 * A single provider-level Modal means there's exactly one WebView lifecycle to reason about.
 */
export function PaymentSheetProvider({ children }: { children: React.ReactNode }) {
  const [link, setLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const returnBaseRef = useRef<string>('');            // returnUrl with any query stripped
  const resolverRef = useRef<((r: PayResult) => void) | null>(null);
  const settledRef = useRef(false);                    // guards against double-resolve from both WebView callbacks

  const settle = useCallback((r: PayResult) => {
    if (settledRef.current) return;
    settledRef.current = true;
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setLink(null);
    resolve?.(r);
  }, []);

  const pay = useCallback((l: string, returnUrl: string) => {
    return new Promise<PayResult>((resolve) => {
      returnBaseRef.current = (returnUrl || '').split('?')[0];
      resolverRef.current = resolve;
      settledRef.current = false;
      setLoading(true);
      setLink(l);
    });
  }, []);

  /**
   * Catch the moment Flutterwave redirects back. Flutterwave always sends the customer to exactly the
   * `redirect_url` we supplied (our `returnUrl`), appending `?status=…&tx_ref=…&transaction_id=…`. We
   * also catch ANY non-http(s) navigation, which can only be our app's deep-link scheme — the WebView
   * can't load it anyway. In both cases we stop the load and hand the params back to the caller.
   */
  const intercept = useCallback((url: string): boolean => {
    if (!url) return true;
    const base = returnBaseRef.current;
    const nonHttp = !/^https?:\/\//i.test(url) && !/^about:/i.test(url);
    if ((base && url.startsWith(base)) || nonHttp) {
      settle(parseQuery(url));
      return false;
    }
    return true;
  }, [settle]);

  return (
    <Ctx.Provider value={{ pay }}>
      {children}
      <Modal visible={!!link} animationType="slide" onRequestClose={() => settle(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top', 'left', 'right', 'bottom']}>
          <View style={styles.bar}>
            <Text style={styles.title}>Secure payment</Text>
            <Pressable onPress={() => settle(null)} hitSlop={12}>
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>
          {link ? (
            <View style={{ flex: 1 }}>
              <WV
                source={{ uri: link }}
                onShouldStartLoadWithRequest={(req: { url: string }) => intercept(req?.url ?? '')}
                // Android doesn't always route custom-scheme loads through onShouldStartLoadWithRequest;
                // the nav-state callback is the belt-and-suspenders (settle() is idempotent).
                onNavigationStateChange={(s: { url: string }) => { if (s?.url) intercept(s.url); }}
                onLoadStart={() => setLoading(true)}
                onLoadEnd={() => setLoading(false)}
                startInLoadingState
                style={{ flex: 1, backgroundColor: t.bg }}
              />
              {loading ? (
                <View style={styles.loading} pointerEvents="none">
                  <ActivityIndicator color={t.primary} size="large" />
                </View>
              ) : null}
            </View>
          ) : null}
        </SafeAreaView>
      </Modal>
    </Ctx.Provider>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: t.space.xl, paddingVertical: t.space.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.line,
    backgroundColor: t.bg,
  },
  title: { fontFamily: t.sans, fontSize: t.size.subtitle, fontWeight: '700', color: t.ink },
  close: { fontFamily: t.sans, fontSize: t.size.body, fontWeight: '600', color: t.primary },
  loading: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg,
  },
});
