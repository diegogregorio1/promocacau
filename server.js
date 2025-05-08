const express = require('express');
const path = require('path');
const { google } = require('googleapis');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const SPREADSHEET_ID = '1ID-ix9OIHZprbcvQbdf5wmGSZvsq25SB4tXw74mVrL8';

// Função para validar CPF
function validarCPF(cpf) {
  cpf = cpf.replace(/[^\d]+/g, '');
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  let soma = 0, resto;
  for (let i = 1; i <= 9; i++) soma += parseInt(cpf.substring(i - 1, i)) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf.substring(9, 10))) return false;
  soma = 0;
  for (let i = 1; i <= 10; i++) soma += parseInt(cpf.substring(i - 1, i)) * (12 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf.substring(10, 11))) return false;
  return true;
}

// Conexão com a API do Google Sheets
async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.resolve(__dirname, 'credentials.json'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

// Middleware para tratar requisições
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Rota de cadastro (Google Sheets)
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
      return res.status(400).json({ message: 'CPF já cadastrado e ganhou o brinde.' });
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'A:D',
      valueInputOption: 'USER_ENTERED',
      resource: { values: [[nome, cpf, email, cellphone]] },
    });

    return res.status(200).json({ message: 'Cadastro realizado com sucesso! Brinde garantido.' });
  } catch (error) {
    console.error('[ERRO Google Sheets]', error);
    return res.status(500).json({ message: 'Erro ao acessar a planilha.', detalhes: error.message });
  }
});

// Função para criar cliente no Asaas
async function criarClienteAsaas({ nome, email, cpf, celular }) {
  const response = await axios.post(
    'https://www.asaas.com/api/v3/customers',
    {
      name: nome,
      email: email,
      cpfCnpj: cpf,
      mobilePhone: celular
    },
    {
      headers: {
        access_token: process.env.ASAAS_API_KEY
      }
    }
  );
  return response.data.id;
}

// Função para criar cobrança no Asaas e retornar link de pagamento
async function criarCobrancaAsaas({ clienteId, valor, descricao }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const response = await axios.post(
    'https://www.asaas.com/api/v3/payments',
    {
      customer: clienteId,
      billingType: 'UNDEFINED', // mostra todas as formas (boleto, pix, cartão)
      value: valor,
      description: descricao,
      dueDate: hoje // vencimento hoje
    },
    {
      headers: {
        access_token: process.env.ASAAS_API_KEY
      }
    }
  );
  return response.data.invoiceUrl;
}

// Endpoint para gerar link de pagamento Asaas (substitui Mercado Pago)
app.post('/api/gerar-pagamento', async (req, res) => {
  console.log('[/api/gerar-pagamento] endpoint chamado', new Date().toISOString());

  // Receba também dados do cliente
  const { frete, nome, email, cpf, cellphone } = req.body;

  let valor, descricao;
  if (frete === 'sedex') {
    valor = 29.99;
    descricao = 'Frete SEDEX';
  } else if (frete === 'pac') {
    valor = 17.99;
    descricao = 'Frete PAC';
  } else {
    return res.status(400).json({ erro: 'Tipo de frete inválido.' });
  }

  if (!nome || !email || !cpf || !cellphone) {
    return res.status(400).json({ erro: 'Dados do cliente incompletos.' });
  }

  try {
    // 1. Crie (ou utilize) cliente no Asaas
    const clienteId = await criarClienteAsaas({ nome, email, cpf, celular: cellphone });

    // 2. Crie cobrança e obtenha URL
    const urlPagamento = await criarCobrancaAsaas({ clienteId, valor, descricao });

    res.json({ url_pagamento: urlPagamento });
  } catch (error) {
    console.error('[ERRO Asaas API]', error?.response?.data || error);
    res.status(500).json({
      erro: 'Erro ao criar cobrança Asaas',
      detalhes: error?.response?.data || error.message || error,
    });
  }
});

// Rotas de retorno para as páginas corretas
app.get('/sucesso', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'confirmacao.html'))
);
app.get('/falha', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'erro.html'))
);
app.get('/pendente', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'pendente.html'))
);

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
