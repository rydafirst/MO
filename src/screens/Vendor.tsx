import { useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { uploadAsync, getInfoAsync, FileSystemUploadType } from 'expo-file-system/legacy';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStack } from '../App';
import { api, naira, type Bank, type Product, type Vendor, type VendorOrder } from '../api';
import { Button, Card, Input, Mono, PressableScale, Screen, useToast } from '../ui';
import { t } from '../theme';

const STATUS: Record<string, { text: string; color: string }> = {
  PENDING: { text: 'Awaiting approval', color: t.warning },
  APPROVED: { text: 'Live', color: t.success },
  REJECTED: { text: 'Needs changes', color: t.danger },
  SUSPENDED: { text: 'Suspended', color: t.danger },
};

/** Pick an image from the library and upload it to a presigned URL; returns the stored key (or null if cancelled). */
async function pickAndUpload(getUrl: (mime: string, size: number) => Promise<{ uploadUrl: string; key: string }>): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Photo permission is needed');
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
  if (res.canceled || !res.assets?.[0]?.uri) return null;
  const asset = res.assets[0];
  const mime = asset.mimeType || 'image/jpeg';
  const info = await getInfoAsync(asset.uri);
  const size = (info as { size?: number }).size ?? 0;
  const { uploadUrl, key } = await getUrl(mime, size || 1);
  const put = await uploadAsync(uploadUrl, asset.uri, { httpMethod: 'PUT', uploadType: FileSystemUploadType.BINARY_CONTENT, headers: { 'Content-Type': mime } });
  if (put.status >= 300) throw new Error(`Upload failed (${put.status})`);
  return key;
}

export function VendorScreen({ navigation }: NativeStackScreenProps<RootStack, 'Vendor'>) {
  const toast = useToast();
  const [vendor, setVendor] = useState<Vendor | null | undefined>(undefined);

  const refresh = () => api.myVendor().then(setVendor).catch((e) => toast((e as Error).message));
  useEffect(() => { refresh(); }, []);

  return (
    <Screen title="Your shop" onBack={() => navigation.goBack()}>
      <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
        {vendor === undefined ? (
          <Mono style={{ color: t.mid }}>LOADING…</Mono>
        ) : vendor === null ? (
          <RegisterForm onCreated={setVendor} />
        ) : (
          <>
            <StatusCard vendor={vendor} onChange={setVendor} />
            <BusinessAccount vendor={vendor} onChange={setVendor} />
            <ShopLocation vendor={vendor} onChange={setVendor} />
            {vendor.status === 'APPROVED' ? <Orders /> : null}
            <Products />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function RegisterForm({ onCreated }: { onCreated: (v: Vendor) => void }) {
  const toast = useToast();
  const [businessName, setBusinessName] = useState('');
  const [category, setCategory] = useState('');
  const [area, setArea] = useState('');
  const [rcNumber, setRcNumber] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (businessName.trim().length < 2) { toast('Enter your business name'); return; }
    setBusy(true);
    try {
      const v = await api.registerVendor({
        businessName: businessName.trim(),
        ...(category.trim() ? { category: category.trim() } : {}),
        ...(area.trim() ? { area: area.trim() } : {}),
        ...(rcNumber.trim() ? { rcNumber: rcNumber.trim() } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      onCreated(v);
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Card>
      <Mono style={{ fontSize: t.size.caption, color: t.ink2, marginBottom: 10 }}>REGISTER YOUR BUSINESS</Mono>
      <Text style={{ color: t.ink2, fontSize: t.size.small, marginBottom: 12, lineHeight: 19 }}>Sell on Rydafirst. Payouts go only to your verified business account.</Text>
      <Input placeholder="Business name" value={businessName} onChangeText={setBusinessName} style={{ marginBottom: 8 }} />
      <Input placeholder="Category (optional)" value={category} onChangeText={setCategory} style={{ marginBottom: 8 }} />
      <Input placeholder="Area, e.g. Yaba (optional)" value={area} onChangeText={setArea} style={{ marginBottom: 8 }} />
      <Input placeholder="CAC / RC number (optional)" value={rcNumber} onChangeText={setRcNumber} style={{ marginBottom: 8 }} />
      <Input placeholder="About your shop (optional)" value={description} onChangeText={setDescription} multiline style={{ marginBottom: 12, minHeight: 70 }} />
      <Button label={busy ? 'Submitting…' : 'Register shop'} onPress={submit} busy={busy} />
    </Card>
  );
}

function StatusCard({ vendor, onChange }: { vendor: Vendor; onChange: (v: Vendor) => void }) {
  const toast = useToast();
  const s = STATUS[vendor.status] ?? { text: vendor.status, color: t.ink2 };
  const [logoBusy, setLogoBusy] = useState(false);
  const uploadLogo = async () => {
    setLogoBusy(true);
    try { const key = await pickAndUpload(api.vendorLogoUploadUrl); if (key) onChange(await api.updateVendor({ logoKey: key })); }
    catch (e) { toast((e as Error).message); } finally { setLogoBusy(false); }
  };
  return (
    <Card style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <Pressable onPress={uploadLogo} style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: t.primarySoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {vendor.logoUrl ? <Image source={{ uri: vendor.logoUrl }} style={{ width: 44, height: 44 }} /> : <Text style={{ fontSize: 18 }}>{logoBusy ? '…' : '🏪'}</Text>}
        </Pressable>
        <Text style={{ fontWeight: '700', fontSize: t.size.subtitle, color: t.ink, flex: 1 }}>{vendor.businessName}</Text>
        <Mono style={{ color: s.color }}>{s.text.toUpperCase()}</Mono>
      </View>
      {vendor.status === 'REJECTED' && vendor.rejectionReason ? (
        <Text style={{ color: t.danger, fontSize: t.size.small, marginTop: 8 }}>{vendor.rejectionReason}</Text>
      ) : null}
      {vendor.status === 'PENDING' ? (
        <Text style={{ color: t.ink2, fontSize: t.size.small, marginTop: 8, lineHeight: 19 }}>Add your business account below — an admin reviews new shops before they go live.</Text>
      ) : null}
    </Card>
  );
}

function BusinessAccount({ vendor, onChange }: { vendor: Vendor; onChange: (v: Vendor) => void }) {
  const toast = useToast();
  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankCode, setBankCode] = useState('');
  const [bankName, setBankName] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ accountName: string; match: boolean } | null>(null);
  const [editing, setEditing] = useState(!vendor.account);

  useEffect(() => { api.banks().then(setBanks).catch(() => {}); }, []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? banks.filter((b) => b.name.toLowerCase().includes(q)) : banks;
  }, [banks, query]);

  const save = async () => {
    if (!bankCode || accountNumber.length < 10) { toast('Pick the bank and enter the 10-digit account number'); return; }
    setBusy(true);
    try {
      const r = await api.vendorBusinessAccount(bankCode, accountNumber);
      setResult(r);
      const fresh = await api.myVendor();
      if (fresh) { onChange(fresh); setEditing(false); }
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Card style={{ marginBottom: 16 }}>
      <Mono style={{ fontSize: t.size.caption, color: t.ink2, marginBottom: 10 }}>BUSINESS PAYOUT ACCOUNT (BUSINESS ACCOUNTS ONLY)</Mono>
      {vendor.account && !editing ? (
        <View>
          <Text style={{ fontWeight: '700', color: t.ink, fontSize: t.size.body }}>{vendor.account.accountName}</Text>
          <Mono style={{ fontSize: t.size.small, color: t.ink2, marginTop: 2 }}>{vendor.account.accountNumber}</Mono>
          <Mono style={{ color: vendor.accountVerified ? t.success : t.warning, marginTop: 8 }}>
            {vendor.accountVerified ? '✓ NAME VERIFIED' : '⚠ NOT AUTO-VERIFIED — ADMIN WILL CONFIRM'}
          </Mono>
          <View style={{ marginTop: 10 }}><Button label="Change account" variant="ghost" onPress={() => { setEditing(true); setResult(null); }} /></View>
        </View>
      ) : (
        <View>
          <Pressable onPress={() => setPickerOpen(true)}
            style={{ borderWidth: 1, borderColor: t.line, borderRadius: t.radius.md, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8, backgroundColor: t.bg }}>
            <Text style={{ fontSize: t.size.body, color: bankName ? t.ink : t.mid }}>{bankName || 'Select your bank'}</Text>
          </Pressable>
          <Input placeholder="Account number (10 digits)" keyboardType="number-pad" maxLength={10} value={accountNumber}
            onChangeText={(v) => { setAccountNumber(v.replace(/\D/g, '').slice(0, 10)); setResult(null); }} style={{ marginBottom: 8 }} />
          {result ? (
            <View style={{ borderWidth: 1, borderColor: result.match ? t.success : t.warning, borderRadius: t.radius.md, padding: 12, marginBottom: 8 }}>
              <Mono style={{ fontSize: t.size.caption, color: t.ink2 }}>ACCOUNT NAME</Mono>
              <Text style={{ fontSize: t.size.body, fontWeight: '700', marginTop: 2 }}>{result.accountName}</Text>
              <Mono style={{ color: result.match ? t.success : t.warning, marginTop: 6 }}>
                {result.match ? '✓ MATCHES YOUR BUSINESS' : '⚠ DOESN’T CLEARLY MATCH — ADMIN WILL REVIEW'}
              </Mono>
            </View>
          ) : null}
          <Button label={busy ? 'Checking…' : 'Save account'} onPress={save} busy={busy} disabled={!bankCode || accountNumber.length < 10} />
        </View>
      )}

      <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: 56, paddingHorizontal: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: t.size.heading, fontWeight: '700', color: t.ink }}>Choose your bank</Text>
            <Pressable onPress={() => { setPickerOpen(false); setQuery(''); }}><Mono style={{ color: t.ink2 }}>CLOSE</Mono></Pressable>
          </View>
          <TextInput placeholder="Search banks…" placeholderTextColor={t.mid} value={query} onChangeText={setQuery} autoFocus
            style={{ borderWidth: 1, borderColor: t.line, borderRadius: t.radius.md, paddingVertical: 12, paddingHorizontal: 14, fontSize: t.size.body, color: t.ink, marginBottom: 8 }} />
          <FlatList data={filtered} keyExtractor={(b) => b.code} keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable onPress={() => { setBankCode(item.code); setBankName(item.name); setResult(null); setPickerOpen(false); setQuery(''); }}
                style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: t.line2 }}>
                <Text style={{ fontSize: t.size.body, color: t.ink }}>{item.name}</Text>
              </Pressable>
            )} />
        </View>
      </Modal>
    </Card>
  );
}

function Orders() {
  const [orders, setOrders] = useState<VendorOrder[] | null>(null);
  useEffect(() => { api.vendorOrders().then(setOrders).catch(() => setOrders([])); }, []);
  if (orders === null) return null;
  return (
    <Card style={{ marginBottom: 16 }}>
      <Mono style={{ fontSize: t.size.caption, color: t.ink2, marginBottom: 10 }}>INCOMING ORDERS</Mono>
      {orders.length === 0 ? <Text style={{ color: t.ink2, fontSize: t.size.small }}>No orders yet.</Text> : null}
      {orders.map((o) => (
        <View key={o.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.line2 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <Text style={{ fontWeight: '600', color: t.ink, fontSize: t.size.small, flex: 1 }} numberOfLines={1}>{o.items || 'Order'}</Text>
            <Mono style={{ fontSize: t.size.caption, color: o.vendorPaidAt ? t.success : t.warning }}>{o.vendorPaidAt ? `PAID ${naira(o.goodsMinor)}` : 'AWAITING'}</Mono>
          </View>
          <Mono style={{ fontSize: t.size.caption, color: t.ink2, marginTop: 2 }}>{new Date(o.createdAt).toLocaleDateString()} · {o.status.replace(/_/g, ' ')}</Mono>
        </View>
      ))}
    </Card>
  );
}

function ShopLocation({ vendor, onChange }: { vendor: Vendor; onChange: (v: Vendor) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const has = vendor.shopLat != null && vendor.shopLng != null;

  const setHere = async () => {
    setBusy(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) { toast('Location permission is needed to set your shop'); return; }
      const pos = await Location.getCurrentPositionAsync({});
      const v = await api.updateVendor({ shopLat: pos.coords.latitude, shopLng: pos.coords.longitude });
      onChange(v);
      toast('Shop location saved', 'success');
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Card style={{ marginBottom: 16 }}>
      <Mono style={{ fontSize: t.size.caption, color: t.ink2, marginBottom: 10 }}>SHOP LOCATION (USED TO PRICE DELIVERY)</Mono>
      {has ? (
        <Mono style={{ color: t.success, marginBottom: 10 }}>✓ LOCATION SET</Mono>
      ) : (
        <Text style={{ color: t.ink2, fontSize: t.size.small, marginBottom: 10, lineHeight: 19 }}>Set your shop location so customers are charged the right delivery fee. Stand at your shop and tap below.</Text>
      )}
      <Button label={busy ? 'Getting location…' : has ? 'Update shop location' : 'Use my current location'} variant="ghost" onPress={setHere} busy={busy} />
    </Card>
  );
}

function Products() {
  const toast = useToast();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [photoKeys, setPhotoKeys] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = () => api.myProducts().then(setProducts).catch((e) => toast((e as Error).message));
  useEffect(() => { load(); }, []);

  const addPhoto = async () => {
    if (photoKeys.length >= 6) return;
    setUploading(true);
    try { const key = await pickAndUpload(api.productPhotoUploadUrl); if (key) setPhotoKeys((k) => [...k, key]); }
    catch (e) { toast((e as Error).message); } finally { setUploading(false); }
  };

  const add = async () => {
    const priceMinor = Math.round(Number(price) * 100);
    if (name.trim().length < 1) { toast('Enter the product name'); return; }
    if (!priceMinor || priceMinor < 1) { toast('Enter a valid price'); return; }
    setBusy(true);
    try {
      await api.addProduct({ name: name.trim(), priceMinor, ...(description.trim() ? { description: description.trim() } : {}), ...(photoKeys.length ? { photoKeys } : {}) });
      setName(''); setPrice(''); setDescription(''); setPhotoKeys([]); await load();
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  const toggle = async (p: Product) => { try { await api.updateProduct(p.id, { available: !p.available }); await load(); } catch (e) { toast((e as Error).message); } };
  const remove = async (p: Product) => { try { await api.removeProduct(p.id); await load(); } catch (e) { toast((e as Error).message); } };

  return (
    <Card>
      <Mono style={{ fontSize: t.size.caption, color: t.ink2, marginBottom: 10 }}>YOUR PRODUCTS</Mono>
      {products?.map((p) => (
        <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.line2 }}>
          {p.photoUrls?.[0] ? <Image source={{ uri: p.photoUrls[0] }} style={{ width: 40, height: 40, borderRadius: 6, backgroundColor: t.bg2 }} /> : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontWeight: '600', color: t.ink }}>{p.name}</Text>
            <Mono style={{ fontSize: t.size.caption, color: t.ink2 }}>{naira(p.priceMinor)}{p.available ? '' : ' · HIDDEN'}</Mono>
          </View>
          <PressableScale onPress={() => toggle(p)} style={{ paddingHorizontal: 8 }}><Mono style={{ color: t.ink2 }}>{p.available ? 'HIDE' : 'SHOW'}</Mono></PressableScale>
          <PressableScale onPress={() => remove(p)} style={{ paddingHorizontal: 8 }}><Mono style={{ color: t.danger }}>DELETE</Mono></PressableScale>
        </View>
      ))}
      {products?.length === 0 ? <Text style={{ color: t.ink2, fontSize: t.size.small, marginVertical: 8 }}>No products yet — add your first below.</Text> : null}

      <View style={{ marginTop: 12 }}>
        <Input placeholder="Product name" value={name} onChangeText={setName} style={{ marginBottom: 8 }} />
        <Input placeholder="Price (₦)" keyboardType="number-pad" value={price} onChangeText={(v) => setPrice(v.replace(/[^\d]/g, ''))} style={{ marginBottom: 8 }} />
        <Input placeholder="Description (optional)" value={description} onChangeText={setDescription} style={{ marginBottom: 10 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Button label={uploading ? 'Uploading…' : (photoKeys.length ? `+ Photo (${photoKeys.length})` : '+ Photo')} variant="ghost" onPress={addPhoto} busy={uploading} disabled={photoKeys.length >= 6} />
          {photoKeys.length ? <Mono style={{ color: t.success }}>{photoKeys.length} ADDED</Mono> : null}
        </View>
        <Button label={busy ? 'Adding…' : 'Add product'} onPress={add} busy={busy} />
      </View>
    </Card>
  );
}
