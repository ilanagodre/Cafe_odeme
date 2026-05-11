import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export default function TableLandingPage() {
  const { qrCode } = useParams();
  const navigate = useNavigate();

  const [status, setStatus] = useState(null); // null | "loading" | "ready" | "full" | "error"
  const [tableInfo, setTableInfo] = useState(null);
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  const fetchStatus = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await fetch(`${API_URL}/api/table/${qrCode}/status`);
      if (res.status === 404) {
        setStatus("error");
        setError("Geçersiz QR kod. Lütfen tekrar tarayın.");
        return;
      }
      const data = await res.json();
      setTableInfo(data);
      setStatus(data.capacityFull ? "full" : "ready");
    } catch {
      setStatus("error");
      setError("Sunucuya bağlanılamadı.");
    }
  }, [qrCode]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Daha önce bu oturuma katıldıysak doğrudan yönlendir
  useEffect(() => {
    if (!tableInfo?.session) return;
    const saved = localStorage.getItem(`ss_${qrCode}`);
    if (saved) {
      try {
        const { sessionToken, participantId, savedSessionId } =
          JSON.parse(saved);
        if (savedSessionId === tableInfo.session.id) {
          navigate(`/table/${sessionToken}/${participantId}`);
        }
      } catch {
        localStorage.removeItem(`ss_${qrCode}`);
      }
    }
  }, [tableInfo, qrCode, navigate]);

  const handleJoin = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setJoining(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/self-service/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrCode, participantName: trimmed }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setStatus("full");
        setTableInfo((prev) => ({ ...prev, capacityFull: true }));
        return;
      }
      if (!res.ok) {
        setError(data.error || "Katılım başarısız");
        return;
      }
      // Oturumu localStorage'a kaydet (reconnect için)
      localStorage.setItem(
        `ss_${qrCode}`,
        JSON.stringify({
          sessionToken: data.sessionToken,
          participantId: data.participant.id,
          savedSessionId: data.sessionId,
        }),
      );
      navigate(`/table/${data.sessionToken}/${data.participant.id}`);
    } catch {
      setError("Bağlantı hatası. Tekrar deneyin.");
    } finally {
      setJoining(false);
    }
  };

  if (status === "loading" || status === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">☕</div>
          <p className="text-gray-500">Masa bilgileri yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-white flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
          <div className="text-5xl mb-4">❌</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">Hata</h1>
          <p className="text-gray-500 mb-6">{error}</p>
          <button
            onClick={fetchStatus}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700"
          >
            Tekrar Dene
          </button>
        </div>
      </div>
    );
  }

  if (status === "full") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-white flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
          <div className="text-5xl mb-4">🚫</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">Masa Dolu</h1>
          <p className="text-gray-500 mb-2">
            Masa {tableInfo?.table?.table_number} şu an dolu (
            {tableInfo?.currentCount}/{tableInfo?.table?.max_concurrent} kişi).
          </p>
          <p className="text-gray-400 text-sm mb-6">
            Bir yer açılınca tekrar deneyin.
          </p>
          <button
            onClick={fetchStatus}
            className="w-full py-3 bg-orange-500 text-white rounded-xl font-semibold hover:bg-orange-600"
          >
            🔄 Yenile
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-white flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">☕</div>
          <h1 className="text-2xl font-bold text-gray-800">
            Masa {tableInfo?.table?.table_number}
          </h1>
          {tableInfo?.session && (
            <p className="text-sm text-gray-400 mt-1">
              {tableInfo.session.participantCount} kişi masada
            </p>
          )}
          {!tableInfo?.session && (
            <p className="text-sm text-indigo-500 mt-1">
              İlk kişi olarak katılın!
            </p>
          )}
        </div>

        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Adınız
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Adınızı girin"
              maxLength={100}
              autoFocus
              className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-lg"
            />
          </div>

          {error && <p className="text-red-500 text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={joining || !name.trim()}
            className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold text-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {joining ? "Katılınıyor..." : "Masaya Katıl →"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-400">
            {tableInfo?.table?.max_concurrent - (tableInfo?.currentCount || 0)}{" "}
            boş yer kaldı
          </p>
        </div>
      </div>
    </div>
  );
}
