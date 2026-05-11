import { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function StaffPage() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [resetPinModal, setResetPinModal] = useState(null);
  
  const [newStaff, setNewStaff] = useState({ name: '', role: 'waiter', pin: '' });
  const [newPin, setNewPin] = useState('');

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isOwner = user.role === 'owner';

  const fetchStaff = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/staff`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error('Personel listesi yüklenemedi');
      const data = await res.json();
      setStaff(data.staff || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStaff(); }, []);

  const handleAddStaff = async () => {
    if (!newStaff.name || !newStaff.pin) {
      alert('İsim ve PIN gerekli');
      return;
    }
    if (!/^\d{4}$/.test(newStaff.pin)) {
      alert('PIN 4 haneli olmalı');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/admin/staff`, {
        credentials: "include",
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newStaff)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShowAddModal(false);
      setNewStaff({ name: '', role: 'waiter', pin: '' });
      fetchStaff();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleUpdateRole = async (staffId, newRole) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/staff/${staffId}/role`, {
        credentials: "include",
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: newRole })
      });
      if (!res.ok) throw new Error('Rol güncellenemedi');
      fetchStaff();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleToggleActive = async (staffId, isActive) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/staff/${staffId}/active`, {
        credentials: "include",
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_active: isActive })
      });
      if (!res.ok) throw new Error('Durum güncellenemedi');
      fetchStaff();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleResetPin = async () => {
    if (!/^\d{4}$/.test(newPin)) {
      alert('PIN 4 haneli olmalı');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/admin/staff/${resetPinModal.id}/reset-pin`, {
        credentials: "include",
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newPin })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResetPinModal(null);
      setNewPin('');
      alert('PIN sıfırlandı');
    } catch (err) {
      alert(err.message);
    }
  };

  const getRoleLabel = (role) => {
    const labels = {
      owner: '👑 Patron',
      head_waiter: '👨‍🍳 Şef',
      waiter: '🧑‍💼 Garson'
    };
    return labels[role] || role;
  };

  if (loading) return <div className="p-8">Yükleniyor...</div>;
  if (error) return <div className="p-8 text-red-600">⚠️ {error}</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">👥 Personel</h1>
        <div className="flex gap-3">
          <button
            onClick={fetchStaff}
            className="px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200"
          >
            🔄 Yenile
          </button>
          {isOwner && (
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
            >
              + Personel Ekle
            </button>
          )}
        </div>
      </div>

      {/* Staff List */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="divide-y divide-gray-100">
          {staff.map(s => (
            <div key={s.id} className={`p-4 ${!s.is_active ? 'bg-gray-50 opacity-60' : ''}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-lg">
                    {s.name[0]}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800">{s.name}</h3>
                    <p className="text-sm text-gray-500">
                      {getRoleLabel(s.role)}
                      {s.last_login && ` • Son giriş: ${new Date(s.last_login).toLocaleString('tr-TR')}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    s.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {s.is_active ? 'Aktif' : 'Pasif'}
                  </span>

                  {isOwner && s.role !== 'owner' && (
                    <>
                      <select
                        value={s.role}
                        onChange={(e) => handleUpdateRole(s.id, e.target.value)}
                        className="px-3 py-1 border rounded-lg text-sm"
                      >
                        <option value="waiter">Garson</option>
                        <option value="head_waiter">Şef</option>
                      </select>

                      <button
                        onClick={() => handleToggleActive(s.id, !s.is_active)}
                        className={`px-3 py-1 rounded-lg text-sm ${
                          s.is_active
                            ? 'bg-red-100 text-red-600 hover:bg-red-200'
                            : 'bg-green-100 text-green-600 hover:bg-green-200'
                        }`}
                      >
                        {s.is_active ? 'Pasif Yap' : 'Aktif Yap'}
                      </button>

                      <button
                        onClick={() => setResetPinModal(s)}
                        className="px-3 py-1 bg-yellow-100 text-yellow-600 rounded-lg text-sm hover:bg-yellow-200"
                      >
                        PIN Sıfırla
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add Staff Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">Yeni Personel Ekle</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">İsim</label>
                <input
                  type="text"
                  value={newStaff.name}
                  onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300"
                  placeholder="Ahmet Yılmaz"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                <select
                  value={newStaff.role}
                  onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300"
                >
                  <option value="waiter">Garson</option>
                  <option value="head_waiter">Şef</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PIN (4 haneli)</label>
                <input
                  type="password"
                  maxLength={4}
                  value={newStaff.pin}
                  onChange={(e) => setNewStaff({ ...newStaff, pin: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300"
                  placeholder="****"
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
                onClick={handleAddStaff}
                className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700"
              >
                Ekle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset PIN Modal */}
      {resetPinModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setResetPinModal(null); setNewPin(''); }}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-2">PIN Sıfırla</h3>
            <p className="text-sm text-gray-500 mb-4">{resetPinModal.name}</p>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Yeni PIN (4 haneli)</label>
              <input
                type="password"
                maxLength={4}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-gray-300"
                placeholder="****"
              />
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setResetPinModal(null); setNewPin(''); }}
                className="flex-1 py-3 bg-gray-100 rounded-xl font-medium"
              >
                Vazgeç
              </button>
              <button
                onClick={handleResetPin}
                className="flex-1 py-3 bg-yellow-600 text-white rounded-xl font-medium hover:bg-yellow-700"
              >
                Sıfırla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
