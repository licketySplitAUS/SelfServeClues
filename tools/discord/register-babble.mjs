import { pathToFileURL } from 'node:url';
import { babbleCommand, discordBabble } from '../../netlify/lib/discord-babble.mjs';

// Registration is an explicit operator action. Netlify can run it once during
// an opted-in production build, where masked secrets are available securely.
export async function registerBabbleCommand({ token, fetchImpl = fetch } = {}) {
  if (!token || /\s/.test(token)) throw Error('Set DISCORD_BABBLE_BOT_TOKEN in the process environment.');
  const request = async (path, body) => {
    let response;
    try {
      response = await fetchImpl(`https://discord.com/api/v10${path}`, {
        method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { authorization: `Bot ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch { throw Error('Discord registration connection failed.'); }
    if (!response.ok) throw Error(`Discord registration HTTP ${response.status}.`);
    try { return await response.json(); } catch { throw Error('Discord registration response was invalid.'); }
  };
  const app = await request('/oauth2/applications/@me');
  if (app.id !== discordBabble.application) throw Error('This token belongs to another Discord application.');
  // Create/upsert only /babble, preserving all unrelated commands.
  const command = await request(`/applications/${discordBabble.application}/guilds/${discordBabble.guild}/commands`, babbleCommand);
  if (command.name !== 'babble' || command.application_id !== discordBabble.application || !/^\d{17,22}$/.test(command.id)) throw Error('Discord did not confirm the /babble registration.');
  return { id: command.id, name: command.name, application: command.application_id, guild: discordBabble.guild };
}

export async function registerBabbleOnBuild({ readEnv = key => process.env[key], register = registerBabbleCommand } = {}) {
  if (readEnv('CONTEXT') !== 'production' || readEnv('DISCORD_BABBLE_REGISTER_ON_BUILD') !== 'true') return null;
  return register({ token: readEnv('DISCORD_BABBLE_BOT_TOKEN') });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length && !(args.length === 1 && ['--apply', '--from-build'].includes(args[0]))) throw Error('Usage: node tools/discord/register-babble.mjs [--apply|--from-build]');
    if (!args.length) console.log(JSON.stringify({ mode: 'dry-run', application: discordBabble.application, guild: discordBabble.guild, command: babbleCommand }, null, 2));
    else if (args[0] === '--from-build') {
      const result = await registerBabbleOnBuild();
      if (result) console.log('Registered Discord /babble:', JSON.stringify(result));
    }
    else console.log(JSON.stringify(await registerBabbleCommand({ token: process.env.DISCORD_BABBLE_BOT_TOKEN })));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
