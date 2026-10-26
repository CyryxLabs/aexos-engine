/** Canonical evidence codec shared by typed durable stores. */
'use strict';

const crypto = require('crypto');

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function digest(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function eventHash(event) {
  return digest({
    sequence: event.sequence,
    type: event.type,
    at: event.at,
    payload: event.payload,
    previousHash: event.previousHash,
  });
}

function appendEvent(state, type, payload, clock) {
  const events = state.evidence;
  const previousHash = events.length === 0 ? '0'.repeat(64) : events.at(-1).hash;
  const event = {
    sequence: events.length + 1,
    type,
    at: clock().toISOString(),
    payload: clone(payload || {}),
    previousHash,
  };
  event.hash = eventHash(event);
  events.push(event);
}

function stateIntegrity(state) {
  const copy = clone(state);
  delete copy.integrityHash;
  return digest(copy);
}

function validateEvidence(events) {
  if (!Array.isArray(events)) return false;
  let previousHash = '0'.repeat(64);
  return events.every((event, index) => {
    const valid = event.sequence === index + 1
      && event.previousHash === previousHash
      && event.hash === eventHash(event);
    previousHash = event.hash;
    return valid;
  });
}

module.exports = { stableValue, stableStringify, digest, clone, eventHash, appendEvent, stateIntegrity, validateEvidence };
