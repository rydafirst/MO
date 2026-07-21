import { ScrollView, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStack } from '../App';
import { Screen } from '../ui';
import { t } from '../theme';

// Baseline Terms of Use / Privacy Policy shown at sign-up. Kept in sync with the web /terms and
// /privacy pages. Review with counsel before launch.
const TERMS: Array<[string, string]> = [
  ['Who we are', 'Rydafirst operates a technology platform that connects customers who need items delivered with independent riders who carry out those deliveries in Nigeria. Rydafirst provides the platform; riders provide the delivery service.'],
  ['Your account', 'You must provide accurate details (your name, phone number and email) and keep them current. You are responsible for activity on your account. Access is verified with a one-time code. You must be at least 18 years old to use Rydafirst.'],
  ['Payments and escrow', 'Delivery fees are collected up front and held in escrow. Funds are released to the rider once a delivery is completed and confirmed. Where a delivery cannot be completed, funds are released, refunded or split according to our dispute rules and the reason it failed.'],
  ['Acceptable use and conduct', 'You agree to treat riders, customers and staff with respect. There is zero tolerance for abusive, harassing, hateful, fraudulent or otherwise objectionable behaviour or content, including in in-app messages. We review reports and may suspend or remove accounts that breach these terms.'],
  ['Prohibited items', 'You may not send illegal, dangerous, stolen or restricted goods. You are responsible for the contents you send and for complying with applicable law.'],
  ['Disputes', 'If something goes wrong with a delivery, you can open a dispute in the app within the stated window. Our team reviews the evidence, including the delivery timeline and messages, and decides whether funds are released, refunded or split.'],
  ['Liability', 'Rydafirst provides the platform on an "as is" basis and is not the provider of the delivery itself. To the extent permitted by law, our liability is limited to the fees paid for the affected delivery.'],
  ['Changes and contact', 'We may update these terms and will post the updated version in the app. Questions? Contact support@rydafirst.com.'],
];

const PRIVACY: Array<[string, string]> = [
  ['What we collect', 'The details you give us (name, phone number, email), delivery details (pickup and drop-off addresses, item description), payment references needed to process fees, and — while a delivery is active — location data so the delivery can be tracked. Riders also provide identity and vehicle documents for verification.'],
  ['How we use it', 'To create your account, match deliveries, process payments through our payment provider, keep the service safe, resolve disputes and meet legal obligations. We do not sell your personal data.'],
  ['Location', 'Location is used only to enable and track an active delivery and to confirm pickup and drop-off. You can turn location off in your device settings, though some features will not work without it.'],
  ['Sharing', 'We share the minimum necessary with the other party to a delivery and with service providers such as our payment processor, SMS/email providers and cloud hosting. We may disclose data where required by law.'],
  ['Retention and security', 'We keep data only as long as needed for the purposes above or as required by law, and we apply appropriate security measures. Raw location data is kept for a short period.'],
  ['Your rights', 'You can request access to, correction of, or deletion of your personal data, subject to legal limits. Contact privacy@rydafirst.com to make a request.'],
];

export function LegalScreen({ route, navigation }: NativeStackScreenProps<RootStack, 'Legal'>) {
  const isPrivacy = route.params?.doc === 'privacy';
  const title = isPrivacy ? 'Privacy Policy' : 'Terms of Use';
  const sections = isPrivacy ? PRIVACY : TERMS;
  return (
    <Screen title={title} onBack={() => navigation.goBack()}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text style={{ color: t.ink2, fontSize: t.size.caption, letterSpacing: 1, marginBottom: 18 }}>LAST UPDATED 14 JULY 2026</Text>
        {sections.map(([heading, body]) => (
          <View key={heading} style={{ marginBottom: 18 }}>
            <Text style={{ color: t.ink, fontSize: t.size.subtitle, fontWeight: '700', marginBottom: 6 }}>{heading}</Text>
            <Text style={{ color: t.ink2, fontSize: t.size.body, lineHeight: 21 }}>{body}</Text>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
