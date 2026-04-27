import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function LandingPage() {
  const [searchParams] = useSearchParams();
  const [name, setName] = useState('');
  const [tableNumber, setTableNumber] = useState('1');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // QR kod URL'den geliyorsa otomatik algıla
  // Örnek: ?qr=cafe-table-2  → Masa 2
  const qrFromUrl = searchParams.get('qr');
  const isFromQR = qrFromUrl && qrFromUrl.startsWith('cafe-table-');
  const detectedTable = isFromQR ? qrFromUrl.replace('cafe-table-', '') : null;

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/api/session/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrCode: `cafe-table-${detectedTable || tableNumber}`,
          participantName: name
        })
      });

      const data = await res.json();

      if (!res.ok) {
        console.error('[Landing] API error:', res.status, data);
        throw new Error(data.error || `Sunucu hatası (${res.status})`);
      }

      if (!data.sessionToken || !data.participant?.id) {
        console.error('[Landing] Invalid response:', data);
        throw new Error('Sunucudan geçersiz yanıt');
      }

      navigate(`/table/${data.sessionToken}/${data.participant.id}`);
    } catch (err) {
      console.error('[Landing] Error:', err);
      setError(err.message || 'Bilinmeyen hata');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">☕</div>
          <h1 className="text-3xl font-bold text-gray-800">Cafe Pay</h1>
          <p className="text-gray-500 mt-2">Hesabını gör, paylaş, öde</p>
          {isFromQR && (
            <div data-testid="qr-detected-banner" className="mt-3 bg-green-50 text-green-700 px-4 py-2 rounded-lg text-sm inline-block">
              ✓ Masa {detectedTable} algılandı
            </div>
          )}
        </div>

        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Adın
            </label>
            <input
              data-testid="name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ali"
              autoFocus={isFromQR}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {!isFromQR && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Masa Numarası
              </label>
              <select
                data-testid="table-select"
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500"
              >
                {[1, 2, 3, 4].map(n => (
                  <option key={n} value={n}>Masa {n}</option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <div data-testid="error-message" className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            data-testid="join-button"
            type="submit"
            disabled={loading || !name.trim()}
            className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Giriş yapılıyor...' : 'Masaya Katıl'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-400">
          MVP Demo
        </div>

        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-400 mb-3 text-center">📱 QR Demo — Masa seç:</p>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map(n => (
              <a
                key={n}
                href={`/?qr=cafe-table-${n}`}
                className="text-center py-2 bg-gray-100 rounded-lg text-sm text-indigo-600 hover:bg-indigo-50 font-medium transition-colors"
              >
                Masa {n}
              </a>
            ))}
          </div>
          <p className="text-xs text-gray-300 mt-2 text-center">Her link bir QR kod simülasyonu</p>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-200">
          <button
            onClick={() => navigate('/staff-login')}
            className="w-full text-center text-sm text-indigo-600 hover:text-indigo-800 py-2"
          >
            👨‍💼 Personel Girişi
          </button>
        </div>
      </div>
    </div>
  );
}
