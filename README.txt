STOCK OPNAME PWA V7

PWA untuk HP dengan sidebar: Home, Data Master, Stock, Riwayat
Revisi, Komplain, About. Data master + hasil opname tersimpan di
Supabase. Export menghasilkan file .xlsx asli.

YANG BERUBAH DI V7 (GANTI DATA MASTER)
- Data master DIGANTI TOTAL: 636 part baru (10 Nov 2026),
  menggantikan 4.008 part lama. Kolom data baru: Drawing No.,
  Article No., Part No., Material — TIDAK ada Part Name, jadi
  kolom Part Name tampil kosong di aplikasi & export.
- Kolom baru Article No. tampil di Data Master, detail part,
  Riwayat Revisi, pencarian, dan export .xlsx.
- PENTING — SQL GANTI MASTER (WAJIB): jalankan file
  ganti-master-stock-opname-2026-11-10.sql di Supabase SQL Editor
  (sekali saja). File itu menambah kolom article_no, menghapus
  semua part lama, lalu mengisi 636 part baru. Sampai SQL itu
  dijalankan, aplikasi online masih menampilkan data lama;
  aplikasi tetap bisa dibuka (mode offline memakai data baru
  dari file lokal).
- Riwayat opname lama TIDAK dihapus, tapi baris riwayat yang
  merujuk ke part lama akan tampil tanpa nama part (part-nya
  sudah tidak ada di master). Bila SQL DELETE gagal karena
  foreign key, lihat catatan di file SQL.

YANG BERUBAH DI V6.1 (PERBAIKAN UPDATE)
- Service worker diperbaiki: versi baru langsung aktif
  (skipWaiting + clients.claim) dan file tampilan utama selalu
  diambil dari jaringan bila online (network-first), jadi pengguna
  yang sudah pernah membuka aplikasi tidak lagi tertahan di versi
  lama. Sebelumnya, v6 sempat tidak tampil di browser yang sudah
  pernah membuka v5 karena cache service worker lama.
  Mode offline tetap jalan lewat cache.

YANG BERUBAH DI V6 (REFRESH TAMPILAN)
- Sidebar gelap (navy) dengan menu aktif berwarna biru.
- Kartu statistik berikon warna (Total/Sudah/Belum/Total Stok).
- Form opname: tombol +/− untuk hitung stok (tanpa ketik),
  angka besar, tombol Simpan lebih besar.
- Hasil pencarian yang sudah diopname bergaris hijau + nilai stok.
- Tabel berubah jadi kartu di layar HP (label tiap kolom).
- Topbar menempel saat scroll; tombol lebih besar & nyaman disentuh.
- Progress bar hijau bergradasi; toast & panel lebih halus.

YANG BERUBAH DI V5
- Form opname disederhanakan: HANYA Stok Saat Ini + Waktu Input
  (tanggal, jam, menit). Stok Sistem dan Selisih DIHAPUS.
- Sidebar (di HP jadi menu geser) dengan 6 halaman.
- Home: dashboard (Total Part, Sudah/Belum Opname, Total Stok,
  progress bar, opname terakhir, komplain baru).
- Data Master: tabel semua part + status hari ini + export master.
- Riwayat Revisi: opname per tanggal + export per tanggal +
  lacak riwayat satu part dari waktu ke waktu.
- Komplain: laporkan part bermasalah + status (Baru/Diproses/
  Selesai).
- Mode gelap (tombol di sidebar bawah).

SUPABASE
- Project: https://kjeboevclvwwtosjcnaq.supabase.co
  (sama dengan situs live qc.alifwildan14.workers.dev)
- Tabel master_parts(id, part_number, no_drawing, material)
- Tabel stock_opname(master_part_id, opname_date, revisi_gambar,
  stok_aktual, keterangan, created_at, updated_at)
- Upsert per part per tanggal: onConflict master_part_id, opname_date
- Kunci di app.js adalah publishable key (kunci publik untuk
  client-side, sama seperti di situs live). JANGAN diganti dengan
  service key.
- Part Name TIDAK ada di Supabase — diambil dari data/master.json
  (dicocokkan lewat Part Number) untuk tampilan + export.
- data/master.json tetap disertakan sebagai cadangan bila Supabase
  tidak terjangkau (mode offline: baca master lokal, simpan antre
  di HP, otomatis terkirim saat online lagi).

SQL TAMBAHAN (JALANKAN SEKALI DI SUPABASE — SQL EDITOR)
Tanpa SQL ini aplikasi tetap jalan: jam input & komplain hanya
tersimpan di HP. Setelah SQL dijalankan, keduanya tersimpan di
Supabase dan terlihat di semua perangkat.

  -- 1. Kolom jam input untuk stock_opname
  alter table public.stock_opname
    add column if not exists opname_time time;

  -- 2. Tabel komplain
  create table if not exists public.komplain (
    id bigint generated always as identity primary key,
    part_number text not null,
    part_name text,
    jenis text not null,
    deskripsi text,
    status text not null default 'Baru',
    created_at timestamptz not null default now()
  );

FITUR
- Search (Part Number / Part Name / No. Drawing)
- Stok Saat Ini + Waktu Input (datetime-local), Keterangan
- Navigasi part: sebelumnya / berikutnya / lanjut ke yang belum
  diopname
- Statistik + progress opname hari ini
- Export .xlsx (SheetJS, file xlsx.full.min.js disertakan lokal
  agar tetap bisa offline): semua tanggal, per tanggal, master
- Install ke layar utama, cache/offline via service worker
- Hapus antrean offline / data lokal hanya memengaruhi HP ini —
  data di Supabase tidak ikut terhapus.

FILE
- index.html, app.js, style.css, sw.js, manifest.json, icon.svg
- xlsx.full.min.js (SheetJS 0.18.5, lisensi Apache-2.0)
- data/master.json (636 part baru — cadangan offline)

DEPLOY CLOUDFLARE (WORKER + STATIC ASSETS, API)
  python3 cf_deploy_assets.py qc <folder-ini>
  (helper ada di connector custom.cloudflare)
  atau Cloudflare Pages Direct Upload seperti v4.

CATATAN
- Aplikasi butuh internet untuk membaca/menyimpan ke Supabase.
  Tanpa internet, aplikasi tetap bisa dibuka (mode offline) dan
  hasil opname akan terkirim otomatis begitu online lagi.
- Jangan gunakan mode incognito saat opname offline, karena
  antrean tersimpan di penyimpanan browser HP.
