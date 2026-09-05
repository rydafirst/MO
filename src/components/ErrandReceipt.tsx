import { useEffect, useState } from 'react';
import { Modal, ScrollView, Share, Text, View } from 'react-native';
import { api, naira, type ErrandReceipt as Receipt } from '../api';
import { Button, Mono, PressableScale } from '../ui';
import { t } from '../theme';

/**
 * ERRAND: proof-of-payment receipt the rider shows the vendor (and the customer keeps). Data is fetched
 * from the server (authoritative amount + payout reference) so it can't be faked on the device. "Share"
 * uses the OS share sheet so either party can send it on (WhatsApp, email…) or save it.
 */
function line(r: Receipt): string {
  const when = new Date(r.paidAt).toLocaleString();
  return [
    'RYDAFIRST — PAYMENT RECEIPT',
    `Receipt: ${r.receiptNo}`,
    `Paid: ${when}`,
    r.store ? `Shop: ${r.store}` : '',
    `Paid to: ${r.vendorName} (${r.vendorAccountMasked})`,
    `Amount: ${naira(r.amountMinor)}`,
    r.payoutRef ? `Transfer ref: ${r.payoutRef}` : '',
    `Items: ${r.shoppingList}`,
    `Order: ${r.orderId}`,
    'Paid via Rydafirst escrow.',
  ].filter(Boolean).join('\n');
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Mono style={{ fontSize: t.size.caption, color: t.ink2 }}>{label}</Mono>
      <Text style={{ fontSize: t.size.body, fontWeight: '600', marginTop: 2, color: t.ink }}>{value}</Text>
    </View>
  );
}

export function ErrandReceiptModal({ jobId, visible, onClose }: { jobId: string; visible: boolean; onClose: () => void }) {
  const [rc, setRc] = useState<Receipt | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setErr(null); setRc(null);
    api.errandReceipt(jobId).then(setRc).catch((e) => setErr((e as Error).message));
  }, [visible, jobId]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: t.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32, maxHeight: '88%' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ fontSize: t.size.heading, fontWeight: '700', color: t.ink }}>Payment receipt</Text>
            <PressableScale onPress={onClose}><Mono style={{ color: t.ink2 }}>CLOSE</Mono></PressableScale>
          </View>

          {err ? <Text style={{ color: t.danger }}>{err}</Text> : null}
          {!rc && !err ? <Text style={{ color: t.mid }}>Loading…</Text> : null}

          {rc ? (
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={{ alignItems: 'center', marginBottom: 16 }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.success, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                  <Text style={{ color: t.onDark, fontSize: 22, fontWeight: '800' }}>✓</Text>
                </View>
                <Text style={{ fontSize: t.size.title, fontWeight: '800', color: t.ink }}>{naira(rc.amountMinor)}</Text>
                <Mono style={{ color: t.success, marginTop: 4 }}>PAID TO THE SHOP</Mono>
              </View>
              <View style={{ borderTopWidth: 1, borderTopColor: t.line2, paddingTop: 16 }}>
                <Field label="RECEIPT NO." value={rc.receiptNo} />
                <Field label="PAID ON" value={new Date(rc.paidAt).toLocaleString()} />
                {rc.store ? <Field label="SHOP" value={rc.store} /> : null}
                <Field label="PAID TO" value={`${rc.vendorName} · ${rc.vendorAccountMasked}`} />
                {rc.payoutRef ? <Field label="TRANSFER REF" value={rc.payoutRef} /> : null}
                <Field label="ITEMS" value={rc.shoppingList} />
              </View>
              <View style={{ marginTop: 8 }}>
                <Button label="Share receipt" onPress={() => Share.share({ message: line(rc) })} />
              </View>
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
