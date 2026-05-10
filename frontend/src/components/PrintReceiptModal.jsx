import { useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export default function PrintReceiptModal({ session, orders, onClose }) {
  const [sending, setSending] = useState(false);
  const [networkMsg, setNetworkMsg] = useState("");

  const totalBill = parseFloat(session.total_bill || 0);
  const paidAmount = parseFloat(session.paid_amount || 0);
  const now = new Date();

  const handleBrowserPrint = () => {
    window.print();
  };

  const handleNetworkPrint = async (type) => {
    setSending(true);
    setNetworkMsg("");
    try {
      const token = localStorage.getItem("token");
      const endpoint =
        type === "kitchen"
          ? "/api/admin/printer/order"
          : "/api/admin/printer/receipt";
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionId: session.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNetworkMsg(`✓ ${data.message}`);
    } catch (err) {
      setNetworkMsg(`✗ ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  const paymentTypeLabel = (type) => {
    const m = {
      cash: "Nakit",
      transfer: "Havale",
      credit_card: "Kredi Kartı",
      iyzico_3ds: "Kart",
      full: "Tam Ödeme",
      other: "Diğer",
    };
    return m[type] || type || "";
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-sm shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Butonlar */}
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-bold text-gray-800">🖨️ Yazdır</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl"
          >
            ✕
          </button>
        </div>

        {/* Fiş önizleme — sadece print'te görünür */}
        <div id="print-area" className="p-4 font-mono text-xs text-black">
          <p className="text-center font-bold text-sm mb-1">
            {import.meta.env.VITE_CAFE_NAME || "KAFE"}
          </p>
          <p className="text-center">{"─".repeat(32)}</p>
          <p>Masa: {session.table_number || session.tableNumber || "-"}</p>
          <p>Tarih: {now.toLocaleDateString("tr-TR")}</p>
          <p>
            Saat:{" "}
            {now.toLocaleTimeString("tr-TR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          <p>{"─".repeat(32)}</p>
          {orders.map((o, i) => {
            const left = `${o.quantity}x ${o.name}`;
            const right = `${parseFloat(o.total_price).toFixed(2)}TL`;
            const pad = Math.max(1, 32 - left.length - right.length);
            return (
              <p key={i}>
                {left}
                {" ".repeat(pad)}
                {right}
              </p>
            );
          })}
          <p>{"─".repeat(32)}</p>
          <p className="font-bold">
            {"TOPLAM:"}
            {" ".repeat(
              Math.max(1, 32 - 7 - `${totalBill.toFixed(2)}TL`.length),
            )}
            {totalBill.toFixed(2)}TL
          </p>
          <p>
            {"ODENEN:"}
            {" ".repeat(
              Math.max(1, 32 - 7 - `${paidAmount.toFixed(2)}TL`.length),
            )}
            {paidAmount.toFixed(2)}TL
          </p>
          <p>{"─".repeat(32)}</p>
          <p className="text-center mt-1">Tesekkurler!</p>
          <p className="text-center">Afiyet olsun :)</p>
        </div>

        {/* Aksiyon butonları */}
        <div className="p-4 space-y-2 border-t">
          {/* Seviye 1 — tarayıcı yazdırma */}
          <button
            onClick={handleBrowserPrint}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700"
          >
            🖨️ Tarayıcıdan Yazdır
          </button>

          {/* Seviye 2 — ağ yazıcısı */}
          <button
            onClick={() => handleNetworkPrint("receipt")}
            disabled={sending}
            className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 disabled:opacity-50"
          >
            📡 Fiş Yazıcısına Gönder
          </button>
          <button
            onClick={() => handleNetworkPrint("kitchen")}
            disabled={sending}
            className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 disabled:opacity-50"
          >
            👨‍🍳 Mutfak Yazıcısına Gönder
          </button>

          {networkMsg && (
            <p
              className={`text-sm text-center font-medium ${networkMsg.startsWith("✓") ? "text-green-600" : "text-red-500"}`}
            >
              {networkMsg}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
