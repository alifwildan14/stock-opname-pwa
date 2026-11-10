// Stock Opname PWA v4 — data di Supabase (PostgREST), export .xlsx
// Skema mengikuti situs live qc.alifwildan14.workers.dev:
//   master_parts(id, part_number, no_drawing, material)
//   stock_opname(master_part_id, opname_date, revisi_gambar, stok_sistem,
//                stok_aktual, selisih, keterangan, created_at, updated_at)
//   upsert onConflict: master_part_id, opname_date
// Catatan: kolom part_name TIDAK ada di Supabase — Part Name diambil dari
// data/master.json lokal (dicocokkan lewat part_number) dan dipakai untuk
// tampilan + export. Bila Supabase tidak terjangkau, aplikasi jatuh ke
// mode offline (master.json + penyimpanan lokal HP).

const SUPABASE_URL = "https://kjeboevclvwwtosjcnaq.supabase.co";
// Publishable key — kunci publik untuk client-side, sama seperti yang
// dipakai situs live. Bukan service key, jangan diganti dengan service key.
const SUPABASE_KEY = "sb_publishable_gUHsNcbqDaTQJMPKL47Tjw_veqsUS0T";

let products = [], selected = null, deferredPrompt = null;
let saved = {};      // opname hari ini, key = _id part (string)
let online = true;   // apakah Supabase terjangkau
const OUTBOX_KEY = 'stockOpnameOutboxV3';
const LEGACY_KEY = 'stockOpnameV3';
const $ = id => document.getElementById(id);

function today() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); }
function text(p, k) { return String(p[k] ?? '').trim(); }
function esc(s) { return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])); }
function setStatus(msg, cls) { const el = $('status'); if (el) { el.textContent = msg; el.className = 'status ' + (cls || ''); } }

// ---- Supabase (PostgREST, tanpa library tambahan) ----
function sbHeaders(extra) {
  return Object.assign({ apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }, extra || {});
}
async function sbGet(path) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, { headers: sbHeaders() });
  if (!r.ok) throw new Error('Supabase ' + r.status);
  return r.json();
}
async function sbUpsertOpname(payload) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/stock_opname?on_conflict=master_part_id,opname_date', {
    method: 'POST',
    headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error('Supabase ' + r.status + ': ' + (await r.text()).slice(0, 200));
  const rows = await r.json();
  return rows[0];
}
async function loadMasterFromSupabase() {
  let all = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const data = await sbGet('master_parts?select=id,part_number,no_drawing,material&order=part_number.asc&limit=' + pageSize + '&offset=' + from);
    all = all.concat(data || []);
    if (!data || data.length < pageSize) break;
  }
  return all;
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
  const data = await sbGet('stock_opname?select=master_part_id,stok_sistem,stok_aktual,selisih,keterangan,opname_date&opname_date=eq.' + date);
  saved = {};
  (data || []).forEach(r => {
    saved[String(r.master_part_id)] = {
      part_no: '', part_name: '', drawing: '',
      stok_sistem: r.stok_sistem ?? '', stok_aktual: r.stok_aktual ?? '',
      selisih: r.selisih ?? '', keterangan: r.keterangan ?? '', tanggal: r.opname_date
    };
  });
  products.forEach(p => {
    const s = saved[p._id];
    if (s) { s.part_no = text(p, 'Part No.'); s.part_name = text(p, 'Part Name'); s.drawing = text(p, 'No. Drawing'); }
  });
}

// ---- Antrean offline: gagal simpan -> localStorage, dikirim saat online ----
function queueOffline(rec) {
  const box = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]');
  box.push(rec);
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(box));
}
async function flushOutbox() {
  if (!online) return;
  let box = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]');
  if (!box.length) return;
  const rest = [];
  for (const item of box) {
    const p = products.find(x => text(x, 'Part No.') === item.part_no);
    if (!p) continue;
    try {
      await sbUpsertOpname({
        master_part_id: Number(p._id), opname_date: item.tanggal || today(),
        stok_sistem: item.stok_sistem, stok_aktual: item.stok_aktual,
        selisih: item.selisih, keterangan: item.keterangan
      });
    } catch (e) { rest.push(item); }
  }
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(rest));
  if (rest.length < box.length) {
    toast('✓ ' + (box.length - rest.length) + ' opname offline terkirim ke Supabase');
    await loadToday();
  }
}

// ---- Tampilan ----
function stats() {
  const ids = Object.keys(saved);
  $('total').textContent = products.length.toLocaleString('id-ID');
  $('done').textContent = ids.length.toLocaleString('id-ID');
  $('pending').textContent = Math.max(products.length - ids.length, 0).toLocaleString('id-ID');
  $('varianceCount').textContent = ids.filter(i => Number(saved[i].selisih) !== 0).length.toLocaleString('id-ID');
}
function show(q) {
  q = q.trim().toLowerCase();
  const a = q
    ? products.filter(p => [text(p, 'Part No.'), text(p, 'Part Name'), text(p, 'No. Drawing')].some(x => x.toLowerCase().includes(q)))
    : products.slice(0, 25);
  $('hint').textContent = q ? a.length.toLocaleString('id-ID') + ' hasil' : 'Ketik untuk mencari. Menampilkan 25 part pertama.';
  $('results').innerHTML = a.slice(0, 60).map(p =>
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
  $('system').value = s.stok_sistem ?? '';
  $('actual').value = s.stok_aktual ?? '';
  $('note').value = s.keterangan ?? '';
  calc();
  $('actual').focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function calc() {
  const s = $('system').value, a = $('actual').value, ok = s !== '' && a !== '';
  const d = ok ? Number(a) - Number(s) : '-';
  $('diff').textContent = d;
  $('diff').className = ok ? (d > 0 ? 'pos' : d < 0 ? 'neg' : 'zero') : '';
}
$('search').addEventListener('input', e => show(e.target.value));
$('system').addEventListener('input', calc);
$('actual').addEventListener('input', calc);
$('back').onclick = () => {
  $('detailPage').classList.add('hidden');
  $('searchPage').classList.remove('hidden');
  $('search').focus();
  show($('search').value);
};

$('save').onclick = async () => {
  if (!selected) return;
  if ($('system').value === '' || $('actual').value === '') { toast('Isi Stok Sistem dan Stok Aktual.'); return; }
  const ss = Number($('system').value), aa = Number($('actual').value);
  const rec = {
    part_no: text(selected, 'Part No.'), part_name: text(selected, 'Part Name'),
    drawing: text(selected, 'No. Drawing'),
    stok_sistem: ss, stok_aktual: aa, selisih: aa - ss,
    keterangan: $('note').value, tanggal: today()
  };
  if (online) {
    try {
      await sbUpsertOpname({
        master_part_id: Number(selected._id), opname_date: today(),
        stok_sistem: ss, stok_aktual: aa, selisih: aa - ss, keterangan: $('note').value
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
  saved[selected._id] = rec;
  stats();
  $('back').click();
};

$('resetBtn').onclick = () => {
  if (confirm('Hapus antrean offline di HP ini? Data yang sudah tersimpan di Supabase TIDAK dihapus.')) {
    localStorage.removeItem(OUTBOX_KEY);
    localStorage.removeItem(LEGACY_KEY);
    toast('Antrean offline dihapus');
  }
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
async function fetchAllOpname() {
  let all = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const data = await sbGet('stock_opname?select=opname_date,master_part_id,stok_sistem,stok_aktual,selisih,keterangan,revisi_gambar,created_at,updated_at,master_parts(part_number,no_drawing,material)&order=opname_date.desc&order=master_part_id.asc&limit=' + pageSize + '&offset=' + from);
    all = all.concat(data || []);
    if (!data || data.length < pageSize) break;
  }
  return all;
}
$('exportBtn').onclick = async () => {
  let rows = [];
  try {
    const data = await fetchAllOpname();
    const names = await loadMasterNames();
    rows = (data || []).map(r => ({
      'Tanggal': r.opname_date || '',
      'Part Number': r.master_parts?.part_number || '',
      'Part Name': names[String(r.master_parts?.part_number ?? '').trim()] || '',
      'No. Drawing': r.master_parts?.no_drawing || '',
      'Material': r.master_parts?.material || '',
      'Revisi Gambar': r.revisi_gambar || '',
      'Stok Sistem': Number(r.stok_sistem ?? 0),
      'Stok Aktual': Number(r.stok_aktual ?? 0),
      'Selisih': Number(r.selisih ?? 0),
      'Keterangan': r.keterangan || '',
      'Waktu': r.updated_at || r.created_at || ''
    }));
  } catch (e) {
    console.error(e);
    rows = Object.values(saved).map(r => ({
      'Tanggal': r.tanggal || today(), 'Part Number': r.part_no, 'Part Name': r.part_name,
      'No. Drawing': r.drawing, 'Material': '', 'Revisi Gambar': '',
      'Stok Sistem': Number(r.stok_sistem ?? 0), 'Stok Aktual': Number(r.stok_aktual ?? 0),
      'Selisih': Number(r.selisih ?? 0), 'Keterangan': r.keterangan || '', 'Waktu': ''
    }));
    toast('Supabase tidak terjangkau — export dari data lokal');
  }
  if (!rows.length) { toast('Belum ada hasil opname.'); return; }
  try {
    await loadXlsx();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 30 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stock Opname');
    XLSX.writeFile(wb, 'Rekap_Stock_Opname.xlsx');
    toast('✓ ' + rows.length.toLocaleString('id-ID') + ' baris diexport ke .xlsx');
  } catch (e) {
    console.error(e);
    toast('Export gagal: ' + e.message);
  }
};

function toast(s) {
  $('toast').textContent = s;
  $('toast').classList.add('show');
  setTimeout(() => $('toast').classList.remove('show'), 2500);
}
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

// ---- Start ----
(async function init() {
  setStatus('Menghubungkan ke Supabase...', 'loading');
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
    stats();
    show('');
    await flushOutbox();
  } catch (e) {
    console.error(e);
    online = false;
    // Mode offline: master dari file lokal + hasil lama di HP
    try {
      const d = await (await fetch('data/master.json')).json();
      products = d.map((p, i) => ({ ...p, _id: String(i) }));
    } catch (e2) { products = []; }
    saved = JSON.parse(localStorage.getItem(LEGACY_KEY) || '{}');
    setStatus('● Offline — memakai data lokal di HP', 'err');
    stats();
    show('');
    toast('Tidak terhubung ke Supabase — mode offline');
  }
})();
