export const STORAGE_KEY='contractions:v1';
export const INTENSITIES={mild:'Mild',moderate:'Moderate',strong:'Strong'};
export const EVENT_TYPES={waters:'Waters breaking',show:'Show / mucus',bleeding:'Bleeding',movement:'Movement concern',comfort:'Comfort measure',contact:'Contacted maternity team',other:'Other event'};
export const emptyState=()=>({schemaVersion:1,contractions:[],events:[],settings:{maternityName:'',phone:'',gestation:'',dueDate:'',instructions:''}});
const finiteDate=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const shortText=(v,max=10000)=>typeof v==='string'&&v.length<=max;
export function validateContraction(c,now=Date.now()){
 if(!c||!shortText(c.id,100)||!c.id||!finiteDate(c.startedAt)||Date.parse(c.startedAt)>now+1000)throw new Error('Choose a valid start time no later than now.');
 if(c.endedAt!==null&&(!finiteDate(c.endedAt)||Date.parse(c.endedAt)<Date.parse(c.startedAt)||Date.parse(c.endedAt)>now+1000))throw new Error('End time must be after the start and no later than now.');
 if(c.intensity!==null&&!Object.hasOwn(INTENSITIES,c.intensity))throw new Error('Invalid intensity.');
 if(!shortText(c.location,200)||!shortText(c.notes)||!Array.isArray(c.comfort)||c.comfort.length>30||c.comfort.some(v=>!shortText(v,200)))throw new Error('Invalid contraction details.');
 if(!finiteDate(c.createdAt)||!finiteDate(c.updatedAt))throw new Error('Invalid record dates.');
 return Object.fromEntries(['id','startedAt','endedAt','intensity','location','comfort','notes','createdAt','updatedAt'].map(k=>[k,c[k]]));
}
export function validateEvent(e,now=Date.now()){
 if(!e||!shortText(e.id,100)||!e.id||!Object.hasOwn(EVENT_TYPES,e.kind)||!finiteDate(e.occurredAt)||Date.parse(e.occurredAt)>now+1000)throw new Error('Choose a valid event type and time.');
 for(const k of ['notes','fluidColour','fluidAmount'])if(!shortText(e[k],k==='notes'?10000:200))throw new Error('Invalid event details.');
 if(!finiteDate(e.createdAt)||!finiteDate(e.updatedAt))throw new Error('Invalid event dates.');
 return Object.fromEntries(['id','kind','occurredAt','notes','fluidColour','fluidAmount','createdAt','updatedAt'].map(k=>[k,e[k]]));
}
export function validateState(data,now=Date.now()){
 if(!data||data.schemaVersion!==1||!Array.isArray(data.contractions)||!Array.isArray(data.events)||data.contractions.length>50000||data.events.length>20000)throw new Error('Choose a valid Contractions backup. Headache diary backups cannot be imported here.');
 const contractions=data.contractions.map(c=>validateContraction(c,now));
 const events=data.events.map(e=>validateEvent(e,now));
 if(new Set([...contractions,...events].map(e=>e.id)).size!==contractions.length+events.length)throw new Error('Duplicate record IDs.');
 if(contractions.filter(c=>c.endedAt===null).length>1)throw new Error('Only one contraction can be timing.');
 const sorted=[...contractions].sort((a,b)=>Date.parse(a.startedAt)-Date.parse(b.startedAt));
 for(let i=1;i<sorted.length;i++)if(sorted[i-1].endedAt===null||Date.parse(sorted[i].startedAt)<Date.parse(sorted[i-1].endedAt))throw new Error('Contraction times must not overlap. Check the start and end times.');
 const settings={};
 for(const key of Object.keys(emptyState().settings)){
  const value=data.settings?.[key]??'';if(!shortText(value,key==='instructions'?10000:200))throw new Error('Invalid care settings.');settings[key]=value;
 }
 return {schemaVersion:1,contractions,events,settings};
}
export const parseBackup=(text,now=Date.now())=>validateState(JSON.parse(text),now);
export function mergeBackup(current,incoming,now=Date.now()){
 const merge=(a,b)=>{const m=new Map(a.map(c=>[c.id,c]));for(const c of b){const old=m.get(c.id);if(!old||Date.parse(c.updatedAt)>Date.parse(old.updatedAt))m.set(c.id,c);}return [...m.values()];};
 const settings=Object.fromEntries(Object.keys(current.settings).map(k=>[k,current.settings[k]||incoming.settings[k]||'']));
 return validateState({...current,settings,contractions:merge(current.contractions,incoming.contractions),events:merge(current.events,incoming.events)},now);
}
export const durationMs=(c,now=Date.now())=>Math.max(0,(c.endedAt?Date.parse(c.endedAt):now)-Date.parse(c.startedAt));
export function formatTime(ms){if(ms===null||ms===undefined||!Number.isFinite(ms))return '—';const total=Math.max(0,Math.floor(ms/1000));const seconds=total%60,minutes=Math.floor(total/60),hours=Math.floor(minutes/60);return `${hours?hours+':':''}${String(hours?minutes%60:minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;}
export function measurements(contractions){
 const ordered=[...contractions].sort((a,b)=>Date.parse(a.startedAt)-Date.parse(b.startedAt));
 return ordered.map((c,i)=>({contraction:c,duration:c.endedAt?durationMs(c):null,spacing:i?Date.parse(c.startedAt)-Date.parse(ordered[i-1].startedAt):null,rest:i&&ordered[i-1].endedAt?Date.parse(c.startedAt)-Date.parse(ordered[i-1].endedAt):null}));
}
export function recentSummary(contractions,since,now=Date.now()){
 const all=measurements(contractions),rows=all.filter(r=>Date.parse(r.contraction.startedAt)>=since&&Date.parse(r.contraction.startedAt)<=now);
 const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
 // Spacing averages use only pairs whose two starts are in the selected window.
 const starts=new Set(rows.map(r=>r.contraction.id));
 const spacings=all.filter((r,i)=>starts.has(r.contraction.id)&&i>0&&starts.has(all[i-1].contraction.id)).map(r=>r.spacing);
 return {rows,count:rows.length,averageDuration:mean(rows.filter(r=>r.duration!==null).map(r=>r.duration)),averageSpacing:mean(spacings)};
}
export function csvExport(state){
 const cell=v=>`"${String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')}"`;
 const rows=[['Record type','Start (ISO)','End (ISO)','Duration (seconds)','Start-to-start spacing (seconds)','Rest interval (seconds)','Intensity','Location','Comfort measures','Notes','Fluid colour','Fluid amount']];
 measurements(state.contractions).forEach(r=>{const c=r.contraction;rows.push(['Contraction',c.startedAt,c.endedAt,r.duration===null?'':r.duration/1000,r.spacing===null?'':r.spacing/1000,r.rest===null?'':r.rest/1000,c.intensity||'',c.location,c.comfort.join('; '),c.notes,'','']);});
 [...state.events].sort((a,b)=>Date.parse(a.occurredAt)-Date.parse(b.occurredAt)).forEach(e=>rows.push([EVENT_TYPES[e.kind],e.occurredAt,'','','','','','','',e.notes,e.fluidColour,e.fluidAmount]));
 return rows.map(r=>r.map(cell).join(',')).join('\r\n');
}
