import { getToken } from './lib/session';

// Normalize base URL: prepend https:// if a scheme is missing, strip trailing slash.
function normalizeBase(raw: string | undefined): string {
  const v = (raw ?? 'http://localhost:4000/v1').trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}
export const BASE = normalizeBase(process.env.EXPO_PUBLIC_API_URL);

export type JobType = 'DELIVERY' | 'RIDE';
export type Fallback = 'WAIT' | 'DELEGATE' | 'RETURN';
export interface GeoPoint { lat: number; lng: number }
export interface Quote {
  quoteToken: string; amountMinor: number; currency: 'NGN';
  breakdown: { baseMinor: number; distanceMinor: number; platformFeeMinor: number; totalMinor: number };
}
export interface Job {
  id: string; type: JobType; status: string; amountMinor: number; currency: 'NGN'; createdAt: string;
  pickup?: GeoPoint; dropoff?: GeoPoint;
  pickupAddress?: string; dropoffAddress?: string; pickupArea?: string; dropoffArea?: string;
  recipient?: { name: string; phone: string }; item?: string; instructions?: string;
  fallbackPolicy?: Fallback;
}
export interface AvailableJob { id: string; type: JobType; amountMinor: number; currency: 'NGN'; createdAt: string; pickupArea: string; dropoffArea: string; pickupApprox: { lat: number; lng: number } }
export interface Account { bankCode: string; accountName: string; accountNumberMasked: string; type: 'refund' | 'payout' }
export interface Notification { id: string; jobId?: string; title: string; body: string; createdAt: number; read: boolean }
export type VehicleTrack = 'BIKE' | 'CAR' | 'KEKE';
export type DocType =
  | 'PROFILE_PHOTO' | 'GOV_ID' | 'LICENSE' | 'ADDRESS_PROOF' | 'VEHICLE_REG' | 'PROOF_OF_OWNERSHIP'
  | 'ROADWORTHINESS' | 'INSURANCE' | 'VEHICLE_PHOTO' | 'GUARANTOR' | 'LASRRA' | 'LASDRI' | 'HACKNEY_PERMIT' | 'KEKE_PERMIT';
export type DocState = 'MISSING' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
export type DocOnboarding = 'NO_TRACK' | 'INCOMPLETE' | 'UNDER_REVIEW' | 'ACTION_REQUIRED' | 'APPROVED' | 'EXPIRED';
export interface ChecklistItem { type: DocType; label: string; required: boolean; expires: boolean; status: DocState; rejectionReason?: string; expiresAt?: number }
export interface DocChecklist { track: VehicleTrack | null; onboarding: DocOnboarding; items: ChecklistItem[] }
export type VehicleColor = 'BLACK' | 'WHITE' | 'SILVER' | 'GREY' | 'RED' | 'BLUE' | 'GREEN' | 'GOLD' | 'OTHER';
export const VEHICLE_COLORS: VehicleColor[] = ['BLACK', 'WHITE', 'SILVER', 'GREY', 'RED', 'BLUE', 'GREEN', 'GOLD', 'OTHER'];
export interface RiderProfile { track: VehicleTrack | null; legalName?: string; nameVerified: boolean; vehiclePlate?: string; vehicleColor?: VehicleColor }
export interface RiderSummary { name?: string; nameVerified: boolean; vehicleType: VehicleTrack | null; vehiclePlate?: string; vehicleColor?: string; rating?: number; ratingCount?: number }
export interface PendingRating { jobId: string; amountMinor: number; createdAt: string; dropoffArea?: string; riderName?: string }

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
  return (await res.json()) as T;
}

export const api = {
  // ---- Auth ----
  requestOtp: (phone: string, email?: string) =>
    call<{ status: string }>(`/auth/otp/request`, { auth: false, method: 'POST', body: JSON.stringify(email ? { phone, email } : { phone }) }),
  verifyOtp: (phone: string, code: string, role: 'CUSTOMER' | 'RIDER' = 'CUSTOMER') =>
    call<{ accessToken: string; refreshToken: string }>(`/auth/otp/verify`, { auth: false, method: 'POST', body: JSON.stringify({ phone, code, role }) }),

  // ---- Customer: booking + orders ----
  quote: (body: { type: JobType; pickup: GeoPoint; dropoff: GeoPoint }) =>
    call<Quote>(`/jobs/quote`, { method: 'POST', body: JSON.stringify(body) }),
  createJob: (body: {
    quoteToken: string; fallbackPolicy?: Fallback; recipient?: { name: string; phone: string };
    item?: string; instructions?: string; pickupAddress?: string; dropoffAddress?: string; pickupArea?: string; dropoffArea?: string;
    returnUrl?: string;
  }) => call<Job & { paymentLink?: string }>(`/jobs`, { method: 'POST', headers: { 'Idempotency-Key': uuid() }, body: JSON.stringify(body) }),
  myJobs: () => call<Job[]>(`/jobs/mine`),
  getJob: (id: string) => call<Job>(`/jobs/${id}`),
  cancelJob: (id: string) => call<{ status: string; refunded: boolean }>(`/jobs/${id}/cancel`, { method: 'POST' }),
  confirmPayment: (id: string, transactionId: string) =>
    call<{ funded: boolean; status: string }>(`/jobs/${id}/confirm-payment`, { method: 'POST', body: JSON.stringify({ transactionId }) }),
  issueCode: (id: string) => call<{ code: string }>(`/jobs/${id}/issue-code`, { method: 'POST' }),

  // ---- Rider ----
  availableJobs: () => call<AvailableJob[]>(`/jobs/available`),
  assignedJobs: () => call<Job[]>(`/jobs/assigned`),
  accept: (id: string) => call<Job>(`/jobs/${id}/accept`, { method: 'POST' }),
  releaseJob: (id: string) => call<{ status: string }>(`/jobs/${id}/release`, { method: 'POST' }),
  advance: (id: string, to: 'EN_ROUTE_PICKUP' | 'IN_PROGRESS' | 'EN_ROUTE_DROP') =>
    call<Job>(`/jobs/${id}/advance`, { method: 'POST', body: JSON.stringify({ to }) }),
  arrivePickup: (id: string, lat: number, lng: number) =>
    call<Job>(`/jobs/${id}/arrive-pickup`, { method: 'POST', body: JSON.stringify({ lat, lng }) }),
  arrive: (id: string, lat: number, lng: number) =>
    call<Job>(`/jobs/${id}/arrive`, { method: 'POST', body: JSON.stringify({ lat, lng }) }),
  confirmCode: (id: string, code: string) =>
    call<{ status: string }>(`/jobs/${id}/confirm-code`, { method: 'POST', headers: { 'Idempotency-Key': uuid() }, body: JSON.stringify({ code }) }),
  failedAttempt: (id: string) =>
    call<{ status: string; attemptFeeMinor: number; waitingFeeMinor: number }>(`/jobs/${id}/failed-attempt`, { method: 'POST', headers: { 'Idempotency-Key': uuid() } }),
  getAvailability: () => call<{ online: boolean }>(`/me/availability`),
  setAvailability: (online: boolean) => call<{ online: boolean }>(`/me/availability`, { method: 'PUT', body: JSON.stringify({ online }) }),

  // ---- Shared ----
  wallet: () => call<{ releasedMinor: number; currency: 'NGN'; jobsCount: number; activeCount: number }>(`/wallet`),
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
  updateRiderProfile: (body: { legalName?: string; vehiclePlate?: string; vehicleColor?: VehicleColor }) =>
    call<RiderProfile>(`/me/documents/profile`, { method: 'PUT', body: JSON.stringify(body) }),
  jobRider: (id: string) => call<{ rider: RiderSummary | null }>(`/jobs/${id}/rider`),
  pendingRatings: () => call<PendingRating[]>(`/jobs/pending-ratings`),
  rateJob: (id: string, body: { stars: number; comment?: string }) =>
    call<{ id: string }>(`/jobs/${id}/rating`, { method: 'POST', body: JSON.stringify(body) }),
  registerPushToken: (body: { token: string; platform: 'ios' | 'android' }) =>
    call<{ ok: boolean }>(`/me/notifications/tokens`, { method: 'POST', body: JSON.stringify(body) }),
  unregisterPushToken: (token: string) =>
    call<{ ok: boolean }>(`/me/notifications/tokens/${encodeURIComponent(token)}`, { method: 'DELETE' }),
  openDispute: (id: string, counterEvidence = false) =>
    call<{ id: string; status: string; tier: string; resolution?: string }>(`/jobs/${id}/disputes`, { method: 'POST', body: JSON.stringify({ counterEvidence }) }),
};

export const naira = (m: number) => `₦${(m / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
