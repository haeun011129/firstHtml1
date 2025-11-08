// ========= 공통 유틸 =========
function csvToMatrix(text){
  text = String(text||'').replace(/^\uFEFF/,''); // BOM 제거
  const rows=[], len=text.length; let row=[], cell='', q=false;
  for(let i=0;i<len;i++){
    const ch=text[i], nx=text[i+1];
    if(q){
      if(ch==='"' && nx==='"'){ cell+='"'; i++; }
      else if(ch === '"'){ q=false; }
      else cell+=ch;
    }else{
      if(ch === '"'){ q=true; }
      else if(ch === ','){ row.push(cell); cell=''; }
      else if(ch === '\n'){ row.push(cell); rows.push(row); row=[]; cell=''; }
      else if(ch === '\r'){ /* skip */ }
      else cell+=ch;
    }
  }
  if(cell.length || row.length){ row.push(cell); rows.push(row); }
  return rows.filter(r=>r.some(c=>String(c).trim()!==''));
}
const toNum=v=>{ if(v==null) return NaN; const n=Number(String(v).replace(/[, ]/g,'')); return isFinite(n)?n:NaN; };
function findIdx(header, keys, fb=null){
  const low=(header||[]).map(h=>(h??'').toString().toLowerCase().trim());
  for(const k of keys){ const i=low.findIndex(h=>h.includes(k.toLowerCase())); if(i!==-1) return i; }
  return fb;
}
function renderTable(theadId, tbodyId, matrix, max=4000){
  if(!matrix || !matrix.length) return;
  const thead=document.getElementById(theadId), tbody=document.getElementById(tbodyId);
  const header=matrix[0];
  thead.innerHTML = `<tr>${header.map(h=>`<th>${h||''}</th>`).join('')}</tr>`;
  const body=matrix.slice(1,1+max);
  tbody.innerHTML = body.map(r=>`<tr>${header.map((_,i)=>`<td>${(r[i]??'')}</td>`).join('')}</tr>`).join('');
}

// ========= 네비/UI =========
function initCircleNavigation(){
  const buttons=document.querySelectorAll('.circle-btn');
  const pages=document.querySelectorAll('.page');
  buttons.forEach(btn=>{
    btn.addEventListener('click',()=>{
      const t=btn.getAttribute('data-target');
      pages.forEach(p=>p.classList.remove('visible'));
      document.getElementById(t).classList.add('visible');
      window.scrollTo({top:document.querySelector('.topbar').offsetHeight, behavior:'smooth'});
    });
  });
  const lo=document.getElementById('logoutBtn');
  if(lo) lo.addEventListener('click',()=>{ localStorage.removeItem('loggedInUser'); location.href='login.html'; });
}
function initTabs(){
  const btns=document.querySelectorAll('.tab-btn');
  const pages=document.querySelectorAll('.tab-page');
  btns.forEach(btn=>{
    btn.addEventListener('click',()=>{
      btns.forEach(b=>b.classList.remove('active')); btn.classList.add('active');
      pages.forEach(p=>p.classList.remove('visible'));
      document.getElementById(btn.getAttribute('data-target')).classList.add('visible');
    });
  });
  if(btns.length) btns[0].classList.add('active');
}
function showLoginToastIfNeeded(){
  const flag=localStorage.getItem('showLoginToast')==='1';
  if(!flag) return;
  const toast=document.getElementById('toast'); if(!toast) return;
  toast.classList.add('show'); setTimeout(()=>{toast.classList.remove('show'); localStorage.removeItem('showLoginToast');},5000);
}

// ========= 데이터 소스 (세 가지 중 하나 사용) =========
// ① 서버에서 fetch('이올스왑.csv') / ② 파일 업로드로 matrixET/IPA 설정 / ③ 내장형 <script type="text/plain">
let matrixET=null, matrixIPA=null;

// (옵션) 파일 업로드 모드 사용 시 연결
function initServerlessInputs(){
  const et=document.getElementById('fileET');
  const ipa=document.getElementById('fileIPA');
  if(et) et.addEventListener('change', e => readCSVFile(e.target.files[0], 'ET'));
  if(ipa) ipa.addEventListener('change', e => readCSVFile(e.target.files[0], 'IPA'));
}
function readCSVFile(file, type){
  if(!file) return;
  const fr=new FileReader();
  fr.onload=()=>{
    const m=csvToMatrix(String(fr.result));
    if(type==='ET'){ matrixET=m; renderTable('et-head','et-body',m); }
    else { matrixIPA=m; renderTable('ipa-head','ipa-body',m); }
    computeAll(); // 데이터 들어오면 계산
  };
  fr.readAsText(file, 'utf-8');
}

// ========= 파싱 & 집계 =========
function extractRecords(matrix){
  // 헤더 인식: 월/일/날짜/생산/로스(불량)
  if(!matrix || !matrix.length) return {header:[], recs:[]};
  const h = matrix[0];
  const idxM = findIdx(h, ['월','month'], 1);
  const idxD = findIdx(h, ['일','day'], null);
  const idxDate = findIdx(h, ['날짜','date','일자'], null);
  const idxP = findIdx(h, ['생산량','생산','production','prod'], 14);
  const idxL = findIdx(h, ['로스','불량','loss','defect','ng'], null);

  const recs=[];
  for(let i=1;i<matrix.length;i++){
    const r=matrix[i];
    // 월/일 추출
    let month = toNum(r[idxM]);
    let day = idxD!=null ? toNum(r[idxD]) : NaN;
    let dateStr = idxDate!=null ? String(r[idxDate]).trim() : '';

    if(!isFinite(month) && dateStr){ // 날짜에서 월/일 파싱
      // yyyy-mm-dd or yyyy/m/d or m/d
      const m = dateStr.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/) || dateStr.match(/(\d{1,2})[.\-\/](\d{1,2})/);
      if(m){
        if(m.length===4){ month = Number(m[2]); day = Number(m[3]); }
        else if(m.length===3){ month = Number(m[1]); day = Number(m[2]); }
      }
    }
    const prod = toNum(r[idxP]);
    const loss = idxL==null ? NaN : toNum(r[idxL]);
    if(!isFinite(month) || !isFinite(prod)) continue;
    const lossVal = isFinite(loss) ? loss : 0;
    const good = prod - lossVal;
    const rate = prod>0 ? (lossVal/prod*100) : 0;
    // 날짜 문자열 만들기
    const label = dateStr || (isFinite(day) ? `${month}/${day}` : `${month}월`);
    recs.push({month, day:isFinite(day)?day:null, date:label, prod, loss:lossVal, good, rate});
  }
  return {header:h, recs};
}

function groupMonthly(recs){
  const by={};
  recs.forEach(o=>{
    const m=o.month;
    if(!by[m]) by[m]={prod:0, loss:0};
    by[m].prod += o.prod;
    by[m].loss += o.loss;
  });
  const months = Object.keys(by).map(n=>Number(n)).sort((a,b)=>a-b);
  return months.map(m=>{
    const prod=by[m].prod, loss=by[m].loss, rate = prod>0 ? loss/prod*100 : 0;
    return {month:m, prod, loss, rate};
  });
}
function groupDailyByMonth(recs){
  // { [month]: [{date, prod, loss, good, rate}] }
  const map={};
  recs.forEach(o=>{
    if(!map[o.month]) map[o.month]=[];
    map[o.month].push(o);
  });
  // 날짜 정렬(가능하면 day로)
  Object.keys(map).forEach(m=>{
    map[m].sort((a,b)=>{
      if(a.day!=null && b.day!=null) return a.day-b.day;
      return String(a.date).localeCompare(String(b.date));
    });
  });
  return map;
}

// ========= 렌더 & 드릴다운 =========
function renderMonthlyAndDrilldown(agg, dailyMap){
  // 누적 생산(월별)
  const tbCur = document.getElementById('current-agg-body');
  tbCur.innerHTML = agg.map(o=>`
    <tr data-month="${o.month}">
      <td>${o.month}</td>
      <td>${Math.round(o.prod).toLocaleString()}</td>
      <td>${Math.round(o.loss).toLocaleString()}</td>
      <td>${o.rate.toFixed(2)}%</td>
    </tr>`).join('');

  // 불량률(월별)
  const tbDef = document.getElementById('defect-agg-body');
  tbDef.innerHTML = agg.map(o=>`
    <tr data-month="${o.month}">
      <td>${o.month}</td>
      <td>${Math.round(o.loss).toLocaleString()}</td>
      <td>${Math.round(o.loss*0.50).toLocaleString()}</td>
      <td>${Math.round(o.loss*0.30).toLocaleString()}</td>
      <td>${Math.max(0, Math.round(o.loss - Math.round(o.loss*0.50) - Math.round(o.loss*0.30))).toLocaleString()}</td>
      <td>${o.rate.toFixed(2)}%</td>
    </tr>`).join('');

  // 클릭 드릴다운: 누적 생산 → 일별(생산/양품/불량/불량률)
  tbCur.querySelectorAll('tr[data-month]').forEach(tr=>{
    tr.addEventListener('click', ()=>{
      const m=tr.getAttribute('data-month');
      const rows=dailyMap[m]||[];
      document.getElementById('current-daily-title').style.display='block';
      document.getElementById('current-daily-wrap').style.display='block';
      document.getElementById('current-daily-help').style.display='block';
      document.getElementById('current-daily-title').textContent=`${m}월 일별 상세`;
      const tbody=document.getElementById('current-daily-body');
      tbody.innerHTML = rows.map(o=>`
        <tr>
          <td>${o.date}</td>
          <td>${Math.round(o.prod).toLocaleString()}</td>
          <td>${Math.round(o.good).toLocaleString()}</td>
          <td>${Math.round(o.loss).toLocaleString()}</td>
          <td>${o.rate.toFixed(2)}%</td>
        </tr>`).join('');
      // 상단 원형 버튼도 최신 월 값으로 갱신(선택)
      const last = agg[agg.length-1];
      if(last){
        const bc=document.getElementById('badge-current');
        if(bc) bc.textContent = Math.round(last.prod).toLocaleString();
      }
    });
  });

  // 클릭 드릴다운: 불량률 → 일별(불량/생산/불량률)
  tbDef.querySelectorAll('tr[data-month]').forEach(tr=>{
    tr.addEventListener('click', ()=>{
      const m=tr.getAttribute('data-month');
      const rows=dailyMap[m]||[];
      document.getElementById('defect-daily-title').style.display='block';
      document.getElementById('defect-daily-wrap').style.display='block';
      document.getElementById('defect-daily-help').style.display='block';
      document.getElementById('defect-daily-title').textContent=`${m}월 일별 불량 상세`;
      const tbody=document.getElementById('defect-daily-body');
      tbody.innerHTML = rows.map(o=>`
        <tr>
          <td>${o.date}</td>
          <td>${Math.round(o.prod).toLocaleString()}</td>
          <td>${Math.round(o.loss).toLocaleString()}</td>
          <td>${o.rate.toFixed(2)}%</td>
        </tr>`).join('');
      // 상단 불량률 배지도 최신 월 기준으로
      const last = agg[agg.length-1];
      if(last){
        const bd=document.getElementById('badge-defect');
        if(bd) bd.textContent = `${last.rate.toFixed(2)}%`;
      }
    });
  });
}

// ========= 메인 계산 =========
function computeAll(){
  // 1) 데이터 소스 구성
  // (A) 내장형 <script type="text/plain"> 가 있으면 읽기
  if(!matrixET && document.getElementById('csv-et')){
    const t=document.getElementById('csv-et').textContent||'';
    if(t.trim()) matrixET = csvToMatrix(t);
  }
  if(!matrixIPA && document.getElementById('csv-ipa')){
    const t=document.getElementById('csv-ipa').textContent||'';
    if(t.trim()) matrixIPA = csvToMatrix(t);
  }

  // (B) 서버 환경이면 fetch로도 가능 (원하면 주석 해제)
  // if(!matrixET)  fetch('이올스왑.csv').then(r=>r.text()).then(tx=>{matrixET=csvToMatrix(tx); renderTable('et-head','et-body',matrixET); proceed();});
  // if(!matrixIPA) fetch('알콜스왑.csv').then(r=>r.text()).then(tx=>{matrixIPA=csvToMatrix(tx); renderTable('ipa-head','ipa-body',matrixIPA); proceed();});

  // 원본표(있으면 렌더)
  if(matrixET)  renderTable('et-head','et-body', matrixET);
  if(matrixIPA) renderTable('ipa-head','ipa-body', matrixIPA);

  proceed(); // 바로 계산
  function proceed(){
    if(!matrixET && !matrixIPA) return;

    // 2) 레코드 추출
    const {recs:etRecs}  = extractRecords(matrixET);
    const {recs:ipaRecs} = extractRecords(matrixIPA);
    const all = [...etRecs, ...ipaRecs];

    // 3) 월별 표(목표/월표도 업데이트)
    const monthly = groupMonthly(all);
    const months = monthly.map(o=>({월:o.month, 생산량:o.prod}));
    document.getElementById('monthly-table').innerHTML =
      months.sort((a,b)=>a.월-b.월).map(o=>`<tr><td>${o.월}</td><td>${Math.round(o.생산량).toLocaleString()}</td></tr>`).join('');
    if(monthly.length){
      const last3 = monthly.slice(-3).map(o=>o.prod);
      const avg = Math.round(last3.reduce((a,c)=>a+c,0)/Math.max(1,last3.length));
      const target = Math.round(avg*1.03);
      const goalBig=document.getElementById('goal-big');
      const badgeGoal=document.getElementById('badge-goal');
      if(goalBig) goalBig.textContent = target.toLocaleString();
      if(badgeGoal) badgeGoal.textContent = target.toLocaleString();
      const bc=document.getElementById('badge-current');
      const bd=document.getElementById('badge-defect');
      if(bc) bc.textContent = Math.round(monthly[monthly.length-1].prod).toLocaleString();
      if(bd) bd.textContent = `${monthly[monthly.length-1].rate.toFixed(2)}%`;
    }

    // 4) 일별 맵 & 렌더
    const dailyMap = groupDailyByMonth(all);
    renderMonthlyAndDrilldown(monthly, dailyMap);
  }
}

// ========= 진입점 =========
if (document.querySelector('.topbar')) {
  // 접근 보호
  if(localStorage.getItem('loggedInUser')!=='hlbhc11'){ location.href='login.html'; }
  initCircleNavigation();
  initTabs();
  showLoginToastIfNeeded();
  // (필요 시) 업로드 방식도 병행 가능
  if(document.getElementById('fileET') || document.getElementById('fileIPA')) initServerlessInputs();
  computeAll();
}
