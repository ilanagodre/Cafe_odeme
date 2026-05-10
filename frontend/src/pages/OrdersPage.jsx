import { useState, useEffect } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const [cancelModal, setCancelModal] = useState(null);
  const [cancelReason, setCancelReason] = useState("");

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const canCancel = ["owner", "head_waiter"].includes(user.role);

  const fetchOrders = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/admin/orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Siparişler yüklenemedi");
      const data = await res.json();
      setOrders(data.orders || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleCancelOrder = async () => {
    if (!canCancel || !cancelModal) return;
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${API_URL}/api/admin/orders/${cancelModal.id}/cancel`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ reason: cancelReason || "Şef iptali" }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCancelModal(null);
      setCancelReason("");
      fetchOrders();
    } catch (err) {
      alert(err.message);
    }
  };

  const filteredOrders = orders.filter((order) => {
    if (filter === "all") return true;
    if (filter === "pending") return order.status === "pending";
    if (filter === "preparing") return order.status === "preparing";
    if (filter === "served") return order.status === "served";
    if (filter === "cancelled") return order.status === "cancelled";
    return true;
  });

  const totalPages = Math.ceil(filteredOrders.length / PAGE_SIZE);
  const paginatedOrders = filteredOrders.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  const handleFilterChange = (key) => {
    setFilter(key);
    setPage(1);
  };

  const getStatusBadge = (status) => {
    const badges = {
      pending: { text: "Bekliyor", color: "bg-yellow-100 text-yellow-700" },
      preparing: { text: "Hazırlanıyor", color: "bg-blue-100 text-blue-700" },
      served: { text: "Servis Edildi", color: "bg-green-100 text-green-700" },
      cancelled: { text: "İptal", color: "bg-red-100 text-red-700" },
    };
    return badges[status] || badges.pending;
  };

  const updateStatus = async (orderId, newStatus) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/admin/orders/${orderId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Durum güncellenemedi");
      fetchOrders();
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) return <div className="p-8">Yükleniyor...</div>;
  if (error) return <div className="p-8 text-red-600">⚠️ {error}</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">🍽️ Siparişler</h1>
        <button
          onClick={fetchOrders}
          className="px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200"
        >
          🔄 Yenile
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {[
          { key: "all", label: "Tümü" },
          { key: "pending", label: "Bekliyor" },
          { key: "preparing", label: "Hazırlanıyor" },
          { key: "served", label: "Servis Edildi" },
          { key: "cancelled", label: "İptal" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleFilterChange(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
              filter === tab.key
                ? "bg-indigo-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Orders List */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {filteredOrders.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <p className="text-lg">Sipariş bulunamadı</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {paginatedOrders.map((order) => {
              const badge = getStatusBadge(order.status);
              const orderedBy = order.participant_name || "Bilinmiyor";
              const tableInfo = order.table_number
                ? `Masa ${order.table_number}`
                : "";

              return (
                <div
                  key={order.id}
                  className={`p-4 ${order.status === "cancelled" ? "bg-red-50 opacity-60" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-lg">
                        {order.quantity}x
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-800">
                          {order.name}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {orderedBy} • {tableInfo} •{" "}
                          {new Date(order.created_at).toLocaleTimeString(
                            "tr-TR",
                            { hour: "2-digit", minute: "2-digit" },
                          )}
                        </p>
                        {order.cancel_reason && (
                          <p className="text-xs text-red-500 mt-1">
                            İptal: {order.cancel_reason}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <span className="font-bold text-lg">
                        {parseFloat(order.total_price).toFixed(2)}₺
                      </span>

                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${badge.color}`}
                      >
                        {badge.text}
                      </span>

                      {order.status !== "cancelled" &&
                        order.status !== "served" &&
                        canCancel && (
                          <button
                            onClick={() => setCancelModal(order)}
                            className="px-3 py-1 bg-red-100 text-red-600 rounded-lg text-sm hover:bg-red-200"
                          >
                            İptal
                          </button>
                        )}

                      {order.status !== "cancelled" && (
                        <select
                          value={order.status}
                          onChange={(e) =>
                            updateStatus(order.id, e.target.value)
                          }
                          className="px-3 py-1 border rounded-lg text-sm"
                        >
                          <option value="pending">Bekliyor</option>
                          <option value="preparing">Hazırlanıyor</option>
                          <option value="served">Servis Edildi</option>
                        </select>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white rounded-xl shadow-sm px-4 py-3">
          <p className="text-sm text-gray-500">
            {(page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, filteredOrders.length)} /{" "}
            {filteredOrders.length} sipariş
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 1}
              className="px-3 py-1 rounded-lg text-sm bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Önceki
            </button>
            <span className="text-sm font-medium text-gray-700">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page === totalPages}
              className="px-3 py-1 rounded-lg text-sm bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Sonraki →
            </button>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {cancelModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => {
            setCancelModal(null);
            setCancelReason("");
          }}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold mb-2">Sipariş İptal</h3>
            <p className="text-sm text-gray-500 mb-4">
              {cancelModal.name} × {cancelModal.quantity} (
              {parseFloat(cancelModal.total_price).toFixed(2)}₺)
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
                  setCancelModal(null);
                  setCancelReason("");
                }}
                className="flex-1 py-3 bg-gray-100 rounded-xl font-medium"
              >
                Vazgeç
              </button>
              <button
                onClick={handleCancelOrder}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700"
              >
                İptal Et
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
