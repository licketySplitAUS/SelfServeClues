// Fixed labels keep arbitrary client text out of celebration notifications.
export const celebrationNames = Object.freeze({
  fireworks: 'Fireworks', disco: 'Disco ball', lasers: 'Laser show',
  lanterns: 'Rising lanterns', poppers: 'Party poppers', champagne: 'Champagne',
  balloons: 'Helium balloons', scroll: 'Congratulations scroll',
  curtain: 'Red stage curtain', glitter: 'Glitter bombs', powder: 'Colour powder',
  slime: 'Fluorescent slime', message: 'Congratulations message (reduced motion)',
});
export const validAnimation = value => typeof value === 'string' && Object.hasOwn(celebrationNames, value);
