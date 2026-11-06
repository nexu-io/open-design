# Sistem Desain Terinspirasi Slack

> Category: Produktivitas & SaaS
> Platform komunikasi tempat kerja. Warna utama aubergine, palet logo multi-aksen, permukaan terang dengan sidebar gelap, hangat dan mudah didekati.

## 1. Tema Visual & Suasana

Identitas Slack dibangun di sekitar gagasan bahwa pekerjaan harus terasa manusiawi dan bahkan sedikit menyenangkan. Permukaan kanonik adalah **terang** — area konten putih dengan sidebar aubergine dalam (`#4A154B`) — kebalikan dari alat yang mengutamakan tema gelap. Kontras ini disengaja: sidebar adalah jangkar navigasi yang tenang dan selalu hadir, sementara area konten cerah dan terbuka.

Palet logo — biru, hijau, kuning, merah — muncul terutama pada ikon tagar dan konteks pemasaran, tidak tersebar di seluruh UI. Dalam produk itu sendiri, Slack menggunakan sistem warna yang terkendali dan profesional dengan aubergine sebagai satu-satunya jangkar merek.

**Karakteristik Utama:**
- Permukaan konten mengutamakan terang: putih `#FFFFFF` dan hampir putih `#F8F8F8`
- Sidebar aubergine dalam `#4A154B` — elemen UI merek yang paling mudah dikenali
- Empat warna aksen logo (biru, hijau, kuning, merah) digunakan hemat hanya sebagai sorotan
- Larsseit untuk judul (pemasaran), system sans-serif untuk UI
- Melengkung tapi tidak kartun: radius 4–8px pada sebagian besar komponen
- Padat tapi bisa bernapas: baris pesan yang ringkas dengan hierarki utas yang jelas
- Nada hangat dan percakapan — emoji, reaksi, dan ilustrasi adalah elemen kelas satu

---

## 2. Palet Warna & Peran

### Warna Utama Merek
| Token | Hex | Peran |
|---|---|---|
| `--color-aubergine` | `#4A154B` | Latar belakang sidebar, warna merek utama |
| `--color-aubergine-dark` | `#350d36` | Status hover pada permukaan aubergine |
| `--color-aubergine-light` | `#611f69` | Sorotan item aktif di sidebar |

### Warna Aksen Logo (gunakan hemat — hanya untuk sorotan, ikon, pemasaran)
| Token | Hex | Nama | Peran |
|---|---|---|---|
| `--color-blue` | `#36C5F0` | Biru Langit | Ikon saluran, tautan, status informasi |
| `--color-green` | `#2EB67D` | Hijau Teal | Status online, status sukses |
| `--color-yellow` | `#ECB22E` | Emas | Status tidak ada, peringatan, sorotan |
| `--color-red` | `#E01E5A` | Ruby | Notifikasi, kesalahan, lencana sebutan |

### Permukaan & Latar Belakang
| Token | Hex | Peran |
|---|---|---|
| `--bg-primary` | `#FFFFFF` | Area pesan utama, modal |
| `--bg-secondary` | `#F8F8F8` | Panel utas, permukaan sekunder |
| `--bg-tertiary` | `#F1F1F1` | Latar belakang input, status hover |
| `--bg-sidebar` | `#4A154B` | Sidebar kiri (aubergine) |
| `--bg-sidebar-hover` | `rgba(255,255,255,0.1)` | Hover item sidebar |
| `--bg-sidebar-active` | `rgba(255,255,255,0.2)` | Item sidebar aktif |
| `--bg-message-hover` | `#F8F8F8` | Hover baris pesan |

### Warna Teks
| Token | Hex | Peran |
|---|---|---|
| `--text-primary` | `#1D1C1D` | Teks konten utama (hampir hitam) |
| `--text-secondary` | `#616061` | Cap waktu, label diredam |
| `--text-sidebar` | `rgba(255,255,255,0.9)` | Nama saluran di sidebar |
| `--text-sidebar-muted` | `rgba(255,255,255,0.6)` | Item sidebar tidak aktif |
| `--text-link` | `#1264A3` | Tautan inline dalam pesan |
| `--text-mention` | `#1264A3` | Warna teks @sebutan |

### Warna Semantik
| Token | Hex | Peran |
|---|---|---|
| `--color-success` | `#2EB67D` | Toast sukses, status positif |
| `--color-warning` | `#ECB22E` | Status peringatan |
| `--color-danger` | `#E01E5A` | Status kesalahan, aksi destruktif |
| `--color-info` | `#36C5F0` | Sorotan informasional |

### Batas & Pemisah
| Token | Hex | Peran |
|---|---|---|
| `--border-default` | `#DDDDDD` | Pemisah standar, batas kartu |
| `--border-subtle` | `#F1F1F1` | Pemisah halus antar baris |
| `--border-focus` | `#1264A3` | Warna cincin fokus |

---

## 3. Aturan Tipografi

### Jenis Huruf
| Peran | Resmi | Fallback Web |
|---|---|---|
| Judul Display / Pemasaran | Larsseit | `'Larsseit', 'Helvetica Neue', Arial, sans-serif` |
| UI / Konten / Chrome | Slack Lato (kustom) | `system-ui, -apple-system, BlinkMacSystemFont, sans-serif` |
| Kode / Monospace | — | `'Monaco', 'Menlo', 'Courier New', monospace` |

> Slack menggunakan **Larsseit** untuk judul pemasaran dan varian Lato kustom untuk UI dalam produk. Untuk penggunaan web, `system-ui` adalah fallback yang paling aman.

### Skala Tipografi

| Tingkat | Ukuran | Bobot | Tinggi Baris | Spasi Huruf | Penggunaan |
|---|---|---|---|---|---|
| Display XL | 48px | 800 | 1.1 | -1px | Judul hero pemasaran |
| Display L | 36px | 700 | 1.15 | -0.5px | Hero seksi |
| Judul 1 | 28px | 700 | 1.25 | normal | Judul modal, header halaman |
| Judul 2 | 22px | 700 | 1.3 | normal | Judul kartu, seksi pengaturan |
| Judul 3 | 18px | 700 | 1.35 | normal | Header sub-seksi |
| Konten L | 16px | 400 | 1.5 | normal | Teks pesan, deskripsi |
| Konten | 15px | 400 | 1.46667 | normal | Teks UI default (ukuran dasar Slack) |
| Konten SM | 13px | 400 | 1.38462 | normal | Metadata sekunder |
| Keterangan | 12px | 400 | 1.33 | normal | Cap waktu, petunjuk |
| Kode | 12px | 400 | 1.5 | normal | Kode inline, blok kode |

### Aturan Tipografi
- Ukuran konten dasar Slack adalah **15px** — sedikit lebih kecil dari 16px untuk kepadatan
- Saluran belum dibaca: bobot 700 — tebal adalah indikator belum dibaca utama
- Cap waktu: 12px `--text-secondary`, tampilkan saat hover saja
- Blok kode: latar belakang `#F8F8F8`, batas `1px solid #DDDDDD`, border-radius 4px
- Jangan pernah menggunakan ukuran font di bawah 12px
- Judul pemasaran: letter-spacing `-1px` untuk ukuran display besar

---

## 4. Gaya Komponen

### Tombol

```css
/* Primary */
.btn-primary {
  background: #4A154B;
  color: #FFFFFF;
  border-radius: 4px;
  padding: 0 16px;
  height: 36px;
  font-size: 15px;
  font-weight: 700;
  border: none;
}
.btn-primary:hover { background: #611f69; }

/* Secondary */
.btn-secondary {
  background: #FFFFFF;
  color: #1D1C1D;
  border: 1px solid #DDDDDD;
  border-radius: 4px;
  padding: 0 16px;
  height: 36px;
  font-size: 15px;
  font-weight: 700;
}
.btn-secondary:hover { background: #F8F8F8; }

/* Danger */
.btn-danger {
  background: #E01E5A;
  color: #FFFFFF;
  border-radius: 4px;
}
.btn-danger:hover { background: #B3114A; }
```

### Bidang Input
```css
.input {
  background: #FFFFFF;
  border: 1px solid #DDDDDD;
  border-radius: 4px;
  color: #1D1C1D;
  font-size: 15px;
  padding: 8px 12px;
  height: 36px;
}
.input:focus {
  border-color: #1264A3;
  box-shadow: 0 0 0 2px rgba(18,100,163,0.25);
  outline: none;
}
```

### Item Saluran Sidebar
```css
.channel-item {
  height: 28px;
  padding: 0 16px;
  border-radius: 6px;
  color: rgba(255,255,255,0.7);
  font-size: 15px;
  font-weight: 400;
}
.channel-item:hover {
  background: rgba(255,255,255,0.1);
  color: #FFFFFF;
}
.channel-item.active {
  background: rgba(255,255,255,0.2);
  color: #FFFFFF;
}
.channel-item.unread {
  color: #FFFFFF;
  font-weight: 700;
}
```

### Lencana Belum Dibaca
```css
.badge {
  background: #E01E5A;
  color: #FFFFFF;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  min-width: 18px;
}
```

### Lampiran Pesan / Kartu
```css
.attachment {
  border-left: 4px solid #DDDDDD;
  background: #F8F8F8;
  border-radius: 0 4px 4px 0;
  padding: 8px 12px;
  margin: 4px 0;
}
```

### Reaksi
```css
.reaction {
  border: 1px solid #DDDDDD;
  border-radius: 24px;
  background: #F8F8F8;
  padding: 2px 8px;
  font-size: 13px;
  cursor: pointer;
}
.reaction:hover { background: #F1F1F1; }
.reaction.active {
  background: rgba(18,100,163,0.1);
  border-color: #1264A3;
}
```

---

## 5. Prinsip Tata Letak

### Tata Letak Tiga Kolom
```
┌──────────────┬──────────────────────────────┬─────────────┐
│   Sidebar    │        Area Pesan            │   Utas      │
│   (240px)    │          (flex: 1)           │  (400px)    │
│  #4A154B     │          #FFFFFF             │  opsional   │
└──────────────┴──────────────────────────────┴─────────────┘
```

### Sistem Spasi (dasar 4px)
| Token | Nilai | Penggunaan |
|---|---|---|
| `--space-1` | 4px | Celah rapat |
| `--space-2` | 8px | Padding komponen |
| `--space-3` | 12px | Padding input |
| `--space-4` | 16px | Padding standar |
| `--space-6` | 24px | Padding kartu |
| `--space-8` | 32px | Celah seksi |

### Struktur Sidebar
```
[Nama Ruang Kerja ▼]
────────────────────
Utas
Semua DM
Draf & Terkirim
────────────────────
▼ Saluran
  # general
  # random
  # design  ● (belum dibaca)
────────────────────
▼ Pesan Langsung
  John Doe
  Jane Smith
```

### Komposer Pesan
- Disematkan di bagian bawah area pesan
- `border: 1px solid #DDDDDD`, `border-radius: 8px`, `margin: 0 16px 16px`
- Toolbar: emoji, lampirkan, format, tombol kirim

---

## 6. Kedalaman & Elevasi

Slack menggunakan bayangan ringan pada permukaan terang:

| Tingkat | Penggunaan | Bayangan |
|---|---|---|
| Datar | Baris pesan, item sidebar | none |
| Rendah | Kartu, input | `0 1px 3px rgba(0,0,0,0.08)` |
| Sedang | Dropdown, popover | `0 4px 12px rgba(0,0,0,0.12)` |
| Tinggi | Modal, dialog | `0 8px 24px rgba(0,0,0,0.15)` |
| Overlay | Latar belakang modal | `rgba(0,0,0,0.5)` |

---

## 7. Yang Harus & Tidak Boleh Dilakukan

### ✅ Lakukan
- Gunakan aubergine `#4A154B` untuk sidebar — ini adalah elemen UI paling ikonik Slack
- Jaga area konten utama tetap putih dan terang
- Gunakan `#1D1C1D` (hampir hitam) untuk semua teks konten, bukan hitam murni
- Tebalkan nama saluran untuk menunjukkan status belum dibaca — bobot adalah indikatornya
- Gunakan empat warna aksen hanya untuk peran semantik (sukses, peringatan, bahaya, informasi)
- Terapkan `border-left: 4px` pada lampiran pesan dan embed
- Tampilkan cap waktu hanya saat hover
- Gunakan `#1264A3` untuk tautan dan status fokus
- Jaga item sidebar tetap ringkas: tinggi 28px, border-radius 6px

### ❌ Jangan
- Jangan gunakan area konten utama yang gelap — Slack mengutamakan terang
- Jangan menyebarkan biru/hijau/kuning/merah sebagai aksen dekoratif
- Jangan gunakan hitam murni `#000000` untuk teks
- Jangan gunakan balon percakapan — pesan adalah baris datar
- Jangan buat tombol dengan radius besar — 4px adalah standar
- Jangan tampilkan cap waktu secara permanen
- Jangan gunakan HURUF KAPITAL untuk nama saluran
- Jangan gunakan ukuran font di bawah 12px

---

## 8. Perilaku Responsif

### Titik Henti
| Titik Henti | Lebar | Tata Letak |
|---|---|---|
| Mobile | < 768px | Panel tunggal, sidebar sebagai laci kiri |
| Tablet | 768–1024px | Hanya sidebar + area pesan |
| Desktop | > 1024px | Tata letak tiga kolom penuh |

### Adaptasi Mobile
- Sidebar: laci kiri, geser kanan untuk membuka
- Tab bar bawah: Beranda, DM, Aktivitas, Anda
- Panel utas: overlay layar penuh
- Komposer: disematkan di atas keyboard
- Item daftar saluran: tinggi area sentuh 44px
- Header aubergine atas dipertahankan di mobile

---

## 9. Panduan Prompt Agent

Saat membuat desain bergaya Slack, ikuti pendekatan ini:

**Penerapan warna:**
> Atur `background: #FFFFFF` sebagai kanvas utama. Gunakan `#4A154B` (aubergine) untuk sidebar. Semua teks utama adalah `#1D1C1D`. Tautan dan cincin fokus menggunakan `#1264A3`. Empat warna logo — `#36C5F0`, `#2EB67D`, `#ECB22E`, `#E01E5A` — bersifat semantik saja: informasi, sukses, peringatan, bahaya.

**Tipografi:**
> Gunakan `system-ui, -apple-system, sans-serif` untuk semua UI. Ukuran dasar adalah 15px. Saluran belum dibaca: bobot 700. Teks konten: bobot 400. Cap waktu: 12px `#616061`, hanya saat hover. Kode: `Monaco, Menlo, monospace`, 12px, latar belakang `#F8F8F8`.

**Tata letak:**
> Tiga kolom: sidebar aubergine 240px + area pesan putih fleksibel + panel utas 400px opsional. Item sidebar: tinggi 28px, radius 6px, tebal saat belum dibaca. Komposer: disematkan di bawah, `border: 1px solid #DDDDDD`, `border-radius: 8px`.

**Komponen:**
> Tombol: radius 4px, tinggi 36px, aubergine sebagai utama. Input: batas `1px solid #DDDDDD`, cincin fokus `#1264A3`. Baris pesan: datar, tanpa balon, avatar lingkaran 36px. Reaksi: pill `border: 1px solid #DDDDDD`, `border-radius: 24px`.

**Nada:**
> Slack hangat, profesional, dan manusiawi. Status kosong menggunakan ilustrasi yang ramah. CTA langsung: "Kirim pesan", "Mulai". Pesan kesalahan jelas dan membantu. Tidak pernah mengkhawatirkan.

**Anti-pola yang harus dihindari:**
> Tidak ada area konten gelap. Tidak ada balon percakapan. Tidak ada teks hitam murni. Tidak ada aksen multi-warna yang tersebar. Tidak ada nama saluran dengan HURUF KAPITAL. Tidak ada font di bawah 12px. Tidak ada radius tombol yang besar.
