const fs = require('fs');
const path = require('path');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function makeRelLink(outDir, targetPath) {
  if (!targetPath) return '';
  const resultRoot = path.resolve(outDir, '..');
  const relRoot = path.relative(process.cwd(), resultRoot).replace(/\\/g, '/');
  const relFile = path.relative(resultRoot, targetPath).replace(/\\/g, '/');
  return `/result-file?root=${encodeURIComponent(relRoot)}&file=${encodeURIComponent(relFile)}`;
}

function writeHtmlReport(allTemplateResults, outDir) {
  fs.mkdirSync(outDir, { recursive: true });

  const allCases = allTemplateResults.flatMap(t => t.results.map(r => ({
    ...r,
    TemplateName: t.templateName,
    TemplatePath: t.templatePath,
    ResultExcelPath: t.resultExcelPath
  })));

  const totalTemplates = allTemplateResults.length;
  const total = allCases.length;
  const pass = allCases.filter(x => x.Status === 'PASS').length;
  const fail = allCases.filter(x => x.Status === 'FAIL').length;
  const progress = total ? Math.round((pass / total) * 100) : 0;
  const failedCases = allCases.filter(x => x.Status === 'FAIL');

  const failRows = failedCases.map(r => `
    <tr>
      <td>${esc(r.TemplateName)}</td>
      <td>${esc(r.TemplatePath)}</td>
      <td>${esc(r.TestCaseID || r.No)}</td>
      <td>${esc(r.TestName)}</td>
      <td>${esc(r.Error)}</td>
      <td>${r.ScreenshotPath ? `<a href="${esc(makeRelLink(outDir, r.ScreenshotPath))}" target="_blank"><img class="thumb" src="${esc(makeRelLink(outDir, r.ScreenshotPath))}" alt="screenshot"></a>` : ''}</td>
    </tr>
  `).join('\n') || `<tr><td colspan="6" class="muted">No failed test cases.</td></tr>`;

  const templateSections = allTemplateResults.map((t, index) => {
    const count = t.results.length;
    const p = t.results.filter(x => x.Status === 'PASS').length;
    const f = t.results.filter(x => x.Status === 'FAIL').length;
    const pct = count ? Math.round(p / count * 100) : 0;
    const sectionId = `template_${index + 1}`;

    const rows = t.results.map(r => `
      <tr class="${r.Status === 'PASS' ? 'pass' : (r.Status === 'SKIPPED' ? 'skip' : 'fail')}">
        <td>${esc(r.No)}</td>
        <td>${esc(r.TestCaseID)}</td>
        <td>${esc(r.TestName)}</td>
        <td>${esc(r.Event)}</td>
        <td>${esc(r.Status)}</td>
        <td class="num">${esc(r.DurationSec)}</td>
        <td>${r.ScreenshotPath ? `<a href="${esc(makeRelLink(outDir, r.ScreenshotPath))}" target="_blank"><img class="thumb" src="${esc(makeRelLink(outDir, r.ScreenshotPath))}" alt="screenshot"></a>` : ''}</td>
        <td>${esc(r.Error)}</td>
      </tr>
    `).join('\n');

    return `
      <section class="template-section">
        <div class="template-header">
          <div>
            <h2>${esc(t.templateName)}</h2>
            <p class="path">${esc(t.templatePath)}</p>
          </div>
          <div class="template-summary">
            <span>Total ${count}</span>
            <span class="ok">PASS ${p}</span>
            <span class="${f ? 'ng' : 'ok'}">FAIL ${f}</span>
            <span>Duration ${esc(t.totalDurationSec)} sec</span>
          </div>
        </div>

        <div class="progress-line">
          <div class="bar"><span style="width:${pct}%"></span></div>
          <strong>${pct}%</strong>
          <a class="excel-link" href="${esc(makeRelLink(outDir, t.resultExcelPath))}" target="_blank">Excel Result</a>
        </div>

        <button class="toggle-btn" onclick="toggleSection('${sectionId}', this)">▶ Show Test Case List</button>

        <div id="${sectionId}" class="case-list collapsed">
          <table>
            <thead>
              <tr>
                <th>No</th>
                <th>TestCaseID</th>
                <th>TestName</th>
                <th>Event</th>
                <th>Status</th>
                <th>DurationSec</th>
                <th>Screenshot</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </section>
    `;
  }).join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Playwright Excel Evidence Dashboard</title>
<style>
body{font-family:Arial, sans-serif; margin:24px; background:#f6f8fb; color:#1f2937;}
h1{margin-bottom:6px;}
h2{margin:0 0 4px 0; font-size:20px;}
a{color:#2563eb;}
.summary{display:flex; flex-wrap:wrap; gap:16px; margin:18px 0;}
.kpi{background:white; padding:14px 18px; border-radius:10px; box-shadow:0 1px 4px #d0d7de; min-width:130px;}
.kpi strong{display:block; font-size:26px;}
.kpi.clickable{cursor:pointer; user-select:none;}
.kpi.clickable:hover{outline:2px solid #93c5fd;}
.fail-panel{display:none; background:white; padding:16px; border-radius:10px; box-shadow:0 1px 4px #d0d7de; margin:12px 0 22px;}
.fail-panel.show{display:block;}
.template-section{background:white; border-radius:12px; box-shadow:0 1px 4px #d0d7de; margin:18px 0; padding:16px;}
.template-header{display:flex; justify-content:space-between; gap:16px; align-items:flex-start;}
.path{font-size:12px; color:#64748b; margin:0;}
.template-summary{display:flex; flex-wrap:wrap; gap:8px; justify-content:flex-end;}
.template-summary span{background:#eef2ff; padding:6px 10px; border-radius:999px; font-size:13px;}
.template-summary .ok{background:#dcfce7;}
.template-summary .ng{background:#fee2e2;}
.progress-line{display:flex; gap:12px; align-items:center; margin:14px 0;}
.bar{background:#e5e7eb; height:12px; border-radius:8px; overflow:hidden; flex:1;}
.bar span{display:block; height:100%; background:#22c55e;}
.excel-link{white-space:nowrap;}
.toggle-btn{border:0; background:#1f4e78; color:white; padding:8px 12px; border-radius:6px; cursor:pointer; margin-bottom:10px;}
.toggle-btn:hover{background:#173b5a;}
.case-list.collapsed{display:none;}
table{border-collapse:collapse; width:100%; background:white;}
th,td{border:1px solid #e5e7eb; padding:8px; font-size:13px; vertical-align:top;}
th{background:#1f4e78; color:white;}
.pass td:nth-child(5){background:#dcfce7; font-weight:bold;}
.fail td:nth-child(5){background:#fee2e2; font-weight:bold;}
.skip td:nth-child(5){background:#fef3c7; font-weight:bold;}
.num{text-align:right;}
.thumb{width:180px; max-height:120px; object-fit:contain; border:1px solid #d0d7de; border-radius:6px; background:#fff;}
.muted{color:#64748b; text-align:center;}
</style>
</head>
<body>
<h1>Playwright Excel Evidence Dashboard</h1>
<p>Generated: ${new Date().toLocaleString()}</p>

<div class="summary">
  <div class="kpi"><span>Templates</span><strong>${totalTemplates}</strong></div>
  <div class="kpi"><span>Total Cases</span><strong>${total}</strong></div>
  <div class="kpi"><span>PASS</span><strong>${pass}</strong></div>
  <div class="kpi clickable" onclick="toggleFailPanel()"><span>FAIL</span><strong>${fail}</strong></div>
  <div class="kpi"><span>Progress</span><strong>${progress}%</strong></div>
</div>

<div id="failPanel" class="fail-panel">
  <h2>Failed Test Case List</h2>
  <table>
    <thead>
      <tr>
        <th>Template Name</th>
        <th>Location Folder Path</th>
        <th>Test Case ID</th>
        <th>Test Name</th>
        <th>Error</th>
        <th>Screenshot</th>
      </tr>
    </thead>
    <tbody>${failRows}</tbody>
  </table>
</div>

${templateSections}

<script>
function toggleSection(id, btn) {
  const el = document.getElementById(id);
  el.classList.toggle('collapsed');
  btn.textContent = el.classList.contains('collapsed') ? '▶ Show Test Case List' : '▼ Hide Test Case List';
}
function toggleFailPanel() {
  document.getElementById('failPanel').classList.toggle('show');
}
</script>
</body>
</html>`;

  fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf-8');
}

module.exports = { writeHtmlReport };
