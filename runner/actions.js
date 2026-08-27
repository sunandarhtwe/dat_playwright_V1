const fs = require('fs');
const path = require('path');

function normalize(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

// Accepts plain CSS selectors as well as XPath. If the user already wrote an
// engine prefix (xpath=, css=, text=, etc.) it is left untouched. If the value
// looks like a raw XPath expression (starts with "/", "//" or "(") the
// "xpath=" prefix is added automatically so Playwright's locator() resolves it.
function resolveSelector(value) {
  const s = normalize(value);
  if (!s) return s;
  if (/^[a-z]+=/i.test(s)) return s;
  if (s.startsWith('/') || s.startsWith('(') || s.startsWith('.//')) return 'xpath=' + s;
  return s;
}

async function runAction(page, tc, context) {
  const event = normalize(tc.Event).toLowerCase();
  const selector = resolveSelector(tc.Selector);
  const value = tc.Value === undefined || tc.Value === null ? '' : String(tc.Value);
  const expectedText = normalize(tc.ExpectedText);
  const waitMs = Number(tc.WaitMs || 0);

  switch (event) {
    case 'goto':
      await page.goto(value || selector, { waitUntil: 'domcontentloaded', timeout: 120000 });
      break;

    case 'fill':
      await page.locator(selector).fill(value);
      break;

    case 'type':
      await page.locator(selector).type(value, { delay: Number(tc.DelayMs || 50) });
      break;

    case 'click':
      await page.locator(selector).click();
      break;

    case 'check':
      await page.locator(selector).check();
      break;

    case 'uncheck':
      await page.locator(selector).uncheck();
      break;

    case 'select':
    case 'selectoption':
      await page.locator(selector).selectOption(value);
      break;

    case 'press':
      await page.locator(selector).press(value);
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
      await page.locator(selector).waitFor({ timeout: waitMs || 60000 });
      break;

    case 'waitfortext':
      await page.getByText(value || expectedText, { exact: false }).waitFor({ timeout: waitMs || 60000 });
      break;

    case 'expecttext':
      await page.getByText(expectedText || value, { exact: false }).waitFor({ timeout: waitMs || 60000 });
      break;

    case 'expectvisible':
      await page.locator(selector).waitFor({ state: 'visible', timeout: waitMs || 60000 });
      break;

    case 'screenshot':
      // Explicit screenshot action. File name is handled by runner.
      break;

    case 'keyboardtext':
      // Click on visible software-keyboard buttons by their text.
      // Example Value: 111111 or test067040
      for (const ch of value.split('')) {
        await page.getByText(ch, { exact: true }).click({ timeout: waitMs || 10000 });
      }
      break;

    case 'eval':
      // For special cases only. Example:
      // Selector: #cntrId
      // Value: test067040
      await page.locator(selector).evaluate((el, v) => {
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
