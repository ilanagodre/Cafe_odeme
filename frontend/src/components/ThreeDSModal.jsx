import { useState, useEffect } from "react";

export default function ThreeDSModal({
  htmlContent,
  onSuccess,
  onError,
  onClose,
}) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleMessage = (event) => {
      const backendOrigin =
        import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";
      if (event.origin !== backendOrigin) return;
      if (event.data.type === "payment_success") {
        onSuccess();
      } else if (event.data.type === "payment_error") {
        onError(event.data.message || "Ödeme başarısız");
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onSuccess, onError]);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="text-lg font-bold text-gray-800">
            3D Güvenli Doğrulama
          </h3>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Yükleniyor...</p>
              </div>
            </div>
          )}

          {htmlContent && (
            <iframe
              srcDoc={htmlContent}
              className="w-full h-full border-0"
              title="3DS Verification"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            />
          )}
        </div>

        {/* Footer Info */}
        <div className="px-6 py-3 border-t bg-gray-50 text-xs text-gray-600">
          <p>Banka güvenlik sistemi yönlendiriliyorsunuz. Lütfen bekleyin...</p>
        </div>
      </div>
    </div>
  );
}
