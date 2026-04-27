# ☕ Cafe Pay - QR Restaurant Payment System (MVP)

> **QR oku → Masaya katıl → Sipariş ver → Hesap bölüş → Öde**

B2B SaaS ürünü. Restoranlara satılmak üzere tasarlanmış, WebSocket ile canlı güncellenen split ödeme sistemi.

---

## 🚀 Quick Start

```bash
# 1. Docker Desktop'ı aç
# 2. Build + Run
docker compose up --build

# 3. Tarayıcıda aç
http://localhost:5173
```

---

## 📱 Demo Senaryosu (RESTORAN SATIŞI İÇİN)

> **Bu demo anı restoran sahibine gösterilecek asıl satış noktasıdır.**

### Hazırlık
1. 2 telefon/tablet aç (veya 2 browser penceresi)
2. İkisi de **aynı masaya** katılsın (farklı isimlerle)

### Akış
1. **Ali** masaya katılır → Sipariş verir (Adana + Ayran)
2. **Veli** masaya katılır → Sipariş verir (Tavuk + Çay)
3. Her iki ekranda da **siparişler canlı görünür** (WebSocket)
4. **Ödemeye git** → "Eşit Bölüş" seç → Ali öder
5. ⭐ **VELI'NİN EKRANINDA** kalan balance anında güncellenir ⭐
6. Veli de öder → Hesap kapandı 🎉

### Satış Cümlesi
> _"Bakın, Ali telefonundan ödedi — Veli'nin ekranı OTOMATİK güncellendi. Başka garson çağırmaya, nakarit hesap beklemeye yok."_

---

## 🏗 Architecture

```
┌─────────────┐      WebSocket       ┌─────────────┐
│  Frontend   │ ◄──────────────────► │   API + WS  │
│ React+Vite  │                      │ Express     │
│   :5173     │                      │   :3000     │
└─────────────┘                      └──────┬──────┘
                                            │
                                    ┌───────┴───────┐
                                    │               │
                             ┌──────────────┐  ┌─────────┐
                             │  PostgreSQL  │  │  Redis  │
                             │    :5432     │  │  :6379  │
                             └──────────────┘  └─────────┘
```

---

## 🗄 Database (5 MVP Table)

| Table | Purpose |
|-------|---------|
| `tables` | Fiziksel masa + QR kod |
| `table_sessions` | Aktif masa oturumu |
| `participants` | Masadaki kişiler |
| `orders` | Siparişler |
| `payments` | Ödemeler |

---

## 💰 Split Strategies

| Strategy | Description |
|----------|-------------|
| `equal_split` | Alman usulü — herkes eşit |
| `item_based` | Herkes yediğini öder |

---

## 🔧 Tech Stack

- **Backend**: Node.js + Express + Socket.IO
- **Frontend**: React 18 + Vite + TailwindCSS
- **Database**: PostgreSQL 16
- **Cache/PubSub**: Redis 7
- **Infra**: Docker Compose (arm64 native — M4 Max optimize)

---

## 📂 Project Structure

```
Cafe_odeme/
├── docker-compose.yml
├── .env
├── database/
│   ├── schema.sql          # 5 table MVP schema
│   └── seed.sql            # Demo data
├── src/
│   ├── server.js           # Express + WS entry point
│   ├── config/
│   │   └── database.js     # PostgreSQL pool
│   ├── routes/
│   │   └── api.js          # REST API + split algorithms
│   └── websocket/
│       └── websocket.service.js  # Socket.IO service
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── hooks/
        │   └── useTableSession.js  # WS hook (THE WOW MOMENT)
        └── pages/
            ├── LandingPage.jsx     # QR scan → join
            ├── TablePage.jsx       # Orders + live bill
            └── PaymentPage.jsx     # Split + pay
```

---

## 🎯 MVP Roadmap

| Week | Goal |
|------|------|
| 1 | ✅ Core flow: QR → Session → Orders → Bill |
| 2 | ✅ Split payment + WebSocket live updates |
| 3 | UI polish + demo prep |

### Sonrası (Post-MVP)
- [ ] Sipariş modülü (QR Menü)
- [ ] Stripe/iyzico gerçek ödeme
- [ ] Admin dashboard (restoran sahibi için)
- [ ] Multi-tenant (her restoran kendi instance'ı)
- [ ] Analytics & reporting
