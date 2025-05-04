const mercadopago = require('mercadopago');

mercadopago.configure({
  access_token: process.env.MP_ACCESS_TOKEN // Certifique-se de adicionar ao seu .env
});

module.exports = mercadopago;
