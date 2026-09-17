import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema } from './validation';
describe('credentials', () => {
  it('accepts a valid registration', () => {
    expect(registerSchema.safeParse({ email: 'profe@example.com', password: 'Password12345' }).success).toBe(true);
  });
  it.each(['short', 'alllowercase12345', 'ALLUPPERCASE12345', 'NoDigitsHerePlease'])('rejects weak password %s', (password) => {
    expect(registerSchema.safeParse({ email: 'profe@example.com', password }).success).toBe(false);
  });
  it('rejects invalid email', () => {
    expect(loginSchema.safeParse({ email: 'invalid', password: 'a' }).success).toBe(false);
  });
});

