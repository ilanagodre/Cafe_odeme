import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import PrintReceiptModal from "../components/PrintReceiptModal";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
const WS_URL = import.meta.env.VITE_WS_URL || "http://localhost:3000";

export default function TablesPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTable, setSelectedTable] = useState(null);
  const [closing, setClosing] = useState(false);
  const [cancelOrder, setCancelOrder] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editTable, setEditTable] = useState(null);
  const [tableForm, setTableForm] = useState({ table_number: "", qr_code: "" });
  const [showQRModal, setShowQRModal] = useState(null);
  const [showCashPaymentModal, setShowCashPaymentModal] = useState(false);
  const [cashPaymentType, setCashPaymentType] = useState("cash");
  const [cashPaymentLoading, setCashPaymentLoading] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printSession, setPrintSession] = useState(null);

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const canClose = ["owner", "head_waiter"].includes(user.role);
  const isOwner = user.role === "owner";

  const fetchData = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/admin/tables`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Masalar yüklenemedi");
      setData(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Real-time admin sync via WebSocket
  useEffect(() => {
    const socket = io(WS_URL, { transports: ["websocket", "polling"] });
    socket.on("connect", () => socket.emit("join_admin"));

    socket.on(
      "admin_order_updated",
      ({ sessionId, tableId, totalBill, remainingBalance, order }) => {
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            active: prev.active.map((t) =>
              t.session_id === sessionId
                ? {
                    ...t,
                    total_bill: totalBill,
                    remaining: remainingBalance,
                    orders: order ? [...(t.orders || []), order] : t.orders,
                  }
                : t,
            ),
            allTables: prev.allTables.map((t) =>
              t.id === tableId ? { ...t, total_bill: totalBill } : t,
            ),
          };
        });
        setSelectedTable((prev) =>
          prev?.session_id === sessionId
            ? {
                ...prev,
                total_bill: totalBill,
                remaining: remainingBalance,
                orders: order ? [...(prev.orders || []), order] : prev.orders,
              }
            : prev,
        );
      },
    );

    socket.on(
      "admin_payment_updated",
      ({ sessionId, tableId, totalBill, remainingBalance, payment }) => {
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            active: prev.active.map((t) =>
              t.session_id === sessionId
                ? {
                    ...t,
                    total_bill: totalBill,
                    remaining: remainingBalance,
                    payments: payment
                      ? [...(t.payments || []), payment]
                      : t.payments,
                  }
                : t,
            ),
            allTables: prev.allTables.map((t) =>
              t.id === tableId ? { ...t, total_bill: totalBill } : t,
            ),
          };
        });
        setSelectedTable((prev) =>
          prev?.session_id === sessionId
            ? {
                ...prev,
                total_bill: totalBill,
                remaining: remainingBalance,
                payments: payment
                  ? [...(prev.payments || []), payment]
                  : prev.payments,
              }
            : prev,
        );
      },
    );

    return () => socket.disconnect();
  }, []);

  const handleCloseTable = async (sessionId) => {
    if (!canClose) return;
    setClosing(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${API_URL}/api/admin/tables/${sessionId}/close`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSelectedTable(null);
      fetchData();
    } catch (err) {
      alert(err.message);
    } finally {
      setClosing(false);
    }
  };

  const handleCashPayment = async (sessionId) => {
    if (!canClose || !selectedTable) return;
    setCashPaymentLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${API_URL}/api/admin/tables/${sessionId}/cash-payment`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ paymentType: cashPaymentType }),
        },
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setShowCashPaymentModal(false);
      setCashPaymentType("cash");
      const paidSession = {
        id: selectedTable.session_id,
        table_number: selectedTable.table_number,
        total_bill: selectedTable.total_bill,
        paid_amount: selectedTable.total_bill,
      };
      const paidOrders = (selectedTable.orders || []).filter(
        (o) => o.status !== "cancelled",
      );
      setSelectedTable(null);
      fetchData();
      setPrintSession({ session: paidSession, orders: paidOrders });
      setShowPrintModal(true);
    } catch (err) {
      alert(err.message);
    } finally {
      setCashPaymentLoading(false);
    }
  };

  const handleCancelOrder = async (orderId) => {
    if (!canClose) return;
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/admin/orders/${orderId}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: cancelReason || "Şef iptali" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCancelOrder(null);
      setCancelReason("");
      setSelectedTable(null);
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleAddTable = async () => {
    if (!tableForm.table_number || !tableForm.qr_code) {
      alert("Masa numarası ve QR kod gerekli");
      return;
    }
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/admin/tables`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(tableForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShowAddModal(false);
      setTableForm({ table_number: "", qr_code: "" });
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleUpdateTable = async () => {
    if (!editTable) return;
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${API_URL}/api/admin/tables/${editTable.table_id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(editTable),
        },
      );
      if (!res.ok) throw new Error("Güncellenemedi");
      setEditTable(null);
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteTable = async (tableId) => {
    if (!confirm("Bu masayı silmek istediğinize emin misiniz?")) return;
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/admin/tables/${tableId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Silinemedi");
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) return <div className="p-8">Yükleniyor...</div>;
  if (error) return <div className="p-8 text-red-600">⚠️ {error}</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">🪑 Masalar</h1>
        <div className="flex gap-3">
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200"
          >
            🔄 Yenile
          </button>
          {isOwner && (
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
            >
              + Masa Ekle
            </button>
          )}
        </div>
      </div>

      {/* All Tables Grid */}
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          Tüm Masalar
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {data?.allTables?.map((table) => {
            const activeTable = data?.active?.find(
              (t) => t.table_id === table.id,
            );

            return (
              <div
                key={table.id}
                className={`bg-white rounded-xl p-5 shadow-sm border-2 text-left relative ${
                  activeTable
                    ? "border-transparent"
                    : "border-dashed border-gray-300"
                }`}
              >
                {isOwner && (
                  <div
                    className="absolute top-2 right-2 flex gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() =>
                        setEditTable({
                          table_id: table.id,
                          table_number: table.table_number,
                          qr_code: table.qr_code,
                        })
                      }
                      className="p-1 bg-gray-100 rounded hover:bg-gray-200 text-xs"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => setShowQRModal(table)}
                      className="p-1 bg-indigo-100 text-indigo-600 rounded hover:bg-indigo-200 text-xs"
                      title="QR Kod Göster"
                    >
                      📱
                    </button>
                    {!activeTable && (
                      <button
                        onClick={() => handleDeleteTable(table.id)}
                        className="p-1 bg-red-100 text-red-600 rounded hover:bg-red-200 text-xs"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                )}
                <div className="flex items-center justify-between mb-3">
                  <span
                    className={`text-lg font-bold ${activeTable ? "text-gray-800" : "text-gray-400"}`}
                  >
                    Masa {table.table_number}
                  </span>
                  <div
                    className={`w-3 h-3 rounded-full ${activeTable ? "bg-green-500" : "bg-gray-300"}`}
                  />
                </div>
                {activeTable ? (
                  <div
                    className="space-y-2 text-sm cursor-pointer hover:bg-gray-50 -mx-2 px-2 py-1 rounded"
                    onClick={() => setSelectedTable(activeTable)}
                  >
                    <div className="flex justify-between">
                      <span className="text-gray-500">Kişi:</span>
                      <span className="font-medium">
                        {activeTable.participant_count}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Toplam:</span>
                      <span className="font-bold">
                        {parseFloat(activeTable.total_bill || 0).toFixed(2)}₺
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Boş</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {data?.active?.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg">Henüz aktif masa yok</p>
          {isOwner && (
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-4 px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700"
            >
              + İlk Masayı Ekle
            </button>
          )}
        </div>
      )}

      {/* Session History */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          📋 Oturum Geçmişi
        </h2>
        {data?.history?.length === 0 ? (
          <p className="text-gray-400">Henüz kapanan oturum yok</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-3 pr-4">Masa</th>
                  <th className="pb-3 pr-4">Oturum</th>
                  <th className="pb-3 pr-4">Kişi</th>
                  <th className="pb-3 pr-4">Sipariş</th>
                  <th className="pb-3 pr-4">Tutar</th>
                  <th className="pb-3 pr-4">Kapanış</th>
                </tr>
              </thead>
              <tbody>
                {data?.history?.map((s, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-2.5 pr-4 font-medium">
                      Masa {s.table_number}
                    </td>
                    <td className="py-2.5 pr-4 text-gray-500">
                      #{s.session_number}
                    </td>
                    <td className="py-2.5 pr-4">{s.participant_count}</td>
                    <td className="py-2.5 pr-4">{s.order_count}</td>
                    <td className="py-2.5 pr-4 font-bold text-green-600">
                      {Number(s.total_bill || 0).toFixed(2)}₺
                    </td>
                    <td className="py-2.5 pr-4 text-gray-500">
                      {new Date(s.closed_at).toLocaleString("tr-TR", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Table Detail Modal */}
      {selectedTable && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedTable(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-800">
                  Masa {selectedTable.table_number}
                </h2>
                <p className="text-sm text-gray-500">
                  Oturum #{selectedTable.session_number} •{" "}
                  {new Date(selectedTable.opened_at).toLocaleTimeString(
                    "tr-TR",
                    { hour: "2-digit", minute: "2-digit" },
                  )}
                  'den beri açık
                </p>
              </div>
              <button
                onClick={() => setSelectedTable(null)}
                className="p-2 hover:bg-gray-100 rounded-lg text-xl"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Participants */}
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">
                  Masadakiler
                </h3>
                <div className="flex flex-wrap gap-2">
                  {selectedTable.participants?.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg"
                    >
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                        style={{ backgroundColor: p.color_code }}
                      >
                        {p.name[0]}
                      </div>
                      <span className="text-sm font-medium">
                        {p.name}
                        {p.is_host && " (host)"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Orders */}
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">
                  Siparişler
                </h3>
                {selectedTable.orders?.length === 0 ? (
                  <p className="text-gray-400 text-sm">Henüz sipariş yok</p>
                ) : (
                  <div className="space-y-1">
                    {selectedTable.orders?.map((order) => {
                      const orderedBy = selectedTable.participants?.find(
                        (p) => p.id === order.ordered_by,
                      );
                      const isPaid =
                        order.paid_by !== null && order.paid_by !== undefined;
                      const canCancel =
                        canClose && order.status !== "cancelled";
                      return (
                        <div
                          key={order.id}
                          className={`flex items-center justify-between p-3 rounded-lg ${order.status === "cancelled" ? "bg-red-50 opacity-50" : "bg-gray-50"}`}
                        >
                          <div className="flex items-center gap-3">
                            <div>
                              <p className="font-medium">
                                {order.name} × {order.quantity}
                                {isPaid && (
                                  <span className="ml-2 text-xs text-green-600">
                                    ✓ (ısmarlandı)
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-gray-500">
                                {orderedBy?.name || "—"} • {order.status}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-bold">
                              {parseFloat(order.total_price).toFixed(2)}₺
                            </span>
                            {canCancel && (
                              <button
                                onClick={() => setCancelOrder(order)}
                                className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded hover:bg-red-200"
                              >
                                İptal
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Payments */}
              {selectedTable.payments?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">
                    Ödemeler
                  </h3>
                  <div className="space-y-1">
                    {selectedTable.payments.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between p-3 bg-green-50 rounded-lg"
                      >
                        <span className="text-sm">
                          💳 {p.payment_type?.replace("_", " ")}
                        </span>
                        <span className="font-bold text-green-700">
                          {parseFloat(p.amount).toFixed(2)}₺
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Summary + Actions */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                <div className="flex justify-between text-lg">
                  <span className="text-gray-600">Toplam:</span>
                  <span className="font-bold">
                    {parseFloat(selectedTable.total_bill || 0).toFixed(2)}₺
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Ödenen:</span>
                  <span className="text-green-600 font-bold">
                    {(
                      parseFloat(selectedTable.total_bill || 0) -
                      parseFloat(selectedTable.remaining || 0)
                    ).toFixed(2)}
                    ₺
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t">
                  <span className="text-gray-700 font-semibold">Kalan:</span>
                  <span
                    className={`text-xl font-bold ${parseFloat(selectedTable.remaining || 0) === 0 ? "text-green-600" : "text-red-600"}`}
                  >
                    {parseFloat(selectedTable.remaining || 0).toFixed(2)}₺
                  </span>
                </div>

                {canClose && parseFloat(selectedTable.remaining || 0) > 0 && (
                  <button
                    onClick={() => setShowCashPaymentModal(true)}
                    className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700"
                  >
                    💵 Hesap Al (
                    {parseFloat(selectedTable.remaining || 0).toFixed(2)}₺)
                  </button>
                )}

                {canClose && parseFloat(selectedTable.remaining || 0) === 0 && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleCloseTable(selectedTable.session_id)}
                      disabled={closing}
                      className="flex-1 bg-green-600 text-white py-3 rounded-xl font-semibold hover:bg-green-700 disabled:opacity-50"
                    >
                      {closing ? "Kapatılıyor..." : "✓ Masayı Kapat"}
                    </button>
                    <button
                      onClick={() => {
                        setPrintSession({
                          session: {
                            id: selectedTable.session_id,
                            table_number: selectedTable.table_number,
                            total_bill: selectedTable.total_bill,
                            paid_amount: selectedTable.total_bill,
                          },
                          orders: (selectedTable.orders || []).filter(
                            (o) => o.status !== "cancelled",
                          ),
                        });
                        setShowPrintModal(true);
                      }}
                      className="px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200"
                      title="Fiş Yazdır"
                    >
                      🖨️
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Order Modal */}
      {cancelOrder && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => {
            setCancelOrder(null);
            setCancelReason("");
          }}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold mb-2">Sipariş İptal</h3>
            <p className="text-sm text-gray-500 mb-4">
              {cancelOrder.name} × {cancelOrder.quantity} (
              {parseFloat(cancelOrder.total_price).toFixed(2)}₺)
            </p>
            <input
              type="text"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="İptal sebebi (opsiyonel)"
              className="w-full px-4 py-3 rounded-lg border border-gray-300 mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setCancelOrder(null);
                  setCancelReason("");
                }}
                className="flex-1 py-3 bg-gray-100 rounded-xl font-medium"
              >
                Vazgeç
              </button>
              <button
                onClick={() => handleCancelOrder(cancelOrder.id)}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700"
              >
                İptal Et
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cash Payment Modal */}
      {showCashPaymentModal && selectedTable && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowCashPaymentModal(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold mb-2">Hesap Al</h3>
            <p className="text-sm text-gray-500 mb-6">
              Masa {selectedTable.table_number} — Kalan:{" "}
              <span className="font-bold text-red-600">
                {parseFloat(selectedTable.remaining || 0).toFixed(2)}₺
              </span>
            </p>

            <div className="mb-6 space-y-2">
              <label className="text-sm font-semibold text-gray-700">
                Ödeme Yöntemi
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "cash", label: "💵 Nakit" },
                  { value: "transfer", label: "🏦 Transfer" },
                  { value: "credit_card", label: "💳 Kredi Kartı" },
                  { value: "other", label: "📦 Diğer" },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setCashPaymentType(option.value)}
                    className={`py-3 rounded-lg font-medium transition-all ${
                      cashPaymentType === option.value
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCashPaymentModal(false)}
                className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200"
              >
                İptal
              </button>
              <button
                onClick={() => handleCashPayment(selectedTable.session_id)}
                disabled={cashPaymentLoading}
                className="flex-1 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {cashPaymentLoading ? "İşleniyor..." : "Onayla ve Kapat"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Table Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold mb-4">Yeni Masa Ekle</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Masa Numarası
                </label>
                <input
                  type="text"
                  value={tableForm.table_number}
                  onChange={(e) =>
                    setTableForm({ ...tableForm, table_number: e.target.value })
                  }
                  className="w-full px-4 py-3 rounded-lg border border-gray-300"
                  placeholder="5"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  QR Kod
                </label>
                <input
                  type="text"
                  value={tableForm.qr_code}
                  onChange={(e) =>
                    setTableForm({ ...tableForm, qr_code: e.target.value })
                  }
                  className="w-full px-4 py-3 rounded-lg border border-gray-300"
                  placeholder="cafe-table-5"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-3 bg-gray-100 rounded-xl font-medium"
              >
                Vazgeç
              </button>
              <button
                onClick={handleAddTable}
                className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700"
              >
                Ekle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Table Modal */}
      {editTable && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setEditTable(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold mb-4">Masa Düzenle</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Masa Numarası
                </label>
                <input
                  type="text"
                  value={editTable.table_number}
                  onChange={(e) =>
                    setEditTable({ ...editTable, table_number: e.target.value })
                  }
                  className="w-full px-4 py-3 rounded-lg border border-gray-300"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  QR Kod
                </label>
                <input
                  type="text"
                  value={editTable.qr_code}
                  onChange={(e) =>
                    setEditTable({ ...editTable, qr_code: e.target.value })
                  }
                  className="w-full px-4 py-3 rounded-lg border border-gray-300"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditTable(null)}
                className="flex-1 py-3 bg-gray-100 rounded-xl font-medium"
              >
                Vazgeç
              </button>
              <button
                onClick={handleUpdateTable}
                className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700"
              >
                Güncelle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {showQRModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowQRModal(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <h3 className="text-xl font-bold mb-2">
                Masa {showQRModal.table_number} - QR Kod
              </h3>
              <p className="text-sm text-gray-500 mb-6">
                Bu QR kodu yazdırıp masaya yerleştirin
              </p>

              <div className="bg-white p-6 rounded-xl border-2 border-gray-200 mb-6">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${window.location.origin}/table/${showQRModal.qr_code}`}
                  alt={`QR Code for Table ${showQRModal.table_number}`}
                  className="w-64 h-64 mx-auto"
                />
                <p className="text-xs text-gray-400 mt-4 break-all">
                  {window.location.origin}/table/{showQRModal.qr_code}
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowQRModal(null)}
                  className="flex-1 py-3 bg-gray-100 rounded-xl font-medium"
                >
                  Kapat
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700"
                >
                  🖨️ Yazdır
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Print Receipt Modal */}
      {showPrintModal && printSession && (
        <PrintReceiptModal
          session={printSession.session}
          orders={printSession.orders}
          onClose={() => {
            setShowPrintModal(false);
            setPrintSession(null);
          }}
        />
      )}
    </div>
  );
}
