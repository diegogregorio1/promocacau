const express = require('express');
const path = require('path');
const { google } = require('googleapis');
const axios = require('axios');
const fs = require('fs');
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

// =========== PAGAMENTO VIA PIX PAGSEGURO =============

// Função para obter o access_token do PagSeguro
async function getPagseguroToken() {
  const tokenUrl = 'https://oauth.api.pagseguro.com/oauth2/token';
  const clientId = process.env.PAGSEGURO_CLIENT_ID;
  const clientSecret = process.env.PAGSEGURO_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('PAGSEGURO_CLIENT_ID ou PAGSEGURO_CLIENT_SECRET não configurados.');
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  try {
    const response = await axios.post(tokenUrl, 'grant_type=client_credentials', {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${auth}`
      }
    });
    return response.data.access_token;
  } catch (err) {
    throw new Error('Erro ao obter access_token do PagSeguro. Detalhes: ' + (err.response?.data?.error_description || err.message));
  }
}

// Endpoint para gerar cobrança Pix (PagSeguro)
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

  const PAGSEGURO_PIX_KEY = process.env.PAGSEGURO_PIX_KEY;

  if (!process.env.PAGSEGURO_CLIENT_ID || !process.env.PAGSEGURO_CLIENT_SECRET || !PAGSEGURO_PIX_KEY) {
    return res.status(500).json({ erro: 'Credenciais PagSeguro não configuradas corretamente.' });
  }

  try {
    // 1. Obter access token
    const access_token = await getPagseguroToken();

    // 2. Criar cobrança Pix
    const payload = {
      calendario: { expiracao: 3600 },
      valor: { original: valor },
      chave: PAGSEGURO_PIX_KEY,
      solicitacaoPagador: descricao
    };

    const pixResponse = await axios.post(
      'https://pix.api.pagseguro.com/pix/v2/cob',
      payload,
      {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // 3. Gerar o QR Code e copia e cola
    const txid = pixResponse.data.txid;
    const qrcodeResp = await axios.get(
      `https://pix.api.pagseguro.com/pix/v2/cob/${txid}/qrcode`,
      {
        headers: {
          'Authorization': `Bearer ${access_token}`
        }
      }
    );

    res.json({
      qrcode: qrcodeResp.data.imagemQrcode, // Base64 da imagem QRCode
      copiaecola: qrcodeResp.data.qrcode    // Código Pix Copia e Cola
    });

  } catch (error) {
    console.error('[ERRO PagSeguro Pix]:', error.response?.data || error.message || error);
    res.status(500).json({ erro: 'Erro ao gerar cobrança Pix PagSeguro', detalhes: error.response?.data || error.message || error });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
