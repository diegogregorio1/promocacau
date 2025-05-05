const express = require('express');
const path = require('path');
const { google } = require('googleapis');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Gerencianet/EFI SDK
const EfiPay = require('@efipay/efipay');

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

  // Carrega credenciais do .env
  const CLIENT_ID = process.env.CLIENT_ID;
  const CLIENT_SECRET = process.env.CLIENT_SECRET;
  const CHAVE_PIX = process.env.CHAVE_PIX;

  if (!CLIENT_ID || !CLIENT_SECRET || !CHAVE_PIX) {
    return res.status(500).json({ erro: 'Credenciais Pix não configuradas corretamente.' });
  }

  // Configuração para SDK EFI/Gerencianet
  const options = {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    sandbox: false // true se estiver usando ambiente de testes
  };

  const efipay = new EfiPay(options);

  const chargeBody = {
    calendario: { expiracao: 3600 },
    valor: { original: valor },
    chave: CHAVE_PIX,
    solicitacaoPagador: descricao,
  };

  try {
    // Cria a cobrança Pix
    const cob = await efipay.pixCreateImmediateCharge([], chargeBody);

    // Gera o QR Code para a cobrança
    const locId = cob.loc && cob.loc.id;
    let qrcode = null, copiaecola = null;
    if (locId) {
      const qr = await efipay.pixGenerateQRCode({ id: locId });
      qrcode = qr.imagemQrcode;
      copiaecola = qr.qrcode;
    }

    res.json({
      qrcode: qrcode || null, // URL da imagem QR Code
      copiaecola: copiaecola || null // Código Pix Copia e Cola
    });

  } catch (error) {
    console.error(error.response?.data || error);
    res.status(500).json({ erro: 'Erro ao gerar cobrança Pix' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
