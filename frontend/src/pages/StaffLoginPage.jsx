import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function StaffLoginPage() {
  const navigate = useNavigate();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = useCallback(async () => {
    if (pin.length !== 4 || loading) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'PIN hatalı');
        setPin('');
        return;
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      if (data.user.role === 'owner') {
        navigate('/admin');
      } else {
        navigate('/admin/dashboard');
      }
    } catch (err) {
      setError('Bağlantı hatası');
      setPin('');
    } finally {
      setLoading(false);
    }
  }, [pin, loading, navigate]);

  const handleDigit = (d) => {
    if (pin.length < 4 && !loading) setPin(pin + d);
  };

  const handleDelete = () => {
    if (!loading) setPin(pin.slice(0, -1));
  };

  // Physical keyboard support
  useEffect(() => {
    const handleKey = (e) => {
      if (loading) return;
      if (/^\d$/.test(e.key)) handleDigit(e.key);
      else if (e.key === 'Backspace') handleDelete();
      else if (e.key === 'Enter' && pin.length === 4) handleLogin();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [pin, loading]);

  // PIN pad layout: 1-9, Enter, 0, Backspace
  const padLayout = [
    '1', '2', '3',
    '4', '5', '6',
    '7', '8', '9',
    'ENTER', '0', '⌫'
  ];

  const handlePadPress = (key) => {
    if (key === 'ENTER') {
      if (pin.length === 4) handleLogin();
    } else if (key === '⌫') {
      handleDelete();
    } else {
      handleDigit(key);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">👨‍💼</div>
          <h1 className="text-2xl font-bold text-gray-800">Personel Girişi</h1>
          <p className="text-gray-500 text-sm mt-1">4 haneli PIN'inizi girin</p>
        </div>

        {/* PIN Display */}
        <div data-testid="pin-display" className="flex justify-center gap-4 mb-6">
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              className={`w-14 h-14 rounded-xl border-2 flex items-center justify-center text-2xl font-bold transition-all ${
                i < pin.length
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                  : 'border-gray-200 bg-gray-50'
              }`}
            >
              {i < pin.length ? '●' : ''}
            </div>
          ))}
        </div>

        {error && (
          <div data-testid="pin-error" className="bg-red-50 text-red-600 p-3 rounded-lg text-center text-sm mb-4">
            ⚠️ {error}
          </div>
        )}

        {/* PIN Pad */}
        <div className="grid grid-cols-3 gap-3">
          {padLayout.map((key, i) => {
            const isEnter = key === 'ENTER';
            const isBackspace = key === '⌫';
            const isEmpty = key === '';
            const isDisabled = loading || (isEnter && pin.length !== 4);

            const testId = isEnter ? 'pin-key-enter' : isBackspace ? 'pin-key-backspace' : `pin-key-${key}`;
            return (
              <button
                key={i}
                data-testid={testId}
                onClick={() => handlePadPress(key)}
                disabled={isDisabled}
                className={`h-16 rounded-xl text-xl font-semibold transition-all active:scale-95 ${
                  isEnter
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-30'
                    : isBackspace
                      ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      : isEmpty
                        ? 'bg-transparent cursor-default'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                }`}
              >
                {isEnter ? '↵' : key}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => navigate('/')}
          className="w-full mt-6 text-center text-gray-400 py-2 text-sm hover:text-gray-600"
        >
          ← Müşteri girişine dön
        </button>
      </div>
    </div>
  );
}
