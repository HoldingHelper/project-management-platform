/* Local-only visual check; removes its temporary task and restores preferences. */
const assert = require("node:assert/strict");
const { chromium } = require("@playwright/test");
(async () => {
  const origin = process.env.PMP_TEST_ORIGIN || "http://127.0.0.1:3000";
  assert.ok(["127.0.0.1","localhost"].includes(new URL(origin).hostname), "Run this fixture only against a local app");
  if (!process.env.PMP_TEST_EMAIL || !process.env.PMP_TEST_PASSWORD) throw new Error("Provide local credentials explicitly");
  const login = await fetch(`${origin}/api/v1/auth/login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({identifier:process.env.PMP_TEST_EMAIL,password:process.env.PMP_TEST_PASSWORD})});
  assert.ok(login.ok); const session=await login.json();
  const headers={Authorization:`Bearer ${session.access_token}`,"Content-Type":"application/json"};
  async function request(path,method="GET",body){const response=await fetch(`${origin}/api/v1${path}`,{method,headers,...(body ? {body:JSON.stringify(body)}:{})});assert.ok(response.ok,`${method} ${path}: ${response.status}`);return response.status===204 ? null:response.json();}
  const original=await request("/users/me/settings");
  const restore={theme:original.theme || "light",theme_variant:original.theme_variant || "classic",accent_color:original.accent_color || "blue"};
  let browser,task;
  try {
    task=await request("/tasks","POST",{title:"Warm Glass visual check",checklist_items:["Review implementation","Run regression checks","Review accessibility","Check responsive layout","Confirm acceptance"].map((text,order)=>({text,order}))});
    for(const item of task.checklist_items.slice(0,4)) await request(`/tasks/${task.id}/checklist/${item.id}`,"PUT",{is_done:true});
    browser=await chromium.launch({executablePath:"/usr/bin/chromium",args:["--no-sandbox"]});
    const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:"reduce"});
    await context.addInitScript(({refresh,user})=>{if(!localStorage.getItem("pmp.refresh_token")){localStorage.setItem("pmp.refresh_token",refresh);localStorage.setItem("pmp.user",JSON.stringify(user));}}, {refresh:session.refresh_token,user:session.user});
    const page=await context.newPage();
    for(const theme of ["dark","light"]){
      await request("/users/me/settings","PATCH",{theme,theme_variant:"study",accent_color:"blue"});
      await page.goto(`${origin}/tasks/${task.id}`);
      await page.waitForFunction(theme=>document.documentElement.dataset.themeStyle==="study" && document.documentElement.dataset.theme===theme,theme);
      const checklist=page.locator('section.task-content-card:has(input[type="checkbox"])');
      await checklist.waitFor();
      const boxes=checklist.locator('input[type="checkbox"]'); assert.equal(await boxes.count(),5);
      assert.equal(await boxes.first().evaluate(element=>getComputedStyle(element).appearance),"none");
      assert.ok((await boxes.first().evaluate(element=>getComputedStyle(element).backgroundImage)).includes("linear-gradient"));
      assert.ok((await boxes.nth(4).evaluate(element=>getComputedStyle(element).borderStyle)).includes("solid"));
      const shades=await boxes.evaluateAll(elements=>elements.filter(element=>element.checked).map(element=>getComputedStyle(element).backgroundImage));
      assert.equal(new Set(shades).size,4,"Completed boxes must use intermediate shades, not two alternating colors");
      const progress=checklist.getByRole("progressbar"); assert.equal(await progress.getAttribute("aria-valuenow"),"4");
      assert.equal(await progress.evaluate(element=>getComputedStyle(element).height),"6px");
      await checklist.screenshot({path:`/artifacts/warm-glass-checklist-${theme}.png`,animations:"disabled"});
      console.log(`Verified ${theme}: native checkbox behavior, glowing completed boxes, thin lavender checklist progress`);
    }
    const checklist=page.locator('section.task-content-card:has(input[type="checkbox"])');
    await checklist.locator('input[type="checkbox"]').nth(4).click();
    await page.waitForFunction(()=>document.querySelector('section.task-content-card [role="progressbar"]')?.getAttribute("aria-valuenow")==="5");
    const saved=await request(`/tasks/${task.id}`);assert.equal(saved.checklist_items.filter(item=>item.is_done).length,5);
    await page.goto(`${origin}/portfolio`);
    const standard=page.locator('.pmp-progress[data-progress-variant="standard"] .pmp-progress-track').first();
    await standard.waitFor(); assert.equal(await standard.evaluate(element=>getComputedStyle(element).height),"6px");
    await page.goto(`${origin}/timeline`);
    const timeline=page.locator('.pmp-progress[data-progress-variant="timeline"] .pmp-progress-track').first();
    await timeline.waitFor(); assert.equal(await timeline.evaluate(element=>getComputedStyle(element).height),"8px");
    await request("/users/me/settings","PATCH",{theme:"light",theme_variant:"classic",accent_color:"blue"});
    await page.goto(`${origin}/portfolio`);
    await page.waitForFunction(()=>document.documentElement.dataset.themeStyle==="classic");
    const classic=page.locator('.pmp-progress-track').first();await classic.waitFor();assert.equal(await classic.evaluate(element=>getComputedStyle(element).height),"8px");
    console.log("Verified completion saves, Warm Glass ordinary bars are 6px, Timeline stays 8px, and Classic stays 8px");
  } finally {
    if(task) await request(`/tasks/${task.id}`,"DELETE");
    await request("/users/me/settings","PATCH",restore);
    if(browser) await browser.close();
  }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
