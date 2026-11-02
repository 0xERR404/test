'use strict';
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const icons = {
  alert:'<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3v.1"/>',
  user:'<circle cx="12" cy="7" r="4"/><path d="M4 21v-3a8 8 0 0 1 16 0v3"/>',
  users:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m3 11v-3a6 6 0 0 0-3-5"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  map:'<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16"/>',
  activity:'<path d="M2 12h4l3-8 6 16 3-8h4"/>',
  list:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8m-8 4h8m-8 4h5"/>',
  chart:'<path d="M3 3v18h18M7 16v-5m5 5V6m5 10V9"/>',
  settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
  building:'<rect x="5" y="3" width="14" height="18"/><path d="M9 7h1m4 0h1m-6 4h1m4 0h1m-5 10v-6h4v6"/>',
  shield:'<path d="m12 3 9 4v6c0 4-9 9-9 9s-9-5-9-9V7l9-4Z"/>',
  warehouse:'<path d="m3 9 9-6 9 6v12H3V9Zm0 0h18M7 21V13h10v8M7 17h10"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  chevron:'<path d="m9 5 7 7-7 7"/>',
  plus:'<path d="M12 4v16M4 12h16"/>', minus:'<path d="M4 12h16"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  check:'<path d="m4 12 5 5L20 6"/>',
  search:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
  card:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  door:'<path d="M4 21h16M7 21V3h10v18m-4-10v2"/>',
  offline:'<path d="m3 3 18 18M8 5a13 13 0 0 1 13 4M3 9l2-2m1 6a9 9 0 0 1 5-2m5 1 2 1m-9 4a5 5 0 0 1 6 0M12 21h.1"/>',
  play:'<path d="m7 3 14 9-14 9V3Z"/>',
  north:'<path d="m12 2 7 19-7-5-7 5 7-19Z"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};
function icon(name){return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.door}</svg>`;}
function paintIcons(){ $$('[data-icon]').forEach(el => {el.innerHTML = icon(el.dataset.icon);el.removeAttribute('data-icon');}); }
const esc = v => String(v ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtTime = v => new Date(v).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
const initials = name => name.split(' ').slice(0,2).map(n=>n[0]).join('');
const pointName = id => state?.points.find(p=>p.id===id)?.name || id;
const statusName = p => p.status==='offline'?'Нет связи':p.mode==='blocked'?'Заблокировано':p.status==='warning'?'Долго открыто':'Штатный режим';
const pointTone = p => p.status==='offline'?'muted':p.mode==='blocked'?'purple':p.status==='warning'?'warn':'ok';
const resultIcon = tone => ({ok:'check',danger:'close',warn:'alert',muted:'offline',blue:'arrow'}[tone] || 'check');
let state=null, csrf='', tab='hub', zone='Вся площадка', zoom=1, connected=true, busy=false, renderedRevision=0;
let peopleFilter={q:'',kind:'Все',onsite:false}, journalFilter={q:'',tone:'Все',point:'Все',date:''};
let monitorProblems=false, dialogMeta={}, dirty=false, discardArmed=false, toastTimer, simulationTimer, lastFocus;
let savedTheme='dark', savedDensity='compact';
try { savedTheme=localStorage.getItem('skud-theme')||'dark';savedDensity=localStorage.getItem('skud-density')||'compact'; } catch {}
document.documentElement.dataset.theme=savedTheme;
document.documentElement.dataset.density=savedDensity;

async function api(path,data){
  const response=await fetch(path,{method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:data===undefined?undefined:JSON.stringify(data),cache:'no-store'});
  const body=await response.json();
  if(!response.ok){if(response.status===401 && path!=='/api/login') showLogin(Boolean(state));throw new Error(body.error||'Ошибка сервера');}
  return body;
}
function toast(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,5000);}
function setConnection(ok){connected=ok;$('#connection').innerHTML=`<i class="dot ${ok?'ok':'danger'}"></i>${ok?'Сервер подключён':'Нет связи'}`;$('#offline-banner').hidden=ok;}
async function refresh(force=false){
  if(!state && !force)return;
  try{const next=await api('/api/state');const changed=renderedRevision!==next.revision;state=next;csrf=next.csrf;setConnection(true);updateChrome();const editing=document.activeElement?.matches('input,select,textarea');if(force||(changed&&!$('#dialog').open&&!editing))render();}
  catch(e){setConnection(false);if(force)throw e;}
}
function updateChrome(){
  $('#alarm-count').textContent=`${state.alarms.length} предупреждения`;
  const online=state.points.filter(p=>p.status!=='offline').length;
  $('#footer-counts').textContent=`Контроллеры ${online}/${state.points.length} · Событий в журнале: ${state.events.length}`;
  $$('.tabs button').forEach(b=>{b.classList.toggle('active',b.dataset.tab===tab);b.setAttribute('aria-current',b.dataset.tab===tab?'page':'false');});
}
function showLogin(locked=false){
  state=null;csrf='';clearInterval(simulationTimer);simulationTimer=null;
  $('#dialog').close();$('#app').hidden=true;$('#main').innerHTML='';$('#login').hidden=false;
  $('#login-title').textContent=locked?'Сеанс заблокирован':'Рабочее место охраны';
  $('#login-form').elements.password.value='';
  $('#login-form').elements.password.focus();
}
function render(){
  if(!state)return;
  renderedRevision=state.revision;
  updateChrome();
  $('#main').innerHTML=({hub:hub,monitor:monitor,people:people,journal:journal,reports:reports,settings:settings}[tab]||hub)();
}
function navigate(next){tab=next;render();}
function eventRows(events){return events.length?events.map(e=>`<tr><td class="time">${fmtTime(e.time)}</td><td>${esc(pointName(e.point))}</td><td>${esc(e.person)}</td><td class="muted">${esc(e.direction)}</td><td class="result"><span class="${e.tone}">${icon(resultIcon(e.tone))}${esc(e.result)}</span></td></tr>`).join(''):'<tr><td colspan="5" class="empty">Событий по этим условиям нет</td></tr>';}
function eventsTable(events){return `<table><thead><tr><th>Время</th><th>Точка доступа</th><th>Сотрудник / событие</th><th>Направление</th><th>Результат</th></tr></thead><tbody>${eventRows(events)}</tbody></table>`;}
function alarmList(){return state.alarms.map(a=>`<button class="alert-item" data-action="alarm" data-id="${a.id}"><span class="${a.ack?'blue':'warn'}">${icon(a.ack?'check':'alert')}</span><span><strong>${esc(pointName(a.point))}</strong><small>${esc(a.title)}</small>${a.ack?'<small class="blue">Принято · причина активна</small>':''}</span><time>${fmtTime(a.time).slice(0,5)}</time></button>`).join('');}
function hub(){
  return `<section class="hub"><aside class="zones"><h2 class="panel-heading">План объекта</h2><div class="zones-list">${[['Вся площадка','map'],['Главный корпус','building'],['Периметр','shield'],['Склад','warehouse']].map(([n,i])=>`<button class="${zone===n?'active':''}" data-zone="${n}">${icon(i)}${n}<span class="count">${n==='Вся площадка'?5:state.points.filter(p=>p.zone===n).length}</span></button>`).join('')}</div><div class="zone-foot">Объект 01<strong>Площадка Северная</strong><span>Схематический план · демо</span></div></aside><section class="plan" aria-label="План территории"><div class="plan-toolbar"><h2>${zone}</h2><span class="map-location">/ План территории</span><div class="plan-tools"><button data-action="zoom-out" aria-label="Уменьшить план">${icon('minus')}</button><button data-action="zoom-in" aria-label="Увеличить план">${icon('plus')}</button><button data-action="zoom-reset" aria-label="Сбросить масштаб" style="width:44px">${Math.round(zoom*100)}%</button></div></div><div class="map-viewport">${mapSVG()}<div class="north">${icon('north')}С</div><div class="map-legend"><span><i class="dot ok"></i>В норме</span><span><i class="dot warn"></i>Внимание</span><span><i class="dot muted"></i>Нет связи</span><span><i class="dot purple"></i>Блокировка</span></div></div></section><aside class="attention"><h2 class="panel-heading"><span>Требует внимания <span class="badge">${state.alarms.length}</span></span>${icon('chevron')}</h2>${alarmList()}<div class="occupancy">${icon('users')}<span>На объекте</span><div class="summary"><strong>${state.people.filter(p=>p.onsite).length}</strong><small>человек</small></div></div><button class="quick-action" data-action="onsite">${icon('users')}Кто на объекте<span class="end">${icon('chevron')}</span></button><button class="quick-action" data-action="guest">${icon('card')}Гостевой пропуск<span class="end">${icon('plus')}</span></button><button class="quick-action" data-action="check">${icon('search')}Проверить доступ<span class="end">${icon('chevron')}</span></button><div class="side-note">Нажмите на точку на плане,<br>чтобы открыть её карточку.</div></aside></section><section class="events-panel"><h2 class="panel-heading"><span>Последние события <span class="muted" style="font-weight:400;margin-left:10px">Сегодня</span></span><button data-tab="journal">Все события ${icon('chevron')}</button></h2><div class="table-wrap">${eventsTable(state.events.slice(0,8))}</div></section>`;
}
function mapSVG(){
  const parking=Array.from({length:13},(_,i)=>`<path d="M${330+i*18} 378v44"/>`).join('');
  return `<svg class="site-map" viewBox="0 0 1000 540" aria-label="План: главный корпус, склад, КПП, парковка"><g class="map-content" style="transform:scale(${zoom})"><path class="road" d="M80 0v372q0 32 32 32h110q35 0 35 35v55h480q22 0 22-22V326q0-35 35-35h170"/><path class="road-edge" d="M62 0v372q0 50 50 50h110q17 0 17 17v73h498q40 0 40-40V326q0-17 17-17h170M98 0v372q0 14 14 14h110q53 0 53 53v37h462q4 0 4-4V326q0-53 53-53h170"/><path class="boundary" d="M126 70h690l114 108v300H126Z"/><path class="building-inner" d="M140 84h670l106 100v280H140Z"/><path class="building" d="M260 129h131v20h210v-18h75v170H260Z"/><path class="building-inner" d="M272 143h106v19h235v-18h50v143H272Zm0 100h48v44m263 0v-32h80M320 162v125m-48-75h48m263-50v40h80"/><rect class="building" x="232" y="174" width="42" height="77"/><rect class="building-inner" x="223" y="181" width="9" height="64"/><path class="building-inner" d="M376 301v12h69v-12m125 0v12h58v-12"/><rect class="building" x="796" y="227" width="87" height="159"/><path class="building-inner" d="M807 238h65v136h-65Zm0 99h65m-65-51h65"/><path class="building" d="M142 267h47v73h-47Z"/><path class="building-inner" d="M149 274h32v58h-32"/><rect class="building-inner" x="174" y="121" width="40" height="93"/><rect class="building-inner" x="682" y="126" width="42" height="58"/><rect class="building-inner" x="734" y="126" width="42" height="58"/><rect class="building-inner" x="887" y="402" width="29" height="48"/><path class="building-inner" d="M305 360h279v79H305Z"/><g class="building-inner">${parking}<path d="M330 422h216M305 360h279M202 356h35v84h-35Zm0 18h35m-35 22h35m-35 22h35"/></g><path class="building-inner" d="M710 404h52v43h-52m0-34h52m-52 25h52"/><text class="building-number" x="458" y="208" text-anchor="middle">КОРПУС 01</text><text class="building-name" x="458" y="233" text-anchor="middle">Главный корпус</text><text class="building-name" x="839" y="325" text-anchor="middle">Склад</text><text x="441" y="457" text-anchor="middle">Парковка сотрудников</text><text x="145" y="363">КПП</text><text x="705" y="467">Въезд</text>${state.points.map(p=>`<g role="button" tabindex="0" aria-label="${p.name}: ${statusName(p)}" data-point="${p.id}" class="marker ${pointTone(p)} ${zone!=='Вся площадка'&&zone!==p.zone?'dim':''}" transform="translate(${p.x},${p.y})"><circle class="hit" r="25"/><circle class="halo" r="20"/><circle class="marker-ring" r="9"/><circle class="marker-core" r="4"/><text x="16" y="-9">${p.name}</text><text class="marker-state" x="16" y="8">${p.status==='normal'&&p.mode==='normal'?'':statusName(p)}</text></g>`).join('')}</g></svg>`;
}
function monitor(){const points=state.points.filter(p=>!monitorProblems||p.status!=='normal'||p.mode!=='normal');const latest=state.events.find(e=>e.direction!=='—');return `<section class="page"><div class="page-title"><div><h1>Мониторинг</h1><p>Состояние точек доступа и последние проходы</p></div><div class="actions"><label class="check-label"><input type="checkbox" id="problem-filter" ${monitorProblems?'checked':''}>Только проблемные</label><button class="secondary" data-action="simulate">${icon('play')}Тестовый проход</button></div></div><div class="point-grid">${points.map(p=>`<button class="point-card" data-point="${p.id}"><div class="point-head">${icon('door')}${p.name}<span class="tag ${pointTone(p)}">${statusName(p)}</span></div><p>${p.zone}</p><div class="point-bottom"><span>${p.status==='offline'?'Контроллер недоступен':'Контроллер подключён'}</span>${icon('chevron')}</div></button>`).join('')||'<p class="empty">Нет проблемных точек</p>'}</div><div class="monitor-bottom"><section class="surface"><h2 class="panel-heading">Последний проход</h2>${latest?`<div class="latest-person"><span class="avatar">${initials(latest.person)}</span><div><span class="tag ${latest.tone}">${latest.result}</span><h3>${esc(latest.person)}</h3><p>${pointName(latest.point)} · ${latest.direction} · ${fmtTime(latest.time)}</p><p>Фотография сотрудника не загружена</p></div></div>`:''}</section><section class="surface"><h2 class="panel-heading">Активные предупреждения</h2>${alarmList()}</section></div></section>`;}
function filteredPeople(){const q=peopleFilter.q.toLocaleLowerCase('ru');return state.people.filter(p=>(!q||`${p.name} ${p.department} ${p.card}`.toLocaleLowerCase('ru').includes(q))&&(peopleFilter.kind==='Все'||p.kind===peopleFilter.kind)&&(!peopleFilter.onsite||p.onsite));}
function peopleRows(){return filteredPeople().map(p=>`<tr><td><div class="cell-person"><span class="avatar">${initials(p.name)}</span><button class="name-button" data-person="${p.id}">${esc(p.name)}</button></div></td><td>${esc(p.department)}</td><td>${p.kind}</td><td>${p.group}</td><td class="muted">•••• ${esc(p.card.slice(-4))}</td><td><span class="${p.onsite?'ok':'muted'}"><i class="dot"></i>${p.onsite?'На объекте':'Вне объекта'}</span></td></tr>`).join('')||'<tr><td colspan="6" class="empty">Сотрудники не найдены. Измените условия поиска.</td></tr>';}
function people(){return `<section class="page"><div class="page-title"><div><h1>Сотрудники и гости</h1><p>Пропуска, группы доступа и присутствие на объекте</p></div><div class="actions"><button class="primary" data-action="guest">${icon('plus')}Гостевой пропуск</button></div></div><div class="toolbar"><label class="search-field">Поиск<input id="people-search" value="${esc(peopleFilter.q)}" placeholder="ФИО, подразделение или карта"></label><label>Тип пропуска<select id="people-kind">${['Все','Сотрудник','Гость'].map(k=>`<option ${peopleFilter.kind===k?'selected':''}>${k}</option>`).join('')}</select></label><label class="check-label" style="padding-bottom:8px"><input id="people-onsite" type="checkbox" ${peopleFilter.onsite?'checked':''}>Только на объекте</label></div><section class="surface" style="display:flex;flex-direction:column"><div class="table-wrap"><table><thead><tr><th>Сотрудник</th><th>Подразделение / принимающий</th><th>Тип</th><th>Группа доступа</th><th>Карта</th><th>Присутствие</th></tr></thead><tbody id="people-rows">${peopleRows()}</tbody></table></div><div class="table-summary" id="people-total">Найдено: ${filteredPeople().length} из ${state.people.length}</div></section></section>`;}
function filteredEvents(){const q=journalFilter.q.toLocaleLowerCase('ru');return state.events.filter(e=>(!q||`${e.person} ${e.result} ${e.detail}`.toLocaleLowerCase('ru').includes(q))&&(journalFilter.tone==='Все'||e.tone===journalFilter.tone)&&(journalFilter.point==='Все'||e.point===journalFilter.point)&&(!journalFilter.date||e.time.slice(0,10)===journalFilter.date));}
function journal(){return `<section class="page"><div class="page-title"><div><h1>Журнал событий</h1><p>Последние 1 000 событий локального стенда</p></div><div class="actions"><button class="secondary" data-action="export">${icon('download')}Экспорт CSV</button></div></div><div class="toolbar"><label class="search-field">Поиск<input id="journal-search" value="${esc(journalFilter.q)}" placeholder="Сотрудник, событие, комментарий"></label><label>Дата<input id="journal-date" type="date" value="${journalFilter.date}"></label><label>Точка доступа<select id="journal-point"><option value="Все">Все точки</option>${state.points.map(p=>`<option value="${p.id}" ${journalFilter.point===p.id?'selected':''}>${p.name}</option>`).join('')}</select></label><label>Результат<select id="journal-tone">${[['Все','Все результаты'],['ok','Разрешён'],['danger','Отказ'],['warn','Предупреждение'],['muted','Нет связи'],['blue','Операции']].map(([v,n])=>`<option value="${v}" ${journalFilter.tone===v?'selected':''}>${n}</option>`).join('')}</select></label><button class="text-button" data-action="reset-filters">Сбросить</button></div><section class="surface" style="display:flex;flex-direction:column"><div class="table-wrap"><table><thead><tr><th>Время</th><th>Точка доступа</th><th>Сотрудник / событие</th><th>Направление</th><th>Результат</th></tr></thead><tbody id="journal-rows">${eventRows(filteredEvents())}</tbody></table></div><div class="table-summary" id="journal-total">Найдено: ${filteredEvents().length} из ${state.events.length}</div></section></section>`;}
function reports(){const today=new Date().toLocaleDateString('sv-SE');const events=state.events.filter(e=>e.time.slice(0,10)===today);const passes=events.filter(e=>e.direction!=='—');const depts=[...new Set(state.people.map(p=>p.department))];const max=Math.max(1,...depts.map(d=>state.people.filter(p=>p.department===d&&p.onsite).length));return `<section class="page"><div class="page-title"><div><h1>Сводка за сегодня</h1><p>Рассчитано по демонстрационной базе · ${new Date().toLocaleDateString('ru-RU')}</p></div><div class="actions"><button class="secondary" data-tab="journal">Открыть журнал ${icon('arrow')}</button></div></div><div class="stat-grid">${[['На объекте',state.people.filter(p=>p.onsite).length,'blue'],['Разрешённые проходы',passes.filter(e=>e.result==='Разрешён').length,'ok'],['Отказы в доступе',passes.filter(e=>e.tone==='danger').length,'danger'],['Активные предупреждения',state.alarms.length,'warn']].map(([n,v,t])=>`<div class="stat"><small>${n}</small><strong class="${t}">${v}</strong></div>`).join('')}</div><div class="report-grid"><section class="surface"><h2 class="panel-heading">Присутствие по подразделениям</h2><div class="chart">${depts.map(d=>{const n=state.people.filter(p=>p.department===d&&p.onsite).length;return `<div class="bar-row"><span>${esc(d)}</span><div class="bar-track"><div class="bar-fill" style="width:${n/max*100}%"></div></div><strong>${n}</strong></div>`;}).join('')}</div></section><section class="surface"><h2 class="panel-heading">Состояние оборудования</h2><div class="settings-body">${state.points.map(p=>`<div class="detail-row"><span>${p.name}</span><strong class="${pointTone(p)}">${statusName(p)}</strong></div>`).join('')}</div></section></div><p class="muted">Сводка относится только к стенду. Начальное присутствие задано тестовыми данными.</p></section>`;}
function settings(){return `<section class="page"><div class="page-title"><div><h1>Параметры рабочего места</h1><p>Настройки отображения сохраняются на этом терминале</p></div></div><div class="settings-grid"><section class="surface"><h2 class="panel-heading">Интерфейс</h2><div class="settings-body"><div class="row"><span>Цветовая тема</span><div class="pill"><button data-theme-value="dark" class="${document.documentElement.dataset.theme==='dark'?'active':''}">Тёмная</button><button data-theme-value="light" class="${document.documentElement.dataset.theme==='light'?'active':''}">Светлая</button></div></div><div class="row"><label for="density">Размер элементов</label><select id="density"><option value="compact" ${savedDensity==='compact'?'selected':''}>Компактный</option><option value="touch" ${savedDensity==='touch'?'selected':''}>Сенсорный</option></select></div><div class="row"><span>Рабочее место</span><strong>Охрана · 01</strong></div><div class="row"><span>Оператор</span><strong>Петров А. С.</strong></div><p>Цвета ITN-LAB. Светлая тема сохраняет светлую навигацию и боковые панели.</p></div></section><section class="surface"><h2 class="panel-heading">Демонстрационный стенд</h2><div class="settings-body"><div class="row"><span>Генерация проходов каждые 8 с</span><button class="secondary" data-action="toggle-simulation">${simulationTimer?'Остановить':'Запустить'}</button></div><div class="row"><span>Локальная база</span><span class="ok">SQLite · подключена</span></div><div class="row"><span>Версия прототипа</span><span>0.1.0</span></div><p>Команды не управляют оборудованием. После блокировки сеанса генерация проходов останавливается.</p><p>Системные настройки Ubuntu, сеть и установка обновлений доступны администратору через отдельный канал обслуживания.</p></div></section></div></section>`;}

function setTheme(value){document.documentElement.dataset.theme=value;try{localStorage.setItem('skud-theme',value);}catch{}if(state&&tab==='settings')render();}
function openDialog(title,content,foot='',meta={},drawer=false){
  const d=$('#dialog');if(!d.open)lastFocus=document.activeElement;
  dialogMeta=meta;dirty=false;discardArmed=false;d.className=drawer?'drawer':'';
  d.innerHTML=`<div class="dialog-head"><h2 id="dialog-title">${title}</h2><button class="icon-button" data-action="close-dialog" aria-label="Закрыть">${icon('close')}</button></div>${content}${foot}`;
  if(!d.open)d.showModal();
  const first=$('input:not([type=hidden]),select,textarea',d);if(first)first.focus();
}
function closeDialog(){
  if(dirty&&!discardArmed){discardArmed=true;const err=$('.form-error',$('#dialog'));if(err)err.textContent='Есть несохранённые данные. Нажмите «Закрыть» ещё раз, чтобы их отменить.';else toast('Нажмите «Закрыть» ещё раз, чтобы отменить изменения');return;}
  $('#dialog').close();dirty=false;render();if(lastFocus?.isConnected)lastFocus.focus();
}
function pointDialog(id){const p=state.points.find(p=>p.id===id);const alarm=state.alarms.find(a=>a.point===id);const events=state.events.filter(e=>e.point===id).slice(0,10);openDialog(p.name,`<div class="dialog-content"><div class="point-state"><span class="${pointTone(p)}">${icon(p.status==='offline'?'offline':'door')}</span><div><h3>${statusName(p)}</h3><p>${p.zone}</p></div></div><div class="detail-row"><span>Контроллер</span><strong>${p.status==='offline'?'Нет связи':'Подключён · демо'}</strong></div><div class="detail-row"><span>Режим доступа</span><strong>${p.mode==='blocked'?'Блокировка':'Штатный'}</strong></div><div class="detail-row"><span>Состояние двери</span><strong>${p.status==='offline'?'Неизвестно':p.status==='warning'?'Открыта сверх нормы':'Закрыта'}</strong></div>${alarm?`<div class="notice warning"><strong>${alarm.title}</strong><p>${alarm.ack?'Принято оператором. Причина остаётся активной.':'Требуется подтверждение оператора.'}</p><button class="text-button" data-action="alarm" data-id="${alarm.id}">${alarm.ack?'Посмотреть комментарий':'Принять предупреждение'} ${icon('arrow')}</button></div>`:''}<div class="command-list"><button class="primary" data-command="open" data-id="${p.id}" ${p.status==='offline'||p.mode==='blocked'||!connected?'disabled':''}>${icon('door')}Открыть однократно</button><button class="secondary" data-command="block" data-id="${p.id}" ${p.status==='offline'||p.mode==='blocked'||!connected?'disabled':''}>${icon('lock')}Блокировать</button><button class="secondary" data-command="normal" data-id="${p.id}" ${p.status==='offline'||p.mode==='normal'||!connected?'disabled':''}>${icon('check')}Штатный режим</button></div><p>Демонстрационные команды. Реальное оборудование не подключено.</p><h3 class="subheading">Последние события</h3>${events.map(e=>`<div class="mini-event"><time>${fmtTime(e.time)}</time><span class="${e.tone}">${esc(e.result)}</span><p>${esc(e.person)}</p></div>`).join('')||'<p>Событий пока нет</p>'}</div>`,'',{type:'point',id},true);}
function alarmDialog(id){const a=state.alarms.find(a=>a.id===Number(id));openDialog('Предупреждение '+a.priority,`<form id="modal-form"><div class="dialog-content"><div class="notice warning"><strong>${esc(pointName(a.point))} · ${a.title}</strong><p>${new Date(a.time).toLocaleString('ru-RU')}</p></div>${a.ack?`<p>Принято оператором. Предупреждение сохраняется до устранения причины.</p><div class="notice">${esc(a.comment)}</div>`:`<p>Подтвердите, что предупреждение замечено и передано в работу. Это не изменит состояние точки.</p><label>Комментарий<textarea name="comment" required minlength="3" maxlength="300" placeholder="Например: сообщил дежурному инженеру"></textarea></label>`}<p class="form-error" role="alert"></p></div><div class="dialog-foot"><button type="button" class="secondary" data-action="close-dialog">Закрыть</button>${!a.ack?'<button class="primary" type="submit">Принять</button>':''}</div></form>`,'',{type:'ack',id:a.id});}
function guestDialog(){const expiry=new Date();expiry.setHours(23,59,0,0);const local=new Date(expiry.getTime()-expiry.getTimezoneOffset()*60000).toISOString().slice(0,16);openDialog('Гостевой пропуск',`<form id="modal-form"><div class="dialog-content"><p>Временный доступ на площадку. Карта вводится вручную для демонстрации.</p><div class="form-grid"><label class="full">ФИО гостя<input name="name" required minlength="5" maxlength="100" autocomplete="off" placeholder="Фамилия Имя Отчество"></label><label class="full">Принимающий сотрудник<input name="host" required maxlength="100" placeholder="ФИО или подразделение"></label><label>Номер тестовой карты<input name="card" required inputmode="numeric" pattern="[0-9]{4,12}" maxlength="12" placeholder="Например, 5001"></label><label>Действует до<input name="expires" type="datetime-local" required value="${local}"></label></div><div class="notice">Группа доступа: <strong>Гостевая</strong><br>Пропуск появится в разделе «Сотрудники».</div><p class="form-error" role="alert"></p></div><div class="dialog-foot"><button type="button" class="secondary" data-action="close-dialog">Закрыть</button><button class="primary" type="submit">Создать пропуск</button></div></form>`,'',{type:'guest'});}
function checkDialog(){openDialog('Проверка доступа',`<form id="modal-form"><div class="dialog-content"><label>Сотрудник / гость<select name="person">${state.people.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label><label>Точка доступа<select name="point">${state.points.map(p=>`<option value="${p.id}">${p.name}</option>`).join('')}</select></label><p>Демопроверка срока пропуска и состояния точки. Расписания, зоны и правила реальной СКУД пока не подключены.</p><div id="check-result" aria-live="polite"></div><p class="form-error" role="alert"></p></div><div class="dialog-foot"><button type="button" class="secondary" data-action="close-dialog">Закрыть</button><button class="primary" type="submit">Проверить</button></div></form>`,'',{type:'check'});}
function personDialog(id){const p=state.people.find(p=>p.id===Number(id));openDialog('Карточка пропуска',`<div class="dialog-content"><div class="latest-person" style="padding:0 0 15px"><span class="avatar">${initials(p.name)}</span><div><span class="tag">${p.kind}</span><h3>${esc(p.name)}</h3><p>${esc(p.department)}</p></div></div>${[['Группа доступа',p.group],['Карта','•••• '+p.card.slice(-4)],['Присутствие',p.onsite?'На объекте':'Вне объекта'],['Действует до',p.expires?new Date(p.expires).toLocaleString('ru-RU'):'Бессрочно']].map(([k,v])=>`<div class="detail-row"><span>${k}</span><strong>${esc(v)}</strong></div>`).join('')}<h3 class="subheading">Последние события</h3>${state.events.filter(e=>e.person===p.name).slice(0,8).map(e=>`<div class="mini-event"><time>${fmtTime(e.time)}</time>${esc(pointName(e.point))}<p class="${e.tone}">${e.result} · ${e.direction}</p></div>`).join('')||'<p>Проходов пока нет</p>'}</div>`,'',{},true);}
function commandDialog(action,id){const title={open:'Открыть однократно',block:'Заблокировать точку',normal:'Вернуть штатный режим'}[action];openDialog(title,`<form id="modal-form"><div class="dialog-content"><div class="point-state">${icon('door')}<strong>${pointName(id)}</strong></div><p>${action==='block'?'Проходы через эту точку будут отклоняться в демонстрационной модели.':action==='open'?'В журнал будет записана команда разового открытия.':'Точка вернётся в штатный режим доступа.'}</p><div class="notice">Это имитация. Физические двери не управляются.</div><p class="form-error" role="alert"></p></div><div class="dialog-foot"><button type="button" class="secondary" data-action="close-dialog">Отмена</button><button class="primary" type="submit">Подтвердить</button></div></form>`,'',{type:'point-command',action,id});}

$('#login-form').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;const button=$('button[type=submit]',form);button.disabled=true;$('#login-error').textContent='';try{await api('/api/login',Object.fromEntries(new FormData(form)));await refresh(true);$('#login').hidden=true;$('#app').hidden=false;form.elements.password.value='';}catch(error){$('#login-error').textContent=error.message;}finally{button.disabled=false;}});
$('#dialog').addEventListener('cancel',e=>{e.preventDefault();closeDialog();});
$('#dialog').addEventListener('input',()=>{if(['guest','ack'].includes(dialogMeta.type)){dirty=true;discardArmed=false;}});
$('#dialog').addEventListener('submit',async e=>{
  e.preventDefault();if(busy)return;busy=true;const button=$('button[type=submit]',e.target);const err=$('.form-error',e.target);button.disabled=true;err.textContent='';const data=Object.fromEntries(new FormData(e.target));const meta={...dialogMeta};
  try{
    let result;
    if(meta.type==='point-command')result=await api('/api/point',{id:meta.id,action:meta.action});
    else if(meta.type==='ack')result=await api('/api/ack',{id:meta.id,comment:data.comment});
    else if(meta.type==='guest')result=await api('/api/guest',data);
    else if(meta.type==='check'){
      result=await api('/api/check',{person:Number(data.person),point:data.point});
      $('#check-result').innerHTML=`<div class="notice ${result.allowed?'success':'warning'}"><strong class="${result.allowed?'ok':'danger'}">${result.allowed?'Доступ разрешён':'Доступ запрещён'}</strong><p>${esc(result.message)}</p></div>`;
      return;
    }
    dirty=false;await refresh(true);$('#dialog').close();toast(result.message);
    if(meta.type==='point-command')pointDialog(meta.id);
    if(meta.type==='guest'){navigate('people');personDialog(result.person.id);}
  }catch(error){err.textContent=error.message;}finally{busy=false;button.disabled=false;}
});
document.addEventListener('click',async e=>{
  const target=e.target.closest('button,[data-point]');if(!target||target.disabled)return;
  if(target.dataset.tab){navigate(target.dataset.tab);return;}
  if(target.dataset.zone){zone=target.dataset.zone;render();return;}
  if(target.dataset.point){pointDialog(target.dataset.point);return;}
  if(target.dataset.person){personDialog(target.dataset.person);return;}
  if(target.dataset.command){commandDialog(target.dataset.command,target.dataset.id);return;}
  if(target.dataset.themeValue){setTheme(target.dataset.themeValue);return;}
  const action=target.dataset.action;
  try{
    if(action==='theme')setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');
    else if(action==='lock'){await api('/api/logout',{});showLogin(true);}
    else if(action==='close-dialog')closeDialog();
    else if(action==='guest')guestDialog();
    else if(action==='check')checkDialog();
    else if(action==='alarm')alarmDialog(target.dataset.id);
    else if(action==='alarms'){navigate('monitor');}
    else if(action==='onsite'){peopleFilter.onsite=true;navigate('people');}
    else if(action==='zoom-in'||action==='zoom-out'||action==='zoom-reset'){zoom=action==='zoom-reset'?1:Math.max(.8,Math.min(1.4,Math.round((zoom+(action==='zoom-in'?.1:-.1))*10)/10));render();}
    else if(action==='simulate'){target.disabled=true;await api('/api/simulate',{});await refresh(true);toast('Добавлен тестовый проход');}
    else if(action==='toggle-simulation'){if(simulationTimer){clearInterval(simulationTimer);simulationTimer=null;}else simulationTimer=setInterval(async()=>{if(state&&connected&&!$('#dialog').open){try{await api('/api/simulate',{});await refresh();}catch{}}},8000);render();}
    else if(action==='reset-filters'){journalFilter={q:'',tone:'Все',point:'Все',date:''};render();}
    else if(action==='export'){const result=await api('/api/export',{ids:filteredEvents().map(e=>e.id)});openDialog('Экспорт журнала',`<div class="dialog-content"><div class="notice success"><strong>CSV сохранён на сервере</strong><p>${result.count} событий · UTF-8</p></div><p>Администратор может забрать файл из каталога данных:</p><code style="overflow-wrap:anywhere">${esc(result.path)}</code><p>Выгружены события, соответствующие текущим фильтрам.</p></div>`,`<div class="dialog-foot"><button class="primary" data-action="close-dialog">Готово</button></div>`);}
  }catch(error){toast(error.message);}finally{target.disabled=false;}
});
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('g[data-point]')){e.preventDefault();pointDialog(e.target.dataset.point);}});
document.addEventListener('input',e=>{
  if(e.target.id==='people-search'){peopleFilter.q=e.target.value;$('#people-rows').innerHTML=peopleRows();$('#people-total').textContent=`Найдено: ${filteredPeople().length} из ${state.people.length}`;}
  if(e.target.id==='journal-search'){journalFilter.q=e.target.value;updateJournal();}
});
function updateJournal(){$('#journal-rows').innerHTML=eventRows(filteredEvents());$('#journal-total').textContent=`Найдено: ${filteredEvents().length} из ${state.events.length}`;}
document.addEventListener('change',e=>{
  const el=e.target;
  if(el.id==='people-kind'){peopleFilter.kind=el.value;$('#people-rows').innerHTML=peopleRows();$('#people-total').textContent=`Найдено: ${filteredPeople().length} из ${state.people.length}`;}
  if(el.id==='people-onsite'){peopleFilter.onsite=el.checked;$('#people-rows').innerHTML=peopleRows();$('#people-total').textContent=`Найдено: ${filteredPeople().length} из ${state.people.length}`;}
  if(el.id==='journal-point'){journalFilter.point=el.value;updateJournal();}
  if(el.id==='journal-tone'){journalFilter.tone=el.value;updateJournal();}
  if(el.id==='journal-date'){journalFilter.date=el.value;updateJournal();}
  if(el.id==='problem-filter'){monitorProblems=el.checked;render();}
  if(el.id==='density'){savedDensity=el.value;document.documentElement.dataset.density=el.value;try{localStorage.setItem('skud-density',el.value);}catch{}}
});
function clock(){const value=new Date().toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});$('#clock').textContent=value;$('#login-clock').textContent=value;}
async function health(){if(!state){try{const h=await api('/api/health');$('#login-health').innerHTML=`<i class="dot ok"></i>Сервер подключён <span class="divider">/</span><span class="warn">${h.alarms} активных предупреждения</span>`;}catch{$('#login-health').textContent='Нет связи с сервером. Повторяем подключение…';}}}
paintIcons();clock();health();setInterval(clock,1000);setInterval(()=>{if(state)refresh();else health();},3000);
(async()=>{try{const initial=await api('/api/state');state=initial;csrf=initial.csrf;$('#login').hidden=true;$('#app').hidden=false;render();}catch{}})();
