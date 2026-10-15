/* MiHome API — web UI */
'use strict';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const LS = {
  get(k, d) { try { const v = localStorage.getItem('mh.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('mh.' + k, JSON.stringify(v)); } catch { } },
};

const QS = new URLSearchParams(location.search);
const S = {
  lang: I18N[QS.get('lang')] ? QS.get('lang') : LS.get('lang', 'en'), devs: [], cur: null, spec: null, pf: null, status: {}, via: LS.get('via', 'auto'),
  tab: LS.get('tab', 'dash'), usedVia: null, log: [], timer: null, busy: false, hist: {}, advOpen: LS.get('advOpen', false),
  visEl: null, dashFor: null, lan: false,
};

/* =================== i18n =================== */
function t(k, vars) {
  const L = I18N[S.lang] || I18N.en;
  let s = L[k] ?? I18N.en[k] ?? k;
  if (vars) for (const [a, b] of Object.entries(vars)) s = s.replaceAll('{' + a + '}', b);
  return s;
}
const tv = d => (I18N[S.lang]._values || {})[d] || d;          // spec value description
const tp = d => (I18N[S.lang]._props || {})[d] || d;           // spec property/action description
function applyI18n() {
  document.documentElement.lang = S.lang;
  $$('[data-i18n]').forEach(e => e.innerHTML = t(e.dataset.i18n));
  $$('[data-i18n-ph]').forEach(e => e.placeholder = t(e.dataset.i18nPh));
  $$('[data-i18n-title]').forEach(e => e.title = t(e.dataset.i18nTitle));
  $$('[data-lang]').forEach(e => e.innerHTML = Object.keys(I18N).map(l =>
    `<button class="${l === S.lang ? 'on' : ''}" onclick="setLang('${l}')" title="${esc(I18N[l]._name)}">${l.toUpperCase()}</button>`).join(''));
  $('#faInfo').innerHTML = t('login.faInfo');
  if (S.faUrl) $('#faLink').href = S.faUrl;
}
function setLang(l) {
  S.lang = l; LS.set('lang', l); applyI18n(); setStep(lStep);
  $('#uHint').textContent = guessAccount($('#u').value);
  if (S.cur) { setConn(!!S.usedVia); renderView(); }
}

function toast(m, err) {
  const el = document.createElement('div'); el.className = 'toast' + (err ? ' err' : ''); el.textContent = m;
  $('#toasts').append(el); setTimeout(() => el.remove(), 3800);
}
const errMsg = e => { const c = e.data?.error; return c && I18N.en['err.' + c] ? t('err.' + c) : e.message; };

async function api(method, url, body) {
  const t0 = performance.now(); let r, j;
  try { r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); }
  catch { throw new Error(t('err.network')); }
  try { j = await r.json(); } catch { j = {}; }
  S.log.unshift({ t: new Date(), method, url, body, status: r.status, ms: Math.round(performance.now() - t0), res: j });
  S.log.length = Math.min(S.log.length, 80);
  if (S.tab === 'log' && S.cur) renderView();
  if (!r.ok) {
    const d = j.detail;
    throw Object.assign(new Error(j.message || (typeof d === 'string' ? d : JSON.stringify(d || j))), { data: j, status: r.status });
  }
  return j;
}

/* =================== LOGIN =================== */
let lStep = 'cred';
function setStep(st) {
  lStep = st;
  $('#stepCred').classList.toggle('hide', st !== 'cred');
  $('#stepCap').classList.toggle('hide', st !== 'cap');
  $('#step2fa').classList.toggle('hide', st !== '2fa');
  $('#lTitle').textContent = t({ cred: 'login.title', cap: 'login.capTitle', '2fa': 'login.faTitle' }[st]);
  $('#lSub').textContent = st === 'cred' ? t('login.sub') : t('login.as', { u: $('#u').value });
  if (!$('#lBtn').disabled) $('#lBtn').textContent = t({ cred: 'login.btn', cap: 'login.capBtn', '2fa': 'login.faBtn' }[st]);
  $('#s2').classList.toggle('on', st !== 'cred');
}
function reloadCap() { $('#capImg').src = '/api/login/captcha?' + Date.now(); $('#cap').value = ''; }
function lErr(m) { const e = $('#lErr'); e.classList.toggle('hide', !m); e.textContent = m || ''; }
function guessAccount(v) {
  v = v.trim(); if (!v) return '';
  if (/^\S+@\S+\.\S+$/.test(v)) return t('login.hintEmail');
  if (/^0\d{9}$/.test(v.replace(/\s/g, ''))) return t('login.hintPhoneVn', { n: v.replace(/\s/g, '').slice(1) });
  if (/^\+?\d[\d\s]{7,}$/.test(v)) return t('login.hintPhone');
  if (/^\d{6,}$/.test(v)) return t('login.hintId');
  if (v.includes('@')) return t('login.hintBadEmail');
  return '';
}
const normAccount = v => { v = v.trim().replace(/\s/g, ''); return /^0\d{9}$/.test(v) ? '+84' + v.slice(1) : v; };

$('#u').addEventListener('input', e => $('#uHint').textContent = guessAccount(e.target.value));
$('#p').addEventListener('keyup', e => $('#capsHint').textContent = e.getModifierState?.('CapsLock') ? t('login.caps') : '');
$('#eye').onclick = () => { const p = $('#p'); p.type = p.type === 'password' ? 'text' : 'password'; p.focus(); };
$('#capImg').onclick = reloadCap;

$('#lForm').onsubmit = async e => {
  e.preventDefault(); lErr('');
  const u = $('#u').value.trim(), p = $('#p').value;
  if (!u || !p) { setStep('cred'); lErr(t('login.needBoth')); return; }
  if (lStep === 'cap' && !$('#cap').value.trim()) { lErr(t('login.needCap')); $('#cap').focus(); return; }
  const b = $('#lBtn'); b.disabled = true;
  b.innerHTML = `<span class="spin"></span>${esc(t($('#srv').value === 'auto' ? 'login.signingAuto' : 'login.signing'))}`;
  const send = acc => api('POST', '/api/login', { username: acc, password: p, server: $('#srv').value, captcha: lStep === 'cap' ? $('#cap').value.trim() : undefined });
  try {
    let r;
    try { r = await send(u); }
    catch (err) { const n = normAccount(u); if (n !== u && err.data?.error === 'bad_credentials') r = await send(n); else throw err; }
    LS.set('user', u); $('#s3').classList.add('on'); $('#p').value = '';
    toast(t('login.ok', { server: r.server, n: r.devices }));
    b.disabled = false; setStep('cred'); boot();
  } catch (err) {
    const d = err.data || {}; b.disabled = false;
    if (d.captcha) { if (lStep === 'cap') lErr(t('err.captcha_wrong')); setStep('cap'); reloadCap(); setTimeout(() => $('#cap').focus(), 50); }
    else if (d.notificationUrl) { S.faUrl = d.notificationUrl; $('#faLink').href = d.notificationUrl; if (lStep === '2fa') lErr(t('err.2fa_pending')); setStep('2fa'); }
    else { lErr(errMsg(err)); if (lStep !== 'cred') setStep('cred'); }
  } finally { b.disabled = false; setStep(lStep); }
};

/* =================== APP SHELL =================== */
async function boot() {
  applyI18n(); setStep(lStep);
  let s; try { s = await api('GET', '/api/session'); } catch (e) { toast(e.message, true); return; }
  S.lan = s.lan;
  if (!s.logged_in) {
    $('#appView').classList.add('hide'); $('#loginView').classList.remove('hide');
    $('#u').value = LS.get('user', ''); $('#uHint').textContent = guessAccount($('#u').value);
    ($('#u').value ? $('#p') : $('#u')).focus(); return;
  }
  $('#loginView').classList.add('hide'); $('#appView').classList.remove('hide');
  $('#userPill').textContent = `${s.username} · ${s.server}`;
  $('#viaSel').value = S.via;
  $('#viaSel').querySelector('[value=lan]').disabled = !s.lan;
  setTab(S.tab, true);
  await loadDevs();
}

async function loadDevs(refresh) {
  try { S.devs = await api('GET', '/api/devices' + (refresh ? '?refresh=true' : '')); }
  catch (e) { toast(errMsg(e), true); if (e.status === 401) boot(); return; }
  $('#devSel').innerHTML = S.devs.map(d => `<option value="${esc(d.did)}">${d.isOnline ? '● ' : '○ '}${esc(d.name)}</option>`).join('');
  $('#devSel').classList.toggle('hide', S.devs.length < 2);
  if (!S.devs.length) { $('#devName').textContent = t('noDevices'); $('#view').innerHTML = `<div class="card mut">${esc(t('noDevicesLong'))}</div>`; return; }
  const last = LS.get('did');
  pick((S.devs.find(d => d.did === last) || S.devs[0]).did);
}

async function pick(did) {
  S.cur = S.devs.find(d => d.did === did); LS.set('did', did); $('#devSel').value = did;
  S.status = {}; S.spec = null; S.pf = null; S.visEl = null; S.dashFor = null; S.hist = LS.get('hist.' + did, {});
  $('#devName').textContent = S.cur.name;
  $('#devMeta').textContent = `${S.cur.model} · ${S.cur.localip || 'no ip'} · did ${S.cur.did}`;
  $('#view').innerHTML = `<div class="card mut">${esc(t('loadingSpec'))}</div>`;
  try { S.spec = await api('GET', `/api/devices/${did}/spec`); }
  catch (e) { $('#view').innerHTML = `<div class="card">${esc(errMsg(e))}</div>`; return; }
  S.pf = buildProfile(S.spec);
  renderView(); refresh();
}

async function refresh(silent) {
  if (!S.cur || !S.spec || S.busy) return;
  S.busy = true; $('#refBtn').disabled = true;
  try {
    const s = await api('GET', `/api/devices/${S.cur.did}/status?via=${S.via}`);
    S.status = {}; for (const [k, v] of Object.entries(s.props)) S.status[k] = v.value;
    S.usedVia = s.via; setConn(true); pushHist();
    if (S.tab === 'dash' || S.tab === 'all') renderView();
  } catch (e) { setConn(false); if (!silent) toast(errMsg(e), true); if (e.status === 401) boot(); }
  finally { S.busy = false; $('#refBtn').disabled = false; }
}
function setConn(ok) {
  $('#connPill').classList.toggle('on', ok);
  $('#connTxt').textContent = ok ? `${t(S.usedVia === 'lan' ? 'conn.lan' : 'conn.cloud')} · ${new Date().toLocaleTimeString(S.lang)}` : t('conn.lost');
}
function pushHist() {
  const k = S.pf?.pm?.key; if (!k || V(k) == null) return;
  const h = S.hist.pm || []; h.push([Date.now(), V(k)]); S.hist.pm = h.slice(-180); LS.set('hist.' + S.cur.did, S.hist);
}
function schedule() {
  clearInterval(S.timer);
  S.timer = setInterval(() => { if (!document.hidden && (S.tab === 'dash' || S.tab === 'all')) refresh(true); }, 8000);
}

const V = k => S.status[k];
async function setProp(key, value) {
  const old = S.status[key]; S.status[key] = value; renderView();
  try {
    const r = await api('POST', `/api/devices/${S.cur.did}/props?via=${S.via}`, { props: [{ key, value }] });
    const bad = (Array.isArray(r.result) ? r.result : []).find(x => x.code && x.code !== 0);
    if (bad) throw new Error(t('err.rejected', { c: bad.code }));
    setTimeout(() => refresh(true), 800);
  } catch (e) { S.status[key] = old; renderView(); toast(errMsg(e), true); }
}
async function runAction(key, label) {
  if (!confirm(t('confirmRun', { x: label || key }))) return;
  try { await api('POST', `/api/devices/${S.cur.did}/action?via=${S.via}`, { key, params: [] }); toast(t('done', { x: label || key })); setTimeout(() => refresh(true), 800); }
  catch (e) { toast(errMsg(e), true); }
}
function copy(text) { navigator.clipboard?.writeText(text).then(() => toast(t('copied')), () => toast(t('copyFail'), true)); }

/* tabs & toolbar */
function setTab(tab, quiet) {
  S.tab = tab; LS.set('tab', tab);
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
  if (!quiet) renderView();
  schedule();
}
$('#tabs').onclick = e => { const b = e.target.closest('button'); if (b) setTab(b.dataset.t); };
$('#devSel').onchange = e => pick(e.target.value);
$('#viaSel').onchange = e => { S.via = e.target.value; LS.set('via', S.via); refresh(); };
$('#refBtn').onclick = () => refresh();
$('#logoutBtn').onclick = async () => {
  if (!confirm(t('top.logoutAsk'))) return;
  await api('POST', '/api/logout'); clearInterval(S.timer); S.cur = null; boot();
};

/* =================== DEVICE PROFILE ===================
 * Detects the main controls of any MIoT device from its spec, so the dashboard
 * can show the essentials and tuck everything else under "Advanced". */
function buildProfile(spec) {
  const props = spec.services.flatMap(s => s.properties.map(p => ({ ...p, svc: s.name })));
  const acts = spec.services.flatMap(s => s.actions.map(a => ({ ...a, svc: s.name })));
  const W = p => p && p.access.includes('write'), R = p => p && p.access.includes('read');
  const cat = spec.category || '';
  const main = spec.services.find(s => s.name === cat)?.name
    || spec.services.find(s => s.properties.some(p => p.name === 'on' && W(p)))?.name;
  const inMain = (n, f = () => true) => props.find(p => p.svc === main && p.name === n && f(p));
  const find = f => props.find(f);

  const power = inMain('on', W) || find(p => p.name === 'on' && W(p)) || find(p => p.name === 'switch-status' && W(p));
  const mode = inMain('mode', W);
  const level = ['fan-level', 'speed-level', 'brightness', 'target-humidity', 'gear', 'stall'].map(n => inMain(n, W)).find(Boolean);
  const fav = find(p => W(p) && p.range && (/favorite/.test(p.svc) && p.name === 'fan-level'))
    || find(p => W(p) && p.range && p.name === 'favorite-level');
  const ct = inMain('color-temperature', W);
  const pm = find(p => p.name === 'pm2.5-density' && R(p));
  const env = props.filter(p => R(p) && !W(p) && (p.svc === 'environment' || p.name === 'battery-level' || p.key === 'aqi.average-aqi'));
  const filter = {
    life: find(p => p.svc === 'filter' && p.name === 'filter-life-level'),
    left: find(p => p.svc === 'filter' && p.name === 'filter-left-time'),
    used: find(p => p.svc === 'filter' && p.name === 'filter-used-time'),
    reset: acts.find(a => a.name === 'reset-filter-life'),
  };
  const rpm = find(p => R(p) && !W(p) && /(moto|motor).*speed|speed-rpm/.test(p.name));
  const rpmMax = Math.max(0, ...props.filter(p => /speed/.test(p.name) && p.range && p.range[1] >= 1000 && p.range[1] <= 10000).map(p => p.range[1])) || 2300;
  const fault = find(p => p.name === 'fault' && R(p));

  const QUICK = [
    [p => p.name === 'anion', 'd.anion', 'd.anionD'],
    [p => p.name === 'physical-controls-locked', 'd.lock', 'd.lockD'],
    [p => p.svc === 'screen' && p.name === 'brightness', 'd.screen'],
    [p => p.svc === 'indicator-light' && p.name === 'on', 'd.screen'],
    [p => p.name === 'horizontal-swing'], [p => p.name === 'vertical-swing'],
  ];
  const quick = [];
  for (const [f, label, desc] of QUICK) { const p = find(x => W(x) && f(x)); if (p) quick.push({ p, label, desc }); }

  const used = new Set([power, mode, level, fav, ct, pm, fault, rpm, filter.life, filter.left, filter.used, ...env, ...quick.map(q => q.p)].filter(Boolean).map(p => p.key));
  const adv = props.filter(p => W(p) && !used.has(p.key));
  const diag = props.filter(p => R(p) && !W(p) && !used.has(p.key));
  const actions = acts.filter(a => a !== filter.reset);
  return { kind: VIS.kind(cat), cat, power, mode, level, fav, ct, pm, env, filter, rpm, rpmMax, fault, quick, adv, diag, actions, props };
}

/* ---------- value helpers ---------- */
const UNITS = { celsius: '°C', percentage: '%', hours: 'h', days: 'd', 'μg/m3': 'µg/m³', seconds: 's', minutes: 'min', kelvin: 'K', rpm: 'rpm' };
const unit = u => UNITS[u] ?? (u && u !== 'none' ? u : '');
const descOf = (p, v) => p?.values?.find(o => o.value === v)?.description;
function label(p, v) {
  if (v == null) return '—';
  const d = descOf(p, v); if (d) return tv(d);
  if (p?.format === 'bool') return v ? t('on') : t('off');
  if (typeof v === 'number' && !Number.isInteger(v)) return String(Math.round(v * 10) / 10);
  if (typeof v === 'number' && v >= 10000) return v.toLocaleString(S.lang);
  return String(v);
}
const AQ = ['#10b981', '#84cc16', '#f59e0b', '#f97316', '#ef4444', '#a21caf'];
const aqIdx = pm => pm == null ? -1 : pm <= 12 ? 0 : pm <= 35 ? 1 : pm <= 55 ? 2 : pm <= 150 ? 3 : pm <= 250 ? 4 : 5;
const modeIs = (re) => { const p = S.pf.mode; return !!p && re.test(descOf(p, V(p.key)) || ''); };
const ICONS = {
  auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3l2.2 5.6L20 9l-4.5 3.8L17 19l-5-3.2L7 19l1.5-6.2L4 9l5.8-.4z"/></svg>',
  sleep: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
  fav: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
  manual: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="2"/><path d="M12 10c0-4 1-7 4-7s2 5-2 7M14 12c4 0 7 1 7 4s-5 2-7-2M12 14c0 4-1 7-4 7s-2-5 2-7M10 12c-4 0-7-1-7-4s5-2 7 2"/></svg>',
  dot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/></svg>',
};
const modeIcon = d => /auto/i.test(d) ? ICONS.auto : /sleep|night|silent/i.test(d) ? ICONS.sleep : /fav/i.test(d) ? ICONS.fav : /manual|level|straight|natural/i.test(d) ? ICONS.manual : ICONS.dot;

/* how fast the illustration should spin, 0..1 */
function speedNow() {
  const pf = S.pf; if (pf.power && !V(pf.power.key)) return 0;
  if (pf.rpm && V(pf.rpm.key) != null) return clamp(V(pf.rpm.key) / pf.rpmMax);
  if (modeIs(/sleep|silent/i)) return .12;
  if (pf.fav && modeIs(/fav/i)) return clamp((V(pf.fav.key) - pf.fav.range[0]) / (pf.fav.range[1] - pf.fav.range[0] || 1));
  if (pf.level && V(pf.level.key) != null && !modeIs(/auto/i)) return levelFrac(pf.level, V(pf.level.key));
  if (pf.pm && modeIs(/auto/i)) return clamp(.25 + (V(pf.pm.key) || 0) / 150 * .75);
  return .5;
}
function levelFrac(p, v) {
  if (p.values) { const i = p.values.findIndex(o => o.value === v); return i < 0 ? .5 : (i + 1) / p.values.length; }
  if (p.range) return clamp((v - p.range[0]) / (p.range[1] - p.range[0] || 1));
  return .5;
}

/* =================== RENDER =================== */
function renderView() {
  if (!S.spec) return;
  if (S.tab === 'dash') return renderDash();
  S.dashFor = null;
  const v = $('#view');
  v.innerHTML = S.tab === 'all' ? `<div class="all">${allProps(S.pf.props, true)}</div>` : S.tab === 'api' ? apiTab() : logTab();
}

/* region updater: skip a region while the user is typing/dragging inside it */
function fill(id, html) {
  const el = document.getElementById(id); if (!el) return;
  const a = document.activeElement;
  if (a && el.contains(a) && /INPUT|SELECT/.test(a.tagName) && a.type !== 'checkbox') return;
  el.innerHTML = html;
}

function renderDash() {
  const pf = S.pf, view = $('#view');
  const side = [pf.filter.life && 'rFilter', pf.quick.length && 'rQuick', 'rInfo'].filter(Boolean);
  const cls = side.length === 3 ? 'c4' : side.length === 2 ? 'c6' : 'c12';
  if (S.dashFor !== S.cur.did || !document.getElementById('rCtrl')) {
    view.innerHTML = `<div class="grid">
      <div class="c12 hide" id="rFault"></div>
      <div class="c5"><div class="stage"><div class="st-badges"><span class="badge" id="bL"></span><span class="badge" id="bR"></span></div>
        <div id="visSlot"></div><div class="st-name">${esc(S.cur.name)}</div><div class="st-sub" id="stSub"></div></div></div>
      <div class="card c7" id="rCtrl"></div>
      ${side.map(id => `<div class="card ${cls}" id="${id}"></div>`).join('')}
      <div class="c12" id="rAdvWrap"></div>
    </div>`;
    if (!S.visEl) S.visEl = VIS.create(pf.kind);
    $('#visSlot').replaceWith(S.visEl);
    S.dashFor = S.cur.did;
  }
  fillDash();
}

function fillDash() {
  const pf = S.pf, on = pf.power ? !!V(pf.power.key) : true, online = S.cur.isOnline !== false;
  const pm = pf.pm ? V(pf.pm.key) : null, ai = aqIdx(pm);

  // illustration
  VIS.update(S.visEl, {
    on, speed: speedNow(), pm: pm != null ? Math.round(pm) : null, color: ai >= 0 ? AQ[ai] : null,
    brightness: pf.level?.name === 'brightness' && V(pf.level.key) != null ? levelFrac(pf.level, V(pf.level.key)) : null,
    ct: pf.ct && V(pf.ct.key) != null ? levelFrac(pf.ct, V(pf.ct.key)) : null,
  });
  const md = pf.mode && descOf(pf.mode, V(pf.mode.key));
  const parts = [!online ? t('offline') : on ? t('running') : t('stopped')];
  if (on && md) parts.push(tv(md));
  if (on && pf.level && V(pf.level.key) != null && (!pf.mode || !hasManualGate() || modeIs(/manual/i))) parts.push(label(pf.level, V(pf.level.key)));
  if (on && pf.fav && modeIs(/fav/i)) parts.push(`${t('d.level')} ${V(pf.fav.key) ?? '—'}`);
  $('#stSub').textContent = parts.join(' · ');
  const bL = $('#bL'), bR = $('#bR');
  bL.classList.toggle('hide', ai < 0); if (ai >= 0) { bL.textContent = t('aq.' + ai); bL.style.color = AQ[ai]; }
  const rpmV = pf.rpm && V(pf.rpm.key);
  bR.classList.toggle('hide', !on || !rpmV); if (rpmV) bR.textContent = `${rpmV} rpm`;

  // fault banner
  const f = pf.fault && V(pf.fault.key);
  $('#rFault').classList.toggle('hide', !f);
  if (f) $('#rFault').innerHTML = `<div class="alert err">⚠ ${esc(t('d.fault', { x: label(pf.fault, f) }))}</div>`;

  fill('rCtrl', ctrlCard(on));
  if (pf.filter.life) fill('rFilter', filterCard());
  if (pf.quick.length) fill('rQuick', quickCard());
  fill('rInfo', infoCard());
  fill('rAdvWrap', advSection());
}

const hasManualGate = () => !!S.pf.mode?.values?.some(o => /manual/i.test(o.description));

function ctrlCard(on) {
  const pf = S.pf; let h = '';
  if (pf.power) h += `<div class="pwrrow">
      <button class="pwr ${on ? 'on' : ''}" onclick="setProp('${pf.power.key}',${!on})" aria-label="${t('d.power')}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 3v9"/><path d="M6.3 6.3a8 8 0 1 0 11.4 0"/></svg></button>
      <div><div class="mut" style="font-size:12px">${t('d.power')}</div><div class="big">${on ? t('running') : t('stopped')}</div></div></div>`;
  const dim = on ? '' : ' disabled-ctl';
  if (pf.mode?.values) {
    const cur = V(pf.mode.key);
    h += `<div class="blk${dim}"><div class="lab"><span>${t('d.mode')}</span></div><div class="seg">${pf.mode.values.map(o =>
      `<button class="${o.value === cur ? 'on' : ''}" onclick="setProp('${pf.mode.key}',${JSON.stringify(o.value)})">${modeIcon(o.description)}<span>${esc(tv(o.description))}</span></button>`).join('')}</div></div>`;
  }
  // contextual level controls
  if (pf.fav && pf.mode && modeIs(/fav/i)) h += rangeBlk(pf.fav, t('d.favLevel'), dim);
  if (pf.level) {
    const gated = pf.mode && hasManualGate() && !modeIs(/manual/i);
    const lbl = pf.level.name === 'fan-level' ? t('d.fanLevel') : pf.level.name === 'brightness' ? t('d.brightness') : tp(pf.level.description);
    if (gated) {
      const manual = pf.mode.values.find(o => /manual/i.test(o.description));
      const info = modeIs(/auto/i) ? t('d.autoInfo') : modeIs(/sleep/i) ? t('d.sleepInfo') : '';
      h += `<div class="blk${dim}"><div class="info"><span>ℹ</span><div>${info ? esc(info) + '<br>' : ''}<span>${esc(t('d.manualOnly'))}</span> ·
        <a href="#" onclick="setProp('${pf.mode.key}',${manual.value});return false" style="color:var(--acc);font-weight:600">${esc(tv(manual.description))} →</a></div></div></div>`;
    } else if (pf.level.values) {
      const cur = V(pf.level.key);
      h += `<div class="blk${dim}"><div class="lab"><span>${esc(lbl)}</span><b>${esc(label(pf.level, cur))}</b></div><div class="lvl-dots">${pf.level.values.map(o =>
        `<button class="${o.value === cur ? 'on' : ''}" onclick="setProp('${pf.level.key}',${JSON.stringify(o.value)})">${esc(tv(o.description).replace(/^(Level|Mức)\s?/, ''))}</button>`).join('')}</div></div>`;
    } else if (pf.level.range) h += rangeBlk(pf.level, lbl, dim);
  }
  if (pf.ct?.range) h += rangeBlk(pf.ct, t('d.colorTemp'), dim);
  if (!pf.power && !pf.mode && !pf.level) h += `<div class="info">${esc(t('d.noMain'))}</div>`;

  // environment tiles
  if (pf.env.length) {
    const lab = p => ({ 'pm2.5-density': t('d.pm25'), 'pm10-density': t('d.pm10'), temperature: t('d.temp'), 'relative-humidity': t('d.hum'), 'battery-level': t('d.battery'), 'average-aqi': t('d.aqiAvg') }[p.name] || tp(p.description));
    h += `<div class="envs">${pf.env.map(p => {
      const v = V(p.key), isPm = p === pf.pm, ai = isPm ? aqIdx(v) : -1;
      return `<div class="env${isPm ? ' pm' : ''}" ${ai >= 0 ? `style="--aq:${AQ[ai]}"` : ''}><div class="l">${esc(lab(p))}</div><div class="v">${esc(label(p, v))}<small>${v != null && !p.values ? esc(p.name === 'pm10-density' ? 'µg/m³' : unit(p.unit)) : ''}</small></div></div>`;
    }).join('')}</div>`;
    if (pf.pm) h += spark();
  }
  return h;
}
function rangeBlk(p, lbl, dim) {
  const v = V(p.key) ?? p.range[0];
  return `<div class="blk${dim}"><div class="lab"><span>${esc(lbl)}</span><b id="rv_${p.siid}_${p.piid}">${v}</b></div>
    <input type="range" min="${p.range[0]}" max="${p.range[1]}" step="${p.range[2] || 1}" value="${v}"
      oninput="document.getElementById('rv_${p.siid}_${p.piid}').textContent=this.value" onchange="setProp('${p.key}',+this.value)"></div>`;
}
function spark() {
  const h = (S.hist.pm || []).slice(-60);
  if (h.length < 2) return `<div class="spark-empty mut">${esc(t('d.spark'))}</div>`;
  const vs = h.map(x => x[1]), mx = Math.max(...vs) * 1.35 + 5, mn = 0, Wd = 300, H = 56;
  const d = vs.map((v, i) => (i ? 'L' : 'M') + (i / (vs.length - 1) * Wd).toFixed(1) + ' ' + (H - 4 - (v - mn) / (mx - mn || 1) * (H - 10)).toFixed(1)).join(' ');
  return `<svg class="spark" viewBox="0 0 ${Wd} ${H}" preserveAspectRatio="none"><defs><linearGradient id="sg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--acc)" stop-opacity=".25"/><stop offset="1" stop-color="var(--acc)" stop-opacity="0"/></linearGradient></defs>
    <path d="${d} L${Wd} ${H} L0 ${H}Z" fill="url(#sg)"/><path d="${d}" fill="none" stroke="var(--acc)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}

function filterCard() {
  const f = S.pf.filter, life = V(f.life.key), C = 2 * Math.PI * 40;
  const col = life == null ? 'var(--mut)' : life < 15 ? 'var(--err)' : life < 35 ? 'var(--warn)' : 'var(--ok)';
  return `<h4>${t('d.filter')}</h4><div class="ring">
      <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="none" stroke="var(--bg2)" stroke-width="10"/>
        <circle cx="50" cy="50" r="40" fill="none" stroke="${col}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C * (life ?? 0) / 100} ${C}" style="transition:stroke-dasharray .6s"/></svg>
      <div><div class="rv">${life ?? '—'}%</div><div class="mut">${t('d.left')}</div></div></div>
    ${f.left ? `<div class="kv" style="margin-top:12px"><span class="mut">${t('d.daysLeft')}</span><b>${V(f.left.key) ?? '—'} ${t('d.days')}</b></div>` : ''}
    ${f.used ? `<div class="kv"><span class="mut">${t('d.hoursUsed')}</span><b>${V(f.used.key) ?? '—'} ${t('d.hours')}</b></div>` : ''}
    ${f.reset ? `<button class="btn sm" style="margin-top:10px" onclick="runAction('${f.reset.key}','${esc(t('d.resetFilterQ'))}')">${t('d.resetFilter')}</button>` : ''}`;
}

function quickCard() {
  return `<h4>${t('d.quick')}</h4>` + S.pf.quick.map(({ p, label: l, desc }) => {
    const name = l ? t(l) : tp(p.description);
    const ctl = p.format === 'bool' ? sw(p.key)
      : p.values ? `<div style="width:min(230px,60%)"><div class="seg mini">${p.values.map(o => `<button class="${o.value === V(p.key) ? 'on' : ''}" onclick="setProp('${p.key}',${JSON.stringify(o.value)})">${esc(tv(o.description))}</button>`).join('')}</div></div>`
      : '';
    return `<div class="tg"><div><div class="t">${esc(name)}</div>${desc ? `<div class="d">${esc(t(desc))}</div>` : ''}</div>${ctl}</div>`;
  }).join('');
}
const sw = key => { const on = !!V(key); return `<button class="sw ${on ? 'on' : ''}" onclick="setProp('${key}',${!on})" role="switch" aria-checked="${on}"></button>`; };

function infoCard() {
  const d = S.cur, tok = d.token || '';
  return `<h4>${t('d.device')}</h4>
    <div class="kv" style="border:0"><span class="mut">Model</span><b class="mono">${esc(d.model)}</b></div>
    <div class="kv"><span class="mut">IP</span><b class="mono">${esc(d.localip || '—')}</b></div>
    <div class="kv"><span class="mut">MAC</span><b class="mono">${esc(d.mac || '—')}</b></div>
    <div class="kv"><span class="mut">DID</span><b class="mono">${esc(d.did)}</b></div>
    <div class="kv"><span class="mut">${t('d.token')}</span><b class="mono" style="cursor:pointer" title="${t('d.clickCopy')}" onclick="copy('${esc(tok)}')">${tok ? esc(tok.slice(0, 6)) + '••••' + esc(tok.slice(-4)) + ' ⧉' : '—'}</b></div>
    <div class="kv"><span class="mut">${t('d.wifi')}</span><b>${d.rssi != null ? esc(d.rssi) + ' dBm' : '—'}</b></div>`;
}

function advSection() {
  const pf = S.pf, n = pf.adv.length + pf.diag.length + pf.actions.length;
  if (!n) return '';
  let h = `<button class="btn advbtn ${S.advOpen ? 'open' : ''}" onclick="toggleAdv()"><span>⚙ ${esc(S.advOpen ? t('d.advHide') : t('d.advShow', { n }))}</span><span class="chev">▾</span></button>`;
  if (!S.advOpen) return h;
  h += `<div class="card" style="margin-top:12px">`;
  if (pf.adv.length || pf.actions.length) h += `<div class="svc">${t('d.adv')}</div><div class="pgrid">${pf.adv.map(propCard).join('')}${pf.actions.map(actCard).join('')}</div>`;
  if (pf.diag.length) h += `<div class="svc">${t('d.diag')}</div><div class="pgrid">${pf.diag.map(propCard).join('')}</div>`;
  return h + '</div>';
}
function toggleAdv() { S.advOpen = !S.advOpen; LS.set('advOpen', S.advOpen); fill('rAdvWrap', advSection()); }

/* ---------- property cards (advanced + all) ---------- */
function ctl(p) {
  if (!p.access.includes('write')) return '';
  const k = p.key, v = V(k);
  if (p.format === 'bool') return sw(k);
  if (p.values) return `<select onchange="setProp('${k}',+this.value)">${p.values.map(o => `<option value="${o.value}" ${o.value === v ? 'selected' : ''}>${esc(tv(o.description))}</option>`).join('')}</select>`;
  if (p.range) return `<input type="range" min="${p.range[0]}" max="${p.range[1]}" step="${p.range[2] || 1}" value="${v ?? p.range[0]}" onchange="setProp('${k}',+this.value)">`;
  return `<input placeholder="${esc(t('a.enter'))}" onkeydown="if(event.key==='Enter')setProp('${k}',this.value)">`;
}
function propCard(p) {
  const v = V(p.key);
  return `<div class="pc"><div class="k mono">${esc(p.key)} <span class="tag">${p.siid}.${p.piid}</span></div><div class="n">${esc(tp(p.description || p.name))}</div>
    <div class="v">${p.access.includes('read') ? esc(label(p, v)) + (v != null && !p.values && p.format !== 'bool' ? ` <span class="mut" style="font-size:12px;font-weight:500">${esc(unit(p.unit))}</span>` : '') : `<span class="mut" style="font-size:13px">${t('a.writeOnly')}</span>`}</div>${ctl(p)}</div>`;
}
function actCard(a) {
  const n = tp(a.description || a.name);
  return `<div class="pc"><div class="k mono">${esc(a.key)} <span class="tag">action ${a.siid}.${a.aiid}</span></div><div class="n">${esc(n)}</div>
    <div style="margin-top:10px"><button class="btn sm p" onclick="runAction('${a.key}','${esc(n)}')">${t('a.run')}</button></div></div>`;
}
function allProps() {
  return S.spec.services.map(s => {
    if (!s.properties.length && !s.actions.length) return '';
    return `<div class="svc">${esc(tp(s.description || s.name))}<span class="tag">siid ${s.siid}</span></div><div class="pgrid">`
      + s.properties.map(propCard).join('') + s.actions.map(actCard).join('') + '</div>';
  }).join('');
}

/* ---------- API tab ---------- */
let EPS = [];
function apiTab() {
  const d = S.cur.did, b = location.origin, pf = S.pf;
  const pk = pf.power?.key || 'air-purifier.on', mk = pf.mode?.key || 'air-purifier.mode', lk = pf.level?.key || 'air-purifier.fan-level';
  EPS = [
    ['g.auth', 'POST', '/api/login', 'e.login', { username: 'you@mail.com', password: '***', server: 'auto' }],
    ['g.auth', 'GET', '/api/session', 'e.session'],
    ['g.auth', 'POST', '/api/logout', 'e.logout'],
    ['g.dev', 'GET', '/api/devices?refresh=true', 'e.devices'],
    ['g.dev', 'GET', `/api/devices/${d}`, 'e.device'],
    ['g.dev', 'GET', `/api/devices/${d}/spec`, 'e.spec'],
    ['g.state', 'GET', `/api/devices/${d}/status?via=auto`, 'e.status'],
    ['g.state', 'GET', `/api/devices/${d}/prop/${pf.pm?.key || pk}`, 'e.prop'],
    ['g.ctrl', 'POST', `/api/devices/${d}/props`, 'e.power', { props: [{ key: pk, value: true }] }],
    ...(pf.mode ? [['g.ctrl', 'POST', `/api/devices/${d}/props`, 'e.mode', { props: [{ key: mk, value: pf.mode.values?.[0]?.value ?? 0 }] }]] : []),
    ['g.ctrl', 'POST', `/api/devices/${d}/props`, 'e.multi', { props: [{ key: mk, value: pf.mode?.values?.find(o => /manual/i.test(o.description))?.value ?? 3 }, { key: lk, value: 2 }, { siid: pf.power?.siid ?? 2, piid: pf.power?.piid ?? 1, value: true }] }],
    ['g.ctrl', 'POST', `/api/devices/${d}/action`, 'e.action', { key: pf.filter.reset?.key || pf.actions[0]?.key || 'filter.reset-filter-life', params: [] }],
    ['g.adv', 'POST', `/api/devices/${d}/raw`, 'e.raw', { method: 'miIO.info', params: [] }],
  ];
  let g = '', h = '';
  EPS.forEach(([grp, m, u, desc, body], i) => {
    if (grp !== g) { g = grp; h += `<div class="svc">${esc(t(grp))}</div>`; }
    const curl = `curl -X ${m} "${b}${u}"` + (body ? ` \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(body)}'` : '');
    h += `<details class="ep"><summary><span class="m ${m}">${m}</span><span class="path">${esc(u)}</span><span class="sp"></span><span class="mut desc">${esc(t(desc).split(/[.(]/)[0])}</span></summary><div class="body">
      <div class="mut">${esc(t(desc))}</div>
      ${body ? `<div class="lbl">${t('api.body')}</div><pre contenteditable spellcheck="false" id="eb${i}">${esc(JSON.stringify(body, null, 2))}</pre>` : ''}
      <div class="lbl">cURL <button class="btn sm" onclick="copy(this.parentNode.nextElementSibling.textContent)">${t('copy')}</button></div><pre>${esc(curl)}</pre>
      <button class="btn p sm" onclick="tryEp(${i})">${t('api.send')}</button><pre id="er${i}" class="hide"></pre></div></details>`;
  });
  const rows = S.spec.services.flatMap(s => [
    ...s.properties.map(p => `<tr><td>${esc(p.key)}</td><td>${p.siid}.${p.piid}</td><td>${p.access.filter(a => a !== 'notify').map(a => a[0].toUpperCase()).join('')}</td><td>${esc(p.format)}</td><td>${p.values ? p.values.map(v => `${v.value}=${esc(v.description)}`).join(', ') : p.range ? `${p.range[0]} … ${p.range[1]}` : ''} ${esc(unit(p.unit))}</td></tr>`),
    ...s.actions.map(a => `<tr><td>${esc(a.key)}</td><td>${a.siid}.${a.aiid}</td><td>ACT</td><td>action</td><td>${esc(a.description)}</td></tr>`)]).join('');
  return h + `<div class="svc">${esc(t('api.keys', { m: S.cur.model }))}</div><div class="card tblw" style="padding:4px 10px">
    <table class="keys"><tr><th>${t('api.key')}</th><th>siid.piid</th><th>${t('api.perm')}</th><th>${t('api.type')}</th><th>${t('api.values')}</th></tr>${rows}</table></div>`;
}
async function tryEp(i) {
  const [, m, u] = EPS[i], out = $('#er' + i), bEl = $('#eb' + i);
  out.classList.remove('hide'); out.textContent = t('api.sending');
  try { const body = bEl ? JSON.parse(bEl.textContent) : undefined; out.textContent = JSON.stringify(await api(m, u, body), null, 2); }
  catch (e) { out.textContent = '✗ ' + e.message; }
}

/* ---------- log tab ---------- */
function logTab() {
  if (!S.log.length) return `<div class="card mut">${t('log.empty')}</div>`;
  return `<div class="card" style="padding:4px 16px">` + S.log.map(l => `<details><summary class="lg"><span class="m ${l.method}">${l.method}</span>
      <span class="path" style="font-size:12px;flex:1">${esc(l.url)}</span><span class="st ${l.status < 400 ? 'ok' : 'bad'}">${l.status}</span>
      <span class="mut" style="font-size:12px;width:56px;text-align:right">${l.ms}ms</span><span class="mut hide-sm" style="font-size:12px">${l.t.toLocaleTimeString(S.lang)}</span></summary>
    ${l.body ? `<div class="lbl">${t('log.req')}</div><pre>${esc(JSON.stringify(l.body, null, 2).replace(/"password":\s*"[^"]*"/, '"password": "***"'))}</pre>` : ''}
    <div class="lbl">${t('log.res')}</div><pre>${esc(JSON.stringify(l.res, null, 2).slice(0, 5000))}</pre></details>`).join('') + '</div>';
}

boot();
