import { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function ReportsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState('daily');

  const fetchReports = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/admin/reports?period=${period}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Raporlar yüklenemedi');
      const jsonData = await res.json();
      setData(jsonData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReports(); }, [period]);

  const totalRevenue = data?.revenue?.reduce((sum, r) => sum + parseFloat(r.total_revenue), 0) || 0;
  const totalSessions = data?.revenue?.reduce((sum, r) => sum + parseInt(r.session_count), 0) || 0;
  const avgPayment = data?.revenue?.length > 0 
    ? data.revenue.reduce((sum, r) => sum + parseFloat(r.avg_payment), 0) / data.revenue.length 
    : 0;

  if (loading) return <div className="p-8">Yükleniyor...</div>;
  if (error) return <div className="p-8 text-red-600">⚠️ {error}</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">📈 Raporlar</h1>
        <div className="flex gap-2">
          {[
            { key: 'daily', label: 'Günlük' },
            { key: 'weekly', label: 'Haftalık' },
            { key: 'monthly', label: 'Aylık' }
          ].map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                period === p.key
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={fetchReports}
            className="px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200"
          >
            🔄 Yenile
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white shadow-lg">
          <p className="text-green-100 text-sm">Toplam Ciro</p>
          <p className="text-3xl font-bold mt-2">{totalRevenue.toFixed(2)}₺</p>
        </div>
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white shadow-lg">
          <p className="text-blue-100 text-sm">Toplam Masa/Aktif Oturum</p>
          <p className="text-3xl font-bold mt-2">{totalSessions}</p>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 text-white shadow-lg">
          <p className="text-purple-100 text-sm">Ortalama Ödeme</p>
          <p className="text-3xl font-bold mt-2">{avgPayment.toFixed(2)}₺</p>
        </div>
      </div>

      {/* Revenue Chart (simple bar chart) */}
      {data?.revenue?.length > 0 && (
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">💰 Günlük Ciro Trendi</h2>
          <div className="space-y-2">
            {data.revenue.slice(0, 7).map((r, i) => {
              const maxRevenue = Math.max(...data.revenue.map(x => parseFloat(x.total_revenue)));
              const percentage = (parseFloat(r.total_revenue) / maxRevenue) * 100;
              return (
                <div key={i} className="flex items-center gap-4">
                  <span className="text-sm text-gray-500 w-24">
                    {new Date(r.date).toLocaleDateString('tr-TR', { month: 'short', day: 'numeric' })}
                  </span>
                  <div className="flex-1 h-8 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500 rounded-full flex items-center justify-end pr-2"
                      style={{ width: `${percentage}%` }}
                    >
                      <span className="text-xs text-white font-medium">{parseFloat(r.total_revenue).toFixed(0)}₺</span>
                    </div>
                  </div>
                  <span className="text-sm text-gray-500 w-16 text-right">{r.session_count} masa</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Items */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">🏆 En Çok Satan Ürünler</h2>
          {data?.topItems?.length === 0 ? (
            <p className="text-gray-400">Veri yok</p>
          ) : (
            <div className="space-y-2">
              {data?.topItems?.map((item, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-bold">
                      {i + 1}
                    </span>
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-gray-500">{item.total_qty} adet • {item.order_sessions} masa</p>
                    </div>
                  </div>
                  <span className="font-bold text-green-600">{parseFloat(item.total_revenue).toFixed(2)}₺</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Payment Methods */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">💳 Ödeme Yöntemleri</h2>
          {data?.paymentMethods?.length === 0 ? (
            <p className="text-gray-400">Veri yok</p>
          ) : (
            <div className="space-y-3">
              {data?.paymentMethods?.map((m, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium capitalize">{m.payment_type?.replace('_', ' ')}</span>
                    <span className="text-sm text-gray-500">{m.percentage}% ({m.count})</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${m.percentage}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{parseFloat(m.total).toFixed(2)}₺</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Table Revenue */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">🪑 Masa Bazlı Gelir</h2>
        {data?.tableRevenue?.length === 0 ? (
          <p className="text-gray-400">Veri yok</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-3 pr-4">Masa</th>
                  <th className="pb-3 pr-4">Oturum</th>
                  <th className="pb-3 pr-4">Toplam Ciro</th>
                  <th className="pb-3 pr-4">Ort. Oturum</th>
                  <th className="pb-3 pr-4">Kapanan</th>
                </tr>
              </thead>
              <tbody>
                {data?.tableRevenue?.map((t, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-2.5 pr-4 font-medium">Masa {t.table_number}</td>
                    <td className="py-2.5 pr-4">{t.session_count}</td>
                    <td className="py-2.5 pr-4 font-bold text-green-600">
                      {t.total_revenue ? parseFloat(t.total_revenue).toFixed(2) : '0.00'}₺
                    </td>
                    <td className="py-2.5 pr-4">
                      {t.avg_session_revenue ? parseFloat(t.avg_session_revenue).toFixed(2) : '0.00'}₺
                    </td>
                    <td className="py-2.5 pr-4">{t.closed_sessions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Hourly Breakdown */}
      {data?.hourlyBreakdown?.length > 0 && (
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">⏰ Saatlik Dağılım (Bugün)</h2>
          <div className="grid grid-cols-12 gap-2">
            {Array.from({ length: 24 }, (_, hour) => {
              const hourData = data.hourlyBreakdown.find(h => parseInt(h.hour) === hour);
              const maxRevenue = Math.max(...data.hourlyBreakdown.map(h => parseFloat(h.hourly_revenue)));
              const height = hourData ? (parseFloat(hourData.hourly_revenue) / maxRevenue) * 100 : 0;
              
              return (
                <div key={hour} className="flex flex-col items-center">
                  <div className="w-full h-24 bg-gray-100 rounded-lg overflow-hidden flex items-end">
                    {height > 0 && (
                      <div 
                        className="w-full bg-indigo-500 rounded-t-lg"
                        style={{ height: `${height}%` }}
                      />
                    )}
                  </div>
                  <span className="text-xs text-gray-500 mt-1">{hour}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
