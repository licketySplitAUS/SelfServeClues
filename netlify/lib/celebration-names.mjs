// Fixed labels keep arbitrary client text out of celebration notifications.
import { effectNames } from './celebration-catalog.mjs';
export const celebrationNames = Object.freeze({
  ...effectNames, message: 'Congratulations message (reduced motion)',
});
export const validAnimation = value => typeof value === 'string' && Object.hasOwn(celebrationNames, value);
export const celebrationTriggers = Object.freeze({ completion: 'Finished puzzle automatically', preview: 'Opened celebration preview', replay: 'Clicked replay or Play', reload: 'Reloaded celebration page' });
export const validCelebrationTrigger = value => typeof value === 'string' && Object.hasOwn(celebrationTriggers, value);
