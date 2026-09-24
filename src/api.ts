import { getToken } from './lib/session';

// Normalize base URL: prepend https:// if a scheme is missing, strip trailing slash.
function normalizeBase(raw: string | undefined): string {
  const v = (raw ?? 'http://localhost:4000/v1').trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}
export const BASE = normalizeBase(process.env.EXPO_PUBLIC_API_URL);

export type JobType = 'DELIVERY' | 'RIDE' | 'ERRAND';

// ERRAND ("buy-for-me") details carried on a Job of type ERRAND.
export interface ErrandDetails {
  goodsMinor: number;
  shoppingList: string;
  store?: { name?: string; area?: string; address?: string };
  vendorAccount?: { bankCode: string; accountNumber: string; accountName: string };
  accountByCustomer?: boolean;    // the customer supplied the shop account at booking
  vendorApproved?: boolean;
  vendorPaidAt?: number;
  deliveryFeeMinor?: number;      // fixed trip fee — top-ups grow only the goods, never this
  requestedTopUpMinor?: number;   // extra the rider is asking the customer to add
  topUpTxRef?: string;            // present while a top-up payment is pending
  topUpTxId?: string;             // set once a top-up is funded
}
export interface ErrandReceipt {
  receiptNo: string; orderId: string; paidAt: number; amountMinor: number; currency: 'NGN';
  vendorName: string; vendorAccountMasked: string; payoutRef?: string; store?: string; shoppingList: string;
}
export type VendorStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
export interface Vendor {
  id: string; ownerUserId: string; businessName: string; rcNumber?: string; category?: string; area?: string;
  description?: string; logoUrl?: string; status: VendorStatus; shopLat?: number; shopLng?: number;
  account?: { bankCode: string; accountNumber: string; accountName: string };
  accountVerified: boolean; rejectionReason?: string; approvedAt?: number; createdAt: number;
}
export interface Product {
  id: string; vendorId: string; name: string; priceMinor: number; description?: string;
  photoUrls?: string[]; available: boolean; createdAt: number;
}
export interface VendorOrder {
  id: string; status: string; createdAt: string; goodsMinor: number; deliveryFeeMinor: number;
  items: string; customerName?: string; vendorPaidAt?: number; vendorPayoutRef?: string;
}
export type Fallback = 'WAIT' | 'DELEGATE' | 'RETURN';
export interface GeoPoint { lat: number; lng: number }
export interface Quote {
  quoteToken: string; amountMinor: number; currency: 'NGN';
  breakdown: { baseMinor: number; distanceMinor: number; timeMinor: number; platformFeeMinor: number; totalMinor: number };
}
// #4 MULTI-STOP: one pickup, several drop-offs in one booking. Extra stops are the ordered EXTRA
// drop-off points AFTER the primary dropoff. Each carries its own recipient/item/notes and a single-use
// code (the code is NEVER returned on the Job — only once on the created-job response, see CreatedJob).
export interface ExtraStop {
  point: GeoPoint;
  address?: string; area?: string;
  recipient?: { name: string; phone?: string }; // phone omitted by the server until it's the current stop
  item?: string; instructions?: string;
  status: 'PENDING' | 'DELIVERED'; deliveredAt?: number;
}
export interface Job {
  id: string; type: JobType; status: string; amountMinor: number; currency: 'NGN'; createdAt: string;
  // The platform's cut of `amountMinor`. A RIDER's take-home is amountMinor - platformFeeMinor
  // (use riderNet()); the customer is charged the full amountMinor.
  platformFeeMinor?: number;
  customerName?: string;
  pickup?: GeoPoint; dropoff?: GeoPoint;
  pickupAddress?: string; dropoffAddress?: string; pickupArea?: string; dropoffArea?: string;
  recipient?: { name: string; phone?: string }; item?: string; weightGrams?: number; instructions?: string; // phone omitted by the server until pickup
  fallbackPolicy?: Fallback;
  waitStartedAt?: number; waitingFeeMinor?: number; waitingTxId?: string; returnOfJobId?: string;
  returnReserveMinor?: number;
  // #4 MULTI-STOP: present only when the booking has extra drop-offs. `primaryStopDeliveredAt` is set
  // once the primary dropoff is confirmed (status flips to EN_ROUTE_STOP with stops still pending).
  extraStops?: ExtraStop[]; primaryStopDeliveredAt?: number;
  // ERRAND ("buy-for-me"): present only for type ERRAND.
  errand?: ErrandDetails;
}
// #4 MULTI-STOP: metadata sent per extra stop at booking time — SAME order & COUNT as the quote `stops`
// (the geo points come from the signed quote, not this body).
export interface ExtraStopDto { recipient?: { name: string; phone: string }; item?: string; instructions?: string; address?: string; area?: string }
export interface ChatMessage { id: string; jobId: string; senderId: string; body: string; replyToId?: string; audioUrl?: string; audioDurationMs?: number; imageUrl?: string; createdAt: number }
export interface AvailableJob {
  id: string; type: JobType; amountMinor: number; currency: 'NGN'; createdAt: string;
  pickupArea: string; dropoffArea: string; pickupApprox: { lat: number; lng: number };
  tripDistanceMeters: number; tripEtaMin: number;
  toPickupMeters?: number; toPickupEtaMin?: number;
  // #4 MULTI-STOP: total drop-offs (primary + extras); present only for multi-stop jobs (>1).
  stopCount?: number;
  // What the rider is actually paid (customer charge minus the platform fee). Riders see THIS, not gross.
  riderPayoutMinor: number;
}

/** A rider's take-home for a job: the customer's charge minus the platform fee. Never show gross to riders. */
export function riderNet(amountMinor: number, platformFeeMinor?: number): number {
  return Math.max(0, amountMinor - (platformFeeMinor ?? 0));
}
/**
 * A rider's take-home for a specific job. Same as riderNet for a delivery, but for an ERRAND the
 * charge (amountMinor) includes the customer's ITEM money, which goes to the vendor — the rider earns
 * only the DELIVERY fee (net of the platform fee). Use this wherever a rider is shown their earnings.
 */
export function riderJobPayout(job: Job): number {
  const grossFare = job.type === 'ERRAND' && job.errand
    ? (job.errand.deliveryFeeMinor ?? Math.max(0, job.amountMinor - job.errand.goodsMinor))
    : job.amountMinor;
  return Math.max(0, grossFare - (job.platformFeeMinor ?? 0));
}
export interface Account { bankCode: string; accountName: string; accountNumberMasked: string; type: 'refund' | 'payout' }
export interface Bank { code: string; name: string }
export interface Notification { id: string; jobId?: string; title: string; body: string; createdAt: number; read: boolean }
export type VehicleTrack = 'BIKE' | 'CAR' | 'KEKE' | 'BICYCLE';
export type DocType =
  | 'PROFILE_PHOTO' | 'GOV_ID' | 'LICENSE' | 'ADDRESS_PROOF' | 'VEHICLE_REG' | 'PROOF_OF_OWNERSHIP'
  | 'ROADWORTHINESS' | 'INSURANCE' | 'VEHICLE_PHOTO' | 'GUARANTOR' | 'LASRRA' | 'LASDRI' | 'HACKNEY_PERMIT' | 'KEKE_PERMIT';
export type DocState = 'MISSING' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
export type DocOnboarding = 'NO_TRACK' | 'INCOMPLETE' | 'UNDER_REVIEW' | 'ACTION_REQUIRED' | 'APPROVED' | 'EXPIRED';
export interface ChecklistItem { type: DocType; label: string; required: boolean; expires: boolean; status: DocState; rejectionReason?: string; expiresAt?: number }
export interface DocChecklist { track: VehicleTrack | null; onboarding: DocOnboarding; items: ChecklistItem[] }
export type VehicleColor = 'BLACK' | 'WHITE' | 'SILVER' | 'GREY' | 'RED' | 'BLUE' | 'GREEN' | 'GOLD' | 'OTHER';
export const VEHICLE_COLORS: VehicleColor[] = ['BLACK', 'WHITE', 'SILVER', 'GREY', 'RED', 'BLUE', 'GREEN', 'GOLD', 'OTHER'];
export interface RiderProfile { track: VehicleTrack | null; legalName?: string; nameVerified: boolean; vehiclePlate?: string; vehicleColor?: VehicleColor; guarantorName?: string; guarantorPhone?: string; guarantorAddress?: string; guarantorRelationship?: string }
// `phone` is present only while the job is in flight, and only for the counterparty. `phoneMasked`
// says whether it is a proxy number — dial whatever is given and don't cache it.
// `callMode`: 'proxy' means masked in-app calling is live — request a call (server rings you) and no
// number is exposed; 'direct' means fall back to a tel: link with `phone`.
export interface RiderSummary { name?: string; nameVerified: boolean; vehicleType: VehicleTrack | null; vehiclePlate?: string; vehicleColor?: string; rating?: number; ratingCount?: number; photoUrl?: string; phone?: string; phoneMasked?: boolean; callMode?: 'proxy' | 'direct'; callNumber?: string }
/** Per-stage durations for a delivery. `open` marks the stage still running. */
export type LatenessTier = 'none' | 'rider' | 'all';
export interface JobTimings {
  stages: Array<{ status: string; ms: number; open: boolean }>;
  currentStageMs: number;
  totalMs: number;
  drop?: { expectedSec: number; elapsedSec: number; remainingSec: number; lateness: LatenessTier };
}
export interface PendingRating { jobId: string; amountMinor: number; createdAt: string; dropoffArea?: string; riderName?: string }

// ---- Support chat (#5 agent hand-off + #6 per-trip) ----
// Mirrors backend/src/modules/support/domain/support.ts. A thread starts in BOT (a short scripted
// funnel), then escalates to AWAITING_AGENT once the final free-text step is answered.
export type SupportCategory = 'PAYMENT' | 'DELIVERY_ISSUE' | 'CONDUCT' | 'ACCOUNT' | 'APP_ISSUE' | 'OTHER';
export type SupportStatus = 'BOT' | 'AWAITING_AGENT' | 'AGENT_JOINED' | 'RESOLVED';
export interface SupportThread {
  id: string; userId: string; jobId?: string; category: SupportCategory; status: SupportStatus;
  agentId?: string; agentJoinDeadline?: number; createdAt: number; updatedAt: number;
}
export interface SupportMessage {
  id: string; threadId: string; sender: 'USER' | 'BOT' | 'AGENT'; senderId?: string; body: string; createdAt: number;
}

const uuid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

async function call<T>(path: string, opts: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const { auth = true, headers, ...rest } = opts;
  const token = auth ? await getToken() : '';
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const msg = Array.isArray(body.message) ? body.message.join('; ') : body.message;
    throw new Error(msg ?? `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  // Guard against empty bodies (void handlers): parsing "" throws a SyntaxError.
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  // ---- Auth ----
  requestOtp: (phone: string, email?: string, name?: string) =>
    call<{ status: string }>(`/auth/otp/request`, { auth: false, method: 'POST', body: JSON.stringify({ phone, ...(email ? { email } : {}), ...(name ? { name } : {}) }) }),
  verifyOtp: (phone: string, code: string, role: 'CUSTOMER' | 'RIDER' = 'CUSTOMER') =>
    call<{ accessToken: string; refreshToken: string }>(`/auth/otp/verify`, { auth: false, method: 'POST', body: JSON.stringify({ phone, code, role }) }),

  // ---- Customer: booking + orders ----
  // #4 MULTI-STOP: `stops` = ordered EXTRA drop-off points AFTER the primary dropoff (max 8). The
  // server prices the full route pickup→dropoff→stops… and returns the same shape (breakdown reflects
  // every leg).
  quote: (body: { type: JobType; pickup: GeoPoint; dropoff: GeoPoint; stops?: GeoPoint[] }) =>
    call<Quote>(`/jobs/quote`, { method: 'POST', body: JSON.stringify(body) }),
  createJob: (body: {
    quoteToken: string; fallbackPolicy?: Fallback; customerName?: string; recipient?: { name: string; phone: string };
    item?: string; weightKg?: number; instructions?: string; pickupAddress?: string; dropoffAddress?: string; pickupArea?: string; dropoffArea?: string;
    returnUrl?: string;
    // #4 MULTI-STOP: per-stop metadata, SAME order & COUNT as the quote `stops`. The response's
    // `extraStopCodes` carries each stop's plaintext single-use code, shown ONCE to the customer.
    extraStops?: ExtraStopDto[];
  }) => call<Job & { paymentLink?: string; extraStopCodes?: string[] }>(`/jobs`, { method: 'POST', headers: { 'Idempotency-Key': uuid() }, body: JSON.stringify(body) }),
  // ERRAND ("buy-for-me"): create the errand (store->customer trip + goods amount held for the vendor).
  createErrand: (body: {
    quoteToken: string; goodsMinor: number; shoppingList: string;
    storeName?: string; storeArea?: string; storeAddress?: string; dropoffAddress?: string; dropoffArea?: string;
    customerName?: string; returnUrl?: string; bankCode?: string; accountNumber?: string;
  }) => call<Job & { paymentLink?: string }>(`/jobs/errand`, { method: 'POST', headers: { 'Idempotency-Key': uuid() }, body: JSON.stringify(body) }),
  // Rider captures the vendor's business account at the store; returns the resolved name + match.
  errandVendorAccount: (id: string, bankCode: string, accountNumber: string) =>
    call<{ accountName: string; match: boolean }>(`/jobs/${id}/errand/vendor-account`, { method: 'POST', body: JSON.stringify({ bankCode, accountNumber }) }),
  // Customer approves the resolved vendor account — releases the goods-money to the vendor.
  errandApproveVendor: (id: string) => call<{ paidPending: boolean }>(`/jobs/${id}/errand/approve-vendor`, { method: 'POST' }),
  // ERRAND top-up: rider flags the shop price is higher; customer adds the extra through the app.
  errandRequestTopUp: (id: string, additionalMinor: number) =>
    call<{ requestedTopUpMinor: number }>(`/jobs/${id}/errand/request-topup`, { method: 'POST', body: JSON.stringify({ additionalMinor }) }),
  errandStartTopUp: (id: string, returnUrl?: string) =>
    call<{ paymentLink: string; amountMinor: number }>(`/jobs/${id}/errand/start-topup`, { method: 'POST', body: JSON.stringify({ returnUrl }) }),
  errandConfirmTopUp: (id: string, transactionId: string) =>
    call<{ funded: boolean; goodsMinor: number }>(`/jobs/${id}/errand/confirm-topup`, { method: 'POST', body: JSON.stringify({ transactionId }) }),
  // ERRAND: proof-of-payment receipt (shown to the vendor, kept by the customer). Available once paid.
  errandReceipt: (id: string) => call<ErrandReceipt>(`/jobs/${id}/errand/receipt`),
  // Report a late delivery — auto-judged against a traffic-aware ETA server-side.
  reportLate: (id: string) => call<{ reportId: string; verdict: string; status: string }>(`/jobs/${id}/report-late`, { method: 'POST' }),
  // ---- Vendors (marketplace) ----
  myVendor: () => call<Vendor | null>(`/vendors/me`),
  registerVendor: (body: { businessName: string; rcNumber?: string; category?: string; area?: string; description?: string }) =>
    call<Vendor>(`/vendors`, { method: 'POST', body: JSON.stringify(body) }),
  updateVendor: (body: { businessName?: string; rcNumber?: string; category?: string; area?: string; description?: string; logoKey?: string; shopLat?: number; shopLng?: number }) =>
    call<Vendor>(`/vendors/me`, { method: 'PATCH', body: JSON.stringify(body) }),
  vendorBusinessAccount: (bankCode: string, accountNumber: string) =>
    call<{ accountName: string; match: boolean }>(`/vendors/me/business-account`, { method: 'POST', body: JSON.stringify({ bankCode, accountNumber }) }),
  myProducts: () => call<Product[]>(`/vendors/me/products`),
  addProduct: (body: { name: string; priceMinor: number; description?: string; photoKeys?: string[]; available?: boolean }) =>
    call<Product>(`/vendors/me/products`, { method: 'POST', body: JSON.stringify(body) }),
  updateProduct: (productId: string, body: { name?: string; priceMinor?: number; description?: string; photoKeys?: string[]; available?: boolean }) =>
    call<Product>(`/vendors/me/products/${productId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  removeProduct: (productId: string) => call<{ removed: boolean }>(`/vendors/me/products/${productId}`, { method: 'DELETE' }),
  vendorLogoUploadUrl: (contentType: string, sizeBytes: number) =>
    call<{ uploadUrl: string; key: string }>(`/vendors/me/logo-upload-url`, { method: 'POST', body: JSON.stringify({ contentType, sizeBytes }) }),
  productPhotoUploadUrl: (contentType: string, sizeBytes: number) =>
    call<{ uploadUrl: string; key: string }>(`/vendors/me/products/photo-upload-url`, { method: 'POST', body: JSON.stringify({ contentType, sizeBytes }) }),
  vendors: () => call<Vendor[]>(`/vendors`),
  vendor: (id: string) => call<Vendor>(`/vendors/${id}`),
  vendorProducts: (id: string) => call<Product[]>(`/vendors/${id}/products`),
  createMarketplaceOrder: (body: { vendorId: string; items: { productId: string; quantity: number }[]; quoteToken: string; dropoffAddress?: string; dropoffArea?: string; customerName?: string; returnUrl?: string }) =>
    call<Job & { paymentLink?: string }>(`/jobs/marketplace`, { method: 'POST', headers: { 'Idempotency-Key': uuid() }, body: JSON.stringify(body) }),
  vendorOrders: () => call<VendorOrder[]>(`/jobs/vendor-orders`),
  publicConfig: () => call<{ marketplaceEnabled: boolean }>(`/config`, { auth: false }),
  myJobs: () => call<Job[]>(`/jobs/mine`),
  getJob: (id: string) => call<Job>(`/jobs/${id}`),
  cancelJob: (id: string) => call<{ status: string; refunded: boolean }>(`/jobs/${id}/cancel`, { method: 'POST' }),
  notifyComing: (id: string) => call<{ ok: boolean }>(`/jobs/${id}/coming`, { method: 'POST' }),
  confirmPayment: (id: string, transactionId: string) =>
    call<{ funded: boolean; status: string }>(`/jobs/${id}/confirm-payment`, { method: 'POST', body: JSON.stringify({ transactionId }) }),
  // Re-pay an unpaid order without recreating it. Server refuses (returns the current status) if the
  // order is already funded, so the customer can never be charged twice.
  retryPayment: (id: string, returnUrl?: string) =>
    call<{ status: string; paymentLink?: string; flwTxRef?: string }>(`/jobs/${id}/retry-payment`, { method: 'POST', body: JSON.stringify(returnUrl ? { returnUrl } : {}) }),
  issueCode: (id: string) => call<{ code: string }>(`/jobs/${id}/issue-code`, { method: 'POST' }),

  // ---- Rider ----
  availableJobs: (pos?: { lat: number; lng: number }) =>
    call<AvailableJob[]>(`/jobs/available`, { method: 'POST', body: JSON.stringify(pos ?? {}) }),
  assignedJobs: () => call<Job[]>(`/jobs/assigned`),
  accept: (id: string) => call<Job>(`/jobs/${id}/accept`, { method: 'POST' }),
  releaseJob: (id: string) => call<{ status: string }>(`/jobs/${id}/release`, { method: 'POST' }),
  advance: (id: string, to: 'EN_ROUTE_PICKUP' | 'IN_PROGRESS' | 'EN_ROUTE_DROP') =>
    call<Job>(`/jobs/${id}/advance`, { method: 'POST', body: JSON.stringify({ to }) }),
  arrivePickup: (id: string, lat: number, lng: number, accuracyM?: number) =>
    call<Job>(`/jobs/${id}/arrive-pickup`, { method: 'POST', body: JSON.stringify({ lat, lng, ...(accuracyM != null ? { accuracyM } : {}) }) }),
  arrive: (id: string, lat: number, lng: number, accuracyM?: number) =>
    call<Job>(`/jobs/${id}/arrive`, { method: 'POST', body: JSON.stringify({ lat, lng, ...(accuracyM != null ? { accuracyM } : {}) }) }),
  confirmCode: (id: string, code: string) =>
    call<{ status: string }>(`/jobs/${id}/confirm-code`, { method: 'POST', headers: { 'Idempotency-Key': uuid() }, body: JSON.stringify({ code }) }),
  // #4 MULTI-STOP: confirm one EXTRA stop (0-based index within extraStops). The rider works the stops
  // in strict order after the primary dropoff. Intermediate stops return EN_ROUTE_STOP; the final stop
  // returns RELEASED (escrow released, rider paid).
  confirmStop: (id: string, index: number, code: string, lat: number, lng: number, accuracyM?: number) =>
    call<{ status: string }>(`/jobs/${id}/stops/${index}/confirm-code`, { method: 'POST', headers: { 'Idempotency-Key': uuid() }, body: JSON.stringify({ code, lat, lng, ...(accuracyM != null ? { accuracyM } : {}) }) }),
  // #4 MULTI-STOP: customer re-reveals an extra stop's code (0-based index within extraStops).
  issueStopCode: (id: string, index: number) => call<{ code: string }>(`/jobs/${id}/stops/${index}/code`, { method: 'POST' }),
  failedAttempt: (id: string) =>
    call<{ status: string; attemptFeeMinor: number; waitingFeeMinor: number }>(`/jobs/${id}/failed-attempt`, { method: 'POST', headers: { 'Idempotency-Key': uuid() } }),
  // ---- Recipient-unavailable resolution ----
  startWaiting: (id: string) =>
    call<{ status: string; waitStartedAt: number }>(`/jobs/${id}/start-waiting`, { method: 'POST' }),
  escalate: (id: string) =>
    call<{ status: string; waitingSoFarMinor: number; returnFareMinor: number }>(`/jobs/${id}/escalate`, { method: 'POST' }),
  chargeWaiting: (id: string) =>
    call<{ waitingFeeMinor: number; paymentLink: string; flwTxRef: string }>(`/jobs/${id}/charge-waiting`, { method: 'POST' }),
  confirmWaitingPayment: (id: string, transactionId: string) =>
    call<{ funded: boolean }>(`/jobs/${id}/confirm-waiting-payment`, { method: 'POST', body: JSON.stringify({ transactionId }) }),
  keepWaiting: (id: string) =>
    call<{ status: string; waitingSoFarMinor: number }>(`/jobs/${id}/keep-waiting`, { method: 'POST' }),
  payWaiting: (id: string) =>
    call<{ waitingFeeMinor: number; paymentLink: string; flwTxRef: string }>(`/jobs/${id}/pay-waiting`, { method: 'POST' }),
  initiateReturn: (id: string, returnUrl?: string) =>
    call<Job & { paymentLink?: string }>(`/jobs/${id}/return`, { method: 'POST', body: JSON.stringify(returnUrl ? { returnUrl } : {}) }),
  // ---- Rider <-> customer chat ----
  messages: (id: string) => call<ChatMessage[]>(`/jobs/${id}/messages`),
  sendMessage: (id: string, body: string, replyToId?: string, audio?: { audioKey?: string; audioDurationMs?: number }, imageKey?: string) =>
    call<ChatMessage>(`/jobs/${id}/messages`, { method: 'POST', body: JSON.stringify({
      ...(body ? { body } : {}),
      ...(replyToId ? { replyToId } : {}),
      ...(audio?.audioKey ? { audioKey: audio.audioKey } : {}),
      ...(audio?.audioDurationMs != null ? { audioDurationMs: audio.audioDurationMs } : {}),
      ...(imageKey ? { imageKey } : {}),
    }) }),
  // Voice notes: get a presigned URL, PUT the recording to it, then sendMessage with the returned key.
  chatAudioUploadUrl: (id: string, contentType: string, sizeBytes: number) =>
    call<{ uploadUrl: string; key: string }>(`/jobs/${id}/messages/audio-upload-url`, { method: 'POST', body: JSON.stringify({ contentType, sizeBytes }) }),
  // Photos: get a presigned URL, PUT the image to it, then sendMessage with the returned key.
  chatImageUploadUrl: (id: string, contentType: string, sizeBytes: number) =>
    call<{ uploadUrl: string; key: string }>(`/jobs/${id}/messages/image-upload-url`, { method: 'POST', body: JSON.stringify({ contentType, sizeBytes }) }),
  reportMessage: (id: string, messageId: string, reason?: string) =>
    call<{ id: string }>(`/jobs/${id}/messages/${messageId}/report`, { method: 'POST', body: JSON.stringify(reason ? { reason } : {}) }),
  getAvailability: () => call<{ online: boolean }>(`/me/availability`),
  setAvailability: (online: boolean) => call<{ online: boolean }>(`/me/availability`, { method: 'PUT', body: JSON.stringify({ online }) }),

  // ---- Shared ----
  wallet: () => call<{ releasedMinor: number; currency: 'NGN'; jobsCount: number; activeCount: number }>(`/wallet`),
  banks: () => call<Bank[]>(`/me/account/banks`),
  getAccount: () => call<Account | null>(`/me/account`),
  resolveAccount: (body: { bankCode: string; accountNumber: string }) =>
    call<{ accountName: string }>(`/me/account/resolve`, { method: 'POST', body: JSON.stringify(body) }),
  setAccount: (body: { bankCode: string; accountNumber: string; type?: 'refund' | 'payout' }) =>
    call<Account>(`/me/account`, { method: 'PUT', body: JSON.stringify(body) }),
  submitKyc: (inputs: { ninVerified: boolean; bvnVerified: boolean; idDocUploaded: boolean; selfieMatched: boolean; addressProvided: boolean }) =>
    call<{ status: string }>(`/riders/kyc`, { method: 'POST', body: JSON.stringify(inputs) }),
  notifications: () => call<{ items: Notification[]; unread: number }>(`/me/notifications`),
  markNotificationsRead: () => call<{ ok: boolean }>(`/me/notifications/read`, { method: 'POST' }),
  documentsChecklist: () => call<DocChecklist>(`/me/documents`),
  setVehicleTrack: (track: VehicleTrack) =>
    call<{ track: VehicleTrack }>(`/me/documents/track`, { method: 'PUT', body: JSON.stringify({ track }) }),
  requestDocumentUpload: (body: { type: DocType; contentType: string; issuedAt?: number; expiresAt?: number }) =>
    call<{ documentId: string; uploadUrl: string }>(`/me/documents/upload-url`, { method: 'POST', body: JSON.stringify(body) }),
  riderProfile: () => call<RiderProfile>(`/me/documents/profile`),
  updateRiderProfile: (body: { legalName?: string; vehiclePlate?: string; vehicleColor?: VehicleColor; guarantorName?: string; guarantorPhone?: string; guarantorAddress?: string; guarantorRelationship?: string }) =>
    call<RiderProfile>(`/me/documents/profile`, { method: 'PUT', body: JSON.stringify(body) }),
  jobRider: (id: string) => call<{ rider: RiderSummary | null }>(`/jobs/${id}/rider`),
  jobTimings: (id: string) => call<JobTimings>(`/jobs/${id}/timings`),
  jobCustomer: (id: string) => call<{ name?: string; photoUrl?: string; phone?: string; phoneMasked?: boolean; callMode?: 'proxy' | 'direct'; callNumber?: string }>(`/jobs/${id}/customer`),
  // Masked in-app call: server rings the caller, then bridges to the counterparty. No number returned.
  requestCall: (id: string) => call<{ status: string }>(`/jobs/${id}/call`, { method: 'POST' }),
  avatarUploadUrl: (contentType: string, sizeBytes: number) => call<{ uploadUrl: string }>(`/me/avatar/upload-url`, { method: 'POST', body: JSON.stringify({ contentType, sizeBytes }) }),
  myAvatar: () => call<{ photoUrl: string | null }>(`/me/avatar`),
  me: () => call<{ id: string; phone: string | null }>(`/me`),
  deleteAccount: () => call<{ deleted: boolean }>(`/me`, { method: 'DELETE' }),
  pendingRatings: () => call<PendingRating[]>(`/jobs/pending-ratings`),
  rateJob: (id: string, body: { stars: number; comment?: string }) =>
    call<{ id: string }>(`/jobs/${id}/rating`, { method: 'POST', body: JSON.stringify(body) }),
  registerPushToken: (body: { token: string; platform: 'ios' | 'android' }) =>
    call<{ ok: boolean }>(`/me/notifications/tokens`, { method: 'POST', body: JSON.stringify(body) }),
  unregisterPushToken: (token: string) =>
    call<{ ok: boolean }>(`/me/notifications/tokens/${encodeURIComponent(token)}`, { method: 'DELETE' }),
  openDispute: (id: string, counterEvidence = false) =>
    call<{ id: string; status: string; tier: string; resolution?: string }>(`/jobs/${id}/disputes`, { method: 'POST', body: JSON.stringify({ counterEvidence }) }),

  // ---- Support chat ----
  startSupportThread: (category: SupportCategory, jobId?: string) =>
    call<SupportThread>(`/support/threads`, { method: 'POST', body: JSON.stringify({ category, ...(jobId ? { jobId } : {}) }) }),
  // answer = the tapped canned option OR free text; advances the bot (final step escalates to an agent).
  answerSupport: (id: string, answer: string) =>
    call<{ thread: SupportThread; messages: SupportMessage[] }>(`/support/threads/${id}/answer`, { method: 'POST', body: JSON.stringify({ answer }) }),
  postSupportMessage: (id: string, body: string) =>
    call<SupportMessage>(`/support/threads/${id}/messages`, { method: 'POST', body: JSON.stringify({ body }) }),
  mySupportThreads: () => call<SupportThread[]>(`/support/threads`),
  supportMessages: (id: string) => call<SupportMessage[]>(`/support/threads/${id}/messages`),
};

export const naira = (m: number) => `₦${(m / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
