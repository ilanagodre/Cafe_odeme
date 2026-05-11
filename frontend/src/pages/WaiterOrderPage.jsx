import { useState, useEffect } from "react";
import {
  ChevronLeft,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  AlertCircle,
} from "lucide-react";
import { useTableSessionAdmin } from "../hooks/useTableSessionAdmin";

export default function WaiterOrderPage() {
  const [step, setStep] = useState(1);
  const [tables, setTables] = useState([]);
  const [menu, setMenu] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const [newName, setNewName] = useState("");
  const [cart, setCart] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [sessionOpened, setSessionOpened] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [sessionToken, setSessionToken] = useState(null);
  const [menuCategoryFilter, setMenuCategoryFilter] = useState("all");

  const [activeSessions, setActiveSessions] = useState([]);

  // Listen to real-time session updates via WebSocket
  const { sessionState } = useTableSessionAdmin(sessionToken);

  // Fetch tables and menu on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [tablesRes, menuRes] = await Promise.all([
          fetch("/api/admin/tables", {
            credentials: "include",
          }),
          fetch("/api/admin/menu"),
        ]);

        if (!tablesRes.ok) throw new Error("Failed to fetch tables");
        if (!menuRes.ok) throw new Error("Failed to fetch menu");

        const tablesData = await tablesRes.json();
        const menuData = await menuRes.json();

        setActiveSessions(tablesData.active || []);
        setTables(tablesData.allTables || []);
        setMenu(menuData.items || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Update selectedTable when WebSocket receives new session state
  useEffect(() => {
    if (sessionState && selectedTable && sessionToken) {
      // Merge WebSocket data (participants, orders) with selectedTable
      const updatedTable = {
        ...selectedTable,
        participants: sessionState.participants || [],
        participant_count: sessionState.participants?.length || 0,
        orders: sessionState.orders || [],
        total_bill:
          sessionState.orders?.reduce(
            (sum, o) => sum + parseFloat(o.total_price || 0),
            0,
          ) || 0,
      };
      setSelectedTable(updatedTable);
    }
  }, [sessionState, sessionToken]);

  const handleSelectTable = (tableData) => {
    const tableIdKey = tableData.table_id || tableData.id;
    // If table already has an active session, merge that data (includes participants)
    const activeSession = activeSessions.find((s) => s.table_id === tableIdKey);

    const normalizedTable = {
      ...tableData,
      ...(activeSession || {}),
      table_id: tableIdKey,
    };
    setSelectedTable(normalizedTable);
    setSelectedParticipant(null);
    setCart([]);
    setError("");
    setSuccessMsg("");

    if (activeSession) {
      setSessionOpened(true);
      setSessionId(activeSession.session_id);
      setSessionToken(activeSession.session_token);
    } else {
      setSessionOpened(false);
      setSessionId(null);
      setSessionToken(null);
    }
    setStep(2); // Masayı Aç adımına git
  };

  const handleOpenSession = async () => {
    try {
      setSubmitting(true);
      setError("");

      const res = await fetch(
        `/api/admin/tables/${selectedTable.table_id}/open-session`,
        {
          credentials: "include",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!res.ok) throw new Error("Masa açılamadı");

      const data = await res.json();
      setSessionId(data.sessionId);
      setSessionToken(data.sessionToken);
      setSessionOpened(true);
      setSuccessMsg(data.message);

      // 2 saniye sonra Müşteri Seç adımına git
      setTimeout(() => {
        setStep(3);
        setSuccessMsg("");
      }, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddNewParticipant = async (e) => {
    e.preventDefault();
    if (!newName.trim()) {
      setError("Lütfen müşteri adını girin");
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch(
        `/api/admin/tables/${selectedTable.table_id}/participant`,
        {
          credentials: "include",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            participantName: newName,
          }),
        },
      );

      if (!res.ok) throw new Error("Failed to add participant");

      const data = await res.json();
      setSelectedParticipant({
        id: data.participant.id,
        name: newName,
      });
      // Update participants list so it shows when returning to Step 3
      setSelectedTable((prev) => ({
        ...prev,
        participants: [...(prev.participants || []), data.participant],
      }));
      setNewName("");
      setError("");
      setStep(4); // Sipariş Ver adımına git
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectParticipant = (participant) => {
    setSelectedParticipant(participant);
    setNewName("");
    setError("");
    setCart([]);
    setStep(4); // Sipariş Ver adımına git
  };

  const handleAddToCart = (item) => {
    const existing = cart.find((c) => c.id === item.id);
    if (existing) {
      setCart(
        cart.map((c) =>
          c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c,
        ),
      );
    } else {
      setCart([
        ...cart,
        {
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: 1,
        },
      ]);
    }
  };

  const handleUpdateQuantity = (itemId, delta) => {
    setCart(
      cart
        .map((c) =>
          c.id === itemId
            ? { ...c, quantity: Math.max(0, c.quantity + delta) }
            : c,
        )
        .filter((c) => c.quantity > 0),
    );
  };

  const handleRemoveFromCart = (itemId) => {
    setCart(cart.filter((c) => c.id !== itemId));
  };

  const handleSubmitOrder = async () => {
    if (cart.length === 0) {
      setError("Lütfen en az bir ürün seçin");
      return;
    }

    try {
      setSubmitting(true);
      setError("");

      // Submit each item in cart
      const orderPromises = cart.map((item) =>
        fetch("/api/order", {
          credentials: "include",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionToken: sessionToken || selectedTable.session_token,
            itemName: item.name,
            quantity: item.quantity,
            price: item.price,
            orderedBy: selectedParticipant.id,
          }),
        }),
      );

      const responses = await Promise.all(orderPromises);

      for (const res of responses) {
        if (!res.ok) throw new Error("Failed to submit order");
      }

      setSuccessMsg(`${cart.length} ürün başarıyla siparişe eklendi`);
      setCart([]);
      setSelectedParticipant(null);
      setNewName("");

      // Reset to step 3 to add another customer
      setTimeout(() => {
        setStep(3);
        setSuccessMsg("");
      }, 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const cartTotal = cart.reduce(
    (sum, item) => sum + parseFloat(item.price) * item.quantity,
    0,
  );

  const handleBack = () => {
    if (step === 1) return;
    if (step === 2) {
      setStep(1);
      setSelectedTable(null);
    } else if (step === 3) {
      setStep(2);
      setCart([]);
      setSelectedParticipant(null);
    } else if (step === 4) {
      setStep(3);
      setCart([]);
      setSelectedParticipant(null);
    }
    setError("");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={handleBack}
              disabled={step === 1}
              className="p-2 hover:bg-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h1 className="text-3xl font-bold text-gray-900">Sipariş Al</h1>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center gap-4">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold ${
                    s === step
                      ? "bg-indigo-600 text-white"
                      : s < step
                        ? "bg-indigo-200 text-indigo-800"
                        : "bg-gray-300 text-gray-600"
                  }`}
                >
                  {s}
                </div>
                {s < 4 && <div className="w-8 h-0.5 bg-gray-300"></div>}
              </div>
            ))}
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Success Alert */}
        {successMsg && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
            <ShoppingCart className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <p className="text-green-700">{successMsg}</p>
          </div>
        )}

        {/* Step 1: Select Table */}
        {step === 1 && (
          <div>
            <h2 className="text-xl font-semibold mb-6">Masa Seçin</h2>
            {tables.length === 0 ? (
              <div className="p-8 bg-white rounded-lg border border-gray-200 text-center">
                <p className="text-gray-600">Masa bulunmamaktadır</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {tables.map((table) => {
                  // Check if table has active session by looking in activeSessions
                  const isActive = activeSessions.some(
                    (session) => session.table_id === table.id,
                  );
                  return (
                    <button
                      key={table.id}
                      onClick={() => handleSelectTable(table)}
                      className={`p-6 rounded-lg border-2 transition text-left ${
                        isActive
                          ? "bg-green-50 border-green-300 hover:border-green-600"
                          : "bg-white border-gray-200 hover:border-indigo-600"
                      } hover:shadow-lg`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-semibold text-gray-900">
                            Masa {table.table_number}
                          </h3>
                          {isActive && (
                            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                          )}
                        </div>
                        {isActive && (
                          <span className="text-xs bg-green-200 text-green-800 px-2 py-1 rounded">
                            Açık
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mb-2">
                        Kişi Sayısı:{" "}
                        <span className="font-medium">
                          {table.participant_count || 0}
                        </span>
                      </p>
                      <p className="text-sm text-gray-600">
                        Toplam Hesap:{" "}
                        <span className="font-medium">
                          ₺{(parseFloat(table.total_bill) || 0).toFixed(2)}
                        </span>
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Open Table */}
        {step === 2 && selectedTable && (
          <div className="max-w-md mx-auto">
            <h2 className="text-xl font-semibold mb-6">Masayı Aç</h2>

            <div className="bg-white rounded-lg border border-gray-200 p-8 text-center mb-6">
              <div className="flex items-center justify-center mb-4">
                <div className="text-5xl font-bold text-indigo-600">
                  {selectedTable.table_number}
                </div>
                {(activeSessions.some(
                  (s) => s.table_id === selectedTable.table_id,
                ) ||
                  sessionOpened) && (
                  <div className="w-4 h-4 bg-green-500 rounded-full ml-4 animate-pulse"></div>
                )}
              </div>
              <p className="text-gray-600 text-lg mb-4">
                Masa {selectedTable.table_number}'ı açmaya hazır
              </p>
              {!sessionOpened ? (
                <p className="text-gray-500 text-sm mb-6">
                  Lütfen "Masayı Aç" butonuna tıkla
                </p>
              ) : (
                <p className="text-green-600 font-semibold">✓ Masa açıldı</p>
              )}
            </div>

            {!sessionOpened ? (
              <button
                onClick={handleOpenSession}
                disabled={submitting}
                className="w-full px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {submitting ? "Açılıyor..." : "Masayı Aç"}
              </button>
            ) : (
              <button
                onClick={() => setStep(3)}
                className="w-full px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition"
              >
                Müşteri Ekle - Devam Et
              </button>
            )}
          </div>
        )}

        {/* Step 3: Select or Add Participant */}
        {step === 3 && selectedTable && (
          <div>
            <h2 className="text-xl font-semibold mb-4">
              Masa {selectedTable.table_number} - Kişi Seçin
            </h2>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Existing Participants */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-4">
                  Masadaki Kişiler
                </h3>
                <div className="space-y-2">
                  {selectedTable.participants &&
                  selectedTable.participants.length > 0 ? (
                    selectedTable.participants.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => handleSelectParticipant(p)}
                        className="w-full p-4 bg-white rounded-lg border border-gray-200 hover:bg-indigo-50 hover:border-indigo-400 transition text-left"
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: p.color_code || "#999" }}
                          ></div>
                          <p className="font-medium text-gray-900">{p.name}</p>
                          {p.is_host && (
                            <span className="text-xs bg-indigo-100 text-indigo-800 px-2 py-1 rounded">
                              Ev Sahibi
                            </span>
                          )}
                        </div>
                      </button>
                    ))
                  ) : (
                    <p className="text-gray-500 text-sm">
                      Henüz kimse bulunmamaktadır
                    </p>
                  )}
                </div>
              </div>

              {/* Add New Participant */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-4">
                  Yeni Müşteri Ekle
                </h3>
                <form onSubmit={handleAddNewParticipant} className="space-y-4">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Müşteri adını girin"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                  <button
                    type="submit"
                    disabled={submitting || !newName.trim()}
                    className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    {submitting ? "Ekleniyor..." : "Ekle ve Devam Et"}
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Select Items and Place Order */}
        {step === 4 && selectedTable && selectedParticipant && (
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Menu */}
            <div className="lg:col-span-2">
              <h2 className="text-xl font-semibold mb-3">Ürün Seçin</h2>
              {/* Category tabs */}
              {menu.length > 0 && (
                <div className="flex gap-1.5 flex-wrap mb-3">
                  <button
                    onClick={() => setMenuCategoryFilter("all")}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                      menuCategoryFilter === "all"
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    Tümü
                  </button>
                  {[
                    ...new Set(menu.map((i) => i.category).filter(Boolean)),
                  ].map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setMenuCategoryFilter(cat)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                        menuCategoryFilter === cat
                          ? "bg-indigo-600 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[420px] overflow-y-auto pr-1">
                {menu.length > 0 ? (
                  menu
                    .filter(
                      (item) =>
                        menuCategoryFilter === "all" ||
                        item.category === menuCategoryFilter,
                    )
                    .map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleAddToCart(item)}
                        className="p-2.5 bg-white rounded-lg border border-gray-200 hover:border-indigo-500 hover:bg-indigo-50 transition text-left active:scale-95"
                      >
                        <p className="text-sm font-semibold text-gray-900 leading-tight mb-1">
                          {item.name}
                        </p>
                        <p className="text-sm font-bold text-indigo-600">
                          ₺{(parseFloat(item.price) || 0).toFixed(2)}
                        </p>
                      </button>
                    ))
                ) : (
                  <p className="text-gray-600 col-span-3">
                    Ürün bulunmamaktadır
                  </p>
                )}
              </div>
            </div>

            {/* Cart */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 h-fit sticky top-4">
              <h3 className="font-semibold text-gray-900 mb-4">
                Sepet - {selectedParticipant.name}
              </h3>

              {cart.length > 0 ? (
                <>
                  <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
                    {cart.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">
                            {item.name}
                          </p>
                          <p className="text-xs text-gray-600">
                            ₺{parseFloat(item.price).toFixed(2)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleUpdateQuantity(item.id, -1)}
                            className="p-1 hover:bg-gray-200 rounded"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="w-6 text-center text-sm font-medium">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => handleUpdateQuantity(item.id, 1)}
                            className="p-1 hover:bg-gray-200 rounded"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleRemoveFromCart(item.id)}
                            className="p-1 hover:bg-red-100 rounded ml-2"
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex justify-between items-center mb-4">
                      <span className="font-semibold text-gray-900">
                        Toplam:
                      </span>
                      <span className="text-2xl font-bold text-indigo-600">
                        ₺{cartTotal.toFixed(2)}
                      </span>
                    </div>
                    <button
                      onClick={handleSubmitOrder}
                      disabled={submitting}
                      className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-semibold flex items-center justify-center gap-2"
                    >
                      <ShoppingCart className="w-5 h-5" />
                      {submitting ? "Gönderiliyor..." : "Siparişi Gönder"}
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-center text-gray-600 py-8">
                  Henüz ürün seçilmedi
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
