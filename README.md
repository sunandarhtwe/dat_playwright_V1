# Playwright Excel Evidence Framework v14 Editable Rows

## Main Features
- Excel Template Run
- Folder Run
- Template event driven execution
- Screenshot saved by TemplateName / TestCaseID
- Screenshot auto insert into Excel result
- Test duration and case duration
- HTML Dashboard Progress
- Chrome channel execution for THiNC environment
- Video disabled, so FFmpeg download is not required

## Install
```bash
npm install
```

## Run one template
```bash
npm run test:template -- data/templates/SONAR_Login/SONAR_Login_Template.xlsx
```

## Run folder
```bash
npm run test:folder -- data/templates
```

## Output
```text
results/screenshots/<TemplateName>/<TestCaseID>.png
results/reports/<TemplateName>/TestResult_<TemplateName>.xlsx
results/html-report/index.html
```

## Template Columns
| Column | Description |
|---|---|
| No | Display order number |
| TestCaseID | Case ID and screenshot file name |
| TestName | Test case name |
| Event | goto, fill, type, click, selectFrame, waitForLoad, waitForSelector, waitForText, expectText, screenshot, wait, keyboardText, check |
| Selector | CSS selector, XPath (raw `//...` is auto-detected, or `xpath=...`), `id=value`, `name=value`, or `link=LinkText` |
| Value | URL / input value / wait text |
| ExpectedText | Expected text |
| WaitMs | Wait timeout |
| Screenshot | Y/N |
| Enabled | Y/N |
| StopOnFail | Y/N |


## v5 Dashboard Updates
- Top KPI includes total template count.
- FAIL count is clickable. Clicking it shows/hides failed template name, folder path, test case ID, error, and screenshot link.
- Each template is displayed as a separate progress section.
- Each template's test case list is collapsed by default and can be opened only when needed.


## v6 Updates
- HTML dashboard now displays screenshot thumbnails directly instead of only screenshot links.
- Clicking a screenshot thumbnail opens the full image.
- After each run, `results/html-report/index.html` opens automatically in the browser.


## v7 Updates
- When a test case fails with `StopOnFail=Y`, remaining test cases are still listed in HTML and Excel as `SKIPPED`.
- SKIPPED rows show: `Skipped: cannot continue because <Failed TestCaseID> failed.`
- New optional template column: `Highlight`.
- Set `Highlight=Y` only for the test cases where you want a red border around the target element in screenshots.
- Highlight works with CSS selectors and `xpath=...` selectors.
- Example: Login ID textbox row can use `Highlight=Y` with selector `#cntrId`.


## v8 UI Runner Updates
- Run_Test_Tool.bat added.
- Running the .bat file starts a local web page.
- Choose template file(s) or a template folder from the page.
- Browser combo box: Chrome, Microsoft Edge, Edge Mode IE.
- Test Execute runs selected templates.
- After execution, results/html-report/index.html is shown in the page iframe.
- Browser security does not expose the real full local path from file chooser; selected names are displayed and copied into data/ui-selected-templates before execution.


## v9 Updates
- Fixed iframe report loading issue caused by query string in `/results/html-report/index.html?t=...`.
- UI is more compact: smaller header, compact toolbar, shorter execution log, wider report area.
- Added Reload Report button.


## v10 Updates
- Added `テスト結果をダウンロードする` button near HTML Report.
- Clicking it creates a ZIP of the `results` folder and downloads it.
- ZIP includes screenshots, Excel result files, and HTML report.


## v11 Updates
- Templates are selected from `data/templates` folder list on the index page.
- Template uses new optional column: `InputKey`.
  - `URL` updates the Value column with URL input.
  - `USER_ID` updates the Value column with User ID input.
  - `PASSWORD` updates the Value column with Password input.
- `Generate Test Case` creates updated templates under `data/generated-templates/<date_time>/...`.
- Updated templates are previewed on the index page before execution.
- Updated templates can be downloaded as a ZIP.
- Execute runs the generated templates with selected browser.
- Results are saved by date/time under `results/YYYYMMDD_HHMMSS`.
- `.bat` starts the UI and closes/minimizes the command window.


## v11.1 Full Updates
- Fixed inputs are replaced by one user-friendly Variables Text Area.
- Supported format:
  ```text
  # Login Information
  url=https://google.com
  UserID=test12345
  Password=12345678

  # Customer Data
  BranchCode=0001
  CustomerName=Yamada
  ```
- `#` comment lines are ignored.
- Blank lines are ignored.
- Curly quotes and normal quotes around values are trimmed.
- Key matching is dynamic:
  - Template `InputKey=url` matches `url=...`
  - Template `InputKey=UserID` matches `UserID=...`
  - Template `InputKey=BranchCode` matches `BranchCode=...`
- Spaces, hyphens and underscores in keys are normalized for easier matching.
- Any new key can be added without code changes.


## v12 One Flow Updates
- New flow: Generate Test Case → Updated Template Preview/Edit → Execute → HTML Report.
- Updated Template Preview is displayed directly under Generate Test Case.
- Preview is separated by template tabs/tags.
- The `Value` column is editable directly in the preview grid.
- `Save Preview Changes` writes edited preview values back to generated Excel templates.
- `Download Updated Templates` is optional.
- `Execute` runs the edited generated templates directly without requiring download.
- Results are stored by date/time folder:
  `results/YYYYMMDD/HHMMSS/`


## v13 Editable Rows Updates
- Preview grid now allows editing all columns except `No` and `TestCaseID`.
- Users can add a new row after any selected row using `＋`.
- Users can remove any row using `－`.
- After add/remove, `No` and `TestCaseID` are automatically reordered.
- Edited rows are written back to generated Excel templates before Execute or Download.
- New rows and removed rows are reflected in downloaded templates and execution.


## v14 Compact Flow Updates
- UI layout changed to compact flow:
  Template / Browser / Variables / Generate on the first row.
  Updated Template Preview below.
  Log below Preview.
  Report below Log.
- Execute no longer shows confirmation alert; it runs directly.
- HTML report screenshot thumbnails now use `/result-file` route, so dated result folders show images correctly inside iframe.
- Closing the index page sends `/shutdown` to stop the local Node server.
- On shutdown, `data/generated-templates` subfolders are deleted.
- On shutdown, top-level `results` folder is cleaned except `html-report`, `reports`, and `screenshots`.


## v14.1 Updates
- Execute can run immediately after Generate Test Case; Download Templates is no longer required.
- If the preview was not edited, Execute runs directly.
- If the preview was edited, rows were added, or rows were removed, the tool automatically saves preview changes before Execute.
- If save fails, execution is stopped to prevent running incorrect templates.


## v14.2 Updates
- Fixed: Execute failing when the preview was not edited. Execute now only rewrites the generated Excel files when there are actual unsaved edits; an untouched preview runs directly against the files `/generate` already wrote.
- `Selector` accepts XPath directly. A value starting with `/`, `//`, `.//`, or `(` is auto-detected as XPath; an explicit `xpath=` (or `css=`) prefix is still supported and left as-is.
- `Event` is now a dropdown (combobox) in the preview grid, restricted to: `goto, fill, type, click, waitForLoad, waitForSelector, waitForText, expectText, screenshot, wait, keyboardText, check`. An existing value outside this list (e.g. from a hand-edited template) is still shown and preserved as an extra option instead of being overwritten.
- Each preview row can now be moved up/down with new ▲/▼ buttons, next to ＋/－. Moving a row re-runs the automatic No/TestCaseID renumbering.


## v14.3 Updates
- Fixed the real cause of "Execute fails / browser never opens unless Download Templates was clicked first": source templates (e.g. `SONAR_Login_Template1.xlsx`, `Template2.xlsx`) define a native Excel structured Table (`TestCaseTable`) over the data range. Reading that workbook with ExcelJS and writing it back out (which `/generate` always does) could produce a Table definition ExcelJS itself then failed to re-parse on the next read — crashing the runner before Playwright even launched. Clicking Save/Download happened to mask this because that code path rebuilt the rows in a way that dropped the broken Table.
- The Table wrapper is now stripped (data/cells untouched) on every generated-file write, so this no longer depends on whether Save/Download was clicked.


## v14.4 Updates
- Fixed a separate Execute crash seen as `Assertion failed: process_title, file ...\deps\uv\src\win\util.c, line 412` with the browser never opening. This is a known Node.js/libuv bug on Windows: a race condition in console-title handling that can trigger when one Node process spawns another (the server spawning `runner/run.js`), and is more likely on locked-down VDI/RDP sessions. The runner is now spawned with `windowsHide: true` so it never creates its own console window, avoiding the console-title code path that hits the bug.
- If this exact assertion still appears, it is an upstream Node.js issue rather than something in this tool's logic — check `node -v` on the machine and update to the latest Node.js LTS, since this libuv race condition was fixed upstream in later Node releases.
- Spawn failures (e.g. `node` not found on PATH) are now also captured and shown in the Log instead of hanging silently.


## v14.5 Updates
- `Selector` now also accepts a few common Selenium-style locator prefixes, in addition to CSS and XPath:
  - `id=value` — matches Playwright's built-in `id=` engine, used as-is.
  - `name=value` — translated to `css=[name="value"]`.
  - `link=value` — exact link-text lookup, translated to `a >> text="value"`.
- New `Event`: `selectFrame`. `Selector` identifies the `<iframe>` element (CSS, XPath, `name=`, or `id=`); every action after it (fill/click/etc.) runs inside that iframe. Set `Selector` (or `Value`) to `top` / `default` / `main` / `parent` to switch back to the main page. The selected frame automatically resets on the next `goto`.
  - Known limitation: `Highlight=Y` screenshots are drawn against the top page and won't currently box an element that's inside a selected iframe.
