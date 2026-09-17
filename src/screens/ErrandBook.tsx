import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { api, naira, type Bank, type GeoPoint, type Quote } from '../api';
import type { AppNav } from '../nav';
import { AddressField, type Place } from '../components/AddressField';
import { AppHeader } from '../components/AppHeader';
import { Button, Card, Field, Input, KeyboardScreen, Mono, Spacer, useToast } from '../ui';
import { t } from '../theme';

/**
 * ERRAND ("buy-for-me"): the customer picks the shop + their delivery address, types what to buy and how
 * much it costs, and pays (delivery fee + goods). The goods-money is held and later paid to the shop's
 * account — the customer confirms the shop's account on the tracking screen before it's released.
 */
export function ErrandBookTab({ navigation }: { navigation: AppNav }) {
  const toast = useToast();
  const scrollRef = useRef<ScrollView>(null);
  const [shop, setShop] = useState<Place | null>(null);
  const [dropoff, setDropoff] = useState<Place | null>(null);
  const [storeName, setStoreName] = useState('');
  const [list, setList] = useState('');
  const [amount, setAmount] = useState(''); // naira, whole numbers
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  // OPTIONAL: if the customer already has the shop's account (e.g. they called the shop) they can enter it
  // now. It's name-matched server-side, and paid only after the rider reaches the shop.
  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankCode, setBankCode] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [bankPickerOpen, setBankPickerOpen] = useState(false);
  const [bankQuery, setBankQuery] = useState('');
  useEffect(() => { api.banks().then(setBanks).catch(() => {}); }, []);
  const filteredBanks = useMemo(() => {
    const q = bankQuery.trim().toLowerCase();
    return q ? banks.filter((b) => b.name.toLowerCase().includes(q)) : banks;
  }, [banks, bankQuery]);

  const goodsMinor = Math.round((Number(amount.replace(/[^\d.]/g, '')) || 0) * 100);

  const getQuote = async () => {
    if (!shop || !dropoff) return toast('Enter the shop and your delivery address');
    if (goodsMinor <= 0) return toast('Enter the amount to buy');
    if (!list.trim()) return toast('Say what the rider should buy');
    setBusy(true);
    try {
      const pickup: GeoPoint = { lat: shop.lat, lng: shop.lng };
      const dt: GeoPoint = { lat: dropoff.lat, lng: dropoff.lng };
      setQuote(await api.quote({ type: 'ERRAND', pickup, dropoff: dt }));
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  const book = async () => {
    if (!quote || !shop || !dropoff) return;
    setBusy(true);
    try {
      const returnUrl = Linking.createURL('track');
      const job = await api.createErrand({
        quoteToken: quote.quoteToken, goodsMinor, shoppingList: list.trim(), returnUrl,
        ...(storeName.trim() ? { storeName: storeName.trim() } : {}),
        ...(shop.label ? { storeAddress: shop.label } : {}),
        ...(shop.area ? { storeArea: shop.area } : {}),
        ...(dropoff.label ? { dropoffAddress: dropoff.label } : {}),
        ...(dropoff.area ? { dropoffArea: dropoff.area } : {}),
        ...(bankCode && accountNumber.length >= 10 ? { bankCode, accountNumber } : {}),
      });
      const link = job.paymentLink;
      if (link && /^https?:\/\//i.test(link)) {
        const sub = Linking.addEventListener('url', async ({ url }) => {
          const q = Linking.parse(url).queryParams ?? {};
          const txn = q.transaction_id;
          const status = q.status;
          if (txn && (!status || status === 'successful' || status === 'completed')) {
            try { await api.confirmPayment(job.id, String(txn)); } catch { /* Track polling will catch it */ }
          }
          WebBrowser.dismissBrowser();
        });
        try { await WebBrowser.openBrowserAsync(link); } finally { sub.remove(); }
      }
      navigation.navigate('Track', { jobId: job.id });
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  const feeMinor = quote?.amountMinor ?? 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg2 }} edges={['top', 'left', 'right']}>
      <KeyboardScreen scrollRef={scrollRef} contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <AppHeader navigation={navigation} />
        <Spacer h={12} />
        <Text style={{ fontSize: t.size.title, fontWeight: '700', color: t.ink }}>Send an errand</Text>
        <Text style={{ fontSize: t.size.small, color: t.ink2, marginTop: 4, marginBottom: 16, lineHeight: 20 }}>
          A rider buys what you need and delivers it. You pay the item price + delivery — we pay the shop directly, so no cash changes hands.
        </Text>

        <AddressField label="Shop / where to buy" placeholder="e.g. Sola Store, Ikeja" onSelect={(p) => { setShop(p); setQuote(null); }} />
        <Spacer h={10} />
        <AddressField label="Deliver to" placeholder="Your address" onSelect={(p) => { setDropoff(p); setQuote(null); }} />
        <Spacer h={12} />

        <Field label="Shop name (optional)"><Input placeholder="e.g. Sola Store" value={storeName} onChangeText={setStoreName} /></Field>
        <Field label="What should the rider buy?">
          <Input placeholder="e.g. 2 loaves of Agege bread and a tin of Milo" value={list} onChangeText={(v) => { setList(v); setQuote(null); }} multiline style={{ minHeight: 72 }} />
        </Field>
        <Field label="Amount to buy (₦)">
          <Input placeholder="e.g. 5000" keyboardType="number-pad" value={amount} onChangeText={(v) => { setAmount(v.replace(/[^\d]/g, '')); setQuote(null); }} />
        </Field>
        <Text style={{ fontSize: t.size.caption, color: t.ink2, marginTop: -4, marginBottom: 12, lineHeight: 17 }}>
          Enter what the items cost. If it&apos;s more at the shop, your rider will ask and you can top up in the app.
        </Text>

        {/* OPTIONAL: pre-enter the shop's account if the customer already has it (name-matched server-side). */}
        <Field label="Shop account — optional (if you already have it)">
          <Pressable onPress={() => setBankPickerOpen(true)}
            style={{ borderWidth: 1, borderColor: t.line, borderRadius: t.radius.md, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8, backgroundColor: t.bg }}>
            <Text style={{ fontSize: t.size.body, color: bankName ? t.ink : t.mid }}>{bankName || 'Select the shop’s bank'}</Text>
          </Pressable>
          <Input placeholder="Shop account number (10 digits)" keyboardType="number-pad" maxLength={10} value={accountNumber}
            onChangeText={(vv) => { setAccountNumber(vv.replace(/\D/g, '').slice(0, 10)); setQuote(null); }} />
        </Field>
        <Text style={{ fontSize: t.size.caption, color: t.ink2, marginTop: -4, marginBottom: 12, lineHeight: 17 }}>
          Leave this blank if you don’t have it — your rider will collect it at the shop. Either way we verify the name matches before paying.
        </Text>

        {!quote ? (
          <Button label={busy ? 'Getting price…' : 'Get delivery price'} onPress={getQuote} busy={busy} />
        ) : (
          <Card>
            <Mono style={{ marginBottom: 8 }}>ERRAND TOTAL</Mono>
            <Row label="Item money (to the shop)" value={naira(goodsMinor)} />
            <Row label="Delivery fee" value={naira(feeMinor)} />
            <View style={{ height: 1, backgroundColor: t.line2, marginVertical: 8 }} />
            <Row label="You pay now" value={naira(goodsMinor + feeMinor)} strong />
            <Spacer h={12} />
            <Button label={busy ? 'Starting payment…' : `Pay ${naira(goodsMinor + feeMinor)}`} onPress={book} busy={busy} />
          </Card>
        )}

        <Modal visible={bankPickerOpen} animationType="slide" onRequestClose={() => setBankPickerOpen(false)}>
          <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: 56, paddingHorizontal: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: t.size.heading, fontWeight: '700', color: t.ink }}>Choose the shop’s bank</Text>
              <Pressable onPress={() => { setBankPickerOpen(false); setBankQuery(''); }}><Mono style={{ color: t.ink2 }}>CLOSE</Mono></Pressable>
            </View>
            <TextInput placeholder="Search banks…" placeholderTextColor={t.mid} value={bankQuery} onChangeText={setBankQuery} autoFocus
              style={{ borderWidth: 1, borderColor: t.line, borderRadius: t.radius.md, paddingVertical: 12, paddingHorizontal: 14, fontSize: t.size.body, color: t.ink, marginBottom: 8 }} />
            <FlatList data={filteredBanks} keyExtractor={(b) => b.code} keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable onPress={() => { setBankCode(item.code); setBankName(item.name); setQuote(null); setBankPickerOpen(false); setBankQuery(''); }}
                  style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: t.line2 }}>
                  <Text style={{ fontSize: t.size.body, color: t.ink }}>{item.name}</Text>
                </Pressable>
              )} />
          </View>
        </Modal>
      </KeyboardScreen>
    </SafeAreaView>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
      <Text style={{ color: t.ink2, fontSize: t.size.small }}>{label}</Text>
      <Text style={{ fontFamily: t.mono, fontSize: strong ? t.size.body : t.size.small, fontWeight: strong ? '700' : '400' }}>{value}</Text>
    </View>
  );
}
