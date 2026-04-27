import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTableSession } from "../hooks/useTableSession";
import CardForm from "../components/CardForm";
import ThreeDSModal from "../components/ThreeDSModal";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export default function PaymentPage() {
  const { sessionToken, participantId } = useParams();
  const navigate = useNavigate();
  const { sessionState } = useTableSession(sessionToken, participantId);

  const [splitStrategy, setSplitStrategy] = useState("equal_split");
  const [splitResult, setSplitResult] = useState(null);
  const [individualSplit, setIndividualSplit] = useState(null);
  const [paying, setPaying] = useState(false);
  const [paymentMode, setPaymentMode] = useState("self"); // self | all | other | item
  const [selectedForId, setSelectedForId] = useState(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [paymentDone, setPaymentDone] = useState(false);
  const [paymentMsg, setPaymentMsg] = useState("");
  const [paymentError, setPaymentError] = useState("");

  // Iyzico payment method
  const [paymentMethod, setPaymentMethod] = useState("test"); // 'test' | 'iyzico'
  const [showCardForm, setShowCardForm] = useState(false);
  const [threeDSHtml, setThreeDSHtml] = useState(null);
  const [iyzicoError, setIyzicoError] = useState("");

  // Calculate split
  useEffect(() => {
    if (!sessionState?.orders?.length) return;

    const calculateSplit = async () => {
      try {
        const [strategyRes, individualRes] = await Promise.all([
          fetch(`${API_URL}/api/split/calculate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionToken, strategy: splitStrategy }),
          }),
          fetch(`${API_URL}/api/split/calculate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionToken, strategy: "individual" }),
          }),
        ]);
        const strategyData = await strategyRes.json();
        const individualData = await individualRes.json();
        setSplitResult(strategyData);
        setIndividualSplit(individualData);
      } catch (err) {
        console.error("Split failed:", err);
      }
    };
    calculateSplit();
  }, [sessionState?.orders, splitStrategy]);

  const mySplit = splitResult?.splits?.find(
    (s) => s.participantId === participantId,
  );
  const myIndividualSplit = individualSplit?.splits?.find(
    (s) => s.participantId === participantId,
  );
  const remainingBalance = sessionState?.remainingBalance || 0;

  const handlePay = async () => {
    setPaying(true);

    try {
      let endpoint, body;

      if (paymentMode === "all") {
        endpoint = "/api/payment/full";
        body = { sessionToken, paidBy: participantId };
      } else if (paymentMode === "other" && selectedForId) {
        const targetSplit = individualSplit?.splits?.find(
          (s) => s.participantId === selectedForId,
        );
        endpoint = "/api/payment/for";
        body = {
          sessionToken,
          paidBy: participantId,
          targetParticipantId: selectedForId,
          amount: targetSplit?.amount || 0,
        };
      } else if (paymentMode === "item" && selectedOrderIds.length > 0) {
        endpoint = "/api/payment/item";
        body = {
          sessionToken,
          paidBy: participantId,
          orderIds: selectedOrderIds,
        };
      } else {
        endpoint = "/api/payment";
        body = {
          sessionToken,
          participantId,
          amount: myIndividualSplit?.amount || 0,
          paymentType: "individual",
        };
      }

      const res = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (res.ok) {
        setPaymentDone(true);
        setPaymentError("");
        setPaymentMsg(data.message || "Ödeme başarılı!");
        // Use the response's remainingBalance, not stale state
        const newBalance = data.remainingBalance ?? 0;
        if (data.allSettled || newBalance <= 0) {
          setTimeout(
            () => navigate(`/table/${sessionToken}/${participantId}`),
            2500,
          );
        }
      } else {
        setPaymentError(data.error || "Ödeme başarısız oldu");
      }
    } catch (err) {
      console.error("Payment error:", err);
    } finally {
      setPaying(false);
    }
  };

  const handleIyzicoPayment = async (cardData) => {
    setPaying(true);
    setIyzicoError("");

    try {
      let amount = 0;

      if (paymentMode === "all") {
        amount = remainingBalance;
      } else if (paymentMode === "other" && selectedForId) {
        const targetSplit = individualSplit?.splits?.find(
          (s) => s.participantId === selectedForId,
        );
        amount = targetSplit?.amount || 0;
      } else if (paymentMode === "item" && selectedOrderIds.length > 0) {
        amount =
          sessionState.orders
            ?.filter((o) => selectedOrderIds.includes(o.id))
            .reduce((sum, o) => sum + parseFloat(o.total_price), 0) || 0;
      } else {
        amount = myIndividualSplit?.amount || 0;
      }

      const res = await fetch(`${API_URL}/api/payment/iyzico/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionToken,
          participantId,
          amount,
          paymentMode,
          targetId: selectedForId,
          orderIds: selectedOrderIds,
          card: cardData,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setIyzicoError(data.error || "Ödeme başlatılamadı");
        setPaying(false);
        return;
      }

      // Show 3DS modal with htmlContent
      setThreeDSHtml(data.htmlContent);
    } catch (err) {
      console.error("Iyzico initiate error:", err);
      setIyzicoError("Bağlantı hatası. Lütfen tekrar deneyin.");
      setPaying(false);
    }
  };

  const handleThreeDSSuccess = () => {
    setThreeDSHtml(null);
    setPaying(false);
    setPaymentDone(true);
    setPaymentMsg("Ödeme başarılı!");
    const newBalance =
      remainingBalance -
      (paymentMode === "all"
        ? remainingBalance
        : myIndividualSplit?.amount || 0);
    if (newBalance <= 0) {
      setTimeout(
        () => navigate(`/table/${sessionToken}/${participantId}`),
        2500,
      );
    }
  };

  const handleThreeDSError = (message) => {
    setThreeDSHtml(null);
    setPaying(false);
    setIyzicoError(message || "Ödeme başarısız");
  };

  if (!sessionState) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Yükleniyor...
      </div>
    );
  }

  // Check if all already paid
  if (remainingBalance <= 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center max-w-sm">
          <p className="text-6xl mb-4">🎉</p>
          <h1 className="text-2xl font-bold text-green-700 mb-2">
            Hesap Kapandı!
          </h1>
          <p className="text-gray-500 mb-6">Afiyet olsun, teşekkürler.</p>
          <button
            onClick={() => navigate(`/table/${sessionToken}/${participantId}`)}
            className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-indigo-700"
          >
            Masaya Dön
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Header — remaining balance */}
        <div className="bg-gradient-to-r from-red-500 to-orange-500 rounded-xl p-5 text-white shadow-lg">
          <p className="text-sm opacity-90">Kalan Borç</p>
          <p
            data-testid="remaining-balance-header"
            className="text-4xl font-bold mt-1"
          >
            {remainingBalance.toFixed(2)}₺
          </p>
        </div>

        {/* Payment Method Selection */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Ödeme Yöntemi
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setPaymentMethod("test");
                setShowCardForm(false);
                setIyzicoError("");
              }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                paymentMethod === "test"
                  ? "bg-indigo-100 border-2 border-indigo-500 text-indigo-700"
                  : "bg-gray-100 text-gray-600 border-2 border-transparent"
              }`}
            >
              🧪 Test Öde
            </button>
            <button
              onClick={() => {
                setPaymentMethod("iyzico");
                setShowCardForm(false);
                setIyzicoError("");
              }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                paymentMethod === "iyzico"
                  ? "bg-green-100 border-2 border-green-500 text-green-700"
                  : "bg-gray-100 text-gray-600 border-2 border-transparent"
              }`}
            >
              💳 Kart ile Öde
            </button>
          </div>
        </div>

        {/* Card Form (Iyzico) */}
        {paymentMethod === "iyzico" && showCardForm && (
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">
              Kart Bilgilerini Gir
            </h3>
            {iyzicoError && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4">
                ⚠️ {iyzicoError}
              </div>
            )}
            <CardForm
              onSubmit={handleIyzicoPayment}
              isLoading={paying}
              onCancel={() => setShowCardForm(false)}
            />
          </div>
        )}

        {/* Strategy Toggle — compact */}
        {paymentMethod === "test" && (
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex gap-2 bg-gray-100 rounded-lg p-1">
              <button
                data-testid="strategy-equal"
                onClick={() => setSplitStrategy("equal_split")}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
                  splitStrategy === "equal_split"
                    ? "bg-white shadow text-indigo-700"
                    : "text-gray-500"
                }`}
              >
                ⚖️ Eşit
              </button>
              <button
                data-testid="strategy-item"
                onClick={() => setSplitStrategy("item_based")}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
                  splitStrategy === "item_based"
                    ? "bg-white shadow text-indigo-700"
                    : "text-gray-500"
                }`}
              >
                🍽️ Ürün Bazlı
              </button>
            </div>
          </div>
        )}

        {/* Split Result — info panel */}
        {individualSplit && (
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Herkesin Kendi Siparişleri
            </h2>
            <div className="space-y-2">
              {individualSplit.splits.map((split) => {
                const participant = sessionState.participants.find(
                  (p) => p.id === split.participantId,
                );
                const isMe = split.participantId === participantId;
                const hasPaid = sessionState.payments?.some(
                  (p) =>
                    p.participant_id === split.participantId &&
                    p.status === "completed",
                );
                const isTargetSelected = selectedForId === split.participantId;

                return (
                  <div
                    key={split.participantId}
                    onClick={() =>
                      paymentMode === "other" &&
                      !hasPaid &&
                      setSelectedForId(split.participantId)
                    }
                    className={`flex items-center justify-between p-3 rounded-lg transition-all ${
                      isMe
                        ? "bg-indigo-50 border border-indigo-200"
                        : hasPaid
                          ? "bg-green-50 opacity-70"
                          : isTargetSelected
                            ? "bg-green-100 border-2 border-green-400"
                            : "bg-gray-50"
                    } ${paymentMode === "other" && !hasPaid ? "cursor-pointer" : ""}`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shadow"
                        style={{ backgroundColor: participant?.color_code }}
                      >
                        {participant?.name[0]}
                      </div>
                      <div>
                        <p className="font-medium text-sm text-gray-800">
                          {participant?.name}{" "}
                          {isMe && (
                            <span className="text-indigo-600">(sen)</span>
                          )}
                        </p>
                        {hasPaid && (
                          <p className="text-xs text-green-600">✓ Ödedi</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p
                        className={`font-bold text-lg ${hasPaid ? "text-green-600 line-through" : "text-gray-800"}`}
                      >
                        {split.amount.toFixed(2)}₺
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Payment Mode Selection */}
        {!showCardForm && (
          <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Nasıl Ödeyeyim?
            </h2>

            {/* Self */}
            <button
              data-testid="payment-mode-self"
              onClick={() => {
                setPaymentMode("self");
                setSelectedForId(null);
              }}
              className={`w-full p-4 rounded-xl border-2 flex items-center justify-between transition-all ${
                paymentMode === "self"
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-gray-100 hover:border-gray-200"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">💳</span>
                <div className="text-left">
                  <p className="font-semibold text-gray-800">
                    Kendi Borcumu Öde
                  </p>
                  <p className="text-sm text-gray-500">
                    {myIndividualSplit?.amount?.toFixed(2)}₺
                  </p>
                </div>
              </div>
              {paymentMode === "self" && (
                <div className="w-5 h-5 bg-indigo-500 rounded-full" />
              )}
            </button>

            {/* All */}
            {remainingBalance > (mySplit?.amount || 0) && (
              <button
                data-testid="payment-mode-all"
                onClick={() => {
                  setPaymentMode("all");
                  setSelectedForId(null);
                  setSelectedOrderIds([]);
                }}
                className={`w-full p-4 rounded-xl border-2 flex items-center justify-between transition-all ${
                  paymentMode === "all"
                    ? "border-amber-500 bg-amber-50"
                    : "border-gray-100 hover:border-gray-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🎉</span>
                  <div className="text-left">
                    <p className="font-semibold text-gray-800">Benden Olsun</p>
                    <p className="text-sm text-gray-500">
                      Herkesin borcu ({remainingBalance.toFixed(2)}₺)
                    </p>
                  </div>
                </div>
                {paymentMode === "all" && (
                  <div className="w-5 h-5 bg-amber-500 rounded-full" />
                )}
              </button>
            )}

            {/* Ismarlıyorum — pick specific items */}
            <button
              data-testid="payment-mode-item"
              onClick={() => {
                setPaymentMode("item");
                setSelectedForId(null);
              }}
              className={`w-full p-4 rounded-xl border-2 flex items-center justify-between transition-all ${
                paymentMode === "item"
                  ? "border-pink-500 bg-pink-50"
                  : "border-gray-100 hover:border-gray-200"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">🎁</span>
                <div className="text-left">
                  <p className="font-semibold text-gray-800">Isırmaıyom!</p>
                  <p className="text-sm text-gray-500">
                    Birkaç sipariş seç, öde
                  </p>
                </div>
              </div>
              {paymentMode === "item" && (
                <div className="w-5 h-5 bg-pink-500 rounded-full" />
              )}
            </button>

            {/* Other */}
            {splitResult?.splits?.filter((s) => {
              const p = sessionState.participants.find(
                (x) => x.id === s.participantId,
              );
              return (
                s.participantId !== participantId &&
                !sessionState.payments?.some(
                  (pay) =>
                    pay.participant_id === s.participantId &&
                    pay.status === "completed",
                )
              );
            }).length > 0 && (
              <div>
                <button
                  data-testid="payment-mode-other"
                  onClick={() => setPaymentMode("other")}
                  className={`w-full p-4 rounded-xl border-2 flex items-center justify-between transition-all ${
                    paymentMode === "other"
                      ? "border-green-500 bg-green-50"
                      : "border-gray-100 hover:border-gray-200"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">💚</span>
                    <div className="text-left">
                      <p className="font-semibold text-gray-800">
                        Birinin Borcunu Öde
                      </p>
                      <p className="text-sm text-gray-500">Aşağıdan seç</p>
                    </div>
                  </div>
                  {paymentMode === "other" && (
                    <div className="w-5 h-5 bg-green-500 rounded-full" />
                  )}
                </button>
              </div>
            )}

            {/* Item Selection Panel (Isırmaıyom) */}
            {paymentMode === "item" && (
              <div className="mt-3 bg-pink-50 rounded-xl p-4 border border-pink-200">
                <p className="text-sm font-semibold text-pink-700 mb-3">
                  🎁 Ödemek istediğin siparişleri seç:
                </p>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {sessionState.orders
                    ?.filter((o) => o.status !== "cancelled" && !o.paid_by)
                    .map((order) => {
                      const orderedBy = sessionState.participants.find(
                        (p) => p.id === order.ordered_by,
                      );
                      const isSelected = selectedOrderIds.includes(order.id);
                      return (
                        <label
                          key={order.id}
                          className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                            isSelected
                              ? "bg-pink-100 border-2 border-pink-400"
                              : "bg-white border border-gray-200"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              setSelectedOrderIds((prev) =>
                                isSelected
                                  ? prev.filter((id) => id !== order.id)
                                  : [...prev, order.id],
                              );
                            }}
                            className="w-5 h-5 rounded accent-pink-500"
                          />
                          <div className="flex-1">
                            <p className="font-medium text-sm text-gray-800">
                              {order.name} × {order.quantity}
                            </p>
                            <p className="text-xs text-gray-500">
                              {orderedBy?.name || "—"} sipariş verdi
                            </p>
                          </div>
                          <p className="font-bold text-sm text-gray-800">
                            {parseFloat(order.total_price).toFixed(2)}₺
                          </p>
                        </label>
                      );
                    })}
                </div>

                {selectedOrderIds.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-pink-200 flex justify-between items-center">
                    <p className="text-sm text-pink-600">
                      {selectedOrderIds.length} sipariş seçildi
                    </p>
                    <p className="font-bold text-lg text-pink-700">
                      {sessionState.orders
                        ?.filter((o) => selectedOrderIds.includes(o.id))
                        .reduce((sum, o) => sum + parseFloat(o.total_price), 0)
                        .toFixed(2)}
                      ₺
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Pay Button */}
        {paymentMethod === "test" && paymentError && (
          <div
            data-testid="payment-error"
            className="bg-red-50 text-red-600 p-4 rounded-xl text-center text-sm"
          >
            ⚠️ {paymentError}
          </div>
        )}

        {!paymentDone && (
          <div className="sticky bottom-4">
            {paymentMethod === "test" && (
              <button
                data-testid="pay-button"
                onClick={handlePay}
                disabled={paying || (paymentMode === "other" && !selectedForId)}
                className="w-full bg-green-600 text-white py-5 rounded-2xl font-bold text-xl shadow-2xl hover:bg-green-700 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {paying ? (
                  "⏳ Ödeniyor..."
                ) : (
                  <>
                    {paymentMode === "all"
                      ? `Tüm Hesabı Öde (${remainingBalance.toFixed(2)}₺)`
                      : paymentMode === "other" && selectedForId
                        ? `${sessionState.participants.find((p) => p.id === selectedForId)?.name} İçin Öde (${individualSplit?.splits?.find((s) => s.participantId === selectedForId)?.amount?.toFixed(2)}₺)`
                        : paymentMode === "item" && selectedOrderIds.length > 0
                          ? `${selectedOrderIds.length} Sipariş Öde (${sessionState.orders
                              ?.filter((o) => selectedOrderIds.includes(o.id))
                              .reduce(
                                (s, o) => s + parseFloat(o.total_price),
                                0,
                              )
                              .toFixed(2)}₺)`
                          : `Öde (${myIndividualSplit?.amount?.toFixed(2)}₺)`}
                  </>
                )}
              </button>
            )}
            {paymentMethod === "iyzico" && !showCardForm && (
              <button
                onClick={() => setShowCardForm(true)}
                className="w-full bg-green-600 text-white py-5 rounded-2xl font-bold text-xl shadow-2xl hover:bg-green-700 active:scale-[0.98] transition-all"
              >
                💳 Kart Bilgilerini Gir
              </button>
            )}
          </div>
        )}

        {/* Success */}
        {paymentDone && (
          <div
            data-testid="payment-success"
            className="bg-green-100 rounded-xl p-6 text-center"
          >
            <p className="text-4xl mb-2">✅</p>
            <p className="text-lg font-bold text-green-800">{paymentMsg}</p>
            <p className="text-sm text-green-600 mt-1">
              {sessionState?.remainingBalance <= 0
                ? "Hesap kapandı! Afiyet olsun 🎉"
                : "Diğerlerinin ödemesi bekleniyor..."}
            </p>
          </div>
        )}

        <button
          onClick={() => navigate(`/table/${sessionToken}/${participantId}`)}
          className="w-full text-center text-gray-400 py-2 text-sm"
        >
          ← Masaya Dön
        </button>
      </div>

      {/* 3DS Modal */}
      {threeDSHtml && (
        <ThreeDSModal
          htmlContent={threeDSHtml}
          onSuccess={handleThreeDSSuccess}
          onError={handleThreeDSError}
          onClose={() => setThreeDSHtml(null)}
        />
      )}
    </div>
  );
}
