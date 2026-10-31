/* Local opt-in browser regression. Restores account appearance and language. */
const assert = require("node:assert/strict");
const { chromium } = require("@playwright/test");
(async () => {
  if (!process.env.PMP_TEST_EMAIL || !process.env.PMP_TEST_PASSWORD) throw new Error("Provide local test credentials explicitly");
  const origin = process.env.PMP_TEST_ORIGIN || "http://127.0.0.1:3000";
  const response = await fetch(`${origin}/api/v1/auth/login`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({identifier:process.env.PMP_TEST_EMAIL,password:process.env.PMP_TEST_PASSWORD}) });
  assert.ok(response.ok, "Login must succeed");
  const session = await response.json();
  const headers = { Authorization:`Bearer ${session.access_token}`, "Content-Type":"application/json" };
  const original = await (await fetch(`${origin}/api/v1/users/me/settings`, {headers})).json();
  const restore = { theme:original.theme || "light", theme_variant:original.theme_variant || "classic", accent_color:original.accent_color || "blue" };
  let browser;
  async function patch(path, body) { const result = await fetch(`${origin}/api/v1${path}`, {method:"PATCH",headers,body:JSON.stringify(body)}); assert.ok(result.ok, "Test preference update must succeed"); }
  try {
    browser = await chromium.launch({executablePath:"/usr/bin/chromium",args:["--no-sandbox"]});
    const context = await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:"reduce"});
    await context.addInitScript(({refresh,user}) => { if (!localStorage.getItem("pmp.refresh_token")) { localStorage.setItem("pmp.refresh_token",refresh); localStorage.setItem("pmp.user",JSON.stringify(user)); } }, {refresh:session.refresh_token,user:session.user});
    const page = await context.newPage();
    for (const locale of ["en","fa"]) {
      await patch("/users/me/profile",{locale});
      for (const theme of ["light","dark"]) {
        await patch("/users/me/settings",{theme,theme_variant:"clinical",accent_color:"emerald"});
        await page.goto(`${origin}/organization`);
        await page.waitForFunction(({locale,theme}) => document.documentElement.lang === locale && document.documentElement.dataset.themeStyle === "clinical" && document.documentElement.dataset.theme === theme, {locale,theme});
        const tab = page.locator('.pmp-sidebar a.pmp-nav-btn[aria-current="page"]');
        await tab.scrollIntoViewIfNeeded();
        await page.waitForFunction(() => { const element=document.querySelector('.pmp-sidebar a.pmp-nav-btn[aria-current="page"]'); return element && getComputedStyle(element).backgroundColor === "rgb(255, 255, 255)" && getComputedStyle(element).color === "rgb(4, 120, 87)"; });
        const style = await tab.evaluate(element => { const css=getComputedStyle(element); const rect=element.getBoundingClientRect(); const sidebar=element.closest(".pmp-sidebar").getBoundingClientRect(); return { background:css.backgroundColor,image:css.backgroundImage,color:css.color,start:css.getPropertyValue("border-start-start-radius"),end:css.getPropertyValue("border-start-end-radius"),edge:document.documentElement.dir === "rtl" ? Math.abs(rect.left-sidebar.left) : Math.abs(rect.right-sidebar.right) }; });
        assert.equal(style.background,"rgb(255, 255, 255)"); assert.equal(style.image,"none"); assert.equal(style.color,"rgb(4, 120, 87)");
        assert.equal(style.start,"999px"); assert.equal(style.end,"0px"); assert.ok(style.edge <= 2, `Tab must join sidebar edge: ${style.edge}`);
        const rect=await tab.boundingBox(); const sidebar=await page.locator(".pmp-sidebar").boundingBox();
        await page.screenshot({path:`/artifacts/evergreen-tab-${locale}-${theme}.png`,animations:"disabled",clip:{x:locale === "fa" ? sidebar.x-24 : sidebar.x,y:Math.max(0,rect.y-35),width:sidebar.width+24,height:Math.min(140,1000-Math.max(0,rect.y-35))}});
        console.log(`Verified Evergreen ${locale}/${theme}: white tab, green text, rounded leading edge and flush content edge`);
      }
    }
  } finally {
    await patch("/users/me/settings",restore);
    await patch("/users/me/profile",{locale:session.user.locale ?? null});
    if (browser) await browser.close();
  }
})().catch(error => { console.error(error.message); process.exitCode=1; });
