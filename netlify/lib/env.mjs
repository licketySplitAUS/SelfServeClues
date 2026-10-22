export const env = name => globalThis.Netlify?.env?.get(name) ?? process.env[name];
export const productionNotifications = () => !env('CONTEXT') || env('CONTEXT') === 'production' || env('ALLOW_PREVIEW_NOTIFICATIONS') === 'true';
