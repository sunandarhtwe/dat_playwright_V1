const http=require('http'),fs=require('fs'),path=require('path');const{spawn,exec}=require('child_process');const ExcelJS=require('exceljs');

const PORT=3877,ROOT=path.resolve(__dirname,'..');

function send(res,s,c,t='text/plain'){res.writeHead(s,{'Content-Type':t});res.end(c)}
function json(res,obj,status=200){send(res,status,JSON.stringify(obj),'application/json')}
function ct(f){let e=path.extname(f).toLowerCase();return e==='.html'?'text/html; charset=utf-8':e==='.js'?'application/javascript; charset=utf-8':e==='.css'?'text/css; charset=utf-8':e==='.png'?'image/png':e==='.jpg'||e==='.jpeg'?'image/jpeg':e==='.xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':e==='.zip'?'application/zip':'application/octet-stream'}
function safe(base,target){let p=path.resolve(base,String(target||'').replace(/^\/+/,''));if(!p.startsWith(base))throw Error('Invalid path');return p}
function pad(n){return String(n).padStart(2,'0')}
function dateStamp(){const d=new Date();return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`}
function timeStamp(){const d=new Date();return `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`}
function stamp(){return `${dateStamp()}_${timeStamp()}`}
function openUi(){let u=`http://localhost:${PORT}/`;exec(process.platform==='win32'?`start "" "${u}"`:process.platform==='darwin'?`open "${u}"`:`xdg-open "${u}"`)}
function readBody(req){return new Promise(r=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>r(b))})}
function walk(dir,out=[]){if(!fs.existsSync(dir))return out;for(const it of fs.readdirSync(dir)){const p=path.join(dir,it),st=fs.statSync(p);if(st.isDirectory())walk(p,out);else if(/\.xlsx$/i.test(it)&&!it.startsWith('~$'))out.push(p)}return out}
// windowsHide avoids creating a separate console window for the spawned
// runner process. The parent server is normally started via
// `start "" /min node runner\server.js`, and on Windows (especially locked-down
// VDI/RDP sessions) a Node process spawning another Node process while console
// title handling is restricted can hit a known libuv race condition:
// "Assertion failed: process_title, file ...\deps\uv\src\win\util.c" -- this
// crashes the child before it does anything, which looks like "Execute
// fails / browser never opens" regardless of the Excel content. Not creating a
// console window for the child avoids the console-title code path that trips it.
function runCmd(args){return new Promise(r=>{let log='';const c=spawn(process.execPath,args,{cwd:ROOT,shell:false,windowsHide:true});c.stdout.on('data',d=>log+=d.toString());c.stderr.on('data',d=>log+=d.toString());c.on('close',code=>r({code,log}));c.on('error',e=>r({code:-1,log:'Spawn error: '+(e.stack||e.message)}));})}
function zipFolder(sourceDir,outPath){return new Promise((resolve,reject)=>{const c=spawn('powershell.exe',['-NoProfile','-Command',`Compress-Archive -Path "${sourceDir}\\*" -DestinationPath "${outPath}" -Force`],{shell:false});let err='';c.stderr.on('data',d=>err+=d.toString());c.on('close',code=>code===0&&fs.existsSync(outPath)?resolve(outPath):reject(new Error(err||`Compress failed ${code}`)))})}

function cleanQuote(v){return String(v??'').trim().replace(/^["“”']|["“”']$/g,'').trim()}
function normKey(v){return String(v||'').trim().toLowerCase().replace(/[\s_-]+/g,'')}
function parseVariablesText(text){
  const map={}, warnings=[];
  String(text||'').split(/\r?\n/).forEach((line,idx)=>{
    const raw=line.trim();
    if(!raw||raw.startsWith('#')) return;
    const eq=raw.indexOf('=');
    if(eq<0){warnings.push(`Line ${idx+1}: "=" not found. (${raw})`);return;}
    const key=raw.substring(0,eq).trim();
    const value=cleanQuote(raw.substring(eq+1));
    if(!key){warnings.push(`Line ${idx+1}: key is empty.`);return;}
    if(value==='') warnings.push(`Line ${idx+1}: ${key} has empty value.`);
    map[normKey(key)]={originalKey:key,value};
  });
  return {map,warnings};
}
function mapValue(key,varMap){const k=normKey(key);return k&&varMap[k]?varMap[k].value:null}

function cellText(cell){
  const v=cell.value;
  if(v===undefined||v===null) return '';
  if(typeof v==='object'&&v.text) return String(v.text);
  if(typeof v==='object'&&v.richText) return v.richText.map(x=>x.text).join('');
  return String(v);
}
function headersOf(ws){const h={};ws.getRow(1).eachCell((c,i)=>h[String(c.value||'').trim()]=i);return h}

// Source templates define a native Excel "Table" (ListObject) over the data range
// (e.g. TestCaseTable). ExcelJS has a known round-trip issue: reading a workbook
// that contains such a Table and writing it back out (as both generate and save
// do) can produce a Table definition that ExcelJS itself then fails to re-parse,
// crashing the runner before it ever reads a row -- which shows up as "Execute
// fails, browser never opens" and has nothing to do with the template content.
// This tool never reads via the Table API (readTemplate uses the header row +
// eachRow), so it's safe to drop the Table wrapper on every write and keep it
// as a plain cell range.
function stripTables(ws){
  Object.keys(ws.tables||{}).forEach(name=>{ try{ ws.removeTable(name); }catch(e){} });
}

async function updateWorkbookFromVariables(src,dest,varMap){
  const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(src);
  const ws=wb.getWorksheet('TestCases')||wb.worksheets[0];
  const header=headersOf(ws);
  if(!header.InputKey){header.InputKey=ws.getRow(1).cellCount+1;ws.getRow(1).getCell(header.InputKey).value='InputKey'}
  if(!header.Value) throw new Error('Value column not found: '+src);
  const preview=[];
  ws.eachRow((row,n)=>{
    if(n===1) return;
    const inputKey=cellText(row.getCell(header.InputKey));
    const nv=mapValue(inputKey,varMap);
    if(nv!==null) row.getCell(header.Value).value=nv;
    const tcid=cellText(row.getCell(header.TestCaseID||2));
    const event=cellText(row.getCell(header.Event||4));
    if(tcid||event){
      preview.push({
        rowNumber:n,
        No:cellText(row.getCell(header.No||1)),
        TestCaseID:tcid,
        TestName:cellText(row.getCell(header.TestName||3)),
        Event:event,
        Selector:cellText(row.getCell(header.Selector||5)),
        Value:cellText(row.getCell(header.Value)),
        ExpectedText:cellText(row.getCell(header.ExpectedText||7)),
        WaitMs:cellText(row.getCell(header.WaitMs||8)),
        Screenshot:cellText(row.getCell(header.Screenshot||9)),
        Enabled:cellText(row.getCell(header.Enabled||10)),
        StopOnFail:cellText(row.getCell(header.StopOnFail||11)),
        Memo:cellText(row.getCell(header.Memo||12)),
        Highlight:cellText(row.getCell(header.Highlight||13)),
        InputKey:inputKey
      });
    }
  });
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  stripTables(ws);
  await wb.xlsx.writeFile(dest);
  return preview;
}
async function applyPreviewEdits(generatedRoot, templates){
  if(!templates||!Array.isArray(templates)) return;
  for(const t of templates){
    const rel=String(t.relativePath||t.templateName||'').replace(/\\/g,'/');
    if(!rel.toLowerCase().endsWith('.xlsx')) continue;
    const file=safe(generatedRoot,rel);
    if(!fs.existsSync(file)) continue;

    const wb=new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws=wb.getWorksheet('TestCases')||wb.worksheets[0];
    const header=headersOf(ws);

    const existingRow2 = ws.getRow(2);
    const maxCol = ws.getRow(1).cellCount;

    // Remove all old test case rows
    if(ws.rowCount > 1) ws.spliceRows(2, ws.rowCount - 1);

    const rows = Array.isArray(t.rows) ? t.rows : [];
    rows.forEach((r, idx)=>{
      const row = ws.getRow(idx + 2);
      const set = (name, value)=>{
        if(header[name]) row.getCell(header[name]).value = value ?? '';
      };

      set('No', String(idx + 1));
      set('TestCaseID', r.TestCaseID || `TC${String(idx + 1).padStart(3,'0')}`);
      set('TestName', r.TestName);
      set('Event', r.Event);
      set('Selector', r.Selector);
      set('Value', r.Value);
      set('ExpectedText', r.ExpectedText);
      set('WaitMs', r.WaitMs);
      set('Screenshot', r.Screenshot);
      set('Enabled', r.Enabled);
      set('StopOnFail', r.StopOnFail);
      set('Memo', r.Memo);
      set('Highlight', r.Highlight);
      set('InputKey', r.InputKey);

      row.commit();
    });

    stripTables(ws);
    await wb.xlsx.writeFile(file);
  }
}


function rmChildren(dir){
  if(!fs.existsSync(dir)) return;
  for(const item of fs.readdirSync(dir)){
    fs.rmSync(path.join(dir,item),{recursive:true,force:true});
  }
}
function cleanupOnClose(){
  try{
    const gen=path.join(ROOT,'data','generated-templates');
    rmChildren(gen);
  }catch(e){}
  try{
    const results=path.join(ROOT,'results');
    if(fs.existsSync(results)){
      const keep=new Set(['html-report','reports','screenshots']);
      for(const item of fs.readdirSync(results)){
        if(!keep.has(item)) fs.rmSync(path.join(results,item),{recursive:true,force:true});
      }
    }
  }catch(e){}
}

const server=http.createServer(async(req,res)=>{
  try{
    const reqPath=(req.url||'').split('?')[0];
    const urlObj=new URL(req.url,'http://localhost');

    if(req.method==='GET'&&reqPath==='/') return send(res,200,fs.readFileSync(path.join(ROOT,'ui','index.html')),'text/html; charset=utf-8');

    if(req.method==='GET'&&reqPath==='/template-folders'){
      const base=path.join(ROOT,'data','templates');
      const folders=fs.existsSync(base)?fs.readdirSync(base).filter(x=>fs.statSync(path.join(base,x)).isDirectory()):[];
      return json(res,{folders});
    }

    if(req.method==='GET'&&reqPath==='/result-file'){
      const root=urlObj.searchParams.get('root')||'results';
      const file=urlObj.searchParams.get('file')||'html-report/index.html';
      const f=safe(path.resolve(ROOT,root),file);
      if(!fs.existsSync(f)) return send(res,404,'Not found');
      return send(res,200,fs.readFileSync(f),ct(f));
    }

    if(req.method==='GET'&&reqPath.startsWith('/results/')){
      const f=safe(ROOT,reqPath);
      if(!fs.existsSync(f)||fs.statSync(f).isDirectory()) return send(res,404,'Not found');
      return send(res,200,fs.readFileSync(f),ct(f));
    }

    if(req.method==='POST'&&reqPath==='/generate'){
      const data=JSON.parse(await readBody(req)||'{}');
      const folder=data.folder;
      const parsed=parseVariablesText(data.variablesText||'');
      const srcDir=safe(path.join(ROOT,'data','templates'),folder);
      const id=stamp();
      const outDir=path.join(ROOT,'data','generated-templates',id,folder);
      const files=walk(srcDir);
      const preview=[];
      for(const f of files){
        const rel=path.relative(srcDir,f).replace(/\\/g,'/');
        const dest=path.join(outDir,rel);
        preview.push({templateName:path.basename(f),relativePath:rel,rows:await updateWorkbookFromVariables(f,dest,parsed.map)});
      }
      const keys=Object.values(parsed.map).map(x=>x.originalKey).join(', ');
      const warn=parsed.warnings.length?'\nWarnings:\n- '+parsed.warnings.join('\n- ')+'\n':'';
      return json(res,{ok:true,generatedId:id,generatedPath:path.relative(ROOT,outDir),preview,warnings:parsed.warnings,log:`Parsed keys: ${keys || '(none)'}\nGenerated ${files.length} template(s).${warn}\n`});
    }

    if(req.method==='POST'&&reqPath==='/save-generated'){
      const data=JSON.parse(await readBody(req)||'{}');
      const id=data.generatedId, folder=data.folder||'';
      const genRoot=safe(path.join(ROOT,'data','generated-templates',id||''),folder);
      await applyPreviewEdits(genRoot,data.templates||[]);
      return json(res,{ok:true,log:'Preview changes saved to generated templates.\n'});
    }

    if(req.method==='POST'&&reqPath==='/execute-generated'){
      const data=JSON.parse(await readBody(req)||'{}');
      const id=data.generatedId,browser=data.browser||'chrome',folder=data.folder||'';
      const genRoot=safe(path.join(ROOT,'data','generated-templates',id||''),folder);
      // Only rewrite the generated Excel files when the client explicitly flags unsaved
      // preview edits. When the preview was never touched, run directly against the
      // files /generate already wrote — re-serializing untouched data through
      // applyPreviewEdits on every Execute was the cause of "no edit -> Execute fails".
      if(data.dirty && Array.isArray(data.templates) && data.templates.length){
        await applyPreviewEdits(genRoot,data.templates);
      }
      const resultRoot=path.join('results',dateStamp(),timeStamp());
      const result=await runCmd(['runner/run.js','--folder',genRoot,'--browser',browser,'--no-open','--result-root',resultRoot]);
      return json(res,{ok:result.code===0,code:result.code,log:result.log,resultRoot});
    }

    if(req.method==='GET'&&reqPath==='/download-generated.zip'){
      const id=urlObj.searchParams.get('id'), folder=urlObj.searchParams.get('folder')||'';
      const dir=safe(path.join(ROOT,'data','generated-templates',id||''),folder);
      if(!fs.existsSync(dir)) return send(res,404,'generated folder not found');
      const zp=path.join(dir,'UpdatedTemplates.zip');
      await zipFolder(dir,zp);
      res.writeHead(200,{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="UpdatedTemplates_'+id+'.zip"'});
      return fs.createReadStream(zp).pipe(res);
    }

    if(req.method==='GET'&&reqPath==='/download-results.zip'){
      const root=urlObj.searchParams.get('root')||'results';
      const dir=path.resolve(ROOT,root);
      if(!fs.existsSync(dir)) return send(res,404,'results folder not found');
      const zp=path.join(dir,'TestResults_'+stamp()+'.zip');
      await zipFolder(dir,zp);
      res.writeHead(200,{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="'+path.basename(zp)+'"'});
      return fs.createReadStream(zp).pipe(res);
    }


    if(req.method==='POST'&&reqPath==='/shutdown'){
      cleanupOnClose();
      json(res,{ok:true});
      setTimeout(()=>process.exit(0),300);
      return;
    }

    return send(res,404,'Not found');
  }catch(e){
    return json(res,{ok:false,log:e.stack||e.message},500);
  }
});

server.listen(PORT,()=>{console.log(`Playwright Excel Test Runner started: http://localhost:${PORT}/`);openUi()});