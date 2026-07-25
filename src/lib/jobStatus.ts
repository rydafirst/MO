/**
 * Mirrors the backend's `isRiderEngaged` (jobs/domain/job-state-machine.ts): the statuses in which a
 * rider is still running a delivery — from acceptance through drop-off resolution.
 *
 * Kept in ONE module so every client feature that asks "is this rider on a trip?" agrees on the same
 * answer: the dashboard's active-delivery banner, the guard that blocks accepting a second job, and
 * the resume-on-foreground routing. A literal copied into each screen would eventually drift from the
 * server and from each other.
 */
export const RIDER_ACTIVE_STATUSES = [
  'ACCEPTED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'IN_PROGRESS',
  'EN_ROUTE_DROP', 'ARRIVED', 'AWAITING_CODE', 'WAITING', 'AWAITING_RESOLUTION',
] as const;

export function isRiderActive(status: string): boolean {
  return (RIDER_ACTIVE_STATUSES as readonly string[]).includes(status);
}
