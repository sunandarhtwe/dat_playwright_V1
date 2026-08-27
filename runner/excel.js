const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const REQUIRED_HEADERS = [
  'No', 'TestCaseID', 'TestName', 'Event', 'Selector', 'Value',
  'ExpectedText', 'WaitMs', 'Screenshot', 'Enabled'
];

function getCellString(row, idx) {
  const v = row.getCell(idx).value;
  if (v === undefined || v === null) return '';
  if (typeof v === 'object' && v.text) return String(v.text);
  if (typeof v === 'object' && v.richText) return v.richText.map(x => x.text).join('');
  return String(v);
}

async function readTemplate(templatePath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(templatePath);

  const sheet = wb.getWorksheet('TestCases') || wb.worksheets[0];
  const headerRow = sheet.getRow(1);
  const headers = {};
  headerRow.eachCell((cell, col) => {
    headers[String(cell.value).trim()] = col;
  });

  for (const h of REQUIRED_HEADERS) {
    if (!headers[h]) throw new Error(`Missing required column "${h}" in ${templatePath}`);
  }

  const cases = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const enabled = getCellString(row, headers.Enabled).toUpperCase();
    if (enabled === 'N' || enabled === 'NO' || enabled === 'FALSE') return;

    const no = getCellString(row, headers.No);
    const event = getCellString(row, headers.Event);
    if (!no && !event) return;

    const item = {};
    Object.entries(headers).forEach(([h, col]) => item[h] = getCellString(row, col));
    item.__rowNumber = rowNumber;
    cases.push(item);
  });

  return { workbook: wb, sheet, headers, cases };
}

async function writeResultExcel(templatePath, templateName, results, outputPath, totalDurationSec) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Result');

  ws.columns = [
    { header: 'No', key: 'No', width: 8 },
    { header: 'TestCaseID', key: 'TestCaseID', width: 18 },
    { header: 'TestName', key: 'TestName', width: 28 },
    { header: 'Event', key: 'Event', width: 16 },
    { header: 'Status', key: 'Status', width: 12 },
    { header: 'DurationSec', key: 'DurationSec', width: 14 },
    { header: 'ExpectedText', key: 'ExpectedText', width: 28 },
    { header: 'Error', key: 'Error', width: 45 },
    { header: 'ScreenshotPath', key: 'ScreenshotPath', width: 55 },
    { header: 'Evidence', key: 'Evidence', width: 30 }
  ];

  ws.insertRow(1, [`Template: ${templateName}`, `Total Duration: ${totalDurationSec}s`, `Source: ${templatePath}`]);
  ws.mergeCells('A1:J1');
  ws.getRow(1).font = { bold: true, size: 14 };
  ws.getRow(2).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };

  let rowIdx = 3;
  for (const r of results) {
    ws.addRow({
      No: r.No,
      TestCaseID: r.TestCaseID,
      TestName: r.TestName,
      Event: r.Event,
      Status: r.Status,
      DurationSec: r.DurationSec,
      ExpectedText: r.ExpectedText,
      Error: r.Error,
      ScreenshotPath: r.ScreenshotPath,
      Evidence: r.ScreenshotPath ? 'Inserted below' : ''
    });

    const row = ws.getRow(rowIdx);
    row.alignment = { vertical: 'top', wrapText: true };
    if (r.Status === 'PASS') row.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
    if (r.Status === 'FAIL') row.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
    if (r.Status === 'SKIPPED') row.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } };

    if (r.ScreenshotPath && fs.existsSync(r.ScreenshotPath)) {
      try {
        const ext = path.extname(r.ScreenshotPath).toLowerCase().replace('.', '') || 'png';
        const imgId = wb.addImage({ filename: r.ScreenshotPath, extension: ext === 'jpg' ? 'jpeg' : ext });
        ws.addImage(imgId, {
          tl: { col: 9, row: rowIdx - 1 },
          ext: { width: 360, height: 220 }
        });
        ws.getRow(rowIdx).height = 170;
      } catch (e) {
        row.getCell(10).value = `Image insert failed: ${e.message}`;
      }
    }
    rowIdx++;
  }

  ws.views = [{ state: 'frozen', ySplit: 2 }];
  ws.autoFilter = { from: 'A2', to: 'J2' };

  const summary = wb.addWorksheet('Summary');
  const total = results.length;
  const pass = results.filter(x => x.Status === 'PASS').length;
  const fail = results.filter(x => x.Status === 'FAIL').length;
  summary.addRows([
    ['TemplateName', templateName],
    ['Total Cases', total],
    ['PASS', pass],
    ['FAIL', fail],
    ['Progress', total ? `${Math.round((pass / total) * 100)}%` : '0%'],
    ['Total DurationSec', totalDurationSec],
    ['Result File', outputPath]
  ]);
  summary.getColumn(1).width = 24;
  summary.getColumn(2).width = 60;
  summary.getRange && summary.getRange;

  await wb.xlsx.writeFile(outputPath);
}

module.exports = { readTemplate, writeResultExcel };
