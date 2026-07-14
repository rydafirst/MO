import { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { api, type Account, type Bank } from '../api';
import { Button, Input, Mono, useToast } from '../ui';
import { t } from '../theme';

/**
 * Bank account entry: the user picks their bank by NAME from a searchable list (never a code) and
 * types the account number. The account holder name is resolved from the bank (name enquiry) and
 * shown for confirmation — never typed. Saving stores the number encrypted with the verified name.
 */
export function BankAccountForm({ type, onSaved }: { type: 'refund' | 'payout'; onSaved?: (a: Account) => void }) {
  const toast = useToast();
  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankCode, setBankCode] = useState('');
  const [bankName, setBankName] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [name, setName] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.banks().then(setBanks).catch(() => toast('Could not load the bank list'));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? banks.filter((b) => b.name.toLowerCase().includes(q)) : banks;
  }, [banks, query]);

  const resolve = async (code: string, num: string) => {
    setResolving(true);
    try { const r = await api.resolveAccount({ bankCode: code, accountNumber: num }); setName(r.accountName); }
    catch { setName(null); toast('Could not find that account'); }
    finally { setResolving(false); }
  };
  const pickBank = (b: Bank) => {
    setBankCode(b.code); setBankName(b.name); setName(null); setPickerOpen(false); setQuery('');
    if (accountNumber.length === 10) void resolve(b.code, accountNumber);
  };
  const onNumber = (v: string) => {
    const num = v.replace(/\D/g, '').slice(0, 10); setAccountNumber(num); setName(null);
    if (num.length === 10 && bankCode) void resolve(bankCode, num);
  };
  const save = async () => {
    setSaving(true);
    try { const a = await api.setAccount({ bankCode, accountNumber, type }); toast('Bank account saved', 'success'); onSaved?.(a); }
    catch (e) { toast((e as Error).message); } finally { setSaving(false); }
  };

  return (
    <View>
      <Pressable
        onPress={() => setPickerOpen(true)}
        style={{ borderWidth: 1, borderColor: t.line, borderRadius: t.radius.md, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8, backgroundColor: t.bg }}
      >
        <Text style={{ fontSize: 15, color: bankName ? t.ink : t.mid }}>{bankName || 'Select your bank'}</Text>
      </Pressable>

      <Input placeholder="Account number (10 digits)" keyboardType="number-pad" maxLength={10} value={accountNumber} onChangeText={onNumber} style={{ marginBottom: 8 }} />
      {resolving ? <Mono style={{ color: t.mid, marginBottom: 8 }}>CHECKING ACCOUNT…</Mono> : null}
      {name ? <Text style={{ fontSize: 14, fontWeight: '700', marginBottom: 8 }}>{name}</Text> : null}
      <Button label={saving ? 'Saving…' : 'Save account'} variant="ghost" onPress={save} busy={saving} disabled={!name} />
      <Mono style={{ fontSize: 10, color: t.mid, marginTop: 8 }}>NAME CONFIRMED WITH YOUR BANK · STORED ENCRYPTED</Mono>

      <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: 56, paddingHorizontal: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: t.ink }}>Choose your bank</Text>
            <Pressable onPress={() => { setPickerOpen(false); setQuery(''); }}><Mono style={{ color: t.ink2 }}>CLOSE</Mono></Pressable>
          </View>
          <TextInput
            placeholder="Search banks (e.g. Opay, Kuda)…"
            placeholderTextColor={t.mid}
            value={query}
            onChangeText={setQuery}
            autoFocus
            style={{ borderWidth: 1, borderColor: t.line, borderRadius: t.radius.md, paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, color: t.ink, marginBottom: 8 }}
          />
          <FlatList
            data={filtered}
            keyExtractor={(b) => b.code}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable onPress={() => pickBank(item)} style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: t.line2 }}>
                <Text style={{ fontSize: 15, color: t.ink }}>{item.name}</Text>
              </Pressable>
            )}
            ListEmptyComponent={<Text style={{ color: t.mid, paddingVertical: 16 }}>No bank matches “{query}”.</Text>}
          />
        </View>
      </Modal>
    </View>
  );
}
