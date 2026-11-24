# Contributing to Stock Opname PWA

Terima kasih sudah mau berkontribusi! 🎉

## Cara Berkontribusi

1. **Fork** repo ini
2. Buat branch baru: `git checkout -b fitur/nama-fitur` atau `fix/nama-bug`
3. Commit perubahan dengan format [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat: tambah fitur export PDF`
   - `fix: perbaiki bug offline sync`
   - `chore: update dependencies`
   - `docs: perbaiki README`
4. Push ke fork: `git push origin fitur/nama-fitur`
5. Buat **Pull Request** ke branch `main`

## Standar Kode

- **JavaScript**: ES6+, gunakan `const`/`let`, hindari `var`
- **HTML/CSS**: Semantic HTML, CSS custom properties
- **Commit**: Conventional Commits (wajib)
- **PR**: Minimal 1 reviewer approve sebelum merge

## Development Setup

```bash
# Clone repo
git clone https://github.com/alifwildan14/stock-opname-pwa.git
cd stock-opname-pwa

# Buka index.html langsung di browser (file://)
# Atau pakai live server:
npx serve .
```

## Testing

- Test manual di HP (PWA install, offline mode)
- Test Supabase connection (read/write)
- Test export .xlsx

## Melaporkan Bug

Gunakan [GitHub Issues](https://github.com/alifwildan14/stock-opname-pwa/issues) dengan template:
- **Environment**: Browser/OS/HP model
- **Steps to reproduce**: Langkah-langkah detail
- **Expected vs Actual**: Apa yang diharapkan vs yang terjadi
- **Screenshots/Logs**: Jika ada

## Feature Request

Buka Issue dengan label `enhancement`, jelaskan:
- Masalah yang ingin diselesaikan
- Solusi yang diusulkan
- Alternatif yang dipertimbangkan

## Lisensi

Dengan berkontribusi, Anda menyetujui bahwa kontribusi Anda akan dilisensikan di bawah [MIT License](LICENSE).