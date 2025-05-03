const express = require('express');
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
const fetch = require('node-fetch'); // Instale com `npm install node-fetch` se ainda não tiver
require('dotenv').config(); // Garanta que o .env está correto

const app = express();
const PORT = process.env.PORT || 3000;

// --- Config Sheets ---
const SPREADSHEET_ID = '1ID-ix9OIHZprbcvQbdf5wmGSZvsq25SB4tXw74mVrL8';
// O arquivo credentials.json deve estar na raiz do projeto (NÃO subir no GitHub!)

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: '/etc/secrets/credentials.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

// --- Middlewares ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// --- Rota Registrar ---
app.post('/api/registrar', async (req, res) => {
  const { nome, cpf, email, cellphone } = req.body;
if (!nome || !cpf || !email || !cellphone) {
  return res.status(400).json({ message: 'Nome, CPF, Email e Celular são obrigatórios.' });
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

// --- Rota Pagamento ---
app.post('/api/pagamento', async (req, res) => {
  const { frete, referencia } = req.body;

  let valor, descricao;
  if (frete === "pac") {
    valor = 17.99;
    descricao = "Frete PAC";
  } else if (frete === "sedex") {
    valor = 29.99;
    descricao = "Frete SEDEX";
  } else {
    console.error("Frete inválido:", frete);
    return res.status(400).json({ error: "Frete inválido" });
  }

  const token = process.env.ABACATEPAY_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "Token Abacatepay não configurado" });
  }

  try {
    const abacateRes = await fetch("https://api.abacatepay.com/v1/billing/create", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
    "accept": "application/json"
  },
  body: JSON.stringify({
    frequency: "ONE_TIME",
    methods: ["PIX"],
    products: [
      {
        externalId: referencia || "frete_" + Date.now(),
        name: descricao,
        description: descricao,
        quantity: 1,
        price: Math.round(valor * 100) // converte para centavos
      }
    ],
    returnUrl: "https://seusite.com/voltar", // coloque o endereço do seu site
    completionUrl: "https://seusite.com/obrigado",
    customer: {
      name: "Cliente",
      email: "cliente@email.com",
      cellphone: "+5500000000000",
      document: "12345678900"
    }
  }),
});

    if (!abacateRes.ok) {
      const error = await abacateRes.text();
      console.error("Erro Abacatepay:", error);
      return res.status(500).json({ error: "Erro Abacatepay: " + error });
    }

    const data = await abacateRes.json();

    res.status(200).json({
      qrcode: data.qrcode,
      copiaecola: data.copiaecola,
      id: data.id,
      valor,
      descricao,
    });
  } catch (e) {
    console.error("Erro interno:", e);
    res.status(500).json({ error: "Erro interno no servidor: " + e.message });
  }
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
