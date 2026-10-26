import express from 'express';
import { SharedRecord } from '../../shared/src/model';

export interface AccountInput {
  email: string;
  active: boolean;
}

export function requireActive(input: AccountInput): SharedRecord {
  if (!input.active) {
    throw new Error('inactive');
  }
  return { id: input.email, active: input.active };
}

const app = express();
app.get('/accounts/:id', (_request, response) => response.json({ ok: true }));
const dynamicPath = '/dynamic';
app.get(dynamicPath, (_request, response) => response.json({ ok: true }));

const router = { get() { return 'not-http'; } };
router.get('/false-positive');

// import secret from 'comment-only'; app.post('/comment-only')
const example = "require('string-only') app.delete('/string-only')";
void example;
