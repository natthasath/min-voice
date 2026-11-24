import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const DEFAULT_ADMIN_PASSWORD = 'changeme';

export interface AdminCredentials {
  salt: string;
  hash: string;
  isDefault: boolean;
}

export function hashPassword(password: string, isDefault = false): AdminCredentials {
  const salt = randomBytes(16).toString('hex');
  return { salt, hash: scryptSync(password, salt, 64).toString('hex'), isDefault };
}

export function checkPassword(password: string, { salt, hash }: AdminCredentials): boolean {
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, 64);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
