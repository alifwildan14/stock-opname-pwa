STOCK OPNAME PWA V4

PWA untuk HP. Data master + hasil opname tersimpan di Supabase
(bukan lagi localStorage saja). Export menghasilkan file .xlsx asli.

SUPABASE
- Project: https://kjeboevclvwwtosjcnaq.supabase.co
  (sama dengan situs live qc.alifwildan14.workers.dev)
- Tabel master_parts(id, part_number, no_drawing, material)
- Tabel stock_opname(master_part_id, opname_date, revisi_gambar,
  stok_sistem, stok_aktual, selisih, keterangan, created_at, updated_at)
- Upsert per part per tanggal: onConflict master_part_id, opname_date
- Kunci di app.js adalah publishable key (kunci publik untuk
  client-side, sama seperti di situs live). JANGAN diganti dengan
  service key.
- Part Name TIDAK ada di Supabase — diambil dari data/master.json
  (dicocokkan lewat Part Number) untuk tampilan + export.
- data/master.json tetap disertakan sebagai cadangan bila Supabase
  tidak terjangkau (mode offline: baca master lokal, simpan antre
  di HP, otomatis terkirim saat online lagi).

FITUR
- Search (Part Number / Part Name / No. Drawing)
- Stok Sistem, Stok Aktual, Selisih otomatis, Keterangan
- Statistik: Total Part / Sudah Opname / Belum Opname / Ada Selisih
- Simpan ke Supabase (upsert per tanggal opname hari ini, WIB)
- Export .xlsx (SheetJS, file xlsx.full.min.js disertakan lokal
  agar tetap bisa offline) — nama file Rekap_Stock_Opname.xlsx
- Install ke layar utama, cache/offline via service worker
- Tombol Reset hanya menghapus antrean offline di HP, TIDAK
  menghapus data di Supabase.

FILE
- index.html, app.js, style.css, sw.js, manifest.json, icon.svg
- xlsx.full.min.js (SheetJS 0.18.5, lisensi Apache-2.0)
- data/master.json (4.008 part — cadangan + sumber Part Name)

DEPLOY CLOUDFLARE PAGES (Direct Upload)
1. Extract ZIP.
2. Cloudflare Dashboard -> Workers & Pages -> Create application
   -> Pages -> Upload assets / Direct Upload.
3. Upload isi folder ini (bukan folder pembungkusnya).
4. Deploy, buka URL hasil deploy di HP.
5. Pilih Add to Home Screen / Pasang App.

CATATAN
- Aplikasi butuh internet untuk membaca/menyimpan ke Supabase.
  Tanpa internet, aplikasi tetap bisa dibuka (mode offline) dan
  hasil opname akan terkirim otomatis begitu online lagi.
- Jangan gunakan mode incognito saat opname offline, karena
  antrean tersimpan di penyimpanan browser HP.
