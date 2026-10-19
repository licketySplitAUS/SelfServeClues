import test from 'node:test';import assert from 'node:assert/strict';
import message from '../netlify/functions/lickety-message.mjs';
test('explicit messages validate limits and optional contact details, disable mentions and use the message channel',async t=>{
 const oldFetch=globalThis.fetch,old=process.env.DISCORD_MESSAGE_WEBHOOK_URL;let sent,calls=0;
 t.after(()=>{globalThis.fetch=oldFetch;if(old===undefined)delete process.env.DISCORD_MESSAGE_WEBHOOK_URL;else process.env.DISCORD_MESSAGE_WEBHOOK_URL=old;});
 process.env.DISCORD_MESSAGE_WEBHOOK_URL='https://example.invalid/messages';globalThis.fetch=async(url,options)=>{calls++;sent={url,body:JSON.parse(options.body)};return new Response(null,{status:204});};
 const send=body=>message(new Request('https://example.test/api/lickety-message',{method:'POST',body:JSON.stringify(body)}));
 assert.equal((await send({message:''})).status,400);assert.equal((await send({message:'x'.repeat(501)})).status,400);assert.equal(calls,0);
 assert.equal((await send({message:'Hello @everyone\nThanks, lickety!',version:'3.2.10.0',anonymousId:'do-not-forward',word:'do-not-forward'})).status,204);
 assert.equal(sent.url,'https://example.invalid/messages');assert.deepEqual(sent.body.allowed_mentions,{parse:[]});assert.equal(sent.body.embeds[0].description,'Hello @everyone\nThanks, lickety!');
 assert.deepEqual(sent.body.embeds[0].fields,[{name:'Babble Expert version',value:'3.2.10.0'}]);assert.doesNotMatch(JSON.stringify(sent),/do-not-forward/);
 assert.equal((await send({message:'x'.repeat(500)})).status,204);
 const before=calls;
 for(const details of [{email:'bad-email'},{email:'x'.repeat(255)},{name:'x'.repeat(81)},{name:{}},{email:42}]) assert.equal((await send({message:'Hello',...details})).status,400);
 assert.equal(calls,before);
 assert.equal((await send({message:'Hello',name:' Babble Player ',email:' player@example.com ',version:'3.2.11'})).status,204);
 assert.deepEqual(sent.body.embeds[0].fields,[{name:'From',value:'Babble Player'},{name:'Email',value:'player@example.com'},{name:'Babble Expert version',value:'3.2.11'}]);
 globalThis.fetch=async()=>new Response(null,{status:500});assert.equal((await send({message:'retry me'})).status,502);
});
