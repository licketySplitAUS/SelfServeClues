import { env } from './babble.mjs';
import { chatMessage } from './chat-message.mjs';

export async function chatSettings(repo, fallback = env('NotifyBabblersOfClues') === 'true') {
  const { value } = await repo.chatSettings();
  if (value && typeof value.enabled !== 'boolean') throw new Error('Saved chat setting is invalid.');
  return { enabled: value ? value.enabled : fallback, announcementText: chatMessage(value?.announcementText), source: value ? 'admin' : 'environment', changedAt: value?.changedAt || null };
}

export async function saveChatSettings(repo, enabled, announcementText) {
  if (typeof enabled !== 'boolean') throw new Error('Choose whether to enable Babble chat announcements.');
  const { value: previous, etag } = await repo.chatSettings();
  const value = { enabled, announcementText: chatMessage(announcementText === undefined ? previous?.announcementText : announcementText), changedAt: new Date().toISOString() };
  await repo.commitChatSettings(value, etag);
  return { ...value, source: 'admin', message: `Babble chat announcements ${enabled ? 'enabled' : 'disabled'}. Announcement text saved. No redeploy is needed. Saving does not post a message.` };
}
