import { useEffect, useMemo, useState } from 'react';
import { Image, Linking, ScrollView, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { createURL } from 'expo-linking';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStack } from '../App';
import { api, naira, type Product, type Vendor } from '../api';
import { Button, Card, Mono, PressableScale, Screen, useToast } from '../ui';
import { t } from '../theme';

export function ShopScreen({ navigation }: NativeStackScreenProps<RootStack, 'Shop'>) {
  const toast = useToast();
  const [vendors, setVendors] = useState<Vendor[] | null>(null);
  useEffect(() => { api.vendors().then(setVendors).catch((e) => toast((e as Error).message)); }, []);

  return (
    <Screen title="Shops" onBack={() => navigation.goBack()}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={{ color: t.ink2, fontSize: t.size.small, marginBottom: 16 }}>Order from a registered vendor — we deliver it to you.</Text>
        {vendors === null ? <Mono style={{ color: t.mid }}>LOADING…</Mono> : null}
        {vendors?.length === 0 ? <Text style={{ color: t.ink2 }}>No shops are open yet. Check back soon.</Text> : null}
        {vendors?.map((v) => (
          <PressableScale key={v.id} onPress={() => navigation.navigate('Storefront', { vendorId: v.id })}
            style={{ marginBottom: 10 }}>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {v.logoUrl ? <Image source={{ uri: v.logoUrl }} style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: t.bg2 }} />
                  : <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: t.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 20 }}>🏪</Text></View>}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontWeight: '700', color: t.ink, fontSize: t.size.body }}>{v.businessName}</Text>
                  <Mono style={{ fontSize: t.size.caption, color: t.ink2 }}>{[v.category, v.area].filter(Boolean).join(' · ') || 'Shop'}</Mono>
                </View>
                <Mono style={{ color: t.mid }}>→</Mono>
              </View>
            </Card>
          </PressableScale>
        ))}
      </ScrollView>
    </Screen>
  );
}

export function StorefrontScreen({ route, navigation }: NativeStackScreenProps<RootStack, 'Storefront'>) {
  const { vendorId } = route.params;
  const toast = useToast();
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.vendor(vendorId).then(setVendor).catch((e) => toast((e as Error).message));
    api.vendorProducts(vendorId).then(setProducts).catch(() => setProducts([]));
  }, [vendorId]);

  const add = (p: Product) => setCart((c) => ({ ...c, [p.id]: (c[p.id] ?? 0) + 1 }));
  const sub = (p: Product) => setCart((c) => { const n = (c[p.id] ?? 0) - 1; const next = { ...c }; if (n <= 0) delete next[p.id]; else next[p.id] = n; return next; });
  const items = useMemo(() => (products ?? []).filter((p) => cart[p.id]), [products, cart]);
  const goodsMinor = items.reduce((s, p) => s + p.priceMinor * (cart[p.id] ?? 0), 0);
  const count = items.reduce((s, p) => s + (cart[p.id] ?? 0), 0);

  const checkout = async () => {
    if (items.length === 0) return;
    if (vendor?.shopLat == null || vendor?.shopLng == null) { toast('This shop has not set its location yet'); return; }
    setBusy(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) { toast('Location is needed to price delivery'); return; }
      const pos = await Location.getCurrentPositionAsync({});
      const quote = await api.quote({ type: 'ERRAND', pickup: { lat: vendor.shopLat, lng: vendor.shopLng }, dropoff: { lat: pos.coords.latitude, lng: pos.coords.longitude } });
      const order = await api.createMarketplaceOrder({
        vendorId, quoteToken: quote.quoteToken,
        items: items.map((p) => ({ productId: p.id, quantity: cart[p.id] ?? 1 })),
        returnUrl: createURL('track'),
      });
      if (order.paymentLink) Linking.openURL(order.paymentLink);
      navigation.navigate('Track', { jobId: order.id });
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Screen title={vendor?.businessName ?? 'Shop'} onBack={() => navigation.goBack()}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
        {products === null ? <Mono style={{ color: t.mid }}>LOADING…</Mono> : null}
        {products?.length === 0 ? <Text style={{ color: t.ink2 }}>This shop has no products listed yet.</Text> : null}
        {products?.map((p) => (
          <Card key={p.id} style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {p.photoUrls?.[0] ? <Image source={{ uri: p.photoUrls[0] }} style={{ width: 52, height: 52, borderRadius: 8, backgroundColor: t.bg2 }} />
                : <View style={{ width: 52, height: 52, borderRadius: 8, backgroundColor: t.bg2, alignItems: 'center', justifyContent: 'center' }}><Text>🛒</Text></View>}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontWeight: '600', color: t.ink }}>{p.name}</Text>
                {p.description ? <Text style={{ fontSize: t.size.small, color: t.ink2 }} numberOfLines={2}>{p.description}</Text> : null}
                <Mono style={{ fontSize: t.size.caption, color: t.ink }}>{naira(p.priceMinor)}</Mono>
              </View>
              {cart[p.id] ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <PressableScale onPress={() => sub(p)}><Mono style={{ color: t.ink, fontSize: 18 }}>−</Mono></PressableScale>
                  <Text style={{ fontWeight: '700', color: t.ink }}>{cart[p.id]}</Text>
                  <PressableScale onPress={() => add(p)}><Mono style={{ color: t.ink, fontSize: 18 }}>+</Mono></PressableScale>
                </View>
              ) : (
                <PressableScale onPress={() => add(p)} style={{ borderWidth: 1, borderColor: t.line, borderRadius: t.radius.md, paddingVertical: 6, paddingHorizontal: 12 }}><Mono style={{ color: t.ink }}>ADD</Mono></PressableScale>
              )}
            </View>
          </Card>
        ))}
      </ScrollView>

      {items.length > 0 ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: t.bg, borderTopWidth: 1, borderTopColor: t.line, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Mono style={{ fontSize: t.size.caption, color: t.ink2 }}>{count} ITEMS · GOODS {naira(goodsMinor)}</Mono>
            <Text style={{ fontSize: t.size.small, color: t.ink2 }}>+ delivery fee, quoted at checkout</Text>
          </View>
          <View style={{ width: 130 }}><Button label={busy ? 'Starting…' : 'Checkout'} onPress={checkout} busy={busy} /></View>
        </View>
      ) : null}
    </Screen>
  );
}
