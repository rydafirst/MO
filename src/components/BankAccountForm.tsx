import { useState } from 'react';
import { Text, View } from 'react-native';
import { api, type Account } from '../api';
import { Button, Input, Mono, useToast } from '../ui';
import { t } from '../theme';

/**
 * Bank account entry: the user types only the bank code + account number. The account holder name
 * is resolved from the bank (name enquiry) and shown for confirmation — never typed. Saving stores
 * the number encrypted with the verified name. Used for rider payout and customer refund accounts.
 */
export function BankAccountForm({ type, onSaved }: { type: 'refund' | 'payout'; onSaved?: (a: Account) => void }) {
  const toast = useToast();
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [name, setName] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [saving, setSaving] = useState(false);

  const resolve = async (b: string, num: string) => {
    setResolving(true);
    try { const r = await api.resolveAccount({ bankCode: b, accountNumber: num }); setName(r.accountName); }
    catch { setName(null); toast('Could not find that account'); }
    finally { setResolving(false); }
  };
  const onBank = (v: string) => {
    const b = v.replace(/\D/g, ''); setBankCode(b); setName(null);
    if (b.length >= 3 && accountNumber.length === 10) void resolve(b, accountNumber);
  };
  const onNumber = (v: string) => {
    const num = v.replace(/\D/g, '').slice(0, 10); setAccountNumber(num); setName(null);
    if (num.length === 10 && bankCode.length >= 3) void resolve(bankCode, num);
  };
  const save = async () => {
    setSaving(true);
    try { const a = await api.setAccount({ bankCode, accountNumber, type }); toast('Bank account saved', 'success'); onSaved?.(a); }
    catch (e) { toast((e as Error).message); } finally { setSaving(false); }
  };

  return (
    <View>
      <Input placeholder="Bank code (e.g. 044)" keyboardType="number-pad" value={bankCode} onChangeText={onBank} style={{ marginBottom: 8 }} />
      <Input placeholder="Account number (10 digits)" keyboardType="number-pad" maxLength={10} value={accountNumber} onChangeText={onNumber} style={{ marginBottom: 8 }} />
      {resolving ? <Mono style={{ color: t.mid, marginBottom: 8 }}>CHECKING ACCOUNT…</Mono> : null}
      {name ? <Text style={{ fontSize: 14, fontWeight: '700', marginBottom: 8 }}>{name}</Text> : null}
      <Button label={saving ? 'Saving…' : 'Save account'} variant="ghost" onPress={save} busy={saving} disabled={!name} />
      <Mono style={{ fontSize: 10, color: t.mid, marginTop: 8 }}>NAME CONFIRMED WITH YOUR BANK · STORED ENCRYPTED</Mono>
    </View>
  );
}
