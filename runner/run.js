const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { readTemplate, writeResultExcel } = require('./excel');
const { runAction, normalize, resolveSelector } = require('./actions');
const { writeHtmlReport } = require('./htmlReport');
const { exec } = require('child_process');


function openHtmlReport() {
  const reportPath = path.resolve(getResultRoot(), 'html-report', 'index.html');
  const quoted = `\"${reportPath}\"`;
  if (process.platform === 'win32') {
    exec(`start "" ${quoted}`);
  } else if (process.platform === 'darwin') {
    exec(`open ${quoted}`);
  } else {
    exec(`xdg-open ${quoted}`);
  }
}

function arg(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : null;
}

function getResultRoot() {
  return arg('--result-root') || 'results';
}


function getBrowserOption() {
  return (arg('--browser') || 'chrome').toLowerCase();
}
function shouldOpenReport() {
  return process.argv.indexOf('--no-open') < 0;
}
async function launchSelectedBrowser() {
  const browserType = getBrowserOption();
  if (browserType === 'msedge' || browserType === 'edge' || browserType === 'microsoft edge') {
    return await chromium.launch({ channel: 'msedge', headless: false });
  }
  if (browserType === 'edge-ie' || browserType === 'ie' || browserType === 'edge mode ie') {
    return await chromium.launch({ channel: 'msedge', headless: false, args: ['--ie-mode-test'] });
  }
  return await chromium.launch({ channel: 'chrome', headless: false });
}


function sanitizeName(s) {
  return String(s || 'Template').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_');
}

function listTemplates(folder) {
  const out = [];
  function walk(dir) {
    for (const item of fs.readdirSync(dir)) {
      const p = path.join(dir, item);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (/\.(xlsx)$/i.test(item) && !item.startsWith('~$')) out.push(p);
    }
  }
  walk(folder);
  return out;
}


async function clearHighlight(page) {
  await page.evaluate(() => {
    const old = document.getElementById('__pw_red_highlight_box__');
    if (old) old.remove();
  }).catch(() => {});
}

async function addHighlight(page, selector) {
 if (!selector) return;
 await page.locator(selector).first().waitFor({ state: 'visible', timeout: 10000 });
 await page.locator(selector).first().scrollIntoViewIfNeeded();
 await page.evaluate((sel) => {
   const old = document.getElementById('__pw_red_highlight_box__');
   if (old) old.remove();
   let el = null;
   if (sel.startsWith('xpath=')) {
     el = document.evaluate(
       sel.replace(/^xpath=/, ''),
       document,
       null,
       XPathResult.FIRST_ORDERED_NODE_TYPE,
       null
     ).singleNodeValue;
   } else {
     el = document.querySelector(sel);
   }
   if (!el) return;
   const rect = el.getBoundingClientRect();
   const pad = 6;
   const box = document.createElement('div');
box.id = '__pw_red_highlight_box__';
   box.style.position = 'absolute';
   box.style.left = `${window.scrollX + rect.left - pad}px`;
   box.style.top = `${window.scrollY + rect.top - pad}px`;
   box.style.width = `${rect.width + pad * 3}px`;
   box.style.height = `${rect.height + pad * 2}px`;
   box.style.border = '4px solid red';
   box.style.borderRadius = '4px';
   box.style.boxSizing = 'border-box';
   box.style.pointerEvents = 'none';
   box.style.zIndex = '2147483647';
   box.style.background = 'transparent';
   document.body.appendChild(box);
 }, selector);
}

/*async function addHighlight(page, selector) {
  if (!selector) return;
  await page.locator(selector).first().waitFor({ state: 'visible', timeout: 10000 });
  await page.locator(selector).first().scrollIntoViewIfNeeded();
  await page.evaluate((sel) => {
    const old = document.getElementById('__pw_red_highlight_box__');
    if (old) old.remove();

    let el = null;
    if (sel.startsWith('xpath=')) {
      el = document.evaluate(sel.replace(/^xpath=/, ''), document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    } else {
      el = document.querySelector(sel);
    }
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const pad = 5;
    const box = document.createElement('div');
    box.id = '__pw_red_highlight_box__';
    box.style.position = 'fixed';
    box.style.left = `${rect.left - pad}px`;
    box.style.top = `${rect.top - pad}px`;
    box.style.width = `${rect.width + pad * 2}px`;
    box.style.height = `${rect.height + pad * 2}px`;
    box.style.border = '3px solid red';
    box.style.borderRadius = '4px';
    box.style.boxSizing = 'border-box';
    box.style.pointerEvents = 'none';
    box.style.zIndex = '2147483647';
    box.style.background = 'transparent';
    document.body.appendChild(box);
  }, selector);
} */

async function runTemplate(templatePath) {
  const templateName = sanitizeName(path.basename(templatePath, path.extname(templatePath)));
  const screenshotDir = path.join(getResultRoot(), 'screenshots', templateName);
  const reportDir = path.join(getResultRoot(), 'reports', templateName);
  fs.mkdirSync(screenshotDir, { recursive: true });
  fs.mkdirSync(reportDir, { recursive: true });

  const { cases } = await readTemplate(templatePath);
  const results = [];
  const templateStart = Date.now();

  const browser = await launchSelectedBrowser();
  const page = await browser.newPage();

  for (let i = 0; i < cases.length; i++) {
    const tc = cases[i];
    const caseStart = Date.now();
    const testCaseId = sanitizeName(tc.TestCaseID || tc.No);
    const screenshotFlag = normalize(tc.Screenshot).toUpperCase();
    const highlightFlag = normalize(tc.Highlight).toUpperCase();
    let status = 'PASS';
    let error = '';
    let screenshotPath = '';

    try {
      await clearHighlight(page);
      if (highlightFlag === 'Y' || highlightFlag === 'YES') {
        await addHighlight(page, resolveSelector(tc.Selector));
        if (screenshotFlag === 'Y' || screenshotFlag === 'YES') {
          screenshotPath = path.join(screenshotDir, `${testCaseId}.png`);
          await page.screenshot({ path: screenshotPath, fullPage: true });
        }
      }
      await runAction(page, tc, { templateName });
      if ((highlightFlag !== 'Y' && highlightFlag !== 'YES') &&
        (screenshotFlag === 'Y' || screenshotFlag === 'YES' || normalize(tc.Event).toLowerCase() === 'screenshot')) {
        screenshotPath = path.join(screenshotDir, `${testCaseId}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
      }
      /*
      await runAction(page, tc, { templateName });

      if (highlightFlag === 'Y' || highlightFlag === 'YES') {
        await addHighlight(page, resolveSelector(tc.Selector));
      }

      if (screenshotFlag === 'Y' || screenshotFlag === 'YES' || normalize(tc.Event).toLowerCase() === 'screenshot') {
        screenshotPath = path.join(screenshotDir, `${testCaseId}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
      } */

      await clearHighlight(page);
    } catch (e) {
      status = 'FAIL';
      error = e.message || String(e);

      try {
        if (highlightFlag === 'Y' || highlightFlag === 'YES') {
          await addHighlight(page, resolveSelector(tc.Selector));
        }
      } catch {}

      screenshotPath = path.join(screenshotDir, `${testCaseId}_FAIL.png`);
      try { await page.screenshot({ path: screenshotPath, fullPage: true }); } catch {}
      try { await clearHighlight(page); } catch {}
    }

    const durationSec = ((Date.now() - caseStart) / 1000).toFixed(2);
    results.push({
      No: tc.No,
      TestCaseID: tc.TestCaseID,
      TestName: tc.TestName,
      Event: tc.Event,
      Status: status,
      DurationSec: durationSec,
      ExpectedText: tc.ExpectedText,
      Error: error,
      ScreenshotPath: screenshotPath
    });

    if (status === 'FAIL' && normalize(tc.StopOnFail).toUpperCase() === 'Y') {
      const failedId = tc.TestCaseID || tc.No;
      for (let j = i + 1; j < cases.length; j++) {
        const skipped = cases[j];
        results.push({
          No: skipped.No,
          TestCaseID: skipped.TestCaseID,
          TestName: skipped.TestName,
          Event: skipped.Event,
          Status: 'SKIPPED',
          DurationSec: '0.00',
          ExpectedText: skipped.ExpectedText,
          Error: `Skipped: cannot continue because ${failedId} failed.`,
          ScreenshotPath: ''
        });
      }
      break;
    }
  }

  await browser.close();

  const totalDurationSec = ((Date.now() - templateStart) / 1000).toFixed(2);
  const resultExcelPath = path.join(reportDir, `TestResult_${templateName}.xlsx`);
  await writeResultExcel(templatePath, templateName, results, resultExcelPath, totalDurationSec);
  return { templateName, templatePath, results, totalDurationSec, resultExcelPath };
}

(async () => {
  const template = arg('--template');
  const folder = arg('--folder');
  let templates = [];

  if (template) templates = [template];
  else if (folder) templates = listTemplates(folder);
  else {
    console.log('Usage:');
    console.log('  npm run test:template -- data/templates/SONAR_Login/SONAR_Login_Template.xlsx');
    console.log('  npm run test:folder -- data/templates');
    process.exit(1);
  }

  if (!templates.length) {
    console.log('No template xlsx files found.');
    process.exit(1);
  }

  const all = [];
  for (const t of templates) {
    console.log(`\n=== Running template: ${t} ===`);
    all.push(await runTemplate(t));
  }

  writeHtmlReport(all, path.join(getResultRoot(), 'html-report'));
  console.log('\nDone.');
  console.log('HTML Dashboard: ' + path.join(getResultRoot(), 'html-report', 'index.html'));
  if (shouldOpenReport()) openHtmlReport();
})();
