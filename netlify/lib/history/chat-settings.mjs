import { env } from './babble.mjs';
import { chatMessage, chatMessages } from './chat-message.mjs';

const storedMessages = value => value?.messages === undefined ? [chatMessage(value?.announcementText)] : chatMessages(value.messages);

export async function chatSettings(repo, fallback = env('NotifyBabblersOfClues') === 'true') {
  const { value, etag } = await repo.chatSettings();
  if (value && typeof value.enabled !== 'boolean') throw new Error('Saved chat setting is invalid.');
  const messages = storedMessages(value);
  const enabled = value ? value.enabled : fallback;
  if (enabled && !messages.length) throw new Error('Add at least one announcement message before enabling chat.');
  return { enabled, messages, announcementText: messages[0] || '', revision: etag || null, source: value ? 'admin' : 'environment', changedAt: value?.changedAt || null };
}

export async function saveChatSettings(repo, enabled, announcementText, messageList, expectedRevision) {
  if (typeof enabled !== 'boolean') throw new Error('Choose whether to enable Babble chat announcements.');
  const { value: previous, etag } = await repo.chatSettings();
  if (expectedRevision !== undefined && expectedRevision !== etag) throw new Error('Another change was saved first. Reload the message list before saving again.');
  let messages = messageList === undefined ? storedMessages(previous) : chatMessages(messageList);
  // An older open Admin tab edits the first entry without discarding the rest.
  if (messageList === undefined && announcementText !== undefined) messages = chatMessages([chatMessage(announcementText), ...messages.slice(1)]);
  if (enabled && !messages.length) throw new Error('Add at least one announcement message before enabling chat.');
  const value = { enabled, messages, announcementText: messages[0] || '', changedAt: new Date().toISOString() };
  const revision = await repo.commitChatSettings(value, etag);
  return { ...value, revision: revision || null, source: 'admin', message: `${messages.length} announcement message${messages.length === 1 ? '' : 's'} saved. Announcements are ${enabled ? 'on' : 'off'}. Saving does not post a message.` };
}
