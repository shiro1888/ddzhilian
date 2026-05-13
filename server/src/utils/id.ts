import { randomBytes } from 'node:crypto';

const SHORT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const TOKEN_ALPHABET =
  'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function createToken(length: number, alphabet: string) {
  const bytes = randomBytes(length);
  let token = '';

  for (let index = 0; index < length; index += 1) {
    token += alphabet[bytes[index] % alphabet.length];
  }

  return token;
}

export function createDeviceId() {
  return `dev_${createToken(14, TOKEN_ALPHABET)}`;
}

export function createShortCode() {
  return createToken(6, SHORT_CODE_ALPHABET);
}

export function createPairToken() {
  return createToken(12, TOKEN_ALPHABET);
}

export function createHistoryAuthToken() {
  return createToken(32, TOKEN_ALPHABET);
}

export function createSessionId() {
  return `sess_${createToken(18, TOKEN_ALPHABET)}`;
}

export function createRoomId() {
  return createToken(6, ROOM_ID_ALPHABET);
}
