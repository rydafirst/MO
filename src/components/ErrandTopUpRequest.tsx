import { useState } from 'react';
import { Text, View } from 'react-native';
import { api, naira, type Job } from '../api';
import { Button, Input, Mono } from '../ui';
import { t } from '../theme';

/**
 * ERRAND: at the shop the rider finds the price is higher than the customer declared. The rider asks
 * the customer to add the difference through the app — the money still flows through escrow to the
 * vendor, never through the rider's pocket. The rider only ever types the EXTRA amount needed.
 */
export function ErrandTopUpRequest({ job, onRequested }: { job: Job; onRequested?: () => void }) {
  const errand = job.errand;
  const [amount, setAmount] = useState(''); // naira, whole
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!errand || errand.vendorPaidAt) return null;

  const pending = (errand.requestedTopUpMinor ?? 0) > 0;
  const onAmount = (v: string) => { setAmount(v.replace(/[^\d]/g, '').slice(0, 7)); setErr(null); };
  const request = async () => {
    const minor = Math.round(Number(amount) * 100);
    if (!minor || minor < 100) { setErr('Enter how much more the customer should add.'); return; }
    setBusy(true); setErr(null);
    try { await api.errandRequestTopUp(job.id, minor); onRequested?.(); setAmount(''); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: t.line2, paddingTop: 12 }}>
      {pending ? (
        <Mono style={{ color: t.warning }}>
          ⏳ ASKED THE CUSTOMER FOR {naira(errand.requestedTopUpMinor!)} MORE — WAITING FOR THEM TO PAY
        </Mono>
      ) : (
        <>
          <Mono style={{ fontSize: t.size.caption, marginBottom: 6 }}>SHOP COSTS MORE THAN {naira(errand.goodsMinor)}?</Mono>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Input placeholder="Extra needed (₦)" keyboardType="number-pad" value={amount} onChangeText={onAmount} />
            </View>
            <Button label={busy ? '…' : 'Ask customer'} onPress={request} busy={busy} disabled={!amount} />
          </View>
        </>
      )}
      {err ? <Text style={{ color: t.danger, fontSize: t.size.small, marginTop: 6 }}>{err}</Text> : null}
    </View>
  );
}
