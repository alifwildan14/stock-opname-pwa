# 📦 Stock Opname PWA

Aplikasi Progressive Web App (PWA) untuk stock opname di HP. Data master dan hasil opname tersimpan di **Supabase**, dan hasil opname bisa di-export ke file **Excel (.xlsx)**.

## Fitur

- 🔍 Search Part Number / Part Name / No. Drawing (4.008 part)
- 📝 Input Stok Sistem & Stok Aktual, selisih terhitung otomatis
- 📊 Statistik: Total Part / Sudah Opname / Belum Opname / Ada Selisih
- ☁️ Simpan ke Supabase (upsert per part per tanggal opname)
- 📊 Export `.xlsx` asli (SheetJS, file disertakan lokal agar tetap offline)
- 📴 Mode offline: bila Supabase tidak terjangkau, hasil opname tersimpan di HP dan otomatis terkirim saat online lagi
- 📲 Install ke layar utama (PWA), cache/offline via service worker

## Supabase

- Tabel `master_parts` (`id`, `part_number`, `no_drawing`, `material`)
- Tabel `stock_opname` (`master_part_id`, `opname_date`, `revisi_gambar`, `stok_sistem`, `stok_aktual`, `selisih`, `keterangan`, `created_at`, `updated_at`)
- Upsert per part per tanggal: `onConflict: master_part_id, opname_date`
- `Part Name` tidak ada di Supabase — diambil dari `data/master.json` (dicocokkan lewat Part Number) untuk tampilan dan export.
- Kunci di `app.js` adalah *publishable key* (kunci publik untuk client-side). Jangan diganti dengan *service key*.

## Struktur file

```
index.html          # halaman utama (search + detail)
app.js              # logika aplikasi + Supabase (PostgREST) + export .xlsx
style.css           # tampilan
sw.js               # service worker (cache/offline)
xlsx.full.min.js    # SheetJS 0.18.5 (lisensi Apache-2.0)
manifest.json       # manifest PWA
icon.svg            # ikon aplikasi
data/master.json    # 4.008 master part — cadangan + sumber Part Name
```

## Deploy (Cloudflare Pages, Direct Upload)

1. Download ZIP dari release / clone repo ini.
2. Cloudflare Dashboard → Workers & Pages → Create application → Pages → Upload assets / Direct Upload.
3. Upload isi folder ini (bukan folder pembungkusnya).
4. Deploy, buka URL hasil deploy di HP → Add to Home Screen / Pasang App.

## Catatan

- Aplikasi butuh internet untuk membaca/menyimpan ke Supabase.
- Jangan gunakan mode incognito saat opname offline, karena antrean tersimpan di penyimpanan browser HP.
- Tombol Reset hanya menghapus antrean offline di HP — data di Supabase tidak dihapus.
