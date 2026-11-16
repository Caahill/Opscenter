export const API_PREFIX = 'api/v1';

export const SESSION_COOKIE = 'opshub_session';
export const OAUTH_STATE_COOKIE = 'opshub_oauth_state';

/** PRD NFR: sessions expire after 12 hours of inactivity. */
export const SESSION_IDLE_MS = 12 * 60 * 60 * 1000;
/** lastSeenAt is written at most this often to avoid a DB write per request. */
export const SESSION_TOUCH_MS = 60 * 1000;

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';
export const DEFAULT_WEEKLY_CAPACITY_H = 40;

/** Masking replacement tokens (TechSpec 5.4). */
export const MASK_TOKENS = {
  email: '[email hidden]',
  phone: '[phone hidden]',
  credential: '[credential hidden]',
} as const;

/** Socket.IO path and events (TechSpec 6.2). Payloads are serialized per recipient by the API. */
export const REALTIME_PATH = '/api/v1/rt/socket.io';
export const REALTIME_EVENTS = ['notification.new', 'chat.message_new', 'inbox.message_new'] as const;
export type RealtimeEvent = (typeof REALTIME_EVENTS)[number];
