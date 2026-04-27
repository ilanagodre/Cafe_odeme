import { useState } from 'react';

export default function CardForm({ onSubmit, isLoading, onCancel }) {
  const [cardData, setCardData] = useState({
    cardHolderName: '',
    cardNumber: '',
    expireMonth: '',
    expireYear: '',
    cvc: ''
  });

  const [errors, setErrors] = useState({});

  const cardType = getCardType(cardData.cardNumber);

  function getCardType(number) {
    if (!number) return null;
    if (/^4/.test(number)) return 'visa';
    if (/^5[1-5]/.test(number)) return 'mastercard';
    return 'unknown';
  }

  function formatCardNumber(value) {
    const cleaned = value.replace(/\D/g, '').slice(0, 16);
    return cleaned.replace(/(\d{4})(?=\d)/g, '$1 ');
  }

  function handleCardNumberChange(e) {
    const formatted = formatCardNumber(e.target.value);
    setCardData({ ...cardData, cardNumber: formatted.replace(/\s/g, '') });
  }

  function handleExpiryChange(e) {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length >= 2) {
      value = value.slice(0, 2) + '/' + value.slice(2, 4);
    }
    const [month, year] = value.split('/');
    // Convert 2-digit year to 4-digit year (e.g., "30" -> "2030")
    const fullYear = year ? (year.length === 2 ? '20' + year : year) : '';
    setCardData({
      ...cardData,
      expireMonth: month || '',
      expireYear: fullYear
    });
  }

  function validateForm() {
    const newErrors = {};
    if (!cardData.cardHolderName.trim()) newErrors.cardHolderName = 'İsim gerekli';
    if (cardData.cardNumber.length !== 16) newErrors.cardNumber = 'Geçersiz kart numarası';
    if (!cardData.expireMonth || parseInt(cardData.expireMonth) > 12) newErrors.expireMonth = 'Geçersiz ay';
    if (!cardData.expireYear) newErrors.expireYear = 'Geçersiz yıl';
    if (cardData.cvc.length < 3) newErrors.cvc = 'Geçersiz CVV';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!validateForm()) return;

    onSubmit({
      cardHolderName: cardData.cardHolderName,
      cardNumber: cardData.cardNumber,
      expireMonth: cardData.expireMonth,
      expireYear: cardData.expireYear,
      cvc: cardData.cvc
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Card Number */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Kart Numarası
        </label>
        <div className="relative">
          <input
            type="text"
            placeholder="4242 4242 4242 4242"
            value={cardData.cardNumber ? formatCardNumber(cardData.cardNumber) : ''}
            onChange={handleCardNumberChange}
            disabled={isLoading}
            maxLength="19"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
          />
          {cardType === 'visa' && (
            <span className="absolute right-3 top-2.5 text-indigo-600 font-bold">VISA</span>
          )}
          {cardType === 'mastercard' && (
            <span className="absolute right-3 top-2.5 text-red-600 font-bold">MC</span>
          )}
        </div>
        {errors.cardNumber && <p className="text-red-600 text-sm mt-1">{errors.cardNumber}</p>}
      </div>

      {/* Cardholder Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Kart Üzerindeki İsim
        </label>
        <input
          type="text"
          placeholder="Adı Soyadı"
          value={cardData.cardHolderName}
          onChange={(e) => setCardData({ ...cardData, cardHolderName: e.target.value })}
          disabled={isLoading}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
        />
        {errors.cardHolderName && <p className="text-red-600 text-sm mt-1">{errors.cardHolderName}</p>}
      </div>

      {/* Expiry and CVV Row */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Son Kullanma (MM/YY)
          </label>
          <input
            type="text"
            placeholder="12/30"
            value={`${cardData.expireMonth}${cardData.expireYear ? '/' + cardData.expireYear : ''}`}
            onChange={handleExpiryChange}
            disabled={isLoading}
            maxLength="5"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
          />
          {(errors.expireMonth || errors.expireYear) && (
            <p className="text-red-600 text-sm mt-1">{errors.expireMonth || errors.expireYear}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">CVV</label>
          <input
            type="text"
            placeholder="123"
            value={cardData.cvc}
            onChange={(e) => setCardData({ ...cardData, cvc: e.target.value.replace(/\D/g, '').slice(0, 4) })}
            disabled={isLoading}
            maxLength="4"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
          />
          {errors.cvc && <p className="text-red-600 text-sm mt-1">{errors.cvc}</p>}
        </div>
      </div>

      {/* Buttons */}
      <div className="flex gap-3 pt-4">
        <button
          type="submit"
          disabled={isLoading}
          className="flex-1 bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? 'İşleniyor...' : 'Devam Et'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-300 disabled:opacity-50 transition-colors"
        >
          İptal
        </button>
      </div>
    </form>
  );
}
