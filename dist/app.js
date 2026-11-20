import {STORAGE_KEY,INTENSITIES,EVENT_TYPES,emptyState,validateState,validateContraction,validateEvent,parseBackup,mergeBackup,durationMs,formatTime,measurements,recentSummary,csvExport} from './model.js';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>new Intl.DateTimeFormat(undefined,{day:'numeric',month:'short',year:'numeric'}).format(new Date(v));
const clock=v=>new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(v));
const local=v=>{const d=new Date(v);return new Date(+d-d.getTimezoneOffset()*60000).toISOString().slice(0,19)};
let data=emptyState(),lastStored=null,raw=null,blocked=false,loadError='';
try{raw=localStorage.getItem(STORAGE_KEY);if(raw)data=parseBackup(raw);lastStored=raw;}catch(e){blocked=true;loadError='Your saved data could not be read and has been left untouched. Open Care & data to download the original file for recovery.';}
const pages=['timer','history','overview','care'];let page=pages.includes(location.hash.slice(1))?location.hash.slice(1):'timer';
let historyRange='all',overviewRange='60',query='',editing=null,editingEvent=null,intensity=null,deleteTarget=null,undo=null,toastTimer,lastTimerClick=0;
let restored=Boolean(data.contractions.find(c=>!c.endedAt));
const running=()=>data.contractions.find(c=>!c.endedAt);
const ordered=()=>[...data.contractions].sort((a,b)=>Date.parse(a.startedAt)-Date.parse(b.startedAt));
const startOfRange=value=>value==='all'?0:Date.now()-Number(value)*60000;
function save(next){
 if(blocked)throw new Error('Your saved data needs attention. Open Care & data.');
 if(localStorage.getItem(STORAGE_KEY)!==lastStored)throw new Error('Your records changed in another tab. Reload before saving.');
 const checked=validateState(next);const text=JSON.stringify(checked);localStorage.setItem(STORAGE_KEY,text);data=checked;lastStored=text;
}
function errorMessage(e){return e.name==='QuotaExceededError'?'This browser is out of storage. Download a backup in Care & data.':e.message;}
function toast(message,allowUndo=false){clearTimeout(toastTimer);$('#toast').innerHTML=`<span>${esc(message)}</span>${allowUndo?'<button id="undo-delete">Undo</button>':''}`;$('#toast').hidden=false;if(allowUndo)$('#undo-delete').onclick=()=>{try{const next={...data,[undo.collection]:[...data[undo.collection],undo.record]};save(next);undo=null;render();toast('Record restored.');}catch(e){toast(errorMessage(e));}};toastTimer=setTimeout(()=>$('#toast').hidden=true,allowUndo?15000:6500);}
function download(name,content,type){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function backup(){download('contractions-backup.json',JSON.stringify({...data,exportedAt:new Date().toISOString()},null,2),'application/json');toast('Backup downloaded. Keep it somewhere private.');}
function callLink(){const clean=data.settings.phone.replace(/[^+\d]/g,'');return clean&&/\d/.test(clean)?`tel:${clean}`:'#care';}
const labelIntensity=c=>c.intensity?INTENSITIES[c.intensity]:'Not recorded';
function stat(value,label,note){return `<article class="stat"><div class="stat-top">${label}</div><div class="stat-value">${value}</div><div class="stat-note">${note}</div></article>`;}
function contractionCard(c){const row=measurements(data.contractions).find(r=>r.contraction.id===c.id);return `<article class="episode" data-record="${esc(c.id)}" data-collection="contractions"><div class="episode-header"><div class="episode-type-icon">◷</div><div><h3 class="episode-title">${c.endedAt?'Contraction':'Timing in progress'}</h3><p class="episode-time">${date(c.startedAt)} · ${clock(c.startedAt)}${c.endedAt?' – '+clock(c.endedAt):''}</p></div><span class="badge" data-level="${c.intensity==='strong'?3:c.intensity==='moderate'?2:1}">${esc(labelIntensity(c))}</span></div><div class="record-metrics"><span><strong>${formatTime(durationMs(c))}</strong> duration${!c.endedAt?' · running':''}</span><span><strong>${formatTime(row.spacing)}</strong> start to start</span><span><strong>${formatTime(row.rest)}</strong> rest before</span></div>${c.location?`<p class="episode-note">Location: ${esc(c.location)}</p>`:''}${c.comfort.length?`<p class="episode-note">Tried: ${esc(c.comfort.join(', '))}</p>`:''}${c.notes?`<p class="episode-note">${esc(c.notes)}</p>`:''}<div class="episode-actions"><button data-action="edit">${c.endedAt?'Add / edit details':'Adjust timing / details'}</button><button data-action="delete">Delete</button></div></article>`;}
function eventCard(e){return `<article class="episode event-card" data-record="${esc(e.id)}" data-collection="events"><div class="episode-header"><span class="event-mark">◇</span><div><h3 class="episode-title">${EVENT_TYPES[e.kind]}</h3><p class="episode-time">${date(e.occurredAt)} · ${clock(e.occurredAt)}</p></div></div>${e.fluidColour||e.fluidAmount?`<p class="episode-note">Fluid: ${esc([e.fluidColour,e.fluidAmount].filter(Boolean).join(' · '))}</p>`:''}${e.notes?`<p class="episode-note">${esc(e.notes)}</p>`:''}<div class="episode-actions"><button data-action="edit">Edit event</button><button data-action="delete">Delete</button></div></article>`;}
function heading(kicker,title,subtitle,action=''){return `<div class="page-heading"><div><span class="eyebrow heading-kicker">${kicker}</span><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;}
function timerPage(){
 const active=running(),last=ordered().filter(c=>c.endedAt).at(-1),lastRow=measurements(data.contractions).filter(r=>r.contraction.endedAt).at(-1);
 const s=recentSummary(data.contractions,Date.now()-3600000);
 return `<section class="record-page" aria-labelledby="timer-title"><span class="eyebrow">ONE BREATH AT A TIME</span><h1 id="timer-title">One at a time.</h1><p class="record-intro">${active?'Breathe. Tap Stop when this contraction ends.':'Tap Start when a contraction begins.'}</p><span class="timer-caption">${active?'CURRENT CONTRACTION':'TIME SINCE LAST CONTRACTION ENDED'}</span><output id="main-timer" class="hold-timer" role="timer" aria-live="off">${active?formatTime(durationMs(active)):last?formatTime(Date.now()-Date.parse(last.endedAt)):'00:00'}</output><button id="timer-button" type="button" class="hold-record ${active?'is-recording':''}" ${blocked?'disabled':''}><span class="hold-indicator" aria-hidden="true"></span><span>${active?'Stop contraction':'Start contraction'}</span><small>${active?'Saves when you stop':'Saves as you go'}</small></button><p class="hold-status" role="status">${active?'Timing started at '+clock(active.startedAt):last?'Last contraction: '+formatTime(durationMs(last)):'Ready when you are.'}</p>${restored&&active?'<p class="restore-note">Timer restored after an interruption. Check or adjust its timing if needed.</p>':''}${active?'<button class="text-button" id="adjust-active">Adjust current timing</button>':''}<p class="hold-help">You or your support person can use the timer.</p></section><div class="summary-grid timer-stats">${stat(s.count,'Contractions · last hour','Includes a contraction being timed')}${stat(formatTime(s.averageDuration),'Average duration','Completed contractions · last hour')}${stat(formatTime(s.averageSpacing),'Average spacing','Start to start · last hour')}</div>${last?`<section class="latest-record"><div class="section-heading"><h2>Latest contraction</h2><a class="text-button" href="#history">View timeline →</a></div>${contractionCard(last)}</section>`:''}<div class="timer-secondary"><button class="button" data-manual>＋ Log contraction</button><button class="button" data-event>+ Log an event</button></div><p class="timing-note">Spacing means start to start. Rest means end to the next start. Missed recordings can make these intervals longer.</p><p class="gentle-help">Need support or unsure what you’re feeling? <a href="${esc(callLink())}">Contact your maternity team →</a></p>`;
}
function historyPage(){const since=startOfRange(historyRange);const items=[...data.contractions.map(c=>({at:c.startedAt,record:c,type:'c'})),...data.events.map(e=>({at:e.occurredAt,record:e,type:'e'}))].filter(x=>Date.parse(x.at)>=since&&JSON.stringify(x.record).toLowerCase().includes(query.toLowerCase())).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));return heading('YOUR RECORD, TOGETHER','Your timeline.','Contractions and the moments between them.','<div class="action-row timeline-actions"><button class="button primary" data-event>＋ Event</button><button class="button primary" data-manual>+ Log contraction</button></div>')+`<div class="history-filters"><input type="search" id="history-search" aria-label="Search timeline" placeholder="Search notes, events, details…" value="${esc(query)}"><select id="history-range" aria-label="Timeline period">${[['all','All records'],['60','Last hour'],['360','Last 6 hours'],['1440','Last 24 hours']].map(([v,l])=>`<option value="${v}" ${historyRange===v?'selected':''}>${l}</option>`).join('')}</select></div><div id="history-list">${items.length?items.map(x=>x.type==='c'?contractionCard(x.record):eventCard(x.record)).join(''):'<div class="empty-state"><div class="empty-icon">◷</div><h3>No records in this view yet.</h3><p>Your completed contractions and events will appear here.</p></div>'}</div>`;}
function overviewChart(rows,metric='duration'){
 const isSpacing=metric==='spacing';
 const title=isSpacing?'Recent spacing duration':'Recent contraction duration';
 // Both starts must be inside the selected range, as in the average spacing.
 const list=(isSpacing?rows.slice(1):rows).filter(row=>row[metric]!==null).slice(-20);
 if(!list.length){
  return isSpacing
   ?`<article class="content-card"><h3>${title}</h3><p>Record at least two starts in this range to see spacing.</p></article>`
   :'<div class="empty-state"><h3>A picture will build as you record.</h3><p>Complete a contraction to start your recent timeline.</p></div>';
 }
 const description=isSpacing
  ?'Up to the last 20 start-to-start intervals in this range. The red line marks 5 minutes.'
  :'Up to the last 20 completed contractions in this range.';
 const chartLabel=isSpacing?'Recent start-to-start intervals between contractions':'Recent contraction durations, in seconds';
 const spacingReferenceSeconds=5*60;
 const max=Math.max(isSpacing?spacingReferenceSeconds+60:60,...list.map(row=>row[metric]/1000));
 const axisStart=isSpacing?75:55;
 const bar=(735-axisStart)/list.length;
 const secondsFormat=new Intl.NumberFormat(undefined,{useGrouping:false});
 const minuteClock=new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'});
 let svg='';
 for(let i=0;i<4;i++){
  const seconds=Math.round(max*i/3),y=180-150*i/3;
  const tick=isSpacing?formatTime(seconds*1000):`${seconds}s`;
  svg+=`<line x1="${axisStart}" y1="${y}" x2="755" y2="${y}" stroke="#e5e8e1"/><text x="${axisStart-10}" y="${y+4}" text-anchor="end">${tick}</text>`;
 }
 list.forEach((row,i)=>{
  const c=row.contraction,value=row[metric],h=value/1000/max*150,x=axisStart+5+i*bar;
  const fill=isSpacing?'#819582':({mild:'#91aa70',moderate:'#d3aa6c',strong:'#ba8589'}[c.intensity]||'#b4beb0');
  const seconds=Math.round(value/1000);
  const startMinute=Math.round(Date.parse(c.startedAt)/60000)*60000;
  const label=`${minuteClock.format(startMinute)} · ${secondsFormat.format(seconds)} ${seconds===1?'second':'seconds'}`;
  svg+=`<g class="chart-point" role="button" tabindex="0" aria-label="${esc(label)}">
   <rect class="chart-hit-area" x="${x-bar*.175}" y="30" width="${bar}" height="150" fill="transparent" />
   <rect class="chart-bar" x="${x}" y="${180-h}" width="${bar*.65}" height="${h}" rx="2" fill="${fill}" />
  </g>`;
  if(i%Math.max(1,Math.ceil(list.length/5))===0)svg+=`<text x="${x+bar*.3}" y="205" text-anchor="middle">${clock(c.startedAt).replace(/:\d{2}(?=\s|$)/,'')}</text>`;
 });
 if(isSpacing){
  const y=180-150*spacingReferenceSeconds/max;
  svg+=`<line x1="${axisStart}" y1="${y}" x2="755" y2="${y}" stroke="#b66c6b" stroke-opacity=".55" vector-effect="non-scaling-stroke" pointer-events="none" />`;
 }
 const legend=isSpacing?'':'<div class="chart-legend"><span><i style="background:#91aa70"></i>Mild</span><span><i style="background:#d3aa6c"></i>Moderate</span><span><i style="background:#ba8589"></i>Strong</span><span><i style="background:#b4beb0"></i>Not recorded</span></div>';
 return `<article class="content-card"><h3>${title}</h3><p>${description}</p><div class="chart-scroll chart-plot"><svg class="contraction-chart" viewBox="0 0 780 220" role="group" aria-label="${chartLabel}">${svg}</svg><div class="chart-tooltip" aria-hidden="true" hidden></div></div>${legend}</article>`;
}
function bindOverviewCharts(){
 $$('.chart-plot').forEach(plot=>{
  const tooltip=plot.querySelector('.chart-tooltip');
  const hide=()=>{tooltip.hidden=true;};
  const show=point=>{
   tooltip.textContent=point.getAttribute('aria-label');
   tooltip.hidden=false;
   const frame=plot.getBoundingClientRect();
   const bar=point.querySelector('.chart-bar').getBoundingClientRect();
   const center=bar.left-frame.left+bar.width/2;
   const left=Math.max(0,Math.min(center-tooltip.offsetWidth/2,frame.width-tooltip.offsetWidth));
   tooltip.style.left=`${left}px`;
   tooltip.style.top=`${Math.max(0,bar.top-frame.top-tooltip.offsetHeight-4)}px`;
  };
  plot.querySelectorAll('.chart-point').forEach(point=>{
   point.onpointerenter=e=>{if(e.pointerType!=='touch')show(point);};
   point.onpointerleave=e=>{if(e.pointerType!=='touch'&&!point.matches(':focus-visible'))hide();};
   point.onfocus=()=>show(point);
   point.onblur=hide;
   point.onclick=()=>show(point);
   point.onkeydown=e=>{
    if(e.key==='Escape')hide();
    if(e.key==='Enter'||e.key===' '){
     e.preventDefault();
     show(point);
    }
   };
  });
 });
}
function overviewPage(){const since=startOfRange(overviewRange),s=recentSummary(data.contractions,since);return heading('A RECORD TO SHARE','Your overview.','A clear summary for a conversation with your maternity team.',`<select id="overview-range" class="button primary period-select" aria-label="Overview range">${[['60','Last hour'],['360','Last 6 hours'],['1440','Last 24 hours'],['all','All records']].map(([v,l])=>`<option value="${v}" ${v===overviewRange?'selected':''}>${l}</option>`).join('')}</select>`)+`<div class="summary-grid">${stat(s.count,'Recorded starts','In the selected range')}${stat(formatTime(s.averageDuration),'Average duration','Completed contractions only')}${stat(formatTime(s.averageSpacing),'Average spacing','Pairs of starts in this range')}</div>${overviewChart(s.rows)}${overviewChart(s.rows,'spacing')}<article class="content-card"><div class="section-heading"><h3>Contraction timings</h3><button class="text-button" id="print-overview">Print / save PDF</button></div><p>Start-to-start spacing is different from rest time. These are recorded observations, not an assessment of labour.</p><div class="chart-table-wrap"><table class="summary-table"><thead><tr><th>Start</th><th>Duration</th><th>Start to start</th><th>Rest before</th><th>Intensity</th></tr></thead><tbody>${[...s.rows].reverse().map(r=>`<tr><td>${date(r.contraction.startedAt)} ${clock(r.contraction.startedAt)}</td><td>${r.duration===null?'Timing…':formatTime(r.duration)}</td><td>${formatTime(r.spacing)}</td><td>${formatTime(r.rest)}</td><td>${labelIntensity(r.contraction)}</td></tr>`).join('')}</tbody></table>${!s.count?'<p class="info-note">No contractions in this range.</p>':''}</div></article><article class="content-card"><h3>Related events</h3>${data.events.filter(e=>Date.parse(e.occurredAt)>=since).length?data.events.filter(e=>Date.parse(e.occurredAt)>=since).sort((a,b)=>Date.parse(b.occurredAt)-Date.parse(a.occurredAt)).map(eventCard).join(''):'<p>No events recorded in this range.</p>'}</article><div class="print-only"><h2>Care notes</h2><p>${esc(data.settings.instructions)}</p>${s.rows.map(r=>contractionCard(r.contraction)).join('')}</div>`;}
function carePage(){const s=data.settings;return heading('A LITTLE SUPPORT, CLOSE BY','Care & data.','Your contact, your notes, and your records.')+`<article class="content-card urgent-card"><h3>When you need support</h3><p>Contact your maternity team if you’re unsure or concerned. Seek urgent advice for signs of labour before 37 weeks, bleeding, reduced or changed baby movements, coloured or smelly waters, or persistent severe pain between contractions. Contact them if your waters break.</p><p>If birth seems imminent or there is heavy bleeding, call emergency services. <strong>In Australia: 000.</strong></p><p>You don’t need to wait for a timer pattern. This app cannot tell whether you’re in active labour or when it is safe to stay home.</p><a class="button primary" href="${esc(callLink())}">${s.phone?'Call maternity contact':'Add your maternity contact'}</a><p class="info-note"><a class="source-link" href="https://www.pregnancybirthbaby.org.au/labour-and-birth/labour/giving-birth-early-signs-of-labour" target="_blank" rel="noopener noreferrer">Pregnancy, Birth and Baby: signs of labour ↗</a> · <a class="source-link" href="https://www.pregnancybirthbaby.org.au/labour-and-birth/labour/giving-birth-contractions" target="_blank" rel="noopener noreferrer">Timing contractions ↗</a></p></article><article class="content-card"><h3>Your maternity contact & plan</h3><p>Optional details, saved only on this device. Follow the instructions your maternity team has given you.</p><form id="care-form"><div class="care-grid"><div><label for="maternity-name">Maternity unit / midwife</label><input id="maternity-name" maxlength="200" value="${esc(s.maternityName)}" placeholder="Your care team"></div><div><label for="phone">Phone number</label><input id="phone" type="tel" maxlength="40" value="${esc(s.phone)}" placeholder="Include area code"></div><div><label for="gestation">Gestation (optional note)</label><input id="gestation" maxlength="200" value="${esc(s.gestation)}" placeholder="For example, 39 weeks + 2 days"></div><div><label for="due-date">Due date (optional)</label><input id="due-date" type="date" value="${esc(s.dueDate)}"></div></div><label for="care-notes">Your maternity team’s instructions</label><textarea id="care-notes" rows="3" maxlength="10000" placeholder="When to call, where to go, anything to remember…">${esc(s.instructions)}</textarea><button class="button primary" type="submit">Save care details</button><p id="care-error" class="error" role="alert"></p></form></article><article class="content-card"><h3>Your records stay here</h3><p>Records are stored in this browser, on this device. They are separate from your headache diary and don’t sync across devices. Browser storage is not encrypted; anyone using the same browser profile may be able to read it. Clearing browser data can remove records.</p><p>Download a backup regularly. Backups and CSV files contain health information. Import merges records by ID and keeps the latest update. Import fills empty care settings and keeps existing values.</p><div class="action-row"><button class="button primary" id="backup">Download backup</button><button class="button" id="export-csv">Export CSV</button><button class="button" id="import-backup">Import backup</button></div>${blocked?'<p class="error">Saved data needs attention. Download the original file before making changes.</p><button class="button" id="raw-backup">Download original data</button>':''}</article><article class="content-card"><h3>Keep your timer close</h3><p><strong>Android · Chrome:</strong> open this app, tap the three-dot menu, then Install and create shortcut / Add to home screen. Choose Install or Create shortcut and confirm.</p><p><strong>iPhone / iPad · Safari:</strong> open this app, tap Share (or Page Menu → Share), then Add to Home Screen. Keep Open as Web App on if shown and tap Add.</p><p>Adding an icon is not a backup. Some devices keep installed-app data separately: export and import a backup if your records don’t appear.</p><p id="offline-status" class="info-note">Checking offline app availability…</p></article>`;}
function bindCards(){ $$('[data-record]').forEach(card=>card.onclick=e=>{const action=e.target.closest('[data-action]')?.dataset.action;if(!action)return;const collection=card.dataset.collection,record=data[collection].find(r=>r.id===card.dataset.record);if(!record)return;if(action==='edit')collection==='contractions'?openContraction(record):openEvent(record);else{deleteTarget={collection,record};$('#delete-dialog').showModal();}});$$('[data-manual]').forEach(b=>b.onclick=()=>openContraction());$$('[data-event]').forEach(b=>b.onclick=()=>openEvent());}
function render(){
 document.title=`${{timer:'Timer',history:'Timeline',overview:'Overview',care:'Care & data'}[page]} — Contractions`;
 $$('[data-page]').forEach(a=>{a.classList.toggle('active',a.dataset.page===page);a.setAttribute('aria-current',a.dataset.page===page?'page':'false');});
 $('#today').textContent=new Intl.DateTimeFormat(undefined,{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date());
 $('#care-link').href=callLink();$('#care-link').textContent=data.settings.phone?`♡ ${data.settings.maternityName||'Call maternity team'}`:'♡ Maternity contact';
 $('#page').innerHTML=(loadError?`<div class="load-error" role="alert">${esc(loadError)} <a href="#care">Care & data →</a></div>`:'')+({timer:timerPage,history:historyPage,overview:overviewPage,care:carePage}[page])();bindCards();
 if(page==='timer'){ $('#timer-button').onclick=toggleTimer;if($('#adjust-active'))$('#adjust-active').onclick=()=>openContraction(running());}
 if(page==='history'){$('#history-range').onchange=e=>{historyRange=e.target.value;render();};$('#history-search').oninput=e=>{const pos=e.target.selectionStart;query=e.target.value;render();$('#history-search').focus();$('#history-search').setSelectionRange(pos,pos);};}
 if(page==='overview'){
  $('#overview-range').onchange=e=>{overviewRange=e.target.value;render();};
  $('#print-overview').onclick=()=>window.print();
  bindOverviewCharts();
 }
 if(page==='care'){ $('#care-form').onsubmit=e=>{e.preventDefault();try{save({...data,settings:{maternityName:$('#maternity-name').value.trim(),phone:$('#phone').value.trim(),gestation:$('#gestation').value.trim(),dueDate:$('#due-date').value,instructions:$('#care-notes').value.trim()}});render();toast('Care details saved.');}catch(err){$('#care-error').textContent=errorMessage(err);}};$('#backup').onclick=backup;$('#export-csv').onclick=()=>download('contractions.csv',csvExport(data),'text/csv;charset=utf-8');$('#import-backup').onclick=()=>$('#import-file').click();if($('#raw-backup'))$('#raw-backup').onclick=()=>download('contractions-original.json',raw||'','application/json');offlineStatus();}
}
function toggleTimer(){if(Date.now()-lastTimerClick<400)return;lastTimerClick=Date.now();try{const active=running(),now=new Date().toISOString();if(active){save({...data,contractions:data.contractions.map(c=>c.id===active.id?{...c,endedAt:now,updatedAt:now}:c)});restored=false;render();toast('Contraction saved. Add details whenever you like.');}else{save({...data,contractions:[...data.contractions,{id:crypto.randomUUID(),startedAt:now,endedAt:null,intensity:null,location:'',comfort:[],notes:'',createdAt:now,updatedAt:now}]});restored=false;render();}}catch(e){toast(errorMessage(e));}}
const COMFORT=['Breathing','Position change','Rest','Movement','Massage','Heat','TENS','Hip counter pressure','Birth comb','Swaying','Bouncing','Other'];
const startTime=$('#start-time'),endTime=$('#end-time'),durationSeconds=$('#duration-seconds');
const timingDetails=$('#timing-details');

function readLocalTime(value,previous){
 if(previous){
  const original=local(previous);
  if(value===original||value+':00'===original)return previous;
 }
 return new Date(value).toISOString();
}

function endFromDuration(startedAt){
 return new Date(Date.parse(startedAt)+durationSeconds.valueAsNumber*1000);
}

function updateCalculatedEnd(){
 const hasDuration=durationSeconds.value!=='';
 endTime.disabled=hasDuration;
 $('#manual-end-fields').hidden=hasDuration;
 $('#calculated-end-fields').hidden=!hasDuration;
 const output=$('#calculated-end');
 output.value='';
 if(hasDuration){
  const end=startTime.validity.valid&&Number.isFinite(Date.parse(startTime.value))&&durationSeconds.validity.valid
   ?endFromDuration(readLocalTime(startTime.value,editing?.startedAt))
   :null;
  output.value=end&&Number.isFinite(+end)?`${date(end)} · ${clock(end)}`:'—';
 }
}

function openContraction(record=null){
 editing=record;
 intensity=record?.intensity??null;
 $('#contraction-form').reset();
 $('#contraction-title').textContent=record?'Contraction details':'Log a contraction';
 $('#contraction-error').textContent='';
 const now=Date.now();
 startTime.value=local(record?.startedAt??now);
 endTime.value=local(record?.endedAt??now);
 if(record&&!record.endedAt)endTime.value='';
 timingDetails.open=!record?.endedAt;
 updateCalculatedEnd();
 $('#location').value=record?.location||'';
 $('#contraction-notes').value=record?.notes||'';
 $$('[data-intensity]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.intensity===intensity));
 const comfortOptions=new Set([...COMFORT,...(record?.comfort??[])]);
 $('#comfort-options').innerHTML=[...comfortOptions].map(t=>`<button type="button" data-comfort="${esc(t)}" aria-pressed="${record?.comfort.includes(t)||false}">${esc(t)}</button>`).join('');
 $('#contraction-dialog').showModal();
}

startTime.oninput=durationSeconds.oninput=updateCalculatedEnd;
timingDetails.addEventListener('invalid',()=>{timingDetails.open=true;},true);
$('#intensity-options').onclick=e=>{const b=e.target.closest('[data-intensity]');if(!b)return;intensity=intensity===b.dataset.intensity?null:b.dataset.intensity;$$('[data-intensity]').forEach(x=>x.setAttribute('aria-pressed',x.dataset.intensity===intensity));};
$('#comfort-options').onclick=e=>{const b=e.target.closest('[data-comfort]');if(b)b.setAttribute('aria-pressed',b.getAttribute('aria-pressed')!=='true');};
$('#contraction-form').onsubmit=e=>{
 e.preventDefault();
 try{
  const now=new Date().toISOString();
  const startedAt=readLocalTime(startTime.value,editing?.startedAt);
  let endedAt=null;
  if(durationSeconds.value!==''){
   const end=endFromDuration(startedAt);
   if(!Number.isFinite(+end))throw new Error('Enter a shorter duration in seconds.');
   endedAt=end.toISOString();
  }else if(endTime.value){
   endedAt=readLocalTime(endTime.value,editing?.endedAt);
  }
  const c=validateContraction({
   id:editing?.id||crypto.randomUUID(),startedAt,endedAt,intensity,
   location:$('#location').value,
   comfort:$$('[data-comfort][aria-pressed="true"]').map(b=>b.dataset.comfort),
   notes:$('#contraction-notes').value.trim(),
   createdAt:editing?.createdAt||now,updatedAt:now
  });
  save({...data,contractions:[...data.contractions.filter(x=>x.id!==c.id),c]});
  $('#contraction-dialog').close();
  render();
  toast('Contraction details saved.');
 }catch(err){
  $('#contraction-error').textContent=errorMessage(err);
 }
};
$('#event-kind').innerHTML=Object.entries(EVENT_TYPES).map(([v,l])=>`<option value="${v}">${l}</option>`).join('');
function openEvent(record=null){editingEvent=record;$('#event-form').reset();$('#event-error').textContent='';$('#event-title').textContent=record?'Edit event':'Log an event';$('#event-kind').value=record?.kind||'other';$('#event-time').value=local(record?.occurredAt||Date.now());$('#event-notes').value=record?.notes||'';$('#fluid-colour').value=record?.fluidColour||'';$('#fluid-amount').value=record?.fluidAmount||'';$('#water-fields').hidden=$('#event-kind').value!=='waters';$('#event-dialog').showModal();}
$('#event-kind').onchange=()=>$('#water-fields').hidden=$('#event-kind').value!=='waters';
$('#event-form').onsubmit=e=>{e.preventDefault();try{const now=new Date().toISOString(),water=$('#event-kind').value==='waters';const event=validateEvent({id:editingEvent?.id||crypto.randomUUID(),kind:$('#event-kind').value,occurredAt:new Date($('#event-time').value).toISOString(),notes:$('#event-notes').value.trim(),fluidColour:water?$('#fluid-colour').value.trim():'',fluidAmount:water?$('#fluid-amount').value.trim():'',createdAt:editingEvent?.createdAt||now,updatedAt:now});save({...data,events:[...data.events.filter(e=>e.id!==event.id),event]});$('#event-dialog').close();render();toast('Event saved.');}catch(err){$('#event-error').textContent=errorMessage(err);}};
$$('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('#delete-confirm').onclick=()=>{try{const {collection,record}=deleteTarget;save({...data,[collection]:data[collection].filter(x=>x.id!==record.id)});undo={collection,record};$('#delete-dialog').close();render();toast('Record deleted.',true);}catch(e){toast(errorMessage(e));}};
$('#import-file').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>20*1024*1024)throw new Error('Choose a backup smaller than 20 MB.');const imported=parseBackup(await file.text());save(mergeBackup(data,imported));render();toast('Backup merged. Existing care settings were kept.');}catch(err){toast('Import failed: '+errorMessage(err));}finally{e.target.value='';}};
window.addEventListener('hashchange',()=>{page=pages.includes(location.hash.slice(1))?location.hash.slice(1):'timer';render();window.scrollTo(0,0);});
window.addEventListener('storage',e=>{if(e.key!==STORAGE_KEY&&e.key!==null)return;try{const text=localStorage.getItem(STORAGE_KEY);data=text?parseBackup(text):emptyState();lastStored=text;$$('dialog[open]').forEach(d=>d.close());render();toast('Records updated from another tab.');}catch{blocked=true;loadError='A change from another tab could not be read. Reload to recover the saved data.';render();}});
setInterval(()=>{const el=$('#main-timer');if(el){const active=running(),last=ordered().filter(c=>c.endedAt).at(-1);el.textContent=active?formatTime(durationMs(active)):last?formatTime(Date.now()-Date.parse(last.endedAt)):'00:00';}},250);
let offlineReady=false;
function offlineStatus(){if($('#offline-status'))$('#offline-status').textContent=offlineReady?'Offline app shell is ready in this browser. Keep backups of your records.':'Offline availability depends on this browser and host. Open the app online once before relying on offline access.';}
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').then(()=>navigator.serviceWorker.ready).then(()=>{offlineReady=true;offlineStatus();}).catch(()=>offlineStatus());
render();
