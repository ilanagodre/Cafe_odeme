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

## 📱 Demo Senaryoları

### Senaryo 1: Waiter Mode (Geleneksel)

> **Garson sipariş alıp cihazdan giriyor.**

**Hazırlık:**

1. 2 telefon/tablet aç (veya 2 browser penceresi)
2. İkisi de **aynı masaya** katılsın (farklı isimlerle)

**Akış:**

1. **Ali** masaya katılır → Sipariş verir (Adana + Ayran)
2. **Veli** masaya katılır → Sipariş verir (Tavuk + Çay)
3. Her iki ekranda da **siparişler canlı görünür** (WebSocket)
4. **Ödemeye git** → "Eşit Bölüş" seç → Ali öder
5. ⭐ **VELI'NİN EKRANINDA** kalan balance anında güncellenir ⭐
6. Veli de öder → Hesap kapandı 🎉

**Satış Cümlesi:**

> _"Bakın, Ali telefonundan ödedi — Veli'nin ekranı OTOMATİK güncellendi. Başka garson çağırmaya, nakarit hesap beklemeye yok."_

---

### Senaryo 2: Self-Service QR Mode (Yeni)

> **Müşteri QR kod tarayıp kendi kendine sipariş + ödeme yapıyor.**

**Hazırlık:**

1. Admin panelden masa capacitysini 6 olarak ayarla
2. Masa QR kodunu print et (veya ekrana koy)
3. 2 telefon aç

**Akış:**

1. **Ali** QR kod tarar → Adı girer → Masaya katılır
2. **Veli** QR kod tarar → Adı girer → Aynı masaya katılır
3. Ali sipariş verir (Adana) → Durum: `pending_payment` (ödeme bekliyor)
4. Veli sipariş verir (Tavuk) → Durum: `pending_payment`
5. Ali öder (iyzico 3DS) → Kendi siparişi durumu `pending` → Mutfağa gidiyor
6. Veli öder → Kendi siparişi durumu `pending`
7. İkisi de ödenince → Session `waiting_service` → Admin "Servis Edildi" butonu aktif
8. Admin butona basarsa → Session `closed` → Masa temizlenmeye hazır ✅

**Avantajlar:**

- Garson çağırmaya gerek yok
- Müşteri kendi ödemeyi yapıyor (iyzico entegrasyonu)
- Session otomatik timeout (3 saat) → Admin uzatabilir
- Bağlantı kesilince pending_payment siparişler iptal edilir
- Capacity control ile aşırı kalabalık önlenir

**Satış Cümlesi:**

> _"QR kod tarattı, kendi sipariş verdi, kartla ödedi. Masaya garson gitmeye gerek yok. Müşteri gidemedeyse timeout yapıyor, admin kontrol edebiliyor."_

---

## 🏗 Architecture

```
┌──────────────────────────────────────────┐
│         Two Flow Modes (Both Active)      │
├──────────────────────────────────────────┤
│  1. Waiter Mode    2. Self-Service Mode  │
│     (Traditional)      (QR → Pay)        │
└──────────────────────────────────────────┘
           │                    │
           ▼                    ▼
    ┌─────────────┐      WebSocket       ┌─────────────────────┐
    │  Frontend   │ ◄──────────────────► │   API + WS          │
    │ React+Vite  │                      │   Express           │
    │   :5173     │                      │   :3000             │
    └─────────────┘                      └──────┬──────────────┘
                                                 │
                                  ┌──────────────┼──────────────┐
                                  │              │              │
                           ┌──────────────┐ ┌────────┐ ┌─────────┐
                           │  PostgreSQL  │ │ Redis  │ │ iyzico  │
                           │   tables     │ │ PubSub │ │(3DS)    │
                           │ table_session│ │:6379   │ │ Payment │
                           │  participants│ │        │ │Gateway  │
                           │   orders     │ │        │ │         │
                           │   payments   │ │        │ │         │
                           │    :5432     │ │        │ │         │
                           └──────────────┘ └────────┘ └─────────┘
```

**Two Session Types:**

- **waiter**: Garson arası siparişler (geleneksel)
- **self_service**: QR tarayıp müşteri kendi ödeme yapıyor (yeni)

**Key Components:**

- `GET /api/table/:qrCode/status` — Capacity control (public API)
- `POST /api/self-service/join` — QR ile session açma
- `timeoutChecker.js` — 60s'de çalışan session timeout job
- `socket.io` — Orders + payments canlı sync

---

## 🗄 Database (5 MVP Table)

| Table            | Purpose                |
| ---------------- | ---------------------- |
| `tables`         | Fiziksel masa + QR kod |
| `table_sessions` | Aktif masa oturumu     |
| `participants`   | Masadaki kişiler       |
| `orders`         | Siparişler             |
| `payments`       | Ödemeler               |

---

## 💰 Split Strategies

| Strategy      | Description               |
| ------------- | ------------------------- |
| `equal_split` | Alman usulü — herkes eşit |
| `item_based`  | Herkes yediğini öder      |

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

| Week | Goal                                       |
| ---- | ------------------------------------------ |
| 1    | ✅ Core flow: QR → Session → Orders → Bill |
| 2    | ✅ Split payment + WebSocket live updates  |
| 3    | UI polish + demo prep                      |

### Sonrası (Post-MVP)

- [ ] Sipariş modülü (QR Menü)
- [ ] Stripe/iyzico gerçek ödeme
- [ ] Admin dashboard (restoran sahibi için)
- [ ] Multi-tenant (her restoran kendi instance'ı)
- [ ] Analytics & reporting
