import { env } from './babble.mjs';

export async function chatSettings(repo, fallback = env('NotifyBabblersOfClues') === 'true') {
  const { value } = await repo.chatSettings();
  if (value && typeof value.enabled !== 'boolean') throw new Error('Saved chat setting is invalid.');
  return { enabled: value ? value.enabled : fallback, source: value ? 'admin' : 'environment', changedAt: value?.changedAt || null };
}

export async function saveChatSettings(repo, enabled) {
  if (typeof enabled !== 'boolean') throw new Error('Choose whether to enable Babble chat announcements.');
  const { etag } = await repo.chatSettings();
  const value = { enabled, changedAt: new Date().toISOString() };
  await repo.commitChatSettings(value, etag);
  return { ...value, source: 'admin', message: `Babble chat announcements ${enabled ? 'enabled' : 'disabled'}. No redeploy is needed. Saving this setting does not post a message.` };
}
