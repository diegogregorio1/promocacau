const express = require('express');
const path = require('path');
const { google } = require('googleapis');
const axios = require('axios');
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

// Rota de cadastro (planilha Google)
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

// =========== PAGAMENTO VIA PAGSEGURO CHECKOUT PRO (PIX) =============

// Endpoint para gerar link de pagamento PagSeguro (Checkout Pro, com opção Pix)
app.post('/api/gerar-pix', async (req, res) => {
  const { frete } = req.body; // recebe do frontend: 'sedex' ou outro

  let valor, descricao;
  if (frete === 'sedex') {
    valor = "29.99";
    descricao = "Frete SEDEX";
  } else {
    valor = "17.99";
    descricao = "Frete PAC";
  }

  // Dados obrigatórios do PagSeguro Checkout Pro
  const PAGSEGURO_EMAIL = process.env.PAGSEGURO_EMAIL;
  const PAGSEGURO_TOKEN = process.env.PAGSEGURO_TOKEN;

  if (!PAGSEGURO_EMAIL || !PAGSEGURO_TOKEN) {
    return res.status(500).json({ erro: 'Credenciais PagSeguro Checkout Pro não configuradas corretamente.' });
  }

  try {
    // Cria a preferência de pagamento (Checkout Pro)
    const response = await axios.post(
      'https://ws.pagseguro.uol.com.br/v2/checkout',
      new URLSearchParams({
        email: PAGSEGURO_EMAIL,
        token: PAGSEGURO_TOKEN,
        currency: 'BRL',
        itemId1: '1',
        itemDescription1: descricao,
        itemAmount1: valor,
        itemQuantity1: '1'
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    // O retorno é em XML! Vamos extrair o código do checkout para montar a URL de pagamento
    const match = response.data.match(/<code>([^<]+)<\/code>/);
    if (!match) throw new Error('Código de pagamento não encontrado na resposta PagSeguro.');
    const checkoutCode = match[1];
    const redirectURL = `https://pagseguro.uol.com.br/v2/checkout/payment.html?code=${checkoutCode}`;

    // Retorna a URL para o frontend redirecionar o usuário (onde ele pode escolher Pix)
    res.json({ url_pagamento: redirectURL });

  } catch (error) {
    console.error('[ERRO PagSeguro Checkout Pro]:', error.response?.data || error.message || error);
    res.status(500).json({ erro: 'Erro ao criar cobrança PagSeguro Checkout Pro', detalhes: error.response?.data || error.message || error });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
