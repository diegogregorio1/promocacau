const express = require('express');
const path = require('path');
const { google } = require('googleapis');
const axios = require('axios');
const fs = require('fs');
const https = require('https');
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

// =========== PAGAMENTO VIA PIX EFI/GERENCIANET =============

// Carregue o certificado .p12 (PKCS#12) - USANDO VARIÁVEL DE AMBIENTE
let p12;
const certPath = process.env.CERT_PATH || './certs/certificado.p12';
try {
  p12 = fs.readFileSync(certPath);
} catch (err) {
  console.warn('[AVISO] Certificado Pix .p12 não encontrado. Recurso Pix ficará indisponível até corrigir isto.');
}

// Crie o httpsAgent usando o certificado .p12 (PKCS#12)
let httpsAgent;
if (p12) {
  httpsAgent = new https.Agent({
    pfx: p12,
    passphrase: process.env.CERT_PASSWORD || '', // senha do .p12
    rejectUnauthorized: true,
  });
}

// Endpoint para gerar cobrança Pix (QR Code)
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

  const CLIENT_ID = process.env.CLIENT_ID;
  const CLIENT_SECRET = process.env.CLIENT_SECRET;
  const CHAVE_PIX = process.env.CHAVE_PIX;

  if (!CLIENT_ID || !CLIENT_SECRET || !CHAVE_PIX) {
    return res.status(500).json({ erro: 'Credenciais Pix não configuradas corretamente.' });
  }

  if (!httpsAgent) {
    return res.status(500).json({ erro: 'Certificado Pix não configurado no servidor.' });
  }

  try {
    // 1. Obter access token (endpoint de PRODUÇÃO)
    const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const tokenResponse = await axios.post(
      'https://api-pix.gerencianet.com.br/oauth/token',
      { grant_type: 'client_credentials' },
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        httpsAgent
      }
    );
    const accessToken = tokenResponse.data.access_token;

    // 2. Criar cobrança Pix (endpoint de PRODUÇÃO)
    const payload = {
      calendario: { expiracao: 3600 },
      valor: { original: valor },
      chave: CHAVE_PIX,
      solicitacaoPagador: descricao,
    };

    const pixResponse = await axios.post(
      'https://api-pix.gerencianet.com.br/v2/cob',
      payload,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        httpsAgent
      }
    );

    // 3. Gerar o QR Code para a cobrança (endpoint de PRODUÇÃO)
    const locId = pixResponse.data.loc && pixResponse.data.loc.id;
    let qrcode = null, copiaecola = null;
    if (locId) {
      const qrResponse = await axios.get(
        `https://api-pix.gerencianet.com.br/v2/loc/${locId}/qrcode`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
          httpsAgent
        }
      );
      qrcode = qrResponse.data.imagemQrcode;
      copiaecola = qrResponse.data.qrcode;
    }

    res.json({
      qrcode: qrcode || null, // URL da imagem QR Code
      copiaecola: copiaecola || null // Código Pix Copia e Cola
    });

  } catch (error) {
    // Só mostre detalhes completos em ambiente de desenvolvimento!
    if (process.env.NODE_ENV === 'development') {
      console.error(error.response?.data || error);
      res.status(500).json({ erro: error.response?.data || error.message });
    } else {
      console.error(error.response?.data || error);
      res.status(500).json({ erro: 'Erro ao gerar cobrança Pix' });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});