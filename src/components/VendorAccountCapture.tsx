import { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { api, type Bank } from '../api';
import { Button, Input, Mono } from '../ui';
import { t } from '../theme';

/**
 * ERRAND: the rider captures the vendor's BUSINESS account at the store — pick the bank by NAME (never a
 * code) and type the account number. The server resolves the real account name and scores it against the
 * store the customer named; the customer then approves before any money moves. The rider never types the
 * name, and the payment can only ever go to a business account the customer has confirmed.
 */
export function VendorAccountCapture({ jobId, onCaptured }: { jobId: string; onCaptured?: () => void }) {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankCode, setBankCode] = useState('');
  const [bankName, setBankName] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ accountName: string; match: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { api.banks().then(setBanks).catch(() => {}); }, []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? banks.filter((b) => b.name.toLowerCase().includes(q)) : banks;
  }, [banks, query]);

  const onNumber = (v: string) => { setAccountNumber(v.replace(/\D/g, '').slice(0, 10)); setResult(null); };
  const confirm = async () => {
    if (!bankCode || accountNumber.length < 10) { setErr('Pick the bank and enter the 10-digit account number.'); return; }
    setBusy(true); setErr(null);
    try { setResult(await api.errandVendorAccount(jobId, bankCode, accountNumber)); onCaptured?.(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <View>
      <Mono style={{ fontSize: t.size.caption, marginBottom: 8 }}>ENTER THE SHOP&apos;S BUSINESS ACCOUNT (BUSINESS ACCOUNTS ONLY)</Mono>
      <Pressable onPress={() => setPickerOpen(true)}
        style={{ borderWidth: 1, borderColor: t.line, borderRadius: t.radius.md, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8, backgroundColor: t.bg }}>
        <Text style={{ fontSize: t.size.body, color: bankName ? t.ink : t.mid }}>{bankName || 'Select the shop&apos;s bank'}</Text>
      </Pressable>
      <Input placeholder="Account number (10 digits)" keyboardType="number-pad" maxLength={10} value={accountNumber} onChangeText={onNumber} style={{ marginBottom: 8 }} />
      {err ? <Text style={{ color: t.danger, fontSize: t.size.small, marginBottom: 8 }}>{err}</Text> : null}

      {result ? (
        <View style={{ borderWidth: 1, borderColor: result.match ? t.success : t.warning, borderRadius: t.radius.md, padding: 12, marginBottom: 4 }}>
          <Mono style={{ fontSize: t.size.caption, color: t.ink2 }}>ACCOUNT NAME</Mono>
          <Text style={{ fontSize: t.size.body, fontWeight: '700', marginTop: 2 }}>{result.accountName}</Text>
          <Mono style={{ color: result.match ? t.success : t.warning, marginTop: 6 }}>
            {result.match ? '✓ MATCHES THE STORE — WAITING FOR CUSTOMER TO APPROVE' : '⚠ DOESN’T CLEARLY MATCH — THE CUSTOMER MUST CONFIRM'}
          </Mono>
        </View>
      ) : (
        <Button label={busy ? 'Checking…' : 'Confirm vendor account'} onPress={confirm} busy={busy} disabled={!bankCode || accountNumber.length < 10} />
      )}

      <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: 56, paddingHorizontal: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: t.size.heading, fontWeight: '700', color: t.ink }}>Choose the shop&apos;s bank</Text>
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
            )}
            ListEmptyComponent={<Text style={{ color: t.mid, paddingVertical: 16 }}>No bank matches “{query}”.</Text>} />
        </View>
      </Modal>
    </View>
  );
}
