const Iyzipay = require('iyzipay');

let iyzico = null;

function getIyzico() {
  if (iyzico) return iyzico;

  if (!process.env.IYZICO_API_KEY || !process.env.IYZICO_SECRET_KEY) {
    throw new Error('Iyzico API keys not configured. Please set IYZICO_API_KEY and IYZICO_SECRET_KEY in .env');
  }

  iyzico = new Iyzipay({
    apiKey: process.env.IYZICO_API_KEY,
    secretKey: process.env.IYZICO_SECRET_KEY,
    uri: process.env.IYZICO_BASE_URL || 'https://sandbox-api.iyzipay.com'
  });

  return iyzico;
}

module.exports = { getIyzico };
