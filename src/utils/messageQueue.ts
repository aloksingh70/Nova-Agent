import type { NovaMode, SqlDialect } from '../types/nova';

export type QueuedMessageStatus = 'queued' | 'sending' | 'failed';

export interface QueuedMessage {
  id: string;
  prompt: string;
  mode: NovaMode;
  dialect: SqlDialect;
  schemaContext: string;
  createdAt: string;
  status: QueuedMessageStatus;
  error?: string;
}

export function createQueuedMessage(input: {
  id?: string;
  prompt: string;
  mode: NovaMode;
  dialect: SqlDialect;
  schemaContext: string;
  createdAt?: string;
}): QueuedMessage {
  return {
    id: input.id ?? `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    prompt: input.prompt.trim(),
    mode: input.mode,
    dialect: input.dialect,
    schemaContext: input.schemaContext,
    createdAt: input.createdAt ?? new Date().toISOString(),
    status: 'queued',
  };
}

export function enqueueMessage(
  queue: QueuedMessage[],
  item: QueuedMessage
): QueuedMessage[] {
  if (!item.prompt.trim()) return queue;
  return [...queue, item];
}

export function removeQueuedMessage(
  queue: QueuedMessage[],
  id: string
): QueuedMessage[] {
  return queue.filter((item) => item.id !== id);
}

export function moveQueuedMessage(
  queue: QueuedMessage[],
  id: string,
  direction: 'up' | 'down'
): QueuedMessage[] {
  const index = queue.findIndex((item) => item.id === id);
  if (index === -1) return queue;
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= queue.length) return queue;
  // Do not reorder ahead of an actively sending item
  if (queue[index].status === 'sending' || queue[targetIndex].status === 'sending') {
    return queue;
  }
  const next = [...queue];
  const [moved] = next.splice(index, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}

export function updateQueuedMessagePrompt(
  queue: QueuedMessage[],
  id: string,
  newPrompt: string
): QueuedMessage[] {
  const trimmed = newPrompt.trim();
  if (!trimmed) return queue;
  return queue.map((item) =>
    item.id === id && item.status !== 'sending'
      ? { ...item, prompt: trimmed, status: 'queued', error: undefined }
      : item
  );
}

export function markQueuedMessageStatus(
  queue: QueuedMessage[],
  id: string,
  status: QueuedMessageStatus,
  error?: string
): QueuedMessage[] {
  return queue.map((item) =>
    item.id === id ? { ...item, status, error } : item
  );
}

export function getNextDispatchableMessage(
  queue: QueuedMessage[],
  isPaused: boolean,
  isBusy: boolean
): QueuedMessage | null {
  if (isPaused || isBusy) return null;
  if (queue.some((item) => item.status === 'sending')) return null;
  // Stop auto-dispatch if the head item failed so FIFO order is respected
  if (queue.length > 0 && queue[0].status === 'failed') return null;
  return queue.find((item) => item.status === 'queued') ?? null;
}
