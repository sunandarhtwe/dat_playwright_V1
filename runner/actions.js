const fs = require('fs');
const path = require('path');

function normalize(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function escAttr(v) {
  return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// Accepts plain CSS, XPath, and a few common Selenium-style locator prefixes:
//   id=value    -> Playwright already has a built-in "id=" engine, left as-is
//   name=value  -> translated to css=[name="value"]
//   link=value  -> translated to an exact-text anchor lookup: a:text-is("value")
//                  (":text-is" matches the element's own text, unlike "a >> text=..."
//                  which only searches inside descendants of <a> and misses a plain
//                  text node directly inside the link -- the normal case)
// Any other existing engine prefix Playwright already understands (css=, xpath=,
// text=, data-testid=, data-test-id=, data-test=) is left untouched. If the value
// looks like a raw XPath expression (starts with "/", "//", ".//" or "(") the
// "xpath=" prefix is added automatically.
function resolveSelector(value) {
  const s = normalize(value);
  if (!s) return s;
  const m = s.match(/^([A-Za-z][A-Za-z-]*)=([\s\S]*)$/);
  if (m) {
    const engine = m[1].toLowerCase();
    const rest = m[2];
    if (engine === 'name') return `css=[name="${escAttr(rest)}"]`;
    if (engine === 'link') return `a:text-is("${escAttr(rest)}")`;
    return s; // id=, xpath=, css=, text=, data-testid=... already valid, pass through
  }
  if (s.startsWith('/') || s.startsWith('(') || s.startsWith('.//')) return 'xpath=' + s;
  return s;
}

const RESET_FRAME_KEYWORDS = ['top', 'default', 'main', 'parent', 'relative=top', 'relative=parent'];

// Polls page.frame({name}) for a short window instead of checking once, since a
// frame can attach to the page tree a moment after navigation/load -- a single
// synchronous check right after goto/waitForLoad can miss it.
async function waitForFrameByName(page, name, timeoutMs) {
  const start = Date.now();
  let fr = page.frame({ name });
  while (!fr && Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 200));
    fr = page.frame({ name });
  }
  return fr;
}

async function runAction(page, tc, context) {
  const event = normalize(tc.Event).toLowerCase();
  const selector = resolveSelector(tc.Selector);
  const value = tc.Value === undefined || tc.Value === null ? '' : String(tc.Value);
  const expectedText = normalize(tc.ExpectedText);
  const waitMs = Number(tc.WaitMs || 0);
  // Once a selectFrame action has run, subsequent element-based actions in this
  // template (fill/click/etc.) operate inside that frame instead of the top
  // page, until selectFrame switches back to "top"/"relative=top"/etc, or a new
  // goto runs. context.frame (a real Playwright Frame, resolved by name) is
  // preferred over context.frameLocator (a selector-based fallback) when both
  // are available.
  const target = (context && context.frame) ? context.frame
    : (context && context.frameLocator) ? context.frameLocator
    : page;

  switch (event) {
    case 'goto':
      if (context) { context.frame = null; context.frameLocator = null; } // top-level navigation invalidates any selected frame
      await page.goto(value || selector, { waitUntil: 'domcontentloaded', timeout: 120000 });
      break;

    case 'selectframe': {
      // Selector identifies the <frame>/<iframe> element. "relative=top" /
      // "relative=parent" (classic Selenium IDE selectFrame syntax) or the bare
      // words top/default/main/parent, in either Selector or Value, switch back
      // to the main page for all following actions.
      if (context) {
        const rawSel = normalize(tc.Selector);
        const check = [value, rawSel].map(s => s.toLowerCase());
        if (!rawSel || check.some(s => RESET_FRAME_KEYWORDS.includes(s))) {
          context.frame = null;
          context.frameLocator = null;
        } else {
          // Prefer resolving by the frame's "name" attribute via Playwright's
          // real Frame API (page.frame({name})) -- this is the reliable way to
          // target a classic <frame> in an old frameset layout, which a plain
          // selector-based FrameLocator isn't guaranteed to handle the same way
          // as a modern <iframe>. Recognizes both the "name=value" shorthand and
          // a raw [name="value"] / frame[name="value"] CSS attribute selector.
          const nameEq = rawSel.match(/^name=(.+)$/i);
          const attrName = rawSel.match(/\[\s*name\s*=\s*["']?([^"'\]]+)["']?\s*\]/i);
          const name = nameEq ? nameEq[1].trim() : (attrName ? attrName[1].trim() : null);

          if (name) {
            const byName = await waitForFrameByName(page, name, waitMs || 10000);
            if (byName) {
              context.frame = byName;
              context.frameLocator = null;
            } else {
              // Fail here, immediately and specifically, instead of silently
              // falling through -- a later click/fill timing out with a generic
              // "not visible" error gives no clue that the frame itself was
              // never found. List actual frame names to catch typos/timing at a
              // glance.
              const available = page.frames().map(f => f.name() || '(unnamed)').join(', ');
              throw new Error(`selectFrame: no frame with name="${name}" found within ${waitMs || 10000}ms. Frames currently on the page: ${available || '(none)'}`);
            }
          } else {
            context.frame = null;
            context.frameLocator = page.frameLocator(selector);
            // FrameLocator itself is lazy and never errors on creation, so
            // explicitly confirm the underlying <frame>/<iframe> element exists
            // before moving on -- same reasoning as above.
            await context.frameLocator.owner().waitFor({ timeout: waitMs || 10000 }).catch(() => {
              throw new Error(`selectFrame: no frame/iframe element matched selector "${selector}".`);
            });
          }
        }
      }
      break;
    }

    case 'fill':
      await target.locator(selector).fill(value);
      break;

    case 'type':
      await target.locator(selector).type(value, { delay: Number(tc.DelayMs || 50) });
      break;

    case 'click':
      await target.locator(selector).click();
      break;

    case 'check':
      await target.locator(selector).check();
      break;

    case 'uncheck':
      await target.locator(selector).uncheck();
      break;

    case 'select':
    case 'selectoption':
      await target.locator(selector).selectOption(value);
      break;

    case 'press':
      await target.locator(selector).press(value);
      break;

    case 'wait':
    case 'waitms':
      await page.waitForTimeout(waitMs || Number(value) || 1000);
      break;

    case 'waitforload':
      await page.waitForLoadState(value || 'networkidle', { timeout: 120000 }).catch(async () => {
        await page.waitForLoadState('domcontentloaded', { timeout: 120000 });
      });
      break;

    case 'waitforselector':
      await target.locator(selector).waitFor({ timeout: waitMs || 60000 });
      break;

    case 'waitfortext':
      await target.getByText(value || expectedText, { exact: false }).waitFor({ timeout: waitMs || 60000 });
      break;

    case 'expecttext':
      await target.getByText(expectedText || value, { exact: false }).waitFor({ timeout: waitMs || 60000 });
      break;

    case 'expectvisible':
      await target.locator(selector).waitFor({ state: 'visible', timeout: waitMs || 60000 });
      break;

    case 'screenshot':
      // Explicit screenshot action. File name is handled by runner.
      break;

    case 'keyboardtext':
      // Click on visible software-keyboard buttons by their text.
      // Example Value: 111111 or test067040
      for (const ch of value.split('')) {
        await target.getByText(ch, { exact: true }).click({ timeout: waitMs || 10000 });
      }
      break;

    case 'eval':
      // For special cases only. Example:
      // Selector: #cntrId
      // Value: test067040
      await target.locator(selector).evaluate((el, v) => {
        el.value = v;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, value);
      break;

    case '':
    case 'comment':
    case 'manual':
      break;

    default:
      throw new Error(`Unsupported Event: ${tc.Event}`);
  }
}

module.exports = { runAction, normalize, resolveSelector };
