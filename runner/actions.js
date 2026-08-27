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
//   link=value  -> translated to an exact-text anchor lookup: a >> text="value"
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
    if (engine === 'link') return `a >> text="${escAttr(rest)}"`;
    return s; // id=, xpath=, css=, text=, data-testid=... already valid, pass through
  }
  if (s.startsWith('/') || s.startsWith('(') || s.startsWith('.//')) return 'xpath=' + s;
  return s;
}

async function runAction(page, tc, context) {
  const event = normalize(tc.Event).toLowerCase();
  const selector = resolveSelector(tc.Selector);
  const value = tc.Value === undefined || tc.Value === null ? '' : String(tc.Value);
  const expectedText = normalize(tc.ExpectedText);
  const waitMs = Number(tc.WaitMs || 0);
  // Once a selectFrame action has run, subsequent element-based actions in this
  // template (fill/click/etc.) operate inside that iframe instead of the top
  // page, until selectFrame switches back to "top"/"default" or a new goto runs.
  const target = (context && context.frameLocator) ? context.frameLocator : page;

  switch (event) {
    case 'goto':
      if (context) context.frameLocator = null; // top-level navigation invalidates any selected frame
      await page.goto(value || selector, { waitUntil: 'domcontentloaded', timeout: 120000 });
      break;

    case 'selectframe':
      // Selector identifies the <iframe> element (css/xpath/name=/id=). Value or
      // Selector of "top" / "default" / "main" / "parent" switches back to the
      // main page for all following actions.
      if (context) {
        const target_ = (value || selector || '').toLowerCase();
        if (!selector || ['top', 'default', 'main', 'parent'].includes(target_)) {
          context.frameLocator = null;
        } else {
          context.frameLocator = page.frameLocator(selector);
        }
      }
      break;

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
