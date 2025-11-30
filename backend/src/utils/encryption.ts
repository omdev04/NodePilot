import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'nodepilot-development-key-please-change';
if (!process.env.ENCRYPTION_KEY) {
  console.warn('⚠️  ENCRYPTION_KEY is not set. Using development default key. Do not use in production!');
}

const KEY = crypto.scryptSync(ENCRYPTION_KEY, 'nodepilot-salt', 32);
const ALGO = 'aes-256-gcm';

export function encrypt(text: string) {
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGO, KEY, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `enc:${iv.toString('hex')}.${tag.toString('hex')}.${encrypted.toString('hex')}`;
  } catch (error) {
    console.warn('Encryption failed, returning plaintext', error);
    return text;
  }
}

export function decrypt(data: string) {
  try {
    if (!data) return '';
    if (!data.startsWith('enc:')) return data;
    const payload = data.slice(4);
    const [ivHex, tagHex, cipherHex] = payload.split('.');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const encrypted = Buffer.from(cipherHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error) {
    console.warn('Decryption failed, returning original value', error);
    return data;
  }
}

export default { encrypt, decrypt };
