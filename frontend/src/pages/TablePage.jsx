import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTableSession } from "../hooks/useTableSession";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export default function TablePage() {
  const { sessionToken, participantId } = useParams();
  const navigate = useNavigate();
  const { sessionState, isConnected, error } = useTableSession(
    sessionToken,
    participantId,
  );
  const [showMenu, setShowMenu] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [menuItems, setMenuItems] = useState([]);
  const [menuCategoryFilter, setMenuCategoryFilter] = useState("all");
  const [cart, setCart] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);

  // Fetch menu items from database
  useEffect(() => {
    const fetchMenu = async () => {
      try {
        const res = await fetch(`${API_URL}/api/admin/menu`);
        if (res.ok) {
          const data = await res.json();
          setMenuItems(data.items?.filter((i) => i.is_available) || []);
        }
      } catch (err) {
        console.error("Menu fetch error:", err);
      }
    };
    fetchMenu();
  }, []);

  // Get current participant
  const currentParticipant = sessionState?.participants.find(
    (p) => p.id === participantId,
  );

  const sessionStatus = sessionState?.session?.status;
  const isSessionClosed = sessionStatus === "closed";
  const isWaitingService = sessionStatus === "waiting_service";

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
        { id: item.id, name: item.name, price: item.price, quantity: 1 },
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
    if (cart.length === 0) return;
    setSubmitting(true);
    setOrderError("");
    try {
      const responses = await Promise.all(
        cart.map((item) =>
          fetch(`${API_URL}/api/order`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionToken,
              itemName: item.name,
              quantity: item.quantity,
              price: item.price,
              orderedBy: participantId,
            }),
          }),
        ),
      );

      for (const res of responses) {
        if (!res.ok) {
          const data = await res.json();
          setOrderError(data.error || "Sipariş başarısız");
          return;
        }
      }

      setCart([]);
      setOrderSuccess(true);
      setTimeout(() => {
        setShowMenu(false);
        setOrderSuccess(false);
      }, 1500);
    } catch (err) {
      console.error("Order failed:", err);
      setOrderError("Sipariş gönderilemedi");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseMenu = () => {
    setShowMenu(false);
    setCart([]);
    setOrderError("");
  };

  const cartTotal = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  const totalOrders =
    sessionState?.orders?.reduce(
      (sum, o) => sum + parseFloat(o.total_price),
      0,
    ) || 0;
  const remainingBalance = sessionState?.remainingBalance || 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-800">
              {currentParticipant
                ? `${currentParticipant.name}'nin Masası`
                : "Masa"}
            </h1>
            <div
              data-testid="connection-status"
              className="flex items-center gap-2 mt-1"
            >
              <div
                className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`}
              />
              <span className="text-xs text-gray-500">
                {isConnected ? "Canlı" : "Bağlanıyor..."}
              </span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Masa Toplamı</p>
            <p className="text-xl font-bold text-indigo-600">
              {totalOrders.toFixed(2)}₺
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Participants */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-600 mb-3">
            Masadakiler ({sessionState?.participants?.length || 0})
          </h2>
          <div className="flex flex-wrap gap-2">
            {sessionState?.participants?.map((p) => (
              <div
                key={p.id}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                  p.id === participantId ? "bg-indigo-100" : "bg-gray-100"
                }`}
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: p.color_code }}
                >
                  {p.name[0]}
                </div>
                <span className="text-sm font-medium">{p.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Orders */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-600">Siparişler</h2>
            <button
              data-testid="add-order-btn"
              onClick={() => setShowMenu(!showMenu)}
              disabled={isSessionClosed || isWaitingService}
              className="text-sm bg-indigo-600 text-white px-3 py-1 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSessionClosed
                ? "✕ Masa Kapandı"
                : isWaitingService
                  ? "⏳ Servis Bekleniyor"
                  : "+ Sipariş Ekle"}
            </button>
          </div>

          {sessionState?.orders?.length === 0 ? (
            <p className="text-center text-gray-400 py-8">Henüz sipariş yok</p>
          ) : (
            <div data-testid="order-list" className="space-y-2">
              {sessionState?.orders?.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between py-2 border-b border-gray-100"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-800">{order.name}</p>
                      {order.status === "pending_payment" && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
                          💳 Ödeme bekliyor
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      {order.quantity} × {parseFloat(order.price).toFixed(2)}₺
                    </p>
                  </div>
                  <p className="font-semibold text-gray-700">
                    {parseFloat(order.total_price).toFixed(2)}₺
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Menu Modal */}
        {showMenu && !isSessionClosed && !isWaitingService && (
          <div
            className="fixed inset-0 bg-black/50 flex items-end z-50"
            onClick={handleCloseMenu}
          >
            <div
              data-testid="menu-modal"
              className="bg-white rounded-t-2xl w-full max-w-lg mx-auto p-6 max-h-[80vh] overflow-y-auto flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">Menü</h3>
                <button
                  onClick={handleCloseMenu}
                  className="text-gray-500 hover:text-gray-700 text-xl"
                >
                  ✕
                </button>
              </div>

              {orderError && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm text-center mb-3">
                  ⚠️ {orderError}
                </div>
              )}

              {orderSuccess && (
                <div className="bg-green-50 text-green-600 p-3 rounded-lg text-sm text-center mb-3">
                  ✓ Siparişler gönderildi
                </div>
              )}

              {/* Category tabs */}
              {menuItems.length > 0 && (
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
                    ...new Set(
                      menuItems.map((i) => i.category).filter(Boolean),
                    ),
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

              <div className="grid grid-cols-2 gap-2 mb-6">
                {menuItems.length === 0 ? (
                  <p className="col-span-2 text-center text-gray-400 py-8">
                    Menü yükleniyor...
                  </p>
                ) : (
                  menuItems
                    .filter(
                      (item) =>
                        menuCategoryFilter === "all" ||
                        item.category === menuCategoryFilter,
                    )
                    .map((item) => {
                      const cartItem = cart.find((c) => c.id === item.id);
                      return (
                        <div
                          key={item.id}
                          data-testid={`menu-item-${item.id}`}
                          className="bg-gray-50 hover:bg-indigo-50 p-2.5 rounded-xl text-left transition-colors border border-gray-200 relative"
                        >
                          <p className="text-sm font-medium text-gray-800 leading-tight pr-7">
                            {item.name}
                          </p>
                          <p className="text-sm text-indigo-600 font-semibold mt-0.5">
                            {parseFloat(item.price).toFixed(2)}₺
                          </p>
                          <button
                            onClick={() =>
                              handleAddToCart({
                                id: item.id,
                                name: item.name,
                                price: parseFloat(item.price),
                              })
                            }
                            disabled={submitting}
                            className="absolute top-2 right-2 bg-indigo-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-base font-bold hover:bg-indigo-700 disabled:opacity-50"
                          >
                            +
                          </button>
                          {cartItem && (
                            <div className="absolute -top-2 -left-2 bg-indigo-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                              {cartItem.quantity}
                            </div>
                          )}
                        </div>
                      );
                    })
                )}
              </div>

              {/* Cart Panel */}
              {cart.length > 0 && (
                <div className="border-t pt-4 mt-4 space-y-3">
                  <h4 className="font-semibold text-gray-800">
                    Sepetim ({cart.length} ürün)
                  </h4>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {cart.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between bg-gray-50 p-3 rounded-lg"
                      >
                        <div className="flex-1">
                          <p className="font-medium text-gray-800">
                            {item.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {parseFloat(item.price).toFixed(2)}₺ ×{" "}
                            {item.quantity}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleUpdateQuantity(item.id, -1)}
                            disabled={submitting}
                            className="bg-gray-200 hover:bg-gray-300 text-gray-700 w-6 h-6 rounded flex items-center justify-center text-sm disabled:opacity-50"
                          >
                            −
                          </button>
                          <span className="font-semibold text-gray-700 w-6 text-center">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => handleUpdateQuantity(item.id, 1)}
                            disabled={submitting}
                            className="bg-gray-200 hover:bg-gray-300 text-gray-700 w-6 h-6 rounded flex items-center justify-center text-sm disabled:opacity-50"
                          >
                            +
                          </button>
                          <button
                            onClick={() => handleRemoveFromCart(item.id)}
                            disabled={submitting}
                            className="ml-2 text-red-600 hover:text-red-700 text-lg disabled:opacity-50"
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t pt-3 flex justify-between items-center">
                    <span className="font-semibold text-gray-800">Toplam:</span>
                    <span className="text-lg font-bold text-indigo-600">
                      {cartTotal.toFixed(2)}₺
                    </span>
                  </div>

                  <button
                    data-testid="submit-order-btn"
                    onClick={handleSubmitOrder}
                    disabled={submitting || cart.length === 0}
                    className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {submitting
                      ? "Gönderiliyor..."
                      : `Siparişi Gönder (${cartTotal.toFixed(2)}₺)`}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Split & Pay */}
        <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold text-gray-600">Hesap Durumu</h2>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Toplam:</span>
            <span className="text-lg font-bold text-gray-800">
              {totalOrders.toFixed(2)}₺
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Ödenen:</span>
            <span className="text-lg font-bold text-green-600">
              {(totalOrders - remainingBalance).toFixed(2)}₺
            </span>
          </div>
          <div className="flex justify-between items-center border-t pt-3">
            <span className="text-gray-800 font-semibold">Kalan:</span>
            <span
              data-testid="remaining-balance"
              className="text-xl font-bold text-red-600"
            >
              {remainingBalance.toFixed(2)}₺
            </span>
          </div>

          <button
            data-testid="go-to-payment-btn"
            onClick={() =>
              navigate(`/payment/${sessionToken}/${participantId}`)
            }
            disabled={remainingBalance <= 0}
            className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {remainingBalance <= 0 ? "Hesap Kapandı ✓" : "Ödemeye Git →"}
          </button>
        </div>

        {isWaitingService && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <span className="text-blue-600 text-xl">⏳</span>
              <div>
                <h3 className="font-medium text-blue-800 mb-1">
                  Siparişiniz Hazırlanıyor
                </h3>
                <p className="text-sm text-blue-700">
                  Ödeme alındı. Siparişiniz hazır olunca servis edilecek.
                </p>
              </div>
            </div>
          </div>
        )}

        {isSessionClosed && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <div className="flex items-start gap-3 mb-3">
              <span className="text-yellow-600 text-xl">⚠️</span>
              <div>
                <h3 className="font-medium text-yellow-800 mb-1">
                  Masa Kapandı
                </h3>
                <p className="text-sm text-yellow-700">
                  Bu masa kapatıldı. Artık sipariş veremezsiniz.
                </p>
              </div>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-yellow-600 text-white py-2 rounded-lg font-medium hover:bg-yellow-700"
            >
              🔄 Yeni Oturum Başlat
            </button>
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm text-center">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
