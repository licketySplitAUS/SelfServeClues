import { createHash } from 'node:crypto';
// Keep the ordered lists and hash rule stable: these are labels, not real names.
const colors = 'Blue Golden Silver Scarlet Emerald Violet Amber Coral Azure Jade Ruby Indigo Copper Rose Sunny Teal'.split(' ');
const birds = 'Wren Robin Finch Heron Lark Owl Sparrow Kestrel Kingfisher Swallow Falcon Wagtail Warbler Plover Swift Dove'.split(' ');
export const validBrowserId = id => typeof id === 'string' && /^CV-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id);
export function browserAlias(id) {
  if (!validBrowserId(id)) return 'Unidentified browser';
  const hash = createHash('sha256').update(id).digest();
  return colors[hash[0] % colors.length] + ' ' + birds[hash[1] % birds.length];
}
export function browserField(id) {
  return { name: 'Anonymous browser', value: validBrowserId(id) ? browserAlias(id) + '\n' + id : 'Unidentified browser (older page)', inline: false };
}
