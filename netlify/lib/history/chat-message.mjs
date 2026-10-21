export const DEFAULT_CHAT_MESSAGE = 'Clues are up!';
export const MAX_CHAT_MESSAGE_LENGTH = 250;

export function chatMessage(value = DEFAULT_CHAT_MESSAGE) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Enter an announcement message.');
  if (value.trim().length > MAX_CHAT_MESSAGE_LENGTH) throw new Error(`Keep the announcement to ${MAX_CHAT_MESSAGE_LENGTH} characters or fewer.`);
  if (/[\u0000-\u001f\u007f\u2028\u2029]/u.test(value)) throw new Error('Use a single line for the announcement.');
  return value.trim();
}
