// Real menu/room interactions with a simulated standard pad, in an isolated profile.
// CHROME=<path> [VIEW=...] [ASPECT=Auto] node tools/e2e/controller-menus.mjs <outDir>
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startRun, viewport, setAspect } from './start.mjs';
const out = process.argv[2] ?? '/tmp/sts2-controller-menus'; fs.mkdirSync(out, {recursive:true});
const browser = await chromium.launch({executablePath:process.env.CHROME});
const page = await browser.newPage({viewport}); const errors=[];
page.setDefaultTimeout(15000);
page.on('pageerror', e=>errors.push(e.message));
await page.addInitScript(() => {
  performance.setResourceTimingBufferSize(10000);
  window.__pad = {connected:false,index:0,id:'E2E Xbox Controller',mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
  Object.defineProperty(navigator,'getGamepads',{value:()=>window.__pad.connected?[window.__pad]:[]});
});
const tap = button => page.evaluate(async button => {
  window.__pad.buttons[button]={pressed:true,value:1};
  for(let i=0;i<4;i++) await new Promise(requestAnimationFrame);
  window.__pad.buttons[button]={pressed:false,value:0};
  for(let i=0;i<4;i++) await new Promise(requestAnimationFrame);
},button);
const tilt = (x,y=0)=>page.evaluate(async axes=>{
  window.__pad.axes=[...axes,0,0]; for(let i=0;i<3;i++) await new Promise(requestAnimationFrame);
  window.__pad.axes=[0,0,0,0]; for(let i=0;i<4;i++) await new Promise(requestAnimationFrame);
},[x,y]);
async function focus(selector, button) {
  for(let i=0;i<20 && !await page.locator(selector+'.input-focus').count();i++) await tap(button);
  assert.equal(await page.locator(selector+'.input-focus').count(),1,selector);
}
async function debugRoom(type, model) {
  await page.evaluate(async ([type,model])=>{
    const G=window.G;
    G.$.ext('MegaCrit.Sts2.Core.Nodes.Screens.Map.NMapScreen').Instance.Close(false);
    await G.RunManager.Instance.EnterRoomDebug(G.RoomType[type], G.MapPointType.Unassigned, model?G.ModelDb.Event(G[model]):null, false);
  },[type,model]);
}
try {
  await page.goto((process.env.URL??'http://127.0.0.1:47173/')+'?lang=eng&seed=CONTINUE1&unlock=all&tutorials=off');
  await page.waitForFunction(()=>window.ui?.screen==='menu',null,{timeout:60000}); await setAspect(page);
  await page.evaluate(()=>{window.__pad.connected=true;}); await tap(11);
  await page.waitForSelector('.mm-btn.input-focus'); await page.waitForSelector('.controller-focus-hint .rt-controller-icon');
  await page.evaluate(async()=>{
    const entry=performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname==='/src/input/bindings.ts');
    window.__bindings=await import(entry.name); window.__bindings.setGamepadBinding('select',2);
    window.__pad.id='Sony DualSense Controller';
  });
  await page.waitForSelector('.controller-focus-hint [data-glyph*="/ps4/x.tres"]');
  await page.evaluate(()=>{window.__bindings.setGamepadBinding('select',0);window.__pad.id='Nintendo Switch Controller';});
  await page.waitForSelector('.controller-focus-hint [data-glyph*="/switch/b.tres"]');
  await page.evaluate(()=>{window.__pad.id='E2E Xbox Controller';});
  await page.waitForSelector('.controller-focus-hint [data-glyph*="/xbox_one/a.tres"]');
  console.log('Main menu controller focus and glyph passed');
  await focus('.mm-multiplayer',13); await tap(0); await page.waitForSelector('.mp-screen-container .submenu-btn');
  await tilt(.8); await page.waitForSelector('.submenu-btn:nth-child(2).input-focus');
  await tap(0); await page.waitForSelector('.mp-dialog-input');
  for (const invitation of [' https://sts2.136521.xyz/?room=a1b2c3d4e5f6&lang=zhs ', 'sts2.136521.xyz/?room=a1b2c3d4e5f6', 'a1b2c3d4e5f6']) {
    await page.locator('.mp-dialog-input').evaluate((el,text)=>{
      const data=new DataTransfer(); data.setData('text',text);
      el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));
    },invitation);
    assert.equal(await page.inputValue('.mp-dialog-input'),'A1B2C3D4E5F6');
  }
  await tilt(0,.8); await page.waitForSelector('.mp-join-dialog .input-focus');
  assert.equal(await page.locator('.mm-btn.input-focus, .submenu-btn.input-focus').count(),0);
  await page.screenshot({path:`${out}/join-focus.png`});
  await tap(1); await page.waitForSelector('.mp-join-dialog',{state:'detached'});
  assert.equal(await page.evaluate(()=>window.ui.menuStack.length),1,'Cancel returns one level');
  await tap(1); await page.waitForSelector('.mm-single_player');
  console.log('Invite paste and single-level cancel passed');
  await focus('.mm-settings',13); await tap(0); await page.waitForSelector('.settings-screen');
  await tap(5); await tap(5); // Original next-tab action, Audio.
  await page.waitForSelector('.sts-bar.input-focus');
  const volume=await page.evaluate(()=>window.G.SaveManager.Instance.SettingsSave.VolumeMaster);
  await tap(14);
  assert.ok(Math.abs(await page.evaluate(()=>window.G.SaveManager.Instance.SettingsSave.VolumeMaster)-Math.max(0,volume-.05))<.001);
  await tap(15);
  assert.equal(await page.evaluate(()=>window.G.SaveManager.Instance.SettingsSave.VolumeMaster),volume);
  await tilt(0,.8); assert.equal(await page.locator('.sts-bar.input-focus').count(),1);
  await tap(4); await tap(4); // Back to Game.
  await focus('.std-face',13); await tap(0); await page.waitForSelector('.std-list .std-item.input-focus');
  await tilt(0,.8); assert.equal(await page.locator('.std-list .std-item.input-focus').count(),1);
  if (await page.locator('.std-item').count()>10) {
    await focus('.std-item:last-child',13);
    assert.ok(await page.locator('.std-list').evaluate(el=>el.scrollTop)>0,'Dropdown scrolls to its last option');
  }
  await tap(1); await page.waitForSelector('.std-list',{state:'detached'});
  await page.screenshot({path:`${out}/settings-focus.png`});
  await tap(1); await page.waitForSelector('.settings-screen',{state:'detached'});
  console.log('Settings slider steps, tab switching and dropdown cancel passed');
  await page.evaluate(()=>{window.G.SaveManager.Instance.PrefsSave.FastMode=window.G.FastModeType.Instant;});
  await startRun(page);
  await debugRoom('Event','MorphicGrove'); await tap(11);
  await page.waitForSelector('.event-option:not(.disabled).input-focus');
  const first=await page.locator('.event-option.input-focus').innerText();
  await tilt(0,.8); assert.notEqual(await page.locator('.event-option.input-focus').innerText(),first);
  await tilt(0,-.8); await tap(0);
  await page.waitForSelector('.grid-screen .gh-card.input-focus',{timeout:15000});
  const cardX=await page.locator('.gh-card.input-focus').evaluate(el=>el.getBoundingClientRect().left);
  await tilt(-.8);
  assert.ok(await page.locator('.gh-card.input-focus').evaluate(el=>el.getBoundingClientRect().left)>cardX,'Grid wraps left within the row');
  await tilt(.8);
  assert.ok(Math.abs(await page.locator('.gh-card.input-focus').evaluate(el=>el.getBoundingClientRect().left)-cardX)<3);
  await tap(0); await tilt(.8); await tap(0);
  await page.waitForSelector('.grid-preview .input-focus');
  assert.equal(await page.locator('.grid-screen > .input-focus').count(),0,'Preview owns focus');
  await page.screenshot({path:`${out}/grid-preview.png`}); await tap(3);
  await page.waitForSelector('.grid-screen',{state:'detached',timeout:30000});
  console.log('Menu, invite paste, stick event choices and card grid/preview passed');
  await debugRoom('RestSite');
  await page.waitForSelector('.rest-btn[aria-disabled="false"].input-focus');
  const restFirst=await page.locator('.rest-btn.input-focus').innerText();
  await tilt(.8); assert.notEqual(await page.locator('.rest-btn.input-focus').innerText(),restFirst);
  await tilt(-.8); await tap(0); await page.waitForFunction(()=>window.ui.room.proceedOn);
  await debugRoom('Treasure'); await page.waitForSelector('.chest-btn.input-focus'); await tap(0);
  await page.waitForSelector('.relic-holder-t[aria-disabled="false"].input-focus');
  await page.screenshot({path:`${out}/treasure-focus.png`}); await tap(0);
  await page.waitForFunction(()=>window.ui.room.claimed);
  await debugRoom('Shop'); await page.waitForSelector('.merchant-btn.input-focus'); await tap(0);
  await page.waitForSelector('.shop-inv.open .shop-hit.input-focus');
  const shopFirst=await page.locator('.shop-hit.input-focus').evaluate(el=>el.getBoundingClientRect().left);
  await tilt(.8); assert.notEqual(await page.locator('.shop-hit.input-focus').evaluate(el=>el.getBoundingClientRect().left),shopFirst);
  await page.screenshot({path:`${out}/shop-focus.png`});
  await tap(1); await page.waitForSelector('.shop-inv.open',{state:'detached'});
  // Modal selection must respect the highlighted No instead of always invoking Yes.
  await page.evaluate(async()=>{
    const entry=performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname==='/src/ui/modal.tsx');
    const modal=await import(entry.name); window.__popupAnswer='pending';
    modal.confirmPopup({header:'Controller test',body:'Choose No with the pad',yes:'Yes',no:'No'}).then(v=>window.__popupAnswer=v);
  });
  await page.waitForSelector('.modal-slot .vp-btn.input-focus');
  await focus('.modal-slot .vp-btn.no',14); await tap(0);
  await page.waitForFunction(()=>window.__popupAnswer===false);
  assert.deepEqual(errors,[]); console.log('OK: rest, chest/relic selection, shop focus/back, modal No and original controller glyphs');
} catch(e) {
  console.error(e,errors);
  console.error(await page.evaluate(()=>Array.from(document.querySelectorAll('.input-focus, .vp-btn, .mp-dialog-input')).map(el=>({cls:el.className,pointer:getComputedStyle(el).pointerEvents,rect:el.getBoundingClientRect().toJSON()}))).catch(()=>null));
  await page.screenshot({path:`${out}/failed.png`}).catch(()=>{}); process.exitCode=1;
} finally {await browser.close();}
