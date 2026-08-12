import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';

const parameters = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 } as const;
const keyLength = 64;

const scrypt = (password: string, salt: Buffer): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    nodeScrypt(password, salt, keyLength, parameters, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });

export const passwordPolicy = {
  minCharacters: 12,
  maxCharacters: 128,
  maxBytes: 512
} as const;

const assertPasswordShape = (password: string): void => {
  const characters = [...password].length;
  const bytes = Buffer.byteLength(password, 'utf8');
  if (
    characters < passwordPolicy.minCharacters ||
    characters > passwordPolicy.maxCharacters ||
    bytes > passwordPolicy.maxBytes ||
    password.includes('\0')
  ) {
    throw new Error('Password does not satisfy the configured policy');
  }
};

export const hashPassword = async (password: string): Promise<string> => {
  assertPasswordShape(password);
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt);
  return `scrypt$v=1$N=${parameters.N},r=${parameters.r},p=${parameters.p}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
};

export const verifyPassword = async (password: string, encoded: string): Promise<boolean> => {
  const parts = encoded.split('$');
  const [algorithm, version, parameterText, saltText, hashText] = parts;
  if (
    algorithm !== 'scrypt' ||
    version !== 'v=1' ||
    parameterText !== `N=${parameters.N},r=${parameters.r},p=${parameters.p}` ||
    !saltText ||
    !hashText
  ) {
    return false;
  }

  const expected = Buffer.from(hashText, 'base64url');
  if (expected.length !== keyLength) {
    return false;
  }

  try {
    const actual = await scrypt(password, Buffer.from(saltText, 'base64url'));
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
};
