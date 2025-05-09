// Utilitário para formatar CPF e CEP
function formatarCPF(cpf) {
  cpf = cpf.replace(/\D/g, "");
  if (cpf.length <= 11)
    cpf = cpf.replace(/(\d{3})(\d)/, "$1.$2")
             .replace(/(\d{3})(\d)/, "$1.$2")
             .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  return cpf;
}
function formatarCEP(cep) {
  cep = cep.replace(/\D/g, "");
  if (cep.length > 5) cep = cep.replace(/^(\d{5})(\d)/, "$1-$2");
  return cep;
}

document.addEventListener('DOMContentLoaded', () => {
  // Etapas e barra de progresso
  const etapaPesquisa = document.getElementById('etapa-pesquisa');
  const etapaEscolha = document.getElementById('etapa-escolha');
  const etapaEndereco = document.getElementById('etapa-endereco');
  const etapaDados = document.getElementById('etapa-dados');
  const etapaFrete = document.getElementById('etapa-frete');
  const etapaConfirmacao = document.getElementById('etapa-confirmacao');
  const etapaSucesso = document.getElementById('etapa-sucesso');

  const botaoProximo1 = document.getElementById('botaoProximo1');
  const botaoVoltar1 = document.getElementById('botaoVoltar1');
  const botaoVoltar2 = document.getElementById('botaoVoltar2');
  const botaoAvancarEndereco = document.getElementById('botaoAvancarEndereco');
  const botaoVoltar3 = document.getElementById('botaoVoltar3');
  const botaoAvancarDados = document.getElementById('botaoAvancarDados');
  const botaoAvancarFrete = document.getElementById('botaoAvancarFrete');
  const botaoVoltarFrete = document.getElementById('botaoVoltarFrete');
  const botaoPagarPix = document.getElementById('botaoPagarPix');
  const botaoVoltarConfirmacao = document.getElementById('botaoVoltarConfirmacao');

  const passoPesquisa = document.getElementById('passoPesquisa');
  const passoChocolate = document.getElementById('passoChocolate');
  const passoEndereco = document.getElementById('passoEndereco');
  const passoDados = document.getElementById('passoDados');
  const passoFrete = document.getElementById('passoFrete');
  const passoConfirmacao = document.getElementById('passoConfirmacao');

  // ETAPA 1: Pesquisa
  const pesquisaForm = document.getElementById('pesquisa-form');
  const selects = pesquisaForm.querySelectorAll('select');
  function verificaTodosPreenchidos() {
    const todosPreenchidos = Array.from(selects).every(e => e.value !== "");
    botaoProximo1.disabled = !todosPreenchidos;
  }
  selects.forEach(sel => {
    sel.addEventListener('change', verificaTodosPreenchidos);
  });
  verificaTodosPreenchidos();

  botaoProximo1.addEventListener('click', () => {
    etapaPesquisa.classList.remove('etapa-ativa');
    etapaPesquisa.classList.add('etapa-oculta');
    etapaEscolha.classList.remove('etapa-oculta');
    etapaEscolha.classList.add('etapa-ativa');
    passoPesquisa.classList.remove('atual');
    passoChocolate.classList.add('atual');
    window.scrollTo({top: 0, behavior:'smooth'});
  });

  // ETAPA 2: Escolha do Chocolate
  const botoesSelecionar = document.querySelectorAll('.botao-selecionar');
  botoesSelecionar.forEach(botao => {
    botao.addEventListener('click', (e) => {
      botoesSelecionar.forEach(b => b.textContent = 'Selecionar');
      e.target.textContent = 'Selecionado!';
      botoesSelecionar.forEach(b => b.classList.remove('selecionado'));
      e.target.classList.add('selecionado');

      etapaEscolha.classList.remove('etapa-ativa');
      etapaEscolha.classList.add('etapa-oculta');
      etapaEndereco.classList.remove('etapa-oculta');
      etapaEndereco.classList.add('etapa-ativa');
      passoChocolate.classList.remove('atual');
      passoEndereco.classList.add('atual');

      setTimeout(() => {
        document.getElementById('cep').focus();
        window.scrollTo({top: document.getElementById('etapa-endereco').offsetTop - 30, behavior: 'smooth'});
      }, 300);
    });
  });

  botaoVoltar1.addEventListener('click', () => {
    etapaEscolha.classList.remove('etapa-ativa');
    etapaEscolha.classList.add('etapa-oculta');
    etapaPesquisa.classList.remove('etapa-oculta');
    etapaPesquisa.classList.add('etapa-ativa');
    passoChocolate.classList.remove('atual');
    passoPesquisa.classList.add('atual');
    window.scrollTo({top: 0, behavior:'smooth'});
  });

  // ETAPA 3: Endereço (CEP)
  const cepInput = document.getElementById('cep');
  const enderecoFields = document.getElementById('endereco-fields');
  const ruaInput = document.getElementById('rua');
  const bairroInput = document.getElementById('bairro');
  const cidadeInput = document.getElementById('cidade');
  const ufInput = document.getElementById('uf');

  const erroCEP = document.createElement('div');
  erroCEP.style.color = "#c0392b";
  erroCEP.style.marginBottom = "10px";
  erroCEP.style.fontWeight = "bold";
  erroCEP.textContent = "CEP não encontrado. Verifique e tente novamente.";

  cepInput.addEventListener('input', (e) => {
    e.target.value = formatarCEP(e.target.value);

    enderecoFields.style.display = 'none';
    botaoAvancarEndereco.style.display = 'none';
    ruaInput.value = '';
    bairroInput.value = '';
    cidadeInput.value = '';
    ufInput.value = '';
    if (cepInput.parentElement.contains(erroCEP)) {
      cepInput.parentElement.removeChild(erroCEP);
    }

    if (e.target.value.length === 9) {
      fetch(`https://viacep.com.br/ws/${e.target.value.replace('-', '')}/json/`)
      .then(res => res.json())
      .then(data => {
        if (!data.erro) {
          ruaInput.value = data.logradouro || '';
          bairroInput.value = data.bairro || '';
          cidadeInput.value = data.localidade || '';
          ufInput.value = data.uf || '';
          enderecoFields.style.display = 'block';
          botaoAvancarEndereco.style.display = 'block';
        } else {
          enderecoFields.style.display = 'none';
          botaoAvancarEndereco.style.display = 'none';
          cepInput.parentElement.appendChild(erroCEP);
        }
      })
      .catch(() => {
        enderecoFields.style.display = 'none';
        botaoAvancarEndereco.style.display = 'none';
        cepInput.parentElement.appendChild(erroCEP);
      });
    }
  });

  botaoAvancarEndereco.addEventListener('click', () => {
    etapaEndereco.classList.remove('etapa-ativa');
    etapaEndereco.classList.add('etapa-oculta');
    etapaDados.classList.remove('etapa-oculta');
    etapaDados.classList.add('etapa-ativa');
    passoEndereco.classList.remove('atual');
    passoDados.classList.add('atual');
    setTimeout(() => {
      document.getElementById('nome').focus();
      window.scrollTo({top: document.getElementById('etapa-dados').offsetTop - 30, behavior:'smooth'});
    }, 300);
  });

  botaoVoltar2.addEventListener('click', () => {
    etapaEndereco.classList.remove('etapa-ativa');
    etapaEndereco.classList.add('etapa-oculta');
    etapaEscolha.classList.remove('etapa-oculta');
    etapaEscolha.classList.add('etapa-ativa');
    passoEndereco.classList.remove('atual');
    passoChocolate.classList.add('atual');
    window.scrollTo({top: 0, behavior:'smooth'});
  });

  // ETAPA 4: Dados Pessoais
  const dadosForm = document.getElementById('dados-form');
  const nomeInput = document.getElementById('nome');
  const cpfInput = document.getElementById('cpf');
  const emailInput = document.getElementById('email');
  const cellphoneInput = document.getElementById('cellphone');
  const botaoAvancar = document.getElementById('botaoAvancarDados');

  function validarDadosObrigatorios() {
    const nomeValido = nomeInput.value.trim().length > 4;
    const cpfValido = cpfInput.value.replace(/\D/g, '').length === 11;
    const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.value);
    const numeroValido = cellphoneInput.value.trim().length > 0;
    botaoAvancar.disabled = !(nomeValido && cpfValido && emailValido && numeroValido);
  }

  dadosForm.addEventListener('input', () => {
    cpfInput.value = formatarCPF(cpfInput.value);
    validarDadosObrigatorios();
  });

  // ENVIO PARA O BACKEND AO AVANÇAR DADOS PESSOAIS!
  botaoAvancar.addEventListener('click', async () => {
    botaoAvancar.disabled = true;
    botaoAvancar.textContent = "Enviando...";

    // Pegando todos os campos obrigatórios
    const nome = nomeInput.value.trim();
    const cpf = cpfInput.value.replace(/\D/g, '');
    const email = emailInput.value.trim();
    let cellphone = cellphoneInput.value.replace(/\D/g, '');

    // Adiciona o +55 se o telefone tiver 11 dígitos e não começar com +55
    if (cellphone.length === 11 && !cellphone.startsWith('+55')) {
      cellphone = '+55' + cellphone;
    }

    try {
      const resposta = await fetch('/api/registrar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ nome, cpf, email, cellphone })
      });

      const resultado = await resposta.json();

      if (!resposta.ok) {
        alert(resultado.message || 'Erro ao enviar os dados.');
        botaoAvancar.disabled = false;
        botaoAvancar.textContent = "Avançar";
        return;
      }

      // Sucesso: avança para próxima etapa
      etapaDados.classList.remove('etapa-ativa');
      etapaDados.classList.add('etapa-oculta');
      etapaFrete.classList.remove('etapa-oculta');
      etapaFrete.classList.add('etapa-ativa');
      passoDados.classList.remove('atual');
      passoFrete.classList.add('atual');
      setTimeout(() => {
        window.scrollTo({top: etapaFrete.offsetTop - 30, behavior:'smooth'});
      }, 300);
    } catch (erro) {
      alert('Erro ao enviar os dados. Tente novamente.');
      botaoAvancar.disabled = false;
      botaoAvancar.textContent = "Avançar";
    }
  });

  botaoVoltar3.addEventListener('click', () => {
    etapaDados.classList.remove('etapa-ativa');
    etapaDados.classList.add('etapa-oculta');
    etapaEndereco.classList.remove('etapa-oculta');
    etapaEndereco.classList.add('etapa-ativa');
    passoDados.classList.remove('atual');
    passoEndereco.classList.add('atual');
    window.scrollTo({top: document.getElementById('etapa-endereco').offsetTop - 30, behavior:'smooth'});
  });

  // ETAPA 5: Tipo de Frete
  const freteForm = document.getElementById('frete-form');
  if (freteForm) {
    freteForm.addEventListener('change', () => {
      const selecionado = freteForm.querySelector('input[name="tipo-frete"]:checked');
      botaoAvancarFrete.disabled = !selecionado;
    });
  }

  // ETAPA 6: Confirmação
  const resumoPedido = document.getElementById('resumoPedido');
  let dadosResumo = {
    produto: "",
    nome: "",
    endereco: "",
    frete: "",
    valorFrete: ""
  };

  // Variáveis para controle de pagamento
  let paymentId = null;
  let pollingTimer = null;

  if (botaoAvancarFrete) {
    botaoAvancarFrete.addEventListener('click', () => {
      // Produto
      const prodSelecionado = document.querySelector('.botao-selecionar.selecionado');
      let prodNome = prodSelecionado ? prodSelecionado.closest('.produto-card').querySelector('h2').textContent : "";

      // Nome
      let nome = document.getElementById('nome').value;

      // Endereço completo
      let rua = document.getElementById('rua').value;
      let numeroResidencia = document.getElementById('numero').value;
      let complemento = document.getElementById('complemento').value;
      let bairro = document.getElementById('bairro').value;
      let cidade = document.getElementById('cidade').value;
      let uf = document.getElementById('uf').value;
      let cep = document.getElementById('cep').value;
      let endereco =
        `${rua}, ${numeroResidencia}${complemento ? " - " + complemento : ""}, ${bairro}, ${cidade} - ${uf}, CEP: ${cep}`;

      // Frete
      const freteSelecionado = document.querySelector('input[name="tipo-frete"]:checked');
      let tipoFrete = freteSelecionado ?
        freteSelecionado.value : "";

      let valorFrete = freteSelecionado ?
        (freteSelecionado.value === "pac" ? "R$ 17,99" : "R$ 29,99") : "";

      dadosResumo = {
        produto: prodNome,
        nome: nome,
        endereco: endereco,
        frete: tipoFrete,
        valorFrete: valorFrete
      };

      resumoPedido.innerHTML = `
        <p><strong>Produto:</strong> ${prodNome}</p>
        <p><strong>Nome:</strong> ${nome}</p>
        <p><strong>Endereço:</strong> ${endereco}</p>
        <p><strong>Frete:</strong> ${tipoFrete} (${valorFrete})</p>
      `;

      etapaFrete.classList.remove('etapa-ativa');
      etapaFrete.classList.add('etapa-oculta');
      etapaConfirmacao.classList.remove('etapa-oculta');
      etapaConfirmacao.classList.add('etapa-ativa');
      passoFrete.classList.remove('atual');
      passoConfirmacao.classList.add('atual');
      setTimeout(() => {
        window.scrollTo({top: etapaConfirmacao.offsetTop - 30, behavior:'smooth'});
      }, 300);
    });
  }

  if (botaoVoltarConfirmacao) {
    botaoVoltarConfirmacao.addEventListener('click', () => {
      etapaConfirmacao.classList.remove('etapa-ativa');
      etapaConfirmacao.classList.add('etapa-oculta');
      etapaFrete.classList.remove('etapa-oculta');
      etapaFrete.classList.add('etapa-ativa');
      passoConfirmacao.classList.remove('atual');
      passoFrete.classList.add('atual');
      window.scrollTo({top: etapaFrete.offsetTop - 30, behavior:'smooth'});
    });
  }

  // =============== PAGAMENTO - PIX ASAAS (QR CODE E COPIA E COLA) ===============
  if (botaoPagarPix) {
    botaoPagarPix.addEventListener('click', async () => {
      const freteSelecionado = document.querySelector('input[name="tipo-frete"]:checked');
      let tipoFrete = freteSelecionado ? freteSelecionado.value.toLowerCase() : null;
      if (!tipoFrete) {
        alert('Selecione o tipo de frete para gerar o pagamento.');
        return;
      }

      // Pegue os dados do cliente dos inputs
      const nome = document.getElementById('nome').value.trim();
      const email = document.getElementById('email').value.trim();
      const cpf = document.getElementById('cpf').value.replace(/\D/g, '');
      let cellphone = document.getElementById('cellphone').value.replace(/\D/g, '');
      if (cellphone.length === 11 && !cellphone.startsWith('+55')) {
        cellphone = '+55' + cellphone;
      }

      botaoPagarPix.disabled = true;
      botaoPagarPix.textContent = "Gerando PIX...";

      try {
        const resposta = await fetch('/api/gerar-pagamento', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ frete: tipoFrete, nome, email, cpf, cellphone })
        });
        const data = await resposta.json();

        if (data.qrCodeImage && data.copiaECola && data.paymentId) {
          paymentId = data.paymentId;
          // Exibe o QR Code e o Copia e Cola na tela de confirmação
          let resultadoDiv = document.getElementById('resultadoPix');
          if (!resultadoDiv) {
            resultadoDiv = document.createElement('div');
            resultadoDiv.id = 'resultadoPix';
            etapaConfirmacao.appendChild(resultadoDiv);
          }
          resultadoDiv.innerHTML = `
            <h3>Pague com PIX</h3>
            <img src="data:image/png;base64,${data.qrCodeImage}" alt="QR Code PIX" style="width:220px;height:220px;display:block;margin:0 auto 10px auto;">
            <div style="margin: 10px 0;">
              <label for="pixCopiaCola"><strong>Copia e Cola:</strong></label>
              <input id="pixCopiaCola" type="text" value="${data.copiaECola}" readonly style="width: 100%;font-size:14px;" />
              <button id="copiarPix" style="margin-top:6px;">Copiar código PIX</button>
            </div>
            <p style="color: #27ae60; font-weight:bold;">Após o pagamento, aguarde a confirmação automática nesta tela.</p>
            <div id="statusPix" style="margin:10px 0;color:#333;font-weight:bold;"></div>
          `;
          // Função para copiar o código PIX
          document.getElementById('copiarPix').onclick = () => {
            const input = document.getElementById('pixCopiaCola');
            input.select();
            input.setSelectionRange(0, 99999);
            document.execCommand('copy');
            alert('Código PIX copiado!');
          };
          resultadoDiv.scrollIntoView({ behavior: 'smooth' });

          // Inicia o polling do status do pagamento
          iniciarPollingPagamento(paymentId);
        } else {
          alert('Não foi possível gerar o QR Code PIX. Tente novamente.');
        }
      } catch (erro) {
        alert('Erro ao gerar o QR Code PIX. Tente novamente.');
      }

      botaoPagarPix.disabled = false;
      botaoPagarPix.textContent = "Gerar PIX";
    });
  }

  // Função de polling para checar status do pagamento
  function iniciarPollingPagamento(paymentId) {
    const statusDiv = document.getElementById('statusPix');
    function checarStatus() {
      fetch(`/api/status-pagamento?paymentId=${paymentId}`)
        .then(res => res.json())
        .then(data => {
          if (data.status === "RECEIVED" || data.status === "CONFIRMED") {
            statusDiv.innerHTML = '<span style="color:#388e3c;">Pagamento confirmado! Parabéns, seu brinde será enviado para o endereço cadastrado.</span>';
            // Avança para a etapa de sucesso após 3s
            setTimeout(() => {
              etapaConfirmacao.classList.remove('etapa-ativa');
              etapaConfirmacao.classList.add('etapa-oculta');
              etapaSucesso.classList.remove('etapa-oculta');
              etapaSucesso.classList.add('etapa-ativa');
              window.scrollTo({top: 0, behavior:'smooth'});
            }, 3000);
            if (pollingTimer) clearTimeout(pollingTimer);
          } else if (data.status === "PENDING") {
            statusDiv.innerHTML = '<span style="color:#ff9800;">Aguardando pagamento...</span>';
            pollingTimer = setTimeout(checarStatus, 5000);
          } else if (data.status === "OVERDUE") {
            statusDiv.innerHTML = '<span style="color:#c0392b;">Pagamento vencido. Por favor, gere um novo PIX!</span>';
          } else {
            statusDiv.innerHTML = `<span style="color:#c0392b;">Status do pagamento: ${data.status || "desconhecido"}</span>`;
            pollingTimer = setTimeout(checarStatus, 5000);
          }
        })
        .catch(() => {
          statusDiv.innerHTML = '<span style="color:#c0392b;">Erro ao checar status do pagamento. Tentando novamente...</span>';
          pollingTimer = setTimeout(checarStatus, 10000);
        });
    }
    checarStatus();
  }
  // =============== FIM PAGAMENTO - PIX ASAAS ===============
});
