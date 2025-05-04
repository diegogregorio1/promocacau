const express = require('express');
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const SPREADSHEET_ID = '1ID-ix9OIHZprbcvQbdf5wmGSZvsq25SB4tXw74mVrL8';

// Função para validar CPF (dígito verificador)
function validarCPF(cpf) {
  cpf = cpf.replace(/[^\d]+/g,'');
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  let soma = 0, resto;
  for (let i=1; i<=9; i++) soma += parseInt(cpf.substring(i-1, i))*(11-i);
  resto = (soma*10)%11;
  if ((resto===10)||(resto===11)) resto = 0;
  if (resto !== parseInt(cpf.substring(9, 10))) return false;
  soma = 0;
  for (let i=1; i<=10; i++) soma += parseInt(cpf.substring(i-1, i))*(12-i);
  resto = (soma*10)%11;
  if ((resto===10)||(resto===11)) resto = 0;
  if (resto !== parseInt(cpf.substring(10, 11))) return false;
  return true;
}

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: '/etc/secrets/credentials.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/registrar', async (req, res) => {
  const { nome, cpf, email, cellphone } = req.body;
  if (!nome || !cpf || !email || !cellphone) {
    return res.status(400).json({ message: 'Nome, CPF, Email e Celular são obrigatórios.' });
  }

  if (!validarCPF(cpf)) {
    return res.status(400).json({ message: 'CPF inválido.' });
  }

  try {
    const sheets = await getSheetsClient();
    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'A:D',
    });
    const rows = readRes.data.values || [];
    const cpfExists = rows.some(row => row[1] === cpf);

    if (cpfExists) {
      return res.status(400).json({ message: 'CPF já cadastrou e ganhou o brinde.' });
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'A:D',
      valueInputOption: 'USER_ENTERED',
      resource: { values: [[nome, cpf, email, cellphone]] },
    });

    return res.status(200).json({ message: 'Cadastro realizado com sucesso! Brinde garantido.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Erro ao acessar a planilha.' });
  }
});

// =============================
// PAGAMENTO MERCADO PAGO PIX
// =============================

let mercadopago;
try {
  mercadopago = require('./mercadopago-config');
} catch (e) {
  mercadopago = require('mercadopago');
  mercadopago.configure({
    access_token: process.env.MP_ACCESS_TOKEN || 'SUA_ACCESS_TOKEN_AQUI'
  });
}

app.post('/api/pagamento', async (req, res) => {
  // Você pode receber valores do frontend ou definir valores fixos para teste
  const valor = 17.99; // troque pelo valor desejado ou calcule de acordo com o frete/produto
  const descricao = "Frete PAC"; // troque conforme necessário

  const preference = {
    items: [
      {
        title: descricao,
        unit_price: valor,
        quantity: 1,
      },
    ],
    payment_methods: {
      excluded_payment_types: [
        { id: 'credit_card' },
        { id: 'ticket' }
      ]
      // Assim, só Pix ficará disponível no Checkout Pro
    },
    back_urls: {
      success: "https://cacaushowpromo.onrender.com/sucesso.html",
      failure: "https://cacaushowpromo.onrender.com/erro.html",
      pending: "https://cacaushowpromo.onrender.com/pendente.html"
    },
    auto_return: "approved"
  };

  try {
    const response = await mercadopago.preferences.create(preference);
    res.json({ init_point: response.body.init_point });
  } catch (error) {
    console.error("Erro Mercado Pago:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
