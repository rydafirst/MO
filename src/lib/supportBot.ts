/**
 * Client-side mirror of the support-chat bot script.
 *
 * The backend derives the bot step server-side and seeds the BOT prompt messages, but it does NOT
 * return the tap-choices in the API payload. So we replicate the per-category option lists here to
 * render the tap buttons for each step. This MUST stay faithful to
 * backend/src/modules/support/domain/support.ts (SCRIPTS): same categories, same step order, same
 * options — a "choice" step (one or two) then a final free-text "describe your issue" step.
 *
 * When the user taps an option OR types free text, the caller posts it to POST /support/threads/:id/answer,
 * which advances the bot; answering the final free-text step escalates the thread to AWAITING_AGENT.
 */

import type { SupportCategory } from '../api';

export interface BotStep {
  kind: 'choice' | 'freetext';
  prompt: string;
  options?: readonly string[];
}

/** Human labels for the six complaint categories (used by the picker + thread list). */
export const SUPPORT_CATEGORY_LABEL: Record<SupportCategory, string> = {
  PAYMENT: 'Payment',
  DELIVERY_ISSUE: 'Delivery issue',
  CONDUCT: 'Conduct or safety',
  ACCOUNT: 'Account',
  APP_ISSUE: 'App problem',
  OTHER: 'Something else',
};

/** Short helper line shown under each category card in the picker. */
export const SUPPORT_CATEGORY_HINT: Record<SupportCategory, string> = {
  PAYMENT: 'Charges, refunds, wallet or payout',
  DELIVERY_ISSUE: 'A rider, item or drop-off went wrong',
  CONDUCT: 'Report someone’s behaviour',
  ACCOUNT: 'Login, verification or your details',
  APP_ISSUE: 'A bug, crash or something not loading',
  OTHER: 'Anything not listed above',
};

export const SUPPORT_CATEGORIES: readonly SupportCategory[] = [
  'PAYMENT', 'DELIVERY_ISSUE', 'CONDUCT', 'ACCOUNT', 'APP_ISSUE', 'OTHER',
];

/**
 * The guided script per category — mirrors backend SCRIPTS exactly. Clarifying tap questions first,
 * then the closing free-text step.
 */
export const SUPPORT_BOT: Readonly<Record<SupportCategory, readonly BotStep[]>> = {
  PAYMENT: [
    {
      kind: 'choice',
      prompt: 'Sorry about the wahala with payment. Which one is it?',
      options: ['I was charged but no delivery', 'Money removed twice', 'Refund never came', 'Wallet or payout issue'],
    },
    {
      kind: 'freetext',
      prompt: 'Got it. Please tell us exactly what happened — amount, date and anything else that can help us sort it fast.',
    },
  ],
  DELIVERY_ISSUE: [
    {
      kind: 'choice',
      prompt: 'Let’s look into your delivery. What went wrong?',
      options: ['Rider never showed up', 'Item arrived damaged', 'Wrong or missing item', 'Delivered to wrong place'],
    },
    {
      kind: 'choice',
      prompt: 'Thanks. Where is the delivery now?',
      options: ['Still not delivered', 'Already delivered', 'I’m not sure'],
    },
    {
      kind: 'freetext',
      prompt: 'Please describe the issue in your own words so an agent can help you quickly.',
    },
  ],
  CONDUCT: [
    {
      kind: 'choice',
      prompt: 'We take this serious. Who is the complaint about?',
      options: ['The rider', 'The customer', 'A recipient', 'Someone else'],
    },
    {
      kind: 'freetext',
      prompt: 'Please tell us what happened. Share as much detail as you can — we’ll review it carefully.',
    },
  ],
  ACCOUNT: [
    {
      kind: 'choice',
      prompt: 'Let’s sort your account. What do you need help with?',
      options: ['Can’t log in', 'Verification (KYC) issue', 'Change my details', 'Delete my account'],
    },
    {
      kind: 'freetext',
      prompt: 'Please describe the problem so we can help you get back on track.',
    },
  ],
  APP_ISSUE: [
    {
      kind: 'choice',
      prompt: 'Sorry the app is misbehaving. What are you seeing?',
      options: ['App keeps crashing', 'A screen is stuck', 'Something is not loading', 'Other bug'],
    },
    {
      kind: 'freetext',
      prompt: 'Please describe the problem — and if you can, tell us your phone model. It helps us fix it.',
    },
  ],
  OTHER: [
    {
      kind: 'freetext',
      prompt: 'No problem — tell us how we can help and an agent will get back to you.',
    },
  ],
};

/** How many scripted steps a category has. */
export function scriptLength(category: SupportCategory): number {
  return SUPPORT_BOT[category].length;
}

/**
 * The tap options for the step the user is currently answering (empty for the free-text step or past
 * the end). `step` is zero-based. Mirrors backend botFollowUps.
 */
export function botFollowUps(category: SupportCategory, step: number): readonly string[] {
  const s = SUPPORT_BOT[category][step];
  return s && s.kind === 'choice' && s.options ? s.options : [];
}
