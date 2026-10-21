import { randomInt } from 'node:crypto';

export const DEFAULT_CHAT_MESSAGE = 'Clues are up!';
export const MAX_CHAT_MESSAGE_LENGTH = 250;

export function chatMessage(value = DEFAULT_CHAT_MESSAGE) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Enter an announcement message.');
  if (value.trim().length > MAX_CHAT_MESSAGE_LENGTH) throw new Error(`Keep the announcement to ${MAX_CHAT_MESSAGE_LENGTH} characters or fewer.`);
  if (/[\u0000-\u001f\u007f\u2028\u2029]/u.test(value)) throw new Error('Use a single line for the announcement.');
  return value.trim();
}
export function chatMessages(value) {
  if (!Array.isArray(value)) throw new Error('Provide a list of announcement messages.');
  return [...new Set(value.map((message, index) => {
    if (message === undefined) throw new Error(`Message ${index + 1}: Enter an announcement message.`);
    try { return chatMessage(message); }
    catch (error) { throw new Error(`Message ${index + 1}: ${error.message}`); }
  }))];
}

export async function chooseDailyChatMessage(repo, date, messages, randomIndex = randomInt) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('A puzzle date is required to choose its announcement.');
  const saved = await repo.dailyChatSelection(date);
  if (saved) {
    if (saved.date !== date || typeof saved.message !== 'string') throw new Error('The saved daily announcement is invalid.');
    return chatMessage(saved.message);
  }
  const choices = chatMessages(messages);
  if (!choices.length) throw new Error('Add at least one announcement message before enabling chat.');
  const index = randomIndex(choices.length);
  if (!Number.isInteger(index) || index < 0 || index >= choices.length) throw new Error('Could not choose an announcement.');
  const choice = { message: choices[index], date, selectedAt: new Date().toISOString() };
  if (await repo.commitDailyChatSelection(date, choice)) return choice.message;
  const winner = await repo.dailyChatSelection(date);
  if (!winner || winner.date !== date || typeof winner.message !== 'string') throw new Error('The daily announcement could not be confirmed.');
  return chatMessage(winner.message);
}
