import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${API_URL}/api/admin/dashboard`, {
        credentials: "include",
        });

        if (!res.ok) {
          if (res.status === 401) {
            navigate('/staff-login');
            return;
          }
          throw new Error('Dashboard yüklenemedi');
        }

        const data = await res.json();
        setStats(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [navigate]);

  if (loading) return <div className="p-8">Yükleniyor...</div>;
  if (error) return <div className="p-8 text-red-600">⚠️ {error}</div>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <p className="text-sm text-gray-500">Bugünkü Ciro</p>
          <p className="text-3xl font-bold text-green-600 mt-2">
            {stats?.todayRevenue?.toFixed(2) || 0}₺
          </p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <p className="text-sm text-gray-500">Aktif Masalar</p>
          <p className="text-3xl font-bold text-indigo-600 mt-2">
            {stats?.activeTables?.length || 0}
          </p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <p className="text-sm text-gray-500">Bugünkü Ödemeler</p>
          <p className="text-3xl font-bold text-blue-600 mt-2">
            {stats?.paymentMethods?.reduce((s, p) => s + parseInt(p.count), 0) || 0}
          </p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <p className="text-sm text-gray-500">Kapanan Oturumlar</p>
          <p className="text-3xl font-bold text-purple-600 mt-2">
            {stats?.recentSessions?.length || 0}
          </p>
        </div>
      </div>

      {/* Active Tables */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Aktif Masalar</h2>
        {stats?.activeTables?.length === 0 ? (
          <p className="text-gray-400">Şu an aktif masa yok</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-sm text-gray-500">
                  <th className="pb-3 pr-4">Masa</th>
                  <th className="pb-3 pr-4">Kişi</th>
                  <th className="pb-3 pr-4">Toplam</th>
                  <th className="pb-3 pr-4">Kalan</th>
                  <th className="pb-3">Durum</th>
                </tr>
              </thead>
              <tbody>
                {stats?.activeTables?.map(table => {
                  const remaining = parseFloat(table.remaining);
                  const isPaid = remaining <= 0;
                  return (
                    <tr key={table.id} className="border-b border-gray-100">
                      <td className="py-3 pr-4 font-medium">Masa {table.table_number}</td>
                      <td className="py-3 pr-4">{table.participant_count}</td>
                      <td className="py-3 pr-4 font-semibold">{Number(table.total_bill || 0).toFixed(2)}₺</td>
                      <td className={`py-3 pr-4 font-bold ${isPaid ? 'text-green-600' : 'text-red-600'}`}>
                        {remaining.toFixed(2)}₺
                      </td>
                      <td className="py-3">
                        {isPaid ? (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Ödendi</span>
                        ) : remaining > 0 ? (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full">Bekliyor</span>
                        ) : (
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">Sipariş yok</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Items */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">🔥 En Çok Satanlar</h2>
          {stats?.topItems?.length === 0 ? (
            <p className="text-gray-400">Henüz satış yok</p>
          ) : (
            <div className="space-y-3">
              {stats?.topItems?.map((item, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-gray-400">#{i + 1}</span>
                    <span className="font-medium">{item.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-gray-800">{item.total_revenue}₺</span>
                    <span className="text-sm text-gray-500 ml-2">({item.total_qty} adet)</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Payment Methods */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">💳 Ödeme Yöntemleri</h2>
          {stats?.paymentMethods?.length === 0 ? (
            <p className="text-gray-400">Henüz ödeme yok</p>
          ) : (
            <div className="space-y-3">
              {stats?.paymentMethods?.map((method, i) => {
                const icons = { equal_split: '⚖️', item_based: '🍽️', full: '💳', custom: '🎨' };
                return (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{icons[method.payment_type] || '💳'}</span>
                      <span className="font-medium capitalize">{method.payment_type.replace('_', ' ')}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-gray-800">{parseFloat(method.total).toFixed(2)}₺</span>
                      <span className="text-sm text-gray-500 ml-2">({method.count} ödeme)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent Sessions */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">📋 Kapanan Oturumlar</h2>
        {stats?.recentSessions?.length === 0 ? (
          <p className="text-gray-400">Bugün kapanan oturum yok</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-sm text-gray-500">
                  <th className="pb-3 pr-4">Masa</th>
                  <th className="pb-3 pr-4">Oturum</th>
                  <th className="pb-3 pr-4">Tutar</th>
                  <th className="pb-3 pr-4">Kapanış</th>
                </tr>
              </thead>
              <tbody>
                {stats?.recentSessions?.map(s => (
                  <tr key={s.id} className="border-b border-gray-100">
                    <td className="py-3 pr-4 font-medium">Masa {s.table_number}</td>
                    <td className="py-3 pr-4 text-sm text-gray-500">#{s.session_number}</td>
                    <td className="py-3 pr-4 font-bold text-green-600">{Number(s.total_bill || 0).toFixed(2)}₺</td>
                    <td className="py-3 pr-4 text-sm text-gray-500">
                      {new Date(s.closed_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
