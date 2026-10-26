import { requireActive } from '../src/index';

test('requires an active account', () => {
  expect(() => requireActive({ email: 'a@example.test', active: false })).toThrow();
});
