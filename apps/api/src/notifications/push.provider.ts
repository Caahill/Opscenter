import type { Provider } from '@nestjs/common';
import { FakePushSender, WebPushSender } from '@opshub/integrations';
import { ENV, type Env } from '../config/env';

export const PUSH = Symbol('PUSH');

/** Web push with VAPID keys; without them (tests, quick local runs) pushes are recorded only. */
export const PUSH_PROVIDER: Provider = {
  provide: PUSH,
  inject: [ENV],
  useFactory: (env: Env) =>
    env.PUSH_VAPID_PUBLIC_KEY && env.PUSH_VAPID_PRIVATE_KEY && env.NODE_ENV !== 'test'
      ? new WebPushSender({ publicKey: env.PUSH_VAPID_PUBLIC_KEY, privateKey: env.PUSH_VAPID_PRIVATE_KEY, subject: env.PUSH_SUBJECT })
      : new FakePushSender(env.PUSH_VAPID_PUBLIC_KEY || 'BFakeTestPublicKey'),
};
