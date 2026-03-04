# Vibe Coding Roadmap

## 1. What is Vibe Coding

Vibe coding adalah pendekatan development di mana developer bekerja bersama AI coding tools untuk membangun software lebih cepat. Developer tetap menentukan arah, arsitektur, dan keputusan teknis, sementara AI membantu dalam:

- generate code
- refactoring
- debugging
- documentation
- testing

Developer tetap bertanggung jawab atas kualitas dan struktur sistem.

---

## 2. AI-Assisted Coding Tools

### General AI Coding Tools
- Claude Code
- Gemini
- Codex
- Cursor
- Windsurf
- Replit

### Frontend-Focused Builders
- v0
- Lovable

Tools ini mempercepat development tetapi tetap memerlukan pengawasan developer.

---

## 3. Plan Before Writing Code

Sebelum coding, tentukan struktur proyek terlebih dahulu.

Best practice:

- Tentukan **scope produk** (MVP dan fase berikutnya)
- Bangun sistem **step-by-step**, bukan sekaligus
- Berikan AI referensi seperti:
  - UI mockups
  - architecture diagrams
  - sample code
  - screenshots

AI bekerja jauh lebih baik dengan contoh yang jelas.

---

## 4. Tech Stack and Coding

Gunakan teknologi yang stabil dan populer.

Guidelines:

- Pilih **tech stack yang umum digunakan**
- Dokumentasikan style dan coding convention
- Minta AI membuat **code modular**
- Lakukan **review dan refactor code secara berkala**
- Gunakan library atau solusi yang sudah ada

---

## 5. Prompting Best Practices

Prompt yang baik menghasilkan output yang lebih baik.

Tips:

- Kerjakan **satu task per prompt**
- Berikan **instruksi yang spesifik**
- Jelaskan **apa yang tidak boleh dilakukan**
- Berikan reference seperti:
  - mockups
  - documentation
  - example files
- Gunakan framing seperti:
  - "act as a UX researcher"
  - "act as a backend architect"

Hal lain yang membantu:

- Maintain **context document** (misalnya `CLAUDE.md`)
- Untuk masalah kompleks, minta AI untuk **brainstorm dulu**

---

## 6. Managing Context

Manajemen context penting untuk kualitas output.

Best practices:

- Gunakan **long context window** jika diperlukan
- Jika AI gagal setelah beberapa percobaan, **mulai chat baru**
- Untuk task berbeda, gunakan **session baru**
- Gunakan **sub-agents** jika tersedia

---

## 7. Debugging with AI

AI sangat membantu dalam debugging.

Workflow:

- Berikan **error message lengkap**
- Sertakan **code yang relevan**
- Jika belum terpecahkan:
  - minta AI membuat **list kemungkinan penyebab**
- Tambahkan **logging** untuk mempercepat diagnosis
- Gunakan tools seperti **MCP / Playwright** jika tersedia

Tetap pahami penyebab bug sebelum menerima solusi.

---

## 8. Version Control Discipline

Gunakan Git dengan disiplin.

Guidelines:

- Commit setiap selesai feature atau fix
- Mulai feature baru dari **clean state**
- Gunakan **git revert** jika diperlukan
- Gunakan AI untuk membantu:
  - git command
  - PR creation
  - GitHub CLI tasks

Commit message harus jelas.

---

## 9. Testing Practices

Testing menjaga stabilitas sistem.

Workflow:

- Minta AI membuat **automated tests**
- Pertimbangkan **Test Driven Development (TDD)**
- Saat bug muncul:
  - buat **failing test**
  - kemudian perbaiki bug
- Setelah test ada, lakukan **refactor secara rutin**

---

## 10. Security Practices

Security harus dipikirkan sejak awal.

Rules:

- Minta AI melakukan **security audit**
- Jangan hardcode credential
- Gunakan **environment variables** untuk:
  - API keys
  - tokens
  - passwords

---

## 11. Planning with AI

AI juga bisa membantu perencanaan arsitektur.

Workflow:

1. Jelaskan ide produk
2. Minta AI membuat **system breakdown**
3. Minta AI membuat **documentation**
4. Gunakan dokumen tersebut sebagai referensi development

---

## 12. Establish Standards Early

Periksa output awal AI dengan hati-hati:

- coding patterns
- architecture decisions
- folder structure
- naming conventions

Jika standar buruk diterima sejak awal, akan menyebar ke seluruh codebase.

---

## 13. Regular Refactoring

AI cenderung menambahkan code tanpa membersihkan struktur.

Lakukan refactor secara berkala:

- pecah file besar
- hapus code duplikat
- perbaiki struktur modul
- optimasi performa

---

## 14. Maintain Context Documentation

Buat dokumen konteks proyek yang berisi:

- arsitektur sistem
- coding conventions
- keputusan desain
- lesson learned dari session sebelumnya

Update secara berkala.

---

## 15. Reset Context When Needed

Saat memulai task yang tidak berhubungan:

- clear context
- mulai session baru

Ini meningkatkan kualitas output dan menghemat token.

---

## 16. Commit Frequently

Setelah setiap perubahan penting:

- buat commit
- tulis pesan commit yang jelas

Contoh:
feat: add authentication middleware
fix: resolve pagination bug in API

Frequent commits mempermudah rollback.

---

## 17. Force Testing Early

AI sering membuat code tanpa test.

Biasakan:

- setiap feature baru harus memiliki test
- minimal basic coverage

Ini mencegah bug menyebar.

---

## 18. Never Store Secrets in Code

Jangan pernah menyimpan secret di source code.

Gunakan:

- environment variables
- secret manager
- config file yang di-ignore oleh git

Contoh:
.env
API_KEY=xxxx
DATABASE_URL=xxxx

---