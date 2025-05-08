const express = require('express');
const path = require('path');
const { google } = require('googleapis');
require('dotenv').config();

// Mercado Pago SDK v3 (novo formato)
const { MercadoPagoConfig, Preference } = require('mercadopago');

const app = express();
const PORT = process.env.PORT || 3000;
const SPREADSHEET_ID = '1ID-ix9OIHZprbcvQbdf5wmGSZvsq25SB4tXw74mVrL8';

// Configuração do Mercado Pago
if (!process.env.MP_ACCESS_TOKEN) {
  console.error('ERRO: O Access Token do Mercado Pago não está configurado. Verifique o arquivo .env.');
  process.exit(1);
}
const mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
console.log('Access Token do Mercado Pago configurado com sucesso.');

// Função para validar CPF (dígito verificador)
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

// Endpoint para gerar link de pagamento Mercado Pago (Checkout Pro)
app.post('/api/gerar-pagamento', async (req, res) => {
  console.log('[/api/gerar-pagamento] endpoint chamado', new Date().toISOString());

  const { frete } = req.body;

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

  console.log('[/api/gerar-pagamento] Dados de pagamento:', { descricao, valor });

  try {
    const preference = new Preference(mpClient);
    const response = await preference.create({
      items: [
        {
          title: descricao,
          unit_price: parseFloat(valor),
          quantity: 1,
        },
      ],
      payment_methods: {
        excluded_payment_types: [
          { id: 'ticket' }, // Exclui boleto bancário
        ],
        installments: 1, // Limita a 1 parcela
      },
      back_urls: {
        success: `${process.env.BASE_URL}/sucesso`,
        failure: `${process.env.BASE_URL}/falha`,
        pending: `${process.env.BASE_URL}/pendente`,
      },
      auto_return: 'approved',
    });

    console.log('Preferência criada com sucesso:', response);
    res.json({ url_pagamento: response.init_point });
  } catch (error) {
    console.error('[ERRO Mercado Pago Checkout Pro]', {
      mensagem: error.message,
      detalhes: error.response ? error.response.data : null,
    });
    res.status(500).json({
      erro: 'Erro ao criar cobrança Mercado Pago',
      detalhes: error.message || error,
    });
  }
});

// Rotas de retorno para o Mercado Pago direcionando para as páginas corretas
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
