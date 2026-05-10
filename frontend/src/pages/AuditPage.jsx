import { useState, useEffect } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export default function AuditPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterAction, setFilterAction] = useState("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const fetchLogs = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/admin/audit-logs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Kayıtlar yüklenemedi");
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const actions = [...new Set(logs.map((l) => l.action))];
  const filteredLogs =
    filterAction === "all"
      ? logs
      : logs.filter((l) => l.action === filterAction);

  const totalPages = Math.ceil(filteredLogs.length / PAGE_SIZE);
  const paginatedLogs = filteredLogs.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  const handleFilterChange = (action) => {
    setFilterAction(action);
    setPage(1);
  };

  const getActionLabel = (action) => {
    const labels = {
      staff_added: "Personel Eklendi",
      menu_item_added: "Ürün Eklendi",
      menu_item_updated: "Ürün Güncellendi",
      menu_item_deleted: "Ürün Silindi",
      session_close: "Masa Kapatıldı",
      order_cancel: "Sipariş İptal",
      login: "Giriş",
      logout: "Çıkış",
    };
    return labels[action] || action;
  };

  const getActionColor = (action) => {
    const colors = {
      staff_added: "bg-blue-100 text-blue-700",
      menu_item_added: "bg-green-100 text-green-700",
      menu_item_updated: "bg-yellow-100 text-yellow-700",
      menu_item_deleted: "bg-red-100 text-red-700",
      session_close: "bg-purple-100 text-purple-700",
      order_cancel: "bg-red-100 text-red-700",
      login: "bg-gray-100 text-gray-700",
      logout: "bg-gray-100 text-gray-700",
    };
    return colors[action] || "bg-gray-100 text-gray-700";
  };

  if (loading) return <div className="p-8">Yükleniyor...</div>;
  if (error) return <div className="p-8 text-red-600">⚠️ {error}</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">📝 Kayıtlar</h1>
        <button
          onClick={fetchLogs}
          className="px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200"
        >
          🔄 Yenile
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => handleFilterChange("all")}
          className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
            filterAction === "all"
              ? "bg-indigo-600 text-white"
              : "bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          Tümü
        </button>
        {actions.map((action) => (
          <button
            key={action}
            onClick={() => handleFilterChange(action)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap capitalize ${
              filterAction === action
                ? "bg-indigo-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {getActionLabel(action)}
          </button>
        ))}
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <p className="text-lg">Kayıt bulunamadı</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500 bg-gray-50">
                  <th className="py-3 px-4 font-medium">Tarih</th>
                  <th className="py-3 px-4 font-medium">Kullanıcı</th>
                  <th className="py-3 px-4 font-medium">İşlem</th>
                  <th className="py-3 px-4 font-medium">Detay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedLogs.map((log, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="py-3 px-4 text-gray-500 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString("tr-TR", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-medium">
                          {log.user_name || "Sistem"}
                        </p>
                        <p className="text-xs text-gray-500 capitalize">
                          {log.user_role}
                        </p>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${getActionColor(log.action)}`}
                      >
                        {getActionLabel(log.action)}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-gray-600">
                        {log.entity_type && (
                          <span className="capitalize">{log.entity_type}</span>
                        )}
                        {log.entity_id && (
                          <span className="text-gray-400">
                            {" "}
                            #{log.entity_id}
                          </span>
                        )}
                        {log.new_values && (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-xs text-indigo-600 hover:text-indigo-800">
                              Detayları gör
                            </summary>
                            <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-x-auto">
                              {JSON.stringify(
                                JSON.parse(log.new_values),
                                null,
                                2,
                              )}
                            </pre>
                          </details>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white rounded-xl shadow-sm px-4 py-3">
          <p className="text-sm text-gray-500">
            {(page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, filteredLogs.length)} /{" "}
            {filteredLogs.length} kayıt
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

      {/* Info Card */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <span className="text-blue-600 text-xl">ℹ️</span>
          <div>
            <h3 className="font-medium text-blue-800 mb-1">
              Kayıtlar Hakkında
            </h3>
            <p className="text-sm text-blue-700">
              Bu sayfa sistemdeki tüm önemli işlemlerin loglarını gösterir.
              Personel ekleme, menü değişiklikleri, masa kapatma ve sipariş
              iptalleri gibi işlemler otomatik olarak kaydedilir.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
