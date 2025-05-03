const express = require('express');
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
const fetch = require('node-fetch');
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

app.post('/api/pagamento', async (req, res) => {
  const { frete, referencia, nome, email, cellphone, cpf } = req.body;

  const cpfLimpo = (cpf || '').replace(/\D/g, '');
  console.log('DEBUG CPF para Abacatepay:', cpf, 'Limpo:', cpfLimpo);

  if (!validarCPF(cpfLimpo)) {
    return res.status(400).json({ error: "CPF inválido para pagamento (taxId)" });
  }

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
    // 1. Cria a cobrança
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
            price: Math.round(valor * 100) // em centavos
          }
        ],
        returnUrl: "https://cacaushowpromo.onrender.com/",
        completionUrl: "https://cacaushowpromo.onrender.com/confirmacao.html",
        customer: {
          name: nome,
          email: email,
          cellphone: cellphone,
          taxId: cpfLimpo
        }
      }),
    });

    const data = await abacateRes.json();
    console.log("RESPOSTA ABACATEPAY:", data);

    if (!data.data || !data.data.id) {
      return res.status(500).json({ error: "Erro ao criar cobrança. Tente novamente." });
    }

    // 2. Busca o QR Code Pix
    const billingId = data.data.id;
    const qrRes = await fetch(`https://api.abacatepay.com/v1/pix/qrcode/${billingId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "accept": "application/json"
      }
    });
    const qrData = await qrRes.json();
    console.log("RESPOSTA QRCODE PIX:", qrData);

    if (!qrData.data || !qrData.data.qrcode || !qrData.data.copiaecola) {
      // Se não vier o qrcode, ao menos envie a url
      return res.status(200).json({
        url: data.data.url,
        id: billingId,
        valor,
        descricao
      });
    }

    res.status(200).json({
      qrcode: qrData.data.qrcode,
      copiaecola: qrData.data.copiaecola,
      id: billingId,
      valor,
      descricao,
      url: data.data.url
    });
  } catch (e) {
    console.error("Erro interno:", e);
    res.status(500).json({ error: "Erro interno no servidor: " + e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
