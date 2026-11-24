# 📦 Stock Opname PWA

[![CI](https://github.com/alifwildan14/stock-opname-pwa/actions/workflows/ci.yml/badge.svg)](https://github.com/alifwildan14/stock-opname-pwa/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PWA](https://img.shields.io/badge/PWA-ready-blue.svg)](https://web.dev/progressive-web-apps/)
[![Supabase](https://img.shields.io/badge/Backend-Supabase-green.svg)](https://supabase.com/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-yellow.svg)]()

Aplikasi **Progressive Web App (PWA)** untuk stock opname di HP. Data master dan hasil opname tersimpan di **Supabase**, dan hasil opname bisa di-export ke file **Excel (.xlsx)**.

🔗 **Live Demo**: https://stock-opname.pages.dev (deploy via Cloudflare Pages)

---

## ✨ Fitur Utama

| Fitur | Deskripsi |
|-------|-----------|
| 🔍 **Search Cepat** | Part Number / Part Name / No. Drawing (4.008 part) |
| 📝 **Input Stok** | Stok Sistem & Stok Aktual, selisih terhitung otomatis |
| 📊 **Statistik Real-time** | Total Part / Sudah Opname / Belum Opname / Ada Selisih |
| ☁️ **Supabase Sync** | Upsert per part per tanggal opname (`onConflict: master_part_id, opname_date`) |
| 📊 **Export Excel** | `.xlsx` asli via SheetJS (termasuk offline) |
| 📴 **Mode Offline** | Antrean lokal di HP, auto-sync saat online kembali |
| 📲 **Install PWA** | Add to Home Screen, cache/offline via Service Worker |

---

## 🗄️ Supabase Schema

```sql
-- Tabel master parts
CREATE TABLE master_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_number TEXT UNIQUE NOT NULL,
  no_drawing TEXT,
  material TEXT
);

-- Tabel hasil opname
CREATE TABLE stock_opname (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_part_id UUID REFERENCES master_parts(id),
  opname_date DATE NOT NULL,
  revisi_gambar TEXT,
  stok_sistem INTEGER,
  stok_aktual INTEGER,
  selisih INTEGER GENERATED ALWAYS AS (stok_aktual - stok_sistem) STORED,
  keterangan TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(master_part_id, opname_date)
);
```

- `Part Name` diambil dari `data/master.json` (dicocokkan lewat Part Number)
- Kunci di `app.js` = **publishable key** (client-side). Jangan pakai *service key*.

---

## 📁 Struktur Project

```
stock-opname-pwa/
├── index.html          # Halaman utama (search + detail)
├── app.js              # Logika aplikasi + Supabase (PostgREST) + export .xlsx
├── style.css           # Styling responsive
├── sw.js               # Service Worker (cache/offline)
├── manifest.json       # PWA Manifest
├── icon.svg            # App icon
├── xlsx.full.min.js    # SheetJS 0.18.5 (Apache-2.0)
├── data/
│   └── master.json     # 4.008 master part (cadangan + sumber Part Name)
├── LICENSE             # MIT License
├── CONTRIBUTING.md     # Panduan kontribusi
├── CODE_OF_CONDUCT.md  # Code of Conduct
└── .github/workflows/  # CI/CD GitHub Actions
```

---

## 🚀 Deploy (Cloudflare Pages)

1. **Fork/Clone** repo ini
2. Cloudflare Dashboard → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
3. Pilih repo `stock-opname-pwa`, branch `main`
4. **Build settings**: 
   - Framework preset: `None`
   - Build command: `(kosongkan)`
   - Output directory: `.` (root)
5. **Deploy** → buka URL hasil deploy di HP → **Add to Home Screen**

> Atau: **Direct Upload** — zip isi folder (bukan folder pembungkus), upload ke Cloudflare Pages.

---

## 🛠️ Development

```bash
# Clone
git clone https://github.com/alifwildan14/stock-opname-pwa.git
cd stock-opname-pwa

# Serve lokal (opsional)
npx serve .
# Atau buka index.html langsung di browser
```

### Testing Checklist

- [ ] Search part number/name/drawing berfungsi
- [ ] Input stok & hitung selisih otomatis
- [ ] Simpan ke Supabase (online)
- [ ] Export .xlsx terbuka benar di Excel
- [ ] Offline mode: input tersimpan, sync saat online
- [ ] PWA install di Android/iOS
- [ ] Service worker cache work offline

---

## 🤝 Kontribusi

Lihat [CONTRIBUTING.md](CONTRIBUTING.md) untuk panduan:
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`)
- PR workflow
- Code standards

---

## 📜 Lisensi

[MIT License](LICENSE) © 2024 Wildan Alif Ardyanto

---

## 🔗 Links

- **Repo**: https://github.com/alifwildan14/stock-opname-pwa
- **Issues**: https://github.com/alifwildan14/stock-opname-pwa/issues
- **Releases**: https://github.com/alifwildan14/stock-opname-pwa/releases