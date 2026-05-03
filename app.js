// India Weather Live — Enhanced App
// Uses Open-Meteo Free API (CORS-enabled, no key needed)

const WEATHER_DESC={0:"Clear Sky",1:"Mainly Clear",2:"Partly Cloudy",3:"Overcast",45:"Foggy",48:"Rime Fog",51:"Light Drizzle",53:"Moderate Drizzle",55:"Dense Drizzle",56:"Freezing Drizzle",57:"Dense Freezing Drizzle",61:"Slight Rain",63:"Moderate Rain",65:"Heavy Rain",66:"Freezing Rain",67:"Heavy Freezing Rain",71:"Slight Snow",73:"Moderate Snow",75:"Heavy Snow",77:"Snow Grains",80:"Light Showers",81:"Moderate Showers",82:"Violent Showers",85:"Light Snow Showers",86:"Heavy Snow Showers",95:"Thunderstorm",96:"Thunderstorm + Hail",99:"Severe Thunderstorm"};
function weatherIcon(c){if(c===0)return"☀️";if(c<=2)return"🌤️";if(c===3)return"☁️";if(c<=48)return"🌫️";if(c<=57)return"🌧️";if(c<=67)return"🌧️";if(c<=77)return"❄️";if(c<=82)return"🌦️";if(c<=86)return"🌨️";if(c>=95)return"⛈️";return"🌡️";}

// State
let allData=[],activeRegion='all',searchQuery='',sortBy='name',useFahrenheit=false,showFavsOnly=false;
let favorites=JSON.parse(localStorage.getItem('wx-favs')||'[]');

// DOM
const $=id=>document.getElementById(id);
const grid=$('weather-grid'),loadSec=$('loading-section'),wxSec=$('weather-section');
const searchIn=$('search-input'),clearBtn=$('clear-search');
const sortSel=$('sort-select'),refreshBtn=$('refresh-btn');
const overlay=$('modal-overlay'),modalC=$('modal-content');
const pBar=$('progress-bar'),loadStat=$('loading-status');
const resCnt=$('results-count'),noRes=$('no-results');
const filterBtns=document.querySelectorAll('.filter-btn');
const unitToggle=$('unit-toggle'),favToggle=$('fav-toggle');
const toastBox=$('toast-container');

// Helpers
function tempClass(t){if(t>=45)return'tx';if(t>=38)return'th';if(t>=30)return'tw';if(t>=22)return'tp';if(t>=15)return'tc';if(t>=5)return'tco';return'tf';}
function toF(c){return Math.round(c*9/5+32);}
function dispTemp(c){return useFahrenheit?toF(c)+'°F':c+'°C';}
function dispTempShort(c){return useFahrenheit?toF(c)+'°':c+'°';}
function windDir(d){const dirs=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];return dirs[Math.round(d/22.5)%16];}
function fmtTime(s){if(!s)return'--';return new Date(s).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true});}
function isFav(name){return favorites.includes(name);}
function toggleFav(name){if(isFav(name))favorites=favorites.filter(f=>f!==name);else favorites.push(name);localStorage.setItem('wx-favs',JSON.stringify(favorites));renderCards();}
function toast(msg,icon='✅'){const t=document.createElement('div');t.className='toast';t.innerHTML=`<span>${icon}</span> ${msg}`;toastBox.appendChild(t);setTimeout(()=>t.remove(),3200);}
let debounceTimer;function debounce(fn,ms){return(...a)=>{clearTimeout(debounceTimer);debounceTimer=setTimeout(()=>fn(...a),ms);};}
const DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// Paper Plane Cursor
(function initCursor(){
  const plane=$('cursor-plane'),trail=$('cursor-trail');
  if(!plane||!trail)return;
  if('ontouchstart' in window){document.body.style.cursor='auto';return;}
  document.body.style.cursor='none';
  let mx=0,my=0,tx=0,ty=0,prevX=0,prevY=0;
  document.addEventListener('mousemove',e=>{mx=e.clientX;my=e.clientY;
    const dx=mx-prevX,dy=my-prevY;
    const angle=Math.atan2(dy,dx)*180/Math.PI;
    plane.style.transform=`translate(-50%,-50%) rotate(${angle+45}deg)`;
    prevX=mx;prevY=my;
  });
  document.addEventListener('mousedown',()=>plane.classList.add('clicking'));
  document.addEventListener('mouseup',()=>plane.classList.remove('clicking'));
  const interactives='a,button,.weather-card,.filter-btn,.summary-card,select,input';
  document.addEventListener('mouseover',e=>{if(e.target.closest(interactives)){plane.classList.add('hovering');trail.classList.add('hovering');}});
  document.addEventListener('mouseout',e=>{if(e.target.closest(interactives)){plane.classList.remove('hovering');trail.classList.remove('hovering');}});
  function animateCursor(){
    tx+=(mx-tx)*.15;ty+=(my-ty)*.15;
    plane.style.left=mx+'px';plane.style.top=my+'px';
    trail.style.left=tx+'px';trail.style.top=ty+'px';
    trail.style.transform=`translate(-50%,-50%)`;
    requestAnimationFrame(animateCursor);
  }
  animateCursor();
})();

// Fetch Weather
async function fetchAll(){
  loadSec.classList.remove('hidden');wxSec.classList.remove('visible');
  pBar.style.width='5%';loadStat.textContent='Connecting to Open-Meteo...';
  const results=[];const batchSize=15;const total=CITIES.length;
  for(let i=0;i<total;i+=batchSize){
    const batch=CITIES.slice(i,i+batchSize);
    const lats=batch.map(c=>c.lat).join(',');
    const lons=batch.map(c=>c.lon).join(',');
    loadStat.textContent=`Fetching ${Math.min(i+batchSize,total)}/${total} cities...`;
    pBar.style.width=`${Math.round(((i+batchSize)/total)*90)}%`;
    try{
      const url=`https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,cloud_cover,uv_index,dew_point_2m,visibility&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset,weather_code,precipitation_sum&hourly=temperature_2m,weather_code&timezone=Asia/Kolkata&forecast_days=7`;
      const res=await fetch(url);const json=await res.json();
      const dataArr=Array.isArray(json)?json:[json];
      dataArr.forEach((d,j)=>{
        const city=batch[j];if(!d||!d.current)return;
        results.push({
          city:city.name,state:city.state,region:city.region,lat:city.lat,lon:city.lon,
          cur:{temp:d.current.temperature_2m,feels:d.current.apparent_temperature,hum:d.current.relative_humidity_2m,precip:d.current.precipitation,code:d.current.weather_code,desc:WEATHER_DESC[d.current.weather_code]||'Unknown',icon:weatherIcon(d.current.weather_code),wind:d.current.wind_speed_10m,windDir:d.current.wind_direction_10m,pressure:d.current.surface_pressure,clouds:d.current.cloud_cover,uv:d.current.uv_index,dew:d.current.dew_point_2m,vis:d.current.visibility},
          daily:{max:d.daily.temperature_2m_max,min:d.daily.temperature_2m_min,rise:d.daily.sunrise,set:d.daily.sunset,codes:d.daily.weather_code,precip:d.daily.precipitation_sum},
          hourly:{temps:d.hourly.temperature_2m,codes:d.hourly.weather_code}
        });
      });
    }catch(e){console.error('Batch error:',e);}
  }
  allData=results;pBar.style.width='100%';loadStat.textContent='Done!';
  $('city-count').textContent=allData.length;
  $('last-updated').textContent=new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true});
  updateSummary();renderCards();
  setTimeout(()=>{loadSec.classList.add('hidden');wxSec.classList.add('visible');},400);
  toast(`Weather updated for ${allData.length} cities`,'🌤️');
}

// Summary
function updateSummary(){
  if(!allData.length)return;
  const hot=allData.reduce((a,b)=>a.cur.temp>b.cur.temp?a:b);
  const cold=allData.reduce((a,b)=>a.cur.temp<b.cur.temp?a:b);
  const hum=allData.reduce((a,b)=>a.cur.hum>b.cur.hum?a:b);
  const win=allData.reduce((a,b)=>a.cur.wind>b.cur.wind?a:b);
  $('hottest-city').textContent=`${hot.city} · ${dispTemp(hot.cur.temp)}`;
  $('coldest-city').textContent=`${cold.city} · ${dispTemp(cold.cur.temp)}`;
  $('humid-city').textContent=`${hum.city} · ${hum.cur.hum}%`;
  $('windy-city').textContent=`${win.city} · ${win.cur.wind} km/h`;
}

// Filter + Sort
function filtered(){
  let d=[...allData];
  if(activeRegion!=='all')d=d.filter(x=>x.region===activeRegion);
  if(showFavsOnly)d=d.filter(x=>isFav(x.city));
  if(searchQuery){const q=searchQuery.toLowerCase();d=d.filter(x=>x.city.toLowerCase().includes(q)||x.state.toLowerCase().includes(q));}
  // Pin favorites to top
  d.sort((a,b)=>{const fa=isFav(a.city)?0:1,fb=isFav(b.city)?0:1;if(fa!==fb)return fa-fb;
    switch(sortBy){case'temp-high':return b.cur.temp-a.cur.temp;case'temp-low':return a.cur.temp-b.cur.temp;case'humidity':return b.cur.hum-a.cur.hum;case'wind':return b.cur.wind-a.cur.wind;default:return a.city.localeCompare(b.city);}
  });
  return d;
}

// Render Cards
function renderCards(){
  const data=filtered();grid.innerHTML='';
  if(!data.length){noRes.style.display='block';resCnt.textContent='No cities found';return;}
  noRes.style.display='none';
  resCnt.textContent=`Showing ${data.length} ${data.length===1?'city':'cities'}`;
  data.forEach((it,i)=>{
    const c=document.createElement('div');
    c.className='weather-card'+(isFav(it.city)?' favorited':'');
    c.style.animationDelay=`${i*.03}s`;
    c.innerHTML=`
      <div class="ch">
        <div><div class="cn-wrap"><div class="cn">${it.city}</div><button class="fav-star ${isFav(it.city)?'active':''}" data-city="${it.city}" onclick="event.stopPropagation();toggleFav('${it.city.replace(/'/g,"\\'")}')">${isFav(it.city)?'⭐':'☆'}</button></div><div class="cs">${it.state}</div></div>
        <span class="cr">${it.region}</span>
      </div>
      <div class="cm">
        <span class="ci-icon">${it.cur.icon}</span>
        <div>
          <div class="ct ${tempClass(it.cur.temp)}">${useFahrenheit?toF(it.cur.temp):it.cur.temp}<span class="cu">${useFahrenheit?'°F':'°C'}</span></div>
          <div class="cd">${it.cur.desc}</div>
        </div>
      </div>
      <div class="cdet">
        <div class="cdi"><span class="cdl">Humidity</span><span class="cdv">${it.cur.hum}%</span></div>
        <div class="cdi"><span class="cdl">Wind</span><span class="cdv">${it.cur.wind} km/h</span></div>
        <div class="cdi"><span class="cdl">Feels Like</span><span class="cdv ${tempClass(it.cur.feels)}">${dispTempShort(it.cur.feels)}</span></div>
      </div>`;
    c.onclick=()=>openModal(it);
    grid.appendChild(c);
  });
}

// Modal
function openModal(it){
  // Hourly — next 24h
  const now=new Date();const curHour=now.getHours();
  let hourlyHTML='<div class="hourly-strip"><div class="hourly-row">';
  for(let h=curHour;h<curHour+24&&h<it.hourly.temps.length;h++){
    const hr=h%24;const label=hr===curHour?'Now':(hr===0?'12 AM':hr<12?hr+' AM':hr===12?'12 PM':(hr-12)+' PM');
    hourlyHTML+=`<div class="hourly-item"><div class="hi-time">${label}</div><div class="hi-icon">${weatherIcon(it.hourly.codes[h]||0)}</div><div class="hi-temp">${dispTempShort(it.hourly.temps[h])}</div></div>`;
  }
  hourlyHTML+='</div></div>';

  // Weekly
  let weeklyHTML='<div class="weekly-forecast"><div class="weekly-title">7-Day Forecast</div>';
  const allMin=Math.min(...it.daily.min),allMax=Math.max(...it.daily.max);
  for(let d=0;d<7&&d<it.daily.max.length;d++){
    const dt=new Date();dt.setDate(dt.getDate()+d);
    const dayName=d===0?'Today':DAYS[dt.getDay()];
    const pct=allMax>allMin?((it.daily.max[d]-allMin)/(allMax-allMin))*100:50;
    weeklyHTML+=`<div class="weekly-row"><span class="wd-day">${dayName}</span><span class="wd-icon">${weatherIcon(it.daily.codes[d]||0)}</span><div class="wd-bar"><div class="wd-fill" style="width:${pct}%"></div></div><div class="wd-temps"><span class="wd-lo">${dispTempShort(it.daily.min[d])}</span><span class="wd-hi">${dispTempShort(it.daily.max[d])}</span></div></div>`;
  }
  weeklyHTML+='</div>';

  modalC.innerHTML=`
    <div class="mh"><div class="mci">${it.city}</div><div class="mst">${it.state} · ${it.region} India</div></div>
    <div class="mm"><span class="mico">${it.cur.icon}</span><div><div class="mt ${tempClass(it.cur.temp)}">${dispTempShort(it.cur.temp)}</div><div class="mde">${it.cur.desc}</div><div class="mfl">Feels like ${dispTemp(it.cur.feels)}</div></div></div>
    ${hourlyHTML}${weeklyHTML}
    <div class="mg">
      <div class="md"><div class="mdi">💧</div><div class="mdl">Humidity</div><div class="mdv">${it.cur.hum}%</div></div>
      <div class="md"><div class="mdi">💨</div><div class="mdl">Wind</div><div class="mdv">${it.cur.wind} km/h ${windDir(it.cur.windDir)}</div></div>
      <div class="md"><div class="mdi">🌡️</div><div class="mdl">High / Low</div><div class="mdv">${dispTempShort(it.daily.max[0])} / ${dispTempShort(it.daily.min[0])}</div></div>
      <div class="md"><div class="mdi">🌧️</div><div class="mdl">Precipitation</div><div class="mdv">${it.cur.precip} mm</div></div>
      <div class="md"><div class="mdi">📊</div><div class="mdl">Pressure</div><div class="mdv">${it.cur.pressure} hPa</div></div>
      <div class="md"><div class="mdi">☀️</div><div class="mdl">UV Index</div><div class="mdv">${it.cur.uv!=null?it.cur.uv:'--'}</div></div>
      <div class="md"><div class="mdi">☁️</div><div class="mdl">Cloud Cover</div><div class="mdv">${it.cur.clouds!=null?it.cur.clouds+'%':'--'}</div></div>
      <div class="md"><div class="mdi">👁️</div><div class="mdl">Visibility</div><div class="mdv">${it.cur.vis!=null?(it.cur.vis/1000).toFixed(1)+' km':'--'}</div></div>
      <div class="md"><div class="mdi">🌅</div><div class="mdl">Sunrise / Sunset</div><div class="mdv" style="font-size:.82rem">${fmtTime(it.daily.rise[0])} / ${fmtTime(it.daily.set[0])}</div></div>
      <div class="md"><div class="mdi">💦</div><div class="mdl">Dew Point</div><div class="mdv">${it.cur.dew!=null?dispTemp(it.cur.dew):'--'}</div></div>
    </div>`;
  overlay.classList.add('active');document.body.style.overflow='hidden';
}
function closeModal(){overlay.classList.remove('active');document.body.style.overflow='';}

// Events
const debouncedRender=debounce(renderCards,200);
searchIn.addEventListener('input',e=>{searchQuery=e.target.value;clearBtn.classList.toggle('visible',searchQuery.length>0);debouncedRender();});
clearBtn.addEventListener('click',()=>{searchIn.value='';searchQuery='';clearBtn.classList.remove('visible');renderCards();searchIn.focus();});
filterBtns.forEach(b=>b.addEventListener('click',()=>{filterBtns.forEach(x=>x.classList.remove('active'));b.classList.add('active');activeRegion=b.dataset.region;renderCards();}));
sortSel.addEventListener('change',e=>{sortBy=e.target.value;renderCards();});
refreshBtn.addEventListener('click',()=>{refreshBtn.classList.add('spinning');fetchAll().finally(()=>setTimeout(()=>refreshBtn.classList.remove('spinning'),1000));});
$('modal-close').addEventListener('click',closeModal);
overlay.addEventListener('click',e=>{if(e.target===overlay)closeModal();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();if(e.key==='/'&&document.activeElement!==searchIn){e.preventDefault();searchIn.focus();}});
unitToggle.addEventListener('click',()=>{useFahrenheit=!useFahrenheit;$('unit-c').classList.toggle('active-unit',!useFahrenheit);$('unit-f').classList.toggle('active-unit',useFahrenheit);updateSummary();renderCards();if(overlay.classList.contains('active')){/* reopen same modal */}});
favToggle.addEventListener('click',()=>{showFavsOnly=!showFavsOnly;favToggle.classList.toggle('active',showFavsOnly);renderCards();});

// Auto-refresh every 10 minutes
setInterval(()=>{fetchAll();},600000);

// Init
fetchAll();
