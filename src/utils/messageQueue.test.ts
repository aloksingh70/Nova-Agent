import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createQueuedMessage,
  enqueueMessage,
  getNextDispatchableMessage,
  markQueuedMessageStatus,
  moveQueuedMessage,
  removeQueuedMessage,
  updateQueuedMessagePrompt,
} from './messageQueue';

test('enqueueMessage appends trimmed prompts in FIFO order and ignores blanks', () => {
  const q1 = enqueueMessage(
    [],
    createQueuedMessage({
      id: 'q1',
      prompt: '  List top 5 orders  ',
      mode: 'text-to-query',
      dialect: 'postgresql',
      schemaContext: '',
    })
  );
  assert.equal(q1.length, 1);
  assert.equal(q1[0].prompt, 'List top 5 orders');

  const q2 = enqueueMessage(
    q1,
    createQueuedMessage({
      id: 'q2',
      prompt: '   ',
      mode: 'debug',
      dialect: 'postgresql',
      schemaContext: '',
    })
  );
  assert.equal(q2.length, 1);
});

test('moveQueuedMessage reorders queued items without displacing a sending item', () => {
  let queue = [
    createQueuedMessage({ id: 'q1', prompt: 'First', mode: 'text-to-query', dialect: 'postgresql', schemaContext: '' }),
    createQueuedMessage({ id: 'q2', prompt: 'Second', mode: 'optimize', dialect: 'postgresql', schemaContext: '' }),
    createQueuedMessage({ id: 'q3', prompt: 'Third', mode: 'debug', dialect: 'postgresql', schemaContext: '' }),
  ];

  queue = moveQueuedMessage(queue, 'q3', 'up');
  assert.deepEqual(queue.map((i) => i.id), ['q1', 'q3', 'q2']);

  // Mark q1 sending; q3 cannot move above q1
  queue = markQueuedMessageStatus(queue, 'q1', 'sending');
  const blocked = moveQueuedMessage(queue, 'q3', 'up');
  assert.deepEqual(blocked.map((i) => i.id), ['q1', 'q3', 'q2']);
});

test('getNextDispatchableMessage respects pause, busy, and failed head states', () => {
  let queue = [
    createQueuedMessage({ id: 'q1', prompt: 'First', mode: 'text-to-query', dialect: 'postgresql', schemaContext: '' }),
    createQueuedMessage({ id: 'q2', prompt: 'Second', mode: 'debug', dialect: 'postgresql', schemaContext: '' }),
  ];

  assert.equal(getNextDispatchableMessage(queue, false, false)?.id, 'q1');
  assert.equal(getNextDispatchableMessage(queue, true, false), null);
  assert.equal(getNextDispatchableMessage(queue, false, true), null);

  queue = markQueuedMessageStatus(queue, 'q1', 'failed', 'API timeout');
  assert.equal(getNextDispatchableMessage(queue, false, false), null);

  // Updating / retrying failed head makes it dispatchable again
  queue = updateQueuedMessagePrompt(queue, 'q1', 'First fixed');
  assert.equal(queue[0].status, 'queued');
  assert.equal(getNextDispatchableMessage(queue, false, false)?.id, 'q1');

  queue = removeQueuedMessage(queue, 'q1');
  assert.equal(getNextDispatchableMessage(queue, false, false)?.id, 'q2');
});
