// Stock Opname PWA v5 — sidebar + Supabase (PostgREST) + export .xlsx
// Skema mengikuti situs live qc.alifwildan14.workers.dev:
//   master_parts(id, part_number, no_drawing, material)
//   stock_opname(master_part_id, opname_date, revisi_gambar, stok_aktual,
//                keterangan, created_at, updated_at)
//   + kolom opsional opname_time (TIME) — jalankan SQL di README.txt
//     bila ingin jam input tersimpan di database
//   upsert onConflict: master_part_id, opname_date
//   komplain(id, part_number, part_name, jenis, deskripsi, status,
//            created_at) — tabel opsional, lihat README.txt
// Catatan: kolom part_name TIDAK ada di Supabase — Part Name diambil dari
// data/master.json lokal (dicocokkan lewat part_number) dan dipakai untuk
// tampilan + export. Bila Supabase tidak terjangkau, aplikasi jatuh ke
// mode offline (master.json + penyimpanan lokal HP).
// v5: tanpa Stok Sistem & Selisih — hanya Stok Saat Ini + Waktu Input
// (tanggal, jam, menit).

const SUPABASE_URL = "https://kjeboevclvwwtosjcnaq.supabase.co";
// Publishable key — kunci publik untuk client-side, sama seperti yang
// dipakai situs live. Bukan service key, jangan diganti dengan service key.
const SUPABASE_KEY = "sb_publishable_gUHsNcbqDaTQJMPKL47Tjw_veqsUS0T";

let products = [], selected = null, deferredPrompt = null;
let saved = {};      // opname hari ini, key = _id part (string)
let online = true;   // apakah Supabase terjangkau
let timeColOK = true; // apakah kolom opname_time ada di Supabase
let komplainList = [], komplainSource = 'supabase', komplainPart = null;
let currentList = []; // hasil pencarian terakhir (untuk prev/next)
let masterFiltered = [], masterPage = 0;
const MASTER_PAGE_SIZE = 25;
const OUTBOX_KEY = 'stockOpnameOutboxV3';
const LEGACY_KEY = 'stockOpnameV3';
const KOMPLAIN_LOCAL_KEY = 'komplainLocalV5';
const THEME_KEY = 'stockOpnameTheme';
const $ = id => document.getElementById(id);

// ---- Waktu (zona Asia/Jakarta) ----
function today() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); }
function nowParts() {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date());
  const g = t => (p.find(x => x.type === t) || {}).value || '';
  return { date: g('year') + '-' + g('month') + '-' + g('day'), time: g('hour') + ':' + g('minute') };
}
function nowInput() { const n = nowParts(); return n.date + 'T' + n.time; }
function splitDT(v) {
  // "2026-11-10T14:30" -> {date, time:"14:30:00"}
  if (!v) { const n = nowParts(); return { date: n.date, time: n.time + ':00' }; }
  const parts = v.split('T');
  return { date: parts[0], time: (parts[1] || '00:00') + ':00' };
}
function fmtTime(t, fallback) {
  if (t) return String(t).slice(0, 5);
  if (fallback) { const m = String(fallback).match(/T(\d\d:\d\d)/); if (m) return m[1]; }
  return '-';
}
function text(p, k) { return String(p[k] ?? '').trim(); }
function esc(s) { return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])); }
function setStatus(msg, cls) {
  const el = $('status'); if (el) { el.textContent = msg; el.className = 'status ' + (cls || ''); }
  const side = $('sideStatus'); if (side) { side.textContent = msg; side.className = 'status ' + (cls || ''); }
}
function updateOutboxInfo() {
  const box = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]');
  const el = $('outboxInfo');
  if (!el) return;
  if (box.length) { el.textContent = '⏳ ' + box.length + ' opname menunggu kirim'; el.classList.remove('hidden'); }
  else el.classList.add('hidden');
}

// ---- Supabase (PostgREST, tanpa library tambahan) ----
function sbHeaders(extra) {
  return Object.assign({ apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }, extra || {});
}
async function sbGet(path) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, { headers: sbHeaders() });
  if (!r.ok) throw new Error('Supabase ' + r.status);
  return r.json();
}
async function sbGetAll(path) {
  // Paginasi (PostgREST membatasi 1000 baris per panggil)
  let all = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const sep = path.includes('?') ? '&' : '?';
    const data = await sbGet(path + sep + 'limit=' + pageSize + '&offset=' + from);
    all = all.concat(data || []);
    if (!data || data.length < pageSize) break;
  }
  return all;
}
let timeColMissing = false;
async function sbUpsertOpname(payload) {
  const url = SUPABASE_URL + '/rest/v1/stock_opname?on_conflict=master_part_id,opname_date';
  const r = await fetch(url, {
    method: 'POST',
    headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify(payload)
  });
  if (!r.ok) {
    const t = await r.text();
    // Kolom opname_time belum dibuat di Supabase -> coba lagi tanpa kolom itu
    if (!timeColMissing && /opname_time/i.test(t)) {
      timeColMissing = true;
      const p2 = Object.assign({}, payload);
      delete p2.opname_time;
      return sbUpsertOpname(p2);
    }
    throw new Error('Supabase ' + r.status + ': ' + t.slice(0, 200));
  }
  const rows = await r.json();
  return rows[0];
}
async function loadMasterFromSupabase() {
  return sbGetAll('master_parts?select=id,part_number,no_drawing,material&order=part_number.asc');
}
async function loadMasterNames() {
  // Part Name hanya ada di master.json lokal — cocokkan lewat Part No.
  try {
    const d = await (await fetch('data/master.json')).json();
    const m = {};
    d.forEach(p => {
      const k = String(p['Part No.'] ?? '').trim();
      if (k && !(k in m)) m[k] = String(p['Part Name'] ?? '').trim();
    });
    return m;
  } catch (e) { return {}; }
}
async function loadToday() {
  const date = today();
  const data = await sbGet('stock_opname?select=*&opname_date=eq.' + date);
  saved = {};
  (data || []).forEach(r => {
    saved[String(r.master_part_id)] = {
      part_no: '', part_name: '', drawing: '',
      stok_aktual: r.stok_aktual ?? '', keterangan: r.keterangan ?? '',
      tanggal: r.opname_date, waktu: fmtTime(r.opname_time, r.updated_at),
      updated_at: r.updated_at || ''
    };
  });
  products.forEach(p => {
    const s = saved[p._id];
    if (s) { s.part_no = text(p, 'Part No.'); s.part_name = text(p, 'Part Name'); s.drawing = text(p, 'No. Drawing'); }
  });
}

// ---- Antrean offline ----
function queueOffline(rec) {
  const box = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]');
  box.push(rec);
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(box));
  updateOutboxInfo();
}
async function flushOutbox() {
  if (!online) return;
  const box = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]');
  if (!box.length) return;
  const rest = [];
  for (const item of box) {
    const p = products.find(x => text(x, 'Part No.') === item.part_no);
    if (!p) continue;
    try {
      const dt = splitDT(item.waktu_input || '');
      await sbUpsertOpname({
        master_part_id: Number(p._id), opname_date: item.tanggal || dt.date,
        opname_time: dt.time, stok_aktual: item.stok_aktual,
        keterangan: item.keterangan, stok_sistem: null, selisih: null
      });
    } catch (e) { rest.push(item); }
  }
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(rest));
  updateOutboxInfo();
  if (rest.length < box.length) {
    toast('✓ ' + (box.length - rest.length) + ' opname offline terkirim ke Supabase');
    await loadToday();
    renderHome();
  }
}

// ---- Router / sidebar ----
const VIEWS = {
  home: ['Home', 'Ringkasan stock opname hari ini'],
  master: ['Data Master', 'Daftar semua part'],
  stock: ['Stock', 'Cari part & input stok saat ini'],
  history: ['Riwayat Revisi', 'Opname per tanggal & lacak part'],
  komplain: ['Komplain', 'Laporan part bermasalah'],
  about: ['About', 'Tentang aplikasi ini']
};
let currentView = 'home';
function showView(name) {
  currentView = name;
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  $('view-' + name).classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  $('viewTitle').textContent = VIEWS[name][0];
  $('viewSub').textContent = VIEWS[name][1];
  closeSidebar();
  window.scrollTo({ top: 0 });
  if (name === 'home') renderHome();
  if (name === 'master') renderMaster();
  if (name === 'stock') { $('detailPage').classList.add('hidden'); $('searchPage').classList.remove('hidden'); show($('search').value); }
  if (name === 'history') renderHistory();
  if (name === 'komplain') renderKomplain();
}
document.querySelectorAll('.nav-item').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
function closeSidebar() { $('sidebar').classList.remove('open'); $('overlay').classList.add('hidden'); }
$('menuBtn').onclick = () => {
  const open = $('sidebar').classList.toggle('open');
  $('overlay').classList.toggle('hidden', !open);
};
$('overlay').onclick = closeSidebar;

// ---- Tema gelap ----
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem(THEME_KEY, t);
  $('themeBtn').textContent = t === 'dark' ? '☀️ Mode Terang' : '🌙 Mode Gelap';
}
$('themeBtn').onclick = () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
applyTheme(localStorage.getItem(THEME_KEY) || 'light');

// ---- Home ----
function renderHome() {
  const ids = Object.keys(saved);
  const total = products.length;
  const qty = ids.reduce((s, i) => s + Number(saved[i].stok_aktual || 0), 0);
  $('total').textContent = total.toLocaleString('id-ID');
  $('done').textContent = ids.length.toLocaleString('id-ID');
  $('pending').textContent = Math.max(total - ids.length, 0).toLocaleString('id-ID');
  $('qtyTotal').textContent = qty.toLocaleString('id-ID');
  const pct = total ? Math.round(ids.length / total * 100) : 0;
  $('progressText').textContent = pct + '%';
  $('progressBar').style.width = pct + '%';
  $('stockProgressText').textContent = ids.length.toLocaleString('id-ID') + ' / ' + total.toLocaleString('id-ID') + ' sudah opname hari ini';
  $('stockProgressBar').style.width = pct + '%';
  const recent = ids.map(i => saved[i])
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
    .slice(0, 5);
  $('recentList').innerHTML = recent.length ? recent.map(r =>
    `<div class="result" onclick="jumpToPart('${esc(r.part_no)}')"><b>${esc(r.part_no) || '-'}</b><span>${esc(r.part_name) || ''} — Stok: <b>${esc(String(r.stok_aktual))}</b></span><small>${esc(r.tanggal || '')} ${esc(r.waktu || '')}${r.keterangan ? ' · ' + esc(r.keterangan) : ''}</small></div>`
  ).join('') : '<div class="empty">Belum ada opname hari ini.</div>';
  const baru = komplainList.filter(k => k.status === 'Baru').slice(0, 3);
  $('homeKomplain').innerHTML = baru.length ? baru.map(k =>
    `<div class="result"><b>${esc(k.part_number || 'Umum')}</b><span>${esc(k.jenis)} — ${esc(k.deskripsi || '')}</span><small>${esc(k.created_at ? String(k.created_at).slice(0, 16).replace('T', ' ') : '')}</small></div>`
  ).join('') : '<div class="empty">Tidak ada komplain baru.</div>';
  $('komplainBadge').textContent = komplainList.filter(k => k.status === 'Baru').length;
  $('komplainBadge').classList.toggle('hidden', !komplainList.some(k => k.status === 'Baru'));
}
function jumpToPart(partNo) {
  showView('stock');
  $('search').value = partNo;
  show(partNo);
}
$('quickSearch').addEventListener('keydown', e => {
  if (e.key === 'Enter') jumpToPart(e.target.value.trim());
});
$('goStock').onclick = () => showView('stock');
$('goKomplain').onclick = () => showView('komplain');

// ---- Data Master ----
function masterFilterList(q) {
  q = (q || '').trim().toLowerCase();
  if (!q) return products;
  return products.filter(p => [text(p, 'Part No.'), text(p, 'Part Name'), text(p, 'No. Drawing'), text(p, 'material')].some(x => x.toLowerCase().includes(q)));
}
function renderMaster() {
  masterFiltered = masterFilterList($('masterSearch').value);
  const pages = Math.max(1, Math.ceil(masterFiltered.length / MASTER_PAGE_SIZE));
  if (masterPage >= pages) masterPage = pages - 1;
  const slice = masterFiltered.slice(masterPage * MASTER_PAGE_SIZE, (masterPage + 1) * MASTER_PAGE_SIZE);
  $('masterInfo').textContent = masterFiltered.length.toLocaleString('id-ID') + ' part · halaman ' + (masterPage + 1) + ' dari ' + pages;
  $('masterPageInfo').textContent = 'Hal. ' + (masterPage + 1) + ' / ' + pages;
  $('masterBody').innerHTML = slice.map(p => {
    const done = saved[p._id];
    return `<tr><td><b>${esc(text(p, 'Part No.')) || '-'}</b></td><td>${esc(text(p, 'Part Name')) || '-'}</td><td>${esc(text(p, 'No. Drawing')) || '-'}</td><td>${esc(text(p, 'material')) || '-'}</td><td>${done ? '<span class="pill ok">✓ Sudah · ' + esc(String(done.stok_aktual)) + '</span>' : '<span class="pill">Belum</span>'}</td></tr>`;
  }).join('') || '<tr><td colspan="5">Tidak ditemukan.</td></tr>';
}
$('masterSearch').addEventListener('input', () => { masterPage = 0; renderMaster(); });
$('masterPrev').onclick = () => { if (masterPage > 0) { masterPage--; renderMaster(); } };
$('masterNext').onclick = () => { masterPage++; renderMaster(); };

// ---- Stock (opname) ----
function show(q) {
  q = (q || '').trim().toLowerCase();
  const a = q
    ? products.filter(p => [text(p, 'Part No.'), text(p, 'Part Name'), text(p, 'No. Drawing')].some(x => x.toLowerCase().includes(q)))
    : products.slice(0, 25);
  currentList = a.slice(0, 60);
  $('hint').textContent = q ? a.length.toLocaleString('id-ID') + ' hasil' : 'Ketik untuk mencari. Menampilkan 25 part pertama.';
  $('results').innerHTML = currentList.map(p =>
    `<div class="result" onclick="pick('${p._id}')"><b>${esc(text(p, 'Part No.')) || '-'}</b><span>${esc(text(p, 'Part Name')) || 'Nama belum diisi'}</span><small>Drawing: ${esc(text(p, 'No. Drawing')) || '-'} · ${saved[p._id] ? '✓ Sudah opname' : 'Belum opname'}</small></div>`
  ).join('') || '<div class="result">Tidak ditemukan.</div>';
}
function pick(id) {
  selected = products.find(p => p._id === id);
  if (!selected) return;
  const s = saved[id] || {};
  $('searchPage').classList.add('hidden');
  $('detailPage').classList.remove('hidden');
  $('partNo').textContent = text(selected, 'Part No.') || '-';
  $('partName').textContent = text(selected, 'Part Name') || '-';
  $('drawing').textContent = text(selected, 'No. Drawing') || '-';
  $('material').textContent = text(selected, 'material') || '-';
  $('partStatus').textContent = s.stok_aktual !== undefined && s.stok_aktual !== '' ? '✓ Sudah opname' + (s.waktu ? ' · ' + s.waktu : '') : 'Belum opname';
  $('current').value = s.stok_aktual ?? '';
  $('waktu').value = s.tanggal && s.waktu ? s.tanggal + 'T' + s.waktu : nowInput();
  $('note').value = s.keterangan ?? '';
  $('current').focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function stepPart(dir) {
  if (!selected || !currentList.length) return;
  const idx = currentList.findIndex(p => p._id === selected._id);
  const next = currentList[(idx + dir + currentList.length) % currentList.length];
  if (next) pick(next._id);
}
$('prevPart').onclick = () => stepPart(-1);
$('nextPart').onclick = () => stepPart(1);
$('nextUncounted').onclick = () => {
  const pool = currentList.length ? currentList : products;
  const next = pool.find(p => !saved[p._id]) || products.find(p => !saved[p._id]);
  if (next) pick(next._id);
  else toast('Semua part di daftar ini sudah diopname ✓');
};
$('search').addEventListener('input', e => show(e.target.value));
$('back').onclick = () => {
  $('detailPage').classList.add('hidden');
  $('searchPage').classList.remove('hidden');
  $('search').focus();
  show($('search').value);
};

$('save').onclick = async () => {
  if (!selected) return;
  if ($('current').value === '') { toast('Isi Stok Saat Ini.'); return; }
  const aa = Number($('current').value);
  const dt = splitDT($('waktu').value);
  const rec = {
    part_no: text(selected, 'Part No.'), part_name: text(selected, 'Part Name'),
    drawing: text(selected, 'No. Drawing'),
    stok_aktual: aa, keterangan: $('note').value,
    tanggal: dt.date, waktu: dt.time.slice(0, 5), waktu_input: $('waktu').value,
    updated_at: new Date().toISOString()
  };
  if (online) {
    try {
      await sbUpsertOpname({
        master_part_id: Number(selected._id), opname_date: dt.date,
        opname_time: dt.time, stok_aktual: aa, keterangan: $('note').value,
        stok_sistem: null, selisih: null
      });
      toast('✓ Tersimpan di Supabase');
    } catch (e) {
      console.error(e);
      queueOffline(rec);
      toast('Gagal ke Supabase — tersimpan di HP, dikirim saat online');
    }
  } else {
    queueOffline(rec);
    toast('Offline — tersimpan di HP, dikirim saat online');
  }
  if (rec.tanggal === today()) {
    saved[selected._id] = rec;
    renderHome();
  }
  $('back').click();
};

// ---- Riwayat Revisi ----
let historyDates = [], historyDetailDate = null;
async function renderHistory() {
  try {
    const rows = await sbGetAll('stock_opname?select=opname_date,stok_aktual&order=opname_date.desc');
    const map = {};
    (rows || []).forEach(r => {
      if (!map[r.opname_date]) map[r.opname_date] = { date: r.opname_date, count: 0, qty: 0 };
      map[r.opname_date].count++;
      map[r.opname_date].qty += Number(r.stok_aktual || 0);
    });
    historyDates = Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
    $('historyList').innerHTML = historyDates.length ? historyDates.map(x =>
      `<div class="result" onclick="showHistoryDate('${x.date}')"><b>📅 ${x.date}</b><span>${x.count.toLocaleString('id-ID')} part sudah diopname · total stok ${x.qty.toLocaleString('id-ID')}</span><small>Klik untuk melihat tanggal ini</small></div>`
    ).join('') : '<div class="empty">Belum ada riwayat stock opname.</div>';
  } catch (e) {
    console.error(e);
    $('historyList').innerHTML = '<div class="empty">Riwayat tidak terjangkau (offline?). Coba lagi saat online.</div>';
  }
}
$('refreshHistory').onclick = renderHistory;
async function showHistoryDate(date) {
  historyDetailDate = date;
  $('historyDateTitle').textContent = '📅 ' + date;
  $('historyDetail').classList.remove('hidden');
  $('historyDetailInfo').textContent = 'Memuat...';
  try {
    const rows = await sbGetAll('stock_opname?select=*,master_parts(part_number,no_drawing,material)&opname_date=eq.' + date + '&order=master_part_id.asc');
    const names = await loadMasterNames();
    $('historyDetailInfo').textContent = (rows || []).length.toLocaleString('id-ID') + ' part diopname pada tanggal ini.';
    $('historyBody').innerHTML = (rows || []).map(r => {
      const pn = r.master_parts?.part_number || '';
      return `<tr><td>${esc(fmtTime(r.opname_time, r.updated_at))}</td><td><b>${esc(pn)}</b></td><td>${esc(names[pn] || '-')}</td><td>${esc(String(r.stok_aktual ?? ''))}</td><td>${esc(r.keterangan || '')}</td></tr>`;
    }).join('') || '<tr><td colspan="5">Tidak ada data.</td></tr>';
    $('historyDetail').scrollIntoView({ behavior: 'smooth' });
  } catch (e) {
    console.error(e);
    $('historyDetailInfo').textContent = 'Gagal memuat tanggal ini.';
  }
}
$('exportDateBtn').onclick = async () => {
  if (!historyDetailDate) return;
  await exportRows(await sbGetAll('stock_opname?select=*,master_parts(part_number,no_drawing,material)&opname_date=eq.' + historyDetailDate + '&order=master_part_id.asc'), 'Rekap_Stock_Opname_' + historyDetailDate + '.xlsx');
};
$('traceSearch').addEventListener('input', async e => {
  const q = e.target.value.trim().toLowerCase();
  if (!q) { $('traceResult').innerHTML = ''; return; }
  const p = products.find(x => text(x, 'Part No.').toLowerCase() === q)
    || products.find(x => text(x, 'Part No.').toLowerCase().includes(q));
  if (!p) { $('traceResult').innerHTML = '<div class="empty">Part tidak ditemukan di master.</div>'; return; }
  $('traceResult').innerHTML = '<div class="empty">Memuat riwayat ' + esc(text(p, 'Part No.')) + '...</div>';
  try {
    const rows = await sbGet('stock_opname?select=*&master_part_id=eq.' + p._id + '&order=opname_date.desc');
    $('traceResult').innerHTML = (rows || []).length ? rows.map(r =>
      `<div class="result"><b>${esc(r.opname_date || '')} · ${esc(fmtTime(r.opname_time, r.updated_at))}</b><span>Stok saat ini: <b>${esc(String(r.stok_aktual ?? ''))}</b></span><small>${esc(r.keterangan || '')}</small></div>`
    ).join('') : '<div class="empty">Part ini belum pernah diopname.</div>';
  } catch (err) {
    $('traceResult').innerHTML = '<div class="empty">Riwayat tidak terjangkau (offline?).</div>';
  }
});

// ---- Komplain ----
function localKomplain() { return JSON.parse(localStorage.getItem(KOMPLAIN_LOCAL_KEY) || '[]'); }
function saveLocalKomplain(list) { localStorage.setItem(KOMPLAIN_LOCAL_KEY, JSON.stringify(list)); }
async function loadKomplain() {
  try {
    const data = await sbGet('komplain?select=*&order=created_at.desc&limit=200');
    komplainList = data || [];
    komplainSource = 'supabase';
  } catch (e) {
    komplainList = localKomplain();
    komplainSource = 'local';
  }
}
function renderKomplain() {
  const f = $('komplainFilter').value;
  const list = komplainList.filter(k => !f || k.status === f);
  $('komplainNote').textContent = komplainSource === 'local'
    ? '⚠️ Tabel komplain di Supabase belum tersedia — komplain tersimpan di HP ini. Jalankan SQL di README.txt untuk mengaktifkan penyimpanan bersama.'
    : '';
  $('komplainList').innerHTML = list.length ? list.map(k => {
    const actions = k.status === 'Selesai' ? '<span class="pill ok">✓ Selesai</span>'
      : `<button class="secondary small" onclick="setKomplainStatus('${k.id}', 'Diproses')">Diproses</button>
         <button class="secondary small" onclick="setKomplainStatus('${k.id}', 'Selesai')">✓ Selesai</button>`;
    return `<div class="result"><b>${esc(k.part_number || 'Umum')}</b><span>${esc(k.jenis)} — ${esc(k.deskripsi || '')}</span><small>${esc(k.created_at ? String(k.created_at).slice(0, 16).replace('T', ' ') : '')} · Status: <b>${esc(k.status || 'Baru')}</b></small><div class="row-btns">${actions}</div></div>`;
  }).join('') : '<div class="empty">Belum ada komplain.</div>';
  renderHome();
}
async function setKomplainStatus(id, status) {
  const item = komplainList.find(k => String(k.id) === String(id));
  if (!item) return;
  if (online && komplainSource === 'supabase' && !String(id).startsWith('L')) {
    try {
      const r = await fetch(SUPABASE_URL + '/rest/v1/komplain?id=eq.' + id, {
        method: 'PATCH',
        headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
        body: JSON.stringify({ status })
      });
      if (!r.ok) throw new Error('Supabase ' + r.status);
      item.status = status;
    } catch (e) {
      console.error(e);
      toast('Gagal mengubah status di Supabase');
      return;
    }
  } else {
    item.status = status;
    saveLocalKomplain(komplainList);
  }
  renderKomplain();
}
$('komplainPartSearch').addEventListener('input', e => {
  const q = e.target.value.trim().toLowerCase();
  if (!q) { komplainPart = null; $('komplainPartPick').textContent = 'Belum ada part dipilih — komplain bisa juga tanpa part (umum).'; return; }
  const matches = products.filter(p => [text(p, 'Part No.'), text(p, 'Part Name')].some(x => x.toLowerCase().includes(q))).slice(0, 5);
  $('komplainPartPick').innerHTML = matches.length
    ? matches.map(p => `<div class="result" onclick="pickKomplainPart('${p._id}')"><b>${esc(text(p, 'Part No.'))}</b><span>${esc(text(p, 'Part Name'))}</span></div>`).join('')
    : 'Tidak ditemukan — komplain akan dicatat tanpa part.';
});
function pickKomplainPart(id) {
  komplainPart = products.find(p => p._id === id) || null;
  $('komplainPartPick').innerHTML = komplainPart
    ? 'Part dipilih: <b>' + esc(text(komplainPart, 'Part No.')) + '</b> — ' + esc(text(komplainPart, 'Part Name')) + ' <button class="secondary small" onclick="clearKomplainPart()">✕</button>'
    : 'Belum ada part dipilih.';
}
function clearKomplainPart() { komplainPart = null; $('komplainPartSearch').value = ''; $('komplainPartPick').textContent = 'Belum ada part dipilih — komplain bisa juga tanpa part (umum).'; }
$('komplainFilter').addEventListener('change', renderKomplain);
$('komplainSend').onclick = async () => {
  const desc = $('komplainDesc').value.trim();
  if (!desc) { toast('Isi deskripsi komplain.'); return; }
  const item = {
    part_number: komplainPart ? text(komplainPart, 'Part No.') : '',
    part_name: komplainPart ? text(komplainPart, 'Part Name') : '',
    jenis: $('komplainJenis').value, deskripsi: desc, status: 'Baru'
  };
  if (online) {
    try {
      const r = await fetch(SUPABASE_URL + '/rest/v1/komplain', {
        method: 'POST',
        headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
        body: JSON.stringify(item)
      });
      if (!r.ok) throw new Error('Supabase ' + r.status);
      const rows = await r.json();
      komplainList.unshift(rows[0]);
      komplainSource = 'supabase';
      toast('✓ Komplain terkirim ke Supabase');
    } catch (e) {
      console.error(e);
      item.id = 'L' + Date.now();
      item.created_at = new Date().toISOString();
      komplainList.unshift(item);
      saveLocalKomplain(komplainList);
      toast('Supabase belum tersedia — komplain tersimpan di HP');
    }
  } else {
    item.id = 'L' + Date.now();
    item.created_at = new Date().toISOString();
    komplainList.unshift(item);
    saveLocalKomplain(komplainList);
    toast('Offline — komplain tersimpan di HP');
  }
  $('komplainDesc').value = '';
  clearKomplainPart();
  renderKomplain();
};

// ---- Export .xlsx (SheetJS, file lokal — tetap bisa offline) ----
function loadXlsx() {
  if (window.XLSX) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'xlsx.full.min.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('file xlsx.full.min.js gagal dimuat'));
    document.head.appendChild(s);
  });
}
async function exportRows(data, filename) {
  const names = await loadMasterNames();
  const rows = (data || []).map(r => ({
    'Tanggal': r.opname_date || '',
    'Jam': fmtTime(r.opname_time, r.updated_at),
    'Part Number': r.master_parts?.part_number || '',
    'Part Name': names[String(r.master_parts?.part_number ?? '').trim()] || '',
    'No. Drawing': r.master_parts?.no_drawing || '',
    'Material': r.master_parts?.material || '',
    'Revisi Gambar': r.revisi_gambar || '',
    'Stok Saat Ini': Number(r.stok_aktual ?? 0),
    'Keterangan': r.keterangan || ''
  }));
  if (!rows.length) { toast('Belum ada hasil opname.'); return; }
  try {
    await loadXlsx();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 16 }, { wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stock Opname');
    XLSX.writeFile(wb, filename);
    toast('✓ ' + rows.length.toLocaleString('id-ID') + ' baris diexport ke .xlsx');
  } catch (e) {
    console.error(e);
    toast('Export gagal: ' + e.message);
  }
}
$('exportBtn').onclick = async () => {
  try {
    const data = await sbGetAll('stock_opname?select=*,master_parts(part_number,no_drawing,material)&order=opname_date.desc&order=master_part_id.asc');
    await exportRows(data, 'Rekap_Stock_Opname.xlsx');
  } catch (e) {
    console.error(e);
    const rows = Object.values(saved).map(r => ({
      opname_date: r.tanggal, opname_time: (r.waktu || '') + ':00', stok_aktual: r.stok_aktual,
      keterangan: r.keterangan, revisi_gambar: '',
      master_parts: { part_number: r.part_no, no_drawing: r.drawing, material: '' }
    }));
    toast('Supabase tidak terjangkau — export dari data lokal');
    await exportRows(rows, 'Rekap_Stock_Opname.xlsx');
  }
};
$('exportMasterBtn').onclick = async () => {
  const rows = products.map(p => ({
    'Part Number': text(p, 'Part No.'), 'Part Name': text(p, 'Part Name'),
    'No. Drawing': text(p, 'No. Drawing'), 'Material': text(p, 'material'),
    'Status Hari Ini': saved[p._id] ? 'Sudah opname' : 'Belum opname',
    'Stok Saat Ini': saved[p._id] ? Number(saved[p._id].stok_aktual ?? 0) : ''
  }));
  try {
    await loadXlsx();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 16 }, { wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data Master');
    XLSX.writeFile(wb, 'Data_Master_Stock_Opname.xlsx');
    toast('✓ ' + rows.length.toLocaleString('id-ID') + ' part diexport');
  } catch (e) { toast('Export gagal: ' + e.message); }
};

// ---- About: data lokal ----
$('clearOutboxBtn').onclick = () => {
  localStorage.removeItem(OUTBOX_KEY);
  updateOutboxInfo();
  toast('Antrean offline dihapus');
};
$('clearLocalBtn').onclick = () => {
  if (confirm('Hapus semua data lokal di HP ini (antrean offline, hasil lama, komplain lokal)? Data di Supabase TIDAK dihapus.')) {
    localStorage.removeItem(OUTBOX_KEY);
    localStorage.removeItem(LEGACY_KEY);
    localStorage.removeItem(KOMPLAIN_LOCAL_KEY);
    location.reload();
  }
};

// ---- Install PWA ----
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  $('installBtn').classList.remove('hidden');
});
$('installBtn').onclick = async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $('installBtn').classList.add('hidden');
};
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));

function toast(s) {
  $('toast').textContent = s;
  $('toast').classList.add('show');
  setTimeout(() => $('toast').classList.remove('show'), 2500);
}

// ---- Start ----
(async function init() {
  setStatus('Menghubungkan ke Supabase...', 'loading');
  updateOutboxInfo();
  const names = await loadMasterNames();
  try {
    const master = await loadMasterFromSupabase();
    products = master.map(p => ({
      _id: String(p.id),
      'Part No.': p.part_number || '',
      'Part Name': names[String(p.part_number ?? '').trim()] || '',
      'No. Drawing': p.no_drawing || '',
      material: p.material || ''
    }));
    online = true;
    setStatus('● Database terhubung (Supabase)', 'ok');
    await loadToday();
    await flushOutbox();
    await loadKomplain();
  } catch (e) {
    console.error(e);
    online = false;
    // Mode offline: master dari file lokal + hasil lama di HP
    try {
      const d = await (await fetch('data/master.json')).json();
      products = d.map((p, i) => ({ ...p, _id: String(i) }));
    } catch (e2) { products = []; }
    saved = JSON.parse(localStorage.getItem(LEGACY_KEY) || '{}');
    komplainList = localKomplain();
    komplainSource = 'local';
    setStatus('● Offline — memakai data lokal di HP', 'err');
    toast('Tidak terhubung ke Supabase — mode offline');
  }
  renderHome();
  showView('home');
})();
