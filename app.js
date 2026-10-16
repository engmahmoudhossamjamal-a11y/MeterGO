'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const KEYS = {rates:'fare_meter_rates_v1',active:'fare_meter_active_v1',pending:'fare_meter_pending_v1',history:'fare_meter_history_v1'};
  const DEFAULT_RATES = Object.freeze({taxi:{base:16.25,perKm:5.50},tuktuk:{base:7.50,perKm:5.00}});
  const VEHICLES = {taxi:'تاكسي',tuktuk:'توك توك'};
  const ACCURACY_LIMIT_M = 65;
  let rates = validateRates(load(KEYS.rates,null)) || structuredCloneFallback(DEFAULT_RATES);
  let history = load(KEYS.history,[]);
  if (!Array.isArray(history)) history = [];
  let activeTrip = validateActive(load(KEYS.active,null));
  let pendingTrip = validatePending(load(KEYS.pending,null));
  let selectedVehicle = activeTrip ? activeTrip.vehicle : null;
  let screen = pendingTrip ? 'summary' : activeTrip ? 'trip' : 'home';
  let ratingType = 'fair';
  let gpsWatcher = null;
  let gps = {point:null,accuracy:Infinity,notice:'جارٍ تحديد الموقع...',error:null,region:null};
  let toastTimeout = null;

  function structuredCloneFallback(o){return JSON.parse(JSON.stringify(o))}
  function load(k,fallback){try{const raw=localStorage.getItem(k);return raw?JSON.parse(raw):fallback}catch(e){return fallback}}
  function store(k,value){try{localStorage.setItem(k,JSON.stringify(value));return true}catch(e){console.warn('Local storage unavailable',e);return false}}
  function remove(k){try{localStorage.removeItem(k)}catch(e){}}
  function validateRates(r){
    if (!r || !['taxi','tuktuk'].every(k=>r[k] && Number.isFinite(r[k].base) && r[k].base>=0 && Number.isFinite(r[k].perKm) && r[k].perKm>=0)) return null;
    return r;
  }
  function validateActive(t){return t && VEHICLES[t.vehicle] && t.rate && Number.isFinite(t.rate.base) && Number.isFinite(t.rate.perKm) && Number.isFinite(t.startedAt) && Number.isFinite(t.distanceM) && t.distanceM>=0 ? t : null}
  function validatePending(t){return t && VEHICLES[t.vehicle] && t.rate && Number.isFinite(t.rate.base) && Number.isFinite(t.rate.perKm) && Number.isFinite(t.distanceM) && Number.isFinite(t.startedAt) && Number.isFinite(t.endedAt) ? t:null}
  const fixed = v => (Math.round((v+Number.EPSILON)*100)/100).toFixed(2);
  const fare = t => t.rate.base+(t.distanceM/1000)*t.rate.perKm;
  const minutes = t => Math.max(0,Math.floor(((t.endedAt || Date.now())-t.startedAt)/60000));
  const vehicleName = v => VEHICLES[v] || '';
  function regionOf(p) {
    // Approximate bounding area, NOT an official administrative polygon.
    return p.lat >= 30.70 && p.lat <= 31.46 && p.lon >= 29.20 && p.lon <= 30.67 ? 'الإسكندرية' : null;
  }
  function toast(message){
    const el=$('toast');el.textContent=message;el.classList.remove('hidden');
    if(toastTimeout)clearTimeout(toastTimeout);
    toastTimeout=setTimeout(()=>el.classList.add('hidden'),3800);
  }
  function confirmAction(title,message,onOkay,okayLabel='تأكيد'){
    $('modalTitle').textContent=title;$('modalText').textContent=message;$('modalConfirm').textContent=okayLabel;
    $('modalOverlay').classList.remove('hidden');
    $('modalConfirm').onclick=()=>{$('modalOverlay').classList.add('hidden');onOkay()};
    $('modalCancel').onclick=()=>$('modalOverlay').classList.add('hidden');
  }
  // Small self-contained SVG seven-segment digits; works fully offline on Android WebView.
  const SEG={0:'abcdef',1:'bc',2:'abdeg',3:'abcdg',4:'bcfg',5:'acdfg',6:'acdefg',7:'abc',8:'abcdefg',9:'abcdfg'};
  const POLY={
    a:'9,3 35,3 30,9 13,9', b:'37,6 42,11 42,34 36,38 35,14',
    c:'37,42 42,46 42,67 37,72 35,65 35,45', d:'9,75 35,75 30,69 13,69',
    e:'3,45 9,42 10,65 8,72 3,67', f:'3,11 9,6 10,14 10,34 3,38',
    g:'9,39 13,35 31,35 35,39 30,43 13,43'
  };
  function digits(text,highlight=false){
    const color=highlight?'#e6b400':'#222222';let pos=1,items='';
    for(const c of String(text)){
      if(c==='.') {items+=`<circle cx="${pos+2.3}" cy="71.7" r="3.7" fill="${color}"/>`;pos+=13;continue}
      if(c===':') {items+=`<circle cx="${pos+3}" cy="26" r="3.1" fill="${color}"/><circle cx="${pos+3}" cy="51" r="3.1" fill="${color}"/>`;pos+=13;continue}
      const segments=SEG[c]||'';
      for (const name of segments)items+=`<polygon transform="translate(${pos} 0)" points="${POLY[name]}" fill="${color}"/>`;
      pos+=47;
    }
    return `<svg class="digit-svg" viewBox="0 0 ${pos+2} 79" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${String(text).replace(/[^0-9.:]/g,'')}">${items}</svg>`;
  }
  function usableGps(){return !!(!gps.error && gps.point && gps.accuracy<=ACCURACY_LIMIT_M && Date.now()-gps.point.time<30000)}
  function distanceM(a,b){
    const R=6371000,rad=Math.PI/180;
    const dLat=(b.lat-a.lat)*rad,dLon=(b.lon-a.lon)*rad;
    const h=Math.sin(dLat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLon/2)**2;
    return 2*R*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
  }
  function addTripGps(p){
    if(!activeTrip || p.accuracy>ACCURACY_LIMIT_M)return;
    const prev=activeTrip.lastPoint;
    if(!prev){activeTrip.lastPoint=p;store(KEYS.active,activeTrip);return}
    const dt=(p.time-prev.time)/1000;
    if(dt<1.1)return;
    // If backgrounded / suspended, do not pretend a straight line is the driven route.
    if(dt>65){activeTrip.lastPoint=p;store(KEYS.active,activeTrip);return}
    const d=distanceM(prev,p);
    if(!Number.isFinite(d))return;
    // Reject sudden impossible position jumps.
    if((d/dt)>37 || d>dt*36+Math.max(p.accuracy,prev.accuracy)*2){activeTrip.lastPoint=p;store(KEYS.active,activeTrip);return}
    const movementThreshold=Math.max(7,Math.min(17,(prev.accuracy+p.accuracy)*.21));
    if(p.speed!==null && p.speed<0.65 && d<40) return;
    if(d<movementThreshold)return;
    activeTrip.distanceM+=d;
    activeTrip.lastPoint=p;
    store(KEYS.active,activeTrip);
  }
  function onPosition(position){
    const c=position.coords;
    if(!Number.isFinite(c.latitude)||!Number.isFinite(c.longitude))return;
    const p={lat:c.latitude,lon:c.longitude,accuracy:Number.isFinite(c.accuracy)?c.accuracy:999,time:position.timestamp||Date.now(),speed:Number.isFinite(c.speed)&&c.speed>=0?c.speed:null};
    if(gps.point && p.time < gps.point.time)return;
    gps.point=p;gps.accuracy=p.accuracy;gps.error=null;gps.region=regionOf(p);
    gps.notice=p.accuracy>ACCURACY_LIMIT_M?'إشارة GPS ضعيفة':'تم تحديد موقعك';
    if(activeTrip)addTripGps(p);
    refreshLocation();refreshMeter();
  }
  function onGpsError(e){
    const msg={1:'تم رفض إذن الموقع. اسمح للتطبيق باستخدام GPS.',2:'الموقع غير متاح حاليًا. فعّل GPS وحاول تاني.',3:'تحديد الموقع اتأخر؛ حاول تاني في مكان مفتوح.'};
    gps.error=msg[e.code]||'تعذّر الوصول للموقع';
    gps.notice='تعذّر تحديد الموقع';
    refreshLocation();refreshMeter();
  }
  function startGps(){
    if(!navigator.geolocation){gps.error='المتصفح أو نسخة التطبيق لا تدعم تحديد الموقع GPS.';refreshLocation();return}
    if(gpsWatcher!==null){try{navigator.geolocation.clearWatch(gpsWatcher)}catch(e){}}
    try{gpsWatcher=navigator.geolocation.watchPosition(onPosition,onGpsError,{enableHighAccuracy:true,maximumAge:0,timeout:25000})}
    catch(e){gps.error='تعذّر تشغيل GPS في هذه النسخة.';refreshLocation()}
  }
  function refreshGps(){
    gps.error=null;gps.notice='جارٍ تحديد الموقع...';refreshLocation();startGps();
  }
  function refreshLocation(){
    if(screen==='trip'){$('headerStatusText').textContent=usableGps()?'جاري تتبع الرحلة...':'جاري تتبع الرحلة — GPS ضعيف...';$('locationIcon').classList.add('hidden')}
    else if(screen==='summary'){$('headerStatusText').textContent='تم إنهاء الرحلة...';$('locationIcon').classList.add('hidden')}
    else if(screen==='home'){$('headerStatusText').textContent=gps.error?'تعذّر تحديد موقعك...':gps.point?'تم تحديد موقعك...':'جاري تحديد موقعك...';$('locationIcon').classList.remove('hidden')}
    else {$('headerStatusText').textContent=screen==='settings'?'إعدادات العداد...':'رحلاتك السابقة...';$('locationIcon').classList.add('hidden')}
    if(gps.point){
      $('areaName').textContent=gps.region||'خارج نطاق الإسكندرية';
      $('coordsText').textContent=`${gps.point.lat.toFixed(5)}, ${gps.point.lon.toFixed(5)} • دقة ${Math.round(gps.accuracy)} م`;
    }else{$('areaName').textContent='جارٍ تحديد الموقع...';$('coordsText').textContent=gps.error||'اسمح بالوصول للموقع لتشغيل العداد'}
    const n=$('homeNotice');
    if(screen==='home'){
      if(!selectedVehicle){n.textContent='برجاء تحديد وسيلة المواصلات';n.className='notice error-text'}
      else if(!usableGps()){n.textContent=gps.error?'الـ GPS مش متاح، اضغط تحديث الموقع':'مستنيين إشارة GPS دقيقة لبدء الرحلة';n.className='notice error-text'}
      else{n.textContent=`${vehicleName(selectedVehicle)} • تعريفة الإسكندرية${gps.region?'':' (خارج النطاق)'}`;n.className='notice success-text'}
    }
    if(activeTrip){
      const tr=$('trackingInfo');
      if(!gps.point)tr.textContent='مستنيين أول إشارة GPS...';
      else if(!usableGps())tr.textContent='إشارة GPS ضعيفة — المسافة لا تزيد لحد ما تتحسن';
      else tr.textContent=`GPS متصل • دقة حوالي ${Math.round(gps.accuracy)} متر • أبقِ الشاشة مفتوحة`;
    }
  }
  function refreshMeter(){
    if(!activeTrip)return;
    $('priceDisplay').innerHTML=digits(fixed(fare(activeTrip)),true);
    $('minutesDisplay').innerHTML=digits(String(minutes(activeTrip)));
    $('kmDisplay').innerHTML=digits((activeTrip.distanceM/1000).toFixed(2));
    $('tripBase').textContent=fixed(activeTrip.rate.base);
    $('tripPerKm').textContent=fixed(activeTrip.rate.perKm);
    if(screen==='trip')refreshLocation();
  }
  function renderSummary(){
    if(!pendingTrip)return;
    $('summaryTotal').innerHTML=digits(fixed(fare(pendingTrip)),true);
    $('summaryBase').innerHTML=digits(fixed(pendingTrip.rate.base));
    $('summaryPerKm').innerHTML=digits(fixed(pendingTrip.rate.perKm));
    $('summaryKm').innerHTML=digits((pendingTrip.distanceM/1000).toFixed(2));
    $('summaryTime').innerHTML=digits(String(minutes(pendingTrip)));
    selectRating('fair');
  }
  function selectRating(mode){
    ratingType=mode;
    $('fairButton').classList.toggle('selected',mode==='fair');
    $('fairButton').setAttribute('aria-pressed',String(mode==='fair'));
    $('differentChoice').classList.toggle('selected',mode==='different');
  }
  function renderRates(){
    $('homeTaxiRate').textContent=fixed(rates.taxi.perKm);
    $('homeTuktukRate').textContent=fixed(rates.tuktuk.perKm);
    $('taxiBaseInput').value=rates.taxi.base;
    $('taxiPerInput').value=rates.taxi.perKm;
    $('tuktukBaseInput').value=rates.tuktuk.base;
    $('tuktukPerInput').value=rates.tuktuk.perKm;
  }
  function switchScreen(next){
    screen=next;
    for (const name of ['home','trip','summary','settings','history']) $(name+'Screen').classList.toggle('hidden',name!==next);
    const extra=(next==='settings'||next==='history');
    $('topActions').classList.toggle('hidden',next!=='home');
    $('backButton').classList.toggle('hidden',!extra);
    $('locationStrip').classList.toggle('hidden',extra);
    $('brand').classList.toggle('hidden',next==='trip'||next==='summary');
    $('vehicleHero').classList.toggle('hidden',next!=='trip'&&next!=='summary');
    if(next==='trip'||next==='summary') $('vehicleHero').src=`assets/${(activeTrip||pendingTrip).vehicle}.webp`;
    if(next==='settings')renderRates();
    if(next==='history')renderHistory();
    if(next==='summary')renderSummary();
    refreshLocation();
    if(next==='trip')refreshMeter();
  }
  function chooseVehicle(v){
    if(!VEHICLES[v])return;
    selectedVehicle=v;
    document.querySelectorAll('.vehicle-tile').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.vehicle===v)));
    refreshLocation();
  }
  function startTrip(){
    if(!selectedVehicle){toast('اختار التاكسي أو التوك توك الأول');return}
    if(!usableGps()){toast(gps.error||'لازم نحدد موقع GPS بدقة قبل بدء الرحلة');refreshGps();return}
    const go=()=>{
      const now=Date.now();
      activeTrip={vehicle:selectedVehicle,rate:{...rates[selectedVehicle]},startedAt:now,distanceM:0,lastPoint:{...gps.point,time:now},region:'الإسكندرية'};
      if(!store(KEYS.active,activeTrip))toast('تنبيه: جهازك منع حفظ الرحلة محليًا');
      switchScreen('trip');
    };
    if(!gps.region)confirmAction('خارج الإسكندرية','التعريفة المتاحة حاليًا خاصة بالإسكندرية. هل تستخدمها كتقدير فقط في موقعك الحالي؟',go,'بدء كتقدير');
    else go();
  }
  function endTrip(){
    if(!activeTrip)return;
    confirmAction('إنهاء الرحلة؟','هيتم إيقاف تتبع GPS وعرض ملخص الأجرة المحسوبة.',()=>{
      pendingTrip={...activeTrip,endedAt:Date.now()};
      store(KEYS.pending,pendingTrip);
      activeTrip=null;remove(KEYS.active);
      switchScreen('summary');
    },'إنهاء الرحلة');
  }
  function submitRating(){
    if(!pendingTrip)return;
    let paid=null;
    if(ratingType==='different'){
      const v=$('paidAmount').value.trim();
      if(!v || !Number.isFinite(Number(v)) || Number(v)<0){toast('اكتب المبلغ اللي دفعته بالفعل');$('paidAmount').focus();return}
      paid=Number(v);
    }
    const entry={
      id:`${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
      vehicle:pendingTrip.vehicle,start:pendingTrip.startedAt,end:pendingTrip.endedAt,
      base:pendingTrip.rate.base,perKm:pendingTrip.rate.perKm,
      distanceM:pendingTrip.distanceM,elapsedMinutes:minutes(pendingTrip),
      price:Number(fixed(fare(pendingTrip))),assessment:ratingType,
      actualPaid:ratingType==='fair'?Number(fixed(fare(pendingTrip))):paid,
      region:pendingTrip.region||'الإسكندرية'
    };
    history.unshift(entry);history=history.slice(0,250);
    store(KEYS.history,history);
    pendingTrip=null;remove(KEYS.pending);
    $('thanksOverlay').classList.remove('hidden');$('thanksOverlay').setAttribute('aria-hidden','false');
  }
  function closeThanks(){
    $('thanksOverlay').classList.add('hidden');$('thanksOverlay').setAttribute('aria-hidden','true');
    selectedVehicle=null;document.querySelectorAll('.vehicle-tile').forEach(b=>b.setAttribute('aria-pressed','false'));
    $('paidAmount').value='';switchScreen('home');
  }
  function savePrices(){
    if(activeTrip){toast('ماينفعش تعديل تعريفة رحلة شغالة');return}
    const fields={taxi:{base:Number($('taxiBaseInput').value),perKm:Number($('taxiPerInput').value)},tuktuk:{base:Number($('tuktukBaseInput').value),perKm:Number($('tuktukPerInput').value)}};
    if(['taxiBaseInput','taxiPerInput','tuktukBaseInput','tuktukPerInput'].some(id=>$(id).value.trim()==='')||!validateRates(fields)||Object.values(fields).some(v=>v.base>10000||v.perKm>10000)){
      toast('اكتب أسعار صحيحة أكبر من أو تساوي صفر');return;
    }
    rates=fields;store(KEYS.rates,rates);renderRates();switchScreen('home');toast('تم حفظ الأسعار بنجاح');
  }
  function resetPrices(){
    confirmAction('استعادة الأسعار؟','هترجع أسعار التاكسي والتوك توك للقيم المؤقتة اللي حددتها للإسكندرية.',()=>{
      rates=structuredCloneFallback(DEFAULT_RATES);store(KEYS.rates,rates);renderRates();toast('رجّعنا الأسعار الأصلية');
    },'استعادة');
  }
  function formatDate(timestamp){
    try{return new Intl.DateTimeFormat('ar-EG',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(timestamp)}
    catch(e){return new Date(timestamp).toLocaleString()}
  }
  function renderHistory(){
    const box=$('historyContent');
    if(!history.length){box.innerHTML='<div class="empty-history"><span class="empty-symbol">◷</span>لسه مفيش رحلات محفوظة<br>ابدأ أول رحلة علشان تظهر هنا</div>';return}
    box.innerHTML=history.slice(0,250).map(t=>{
      const n=vehicleName(t.vehicle),price=Number(t.price),dist=Number(t.distanceM),elapsed=Number(t.elapsedMinutes);
      return `<article class="history-entry"><header><span>${n}</span><span>${Number.isFinite(price)?fixed(price):'0.00'} ج</span></header><p>${formatDate(t.start)}</p><footer><span>${Number.isFinite(dist)?(dist/1000).toFixed(2):'0.00'} كم</span><span>${Number.isFinite(elapsed)?elapsed:0} دقيقة</span><span>${t.assessment==='different'?'سعر مختلف':'رحلة عادلة'}</span></footer>${t.assessment==='different'&&Number.isFinite(t.actualPaid)?`<p>المدفوع فعليًا: ${fixed(t.actualPaid)} جنيه</p>`:''}</article>`
    }).join('');
  }
  function clearHistory(){
    if(!history.length){toast('سجل الرحلات فاضي');return}
    confirmAction('مسح سجل الرحلات؟','هيتم حذف جميع الرحلات المحفوظة على الجهاز ومش هتقدر تسترجعها.',()=>{
      history=[];store(KEYS.history,history);renderHistory();toast('تم مسح السجل');
    },'مسح السجل');
  }
  function goBack(){if(screen==='history'||screen==='settings')switchScreen('home')}
  function bindEvents(){
    document.querySelectorAll('.vehicle-tile').forEach(b=>b.addEventListener('click',()=>chooseVehicle(b.dataset.vehicle)));
    $('settingsButton').addEventListener('click',()=>switchScreen('settings'));
    $('historyButton').addEventListener('click',()=>switchScreen('history'));
    $('backButton').addEventListener('click',goBack);
    $('refreshLocation').addEventListener('click',refreshGps);
    $('startTrip').addEventListener('click',startTrip);
    $('endTrip').addEventListener('click',endTrip);
    $('fairButton').addEventListener('click',()=>selectRating('fair'));
    $('paidAmount').addEventListener('focus',()=>selectRating('different'));
    $('paidAmount').addEventListener('input',()=>selectRating('different'));
    $('submitRating').addEventListener('click',submitRating);
    $('thanksOkay').addEventListener('click',closeThanks);
    $('savePrices').addEventListener('click',savePrices);
    $('resetPrices').addEventListener('click',resetPrices);
    $('clearHistory').addEventListener('click',clearHistory);
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!$('modalOverlay').classList.contains('hidden'))$('modalOverlay').classList.add('hidden');else goBack()}});
    window.addEventListener('pagehide',()=>{if(activeTrip)store(KEYS.active,activeTrip)});
    document.addEventListener('visibilitychange',()=>{
      if(!document.hidden && activeTrip){toast('للدقة خلي التطبيق مفتوحًا؛ المسافة وقت إغلاقه ممكن ما تتحسبش');refreshLocation()}
    });
  }
  function boot(){
    bindEvents();renderRates();switchScreen(screen);
    // Use a continuous high-accuracy position watch. Never simulate distance from a clock.
    startGps();
    setInterval(()=>{
      if(activeTrip){refreshMeter();if(Math.floor(Date.now()/10000)!==Math.floor((Date.now()-1000)/10000))store(KEYS.active,activeTrip)}
      if(screen==='home')refreshLocation();
    },1000);
    setTimeout(()=>{
      const s=$('splash');s.classList.add('is-gone');setTimeout(()=>s.classList.add('hidden'),450);
    },850);
  }
  boot();
})();
