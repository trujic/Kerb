globalThis.import_meta_client = true
// mali stub, testiramo čistu logiku
const smsHref=(code,plate)=>plate?`sms:${code}?body=${encodeURIComponent(plate)}`:`sms:${code}`
const fill=(tpl,v)=>tpl.replace(/\{(\w+)\}/g,(_,k)=>encodeURIComponent(v[k]??''))
function payActionFor(zone,opts={}){
  const plate=opts.plate?.trim().toUpperCase()??''
  const kind=zone?.pay_method ?? (zone?.sms_shortcode?'sms':'none')
  const target=zone?.pay_target ?? zone?.sms_shortcode ?? null
  if(kind==='sms'&&target) return {kind,actionable:true,href:smsHref(target,plate||null),label:target}
  if(kind==='app'&&target) return {kind,actionable:true,href:fill(target,{plate,zone:zone?.name??'',sector:opts.sector??''}),label:zone?.pay_label??null}
  if(kind==='kiosk') return {kind,actionable:false,href:null,label:zone?.pay_label??null,reason:'kiosk'}
  return {kind:'none',actionable:false,href:null,label:null,reason:'unknown'}
}
let pass=0,fail=0
const ck=(l,got,want)=>{const ok=JSON.stringify(got)===JSON.stringify(want);ok?pass++:fail++;
  console.log(`${ok?'  ok  ':' FAIL '} ${l}`); if(!ok)console.log('    got ',JSON.stringify(got),'\n    want',JSON.stringify(want))}

console.log('\n— SMS (Srbija) —')
ck('Novi Sad Red', payActionFor({pay_method:'sms',pay_target:'8211',name:'Red Zone'},{plate:'ns001qa'}).href,
   'sms:8211?body=NS001QA')
ck('stara zona samo sa sms_shortcode', payActionFor({sms_shortcode:'8230'},{plate:'NS1'}).kind, 'sms')

console.log('\n— App deep link (Solun) —')
const thes={pay_method:'app',pay_target:'parkpal://park?sector={sector}&plate={plate}',pay_label:'ParkPal',name:'Zone A'}
ck('popunjen link', payActionFor(thes,{plate:'ZR123',sector:'21351'}).href,
   'parkpal://park?sector=21351&plate=ZR123')
ck('izvodljiv', payActionFor(thes,{plate:'X'}).actionable, true)
ck('nosi ime aplikacije', payActionFor(thes,{}).label, 'ParkPal')

console.log('\n— bez plaćanja iz aplikacije —')
ck('automat', payActionFor({pay_method:'kiosk'}).reason, 'kiosk')
ck('automat nije izvodljiv', payActionFor({pay_method:'kiosk'}).actionable, false)
ck('Beograd (ništa)', payActionFor({name:'Zone A — Purple'}).reason, 'unknown')

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail?1:0)
