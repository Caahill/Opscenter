import { HEALTH_LABELS, PRIORITY_LABELS, STATUS_LABELS, type Health, type Priority, type StatusType } from '@opshub/shared';
import { Chip, type ChipTone } from '@opshub/ui';

const STATUS_TONE: Record<StatusType, ChipTone> = {
  NOT_STARTED: 'neutral',
  ACTIVE: 'accent',
  WAITING_ON_CLIENT: 'warning',
  ON_HOLD: 'muted',
  DONE: 'success',
  STOPPED: 'danger',
};

const PRIORITY_TONE: Record<Priority, ChipTone> = { URGENT: 'danger', HIGH: 'warning', NORMAL: 'neutral', LOW: 'muted' };
const HEALTH_TONE: Record<Health, ChipTone> = { ON_TRACK: 'success', AT_RISK: 'warning', BLOCKED: 'danger' };

export const StatusChip = ({ status }: { status?: StatusType }) =>
  status ? <Chip tone={STATUS_TONE[status]}>{STATUS_LABELS[status]}</Chip> : null;

export const PriorityChip = ({ priority }: { priority?: Priority }) =>
  priority && priority !== 'NORMAL' ? <Chip tone={PRIORITY_TONE[priority]}>{PRIORITY_LABELS[priority]}</Chip> : null;

export const HealthChip = ({ health }: { health?: Health }) =>
  health && health !== 'ON_TRACK' ? <Chip tone={HEALTH_TONE[health]}>{HEALTH_LABELS[health]}</Chip> : null;
