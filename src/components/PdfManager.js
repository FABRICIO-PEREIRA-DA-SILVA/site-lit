import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, onSnapshot, orderBy, updateDoc, doc, getDocs, getDoc } from 'firebase/firestore';
import { db } from '../utils/firebaseConfig';
import SignatureCanvas from 'react-signature-canvas';
import './PdfManager.css';
import Select from 'react-select';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { storage } from '../utils/firebaseConfig';

const ITEMS_PER_PAGE = 20;

const StatusBadge = ({ status }) => {
  const statusConfig = {
    pendente: { text: 'Pendente', className: 'status-pendente' },
    aprovado: { text: 'Aprovado', className: 'status-aprovado' },
    rejeitado: { text: 'Rejeitado', className: 'status-rejeitado' }
  };
  const config = statusConfig[status] || statusConfig.pendente;
  return <span className={`status-badge ${config.className}`}>{config.text}</span>;
};

function PdfManager({ user }) {
  const [boletins, setBoletins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [agentes, setAgentes] = useState([]);
  const [selectedBoletim, setSelectedBoletim] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [observacoes, setObservacoes] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [userMap, setUserMap] = useState({});
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [signatureAction, setSignatureAction] = useState('');
  const sigCanvas = useRef({});
  const [filters, setFilters] = useState({
    agenteId: '',
    startDate: '',
    endDate: '',
    status: ''
  });
  const [vistoMethod, setVistoMethod] = useState('digital');
  const [textSignature, setTextSignature] = useState('');
  const [savedSignature, setSavedSignature] = useState(null);
  const [saveToProfile, setSaveToProfile] = useState(false);
  const [supervisorMatricula, setSupervisorMatricula] = useState('');
  const [selectedBoletins, setSelectedBoletins] = useState([]);
  const [isMerging, setIsMerging] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState(null);
  const [supervisorTeam, setSupervisorTeam] = useState([]); // Armazena os IDs dos agentes da equipe do supervisor
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false); // Controla a visibilidade do modal de equipe
  const [selectedAgentsInModal, setSelectedAgentsInModal] = useState([]); // Controla os agentes selecionados dentro do modal
  const [isTeamFilterActive, setIsTeamFilterActive] = useState(false); // Controla se o filtro de equipe está ativo
  const [searchTerm, setSearchTerm] = useState(''); // NOVO ESTADO PARA A BUSCA
  const [currentUserInfo, setCurrentUserInfo] = useState(null);
  const [buscaAgente, setBuscaAgente] = useState('');
  const [nomeParaApelidoMap, setNomeParaApelidoMap] = useState({});
  const [isLandscape, setIsLandscape] = useState(window.matchMedia("(orientation: landscape)").matches);
  const labSigCanvas = useRef({});
  const [isLabSignatureModalOpen, setIsLabSignatureModalOpen] = useState(false);

  const agenteOptions = useMemo(() => {
    // Função para normalizar o texto (remover acentos e converter para minúsculas)
    const normalizeText = (text) =>
      text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();

    const normalizedBusca = normalizeText(buscaAgente);

    // Se não houver busca, retorna a lista completa com "Todos"
    if (!normalizedBusca) {
      return [
        { value: '', label: 'Todos os Agentes' },
        ...agentes.map(agente => ({
          value: agente.id,
          label: agente.nome
        }))
      ];
    }

    // Filtra os agentes que correspondem à busca
    const filtered = agentes.filter(agente =>
      normalizeText(agente.nome).includes(normalizedBusca)
    );

    // Ordena os resultados filtrados para dar prioridade
    filtered.sort((a, b) => {
      const normalizedA = normalizeText(a.nome);
      const normalizedB = normalizeText(b.nome);

      const aStartsWith = normalizedA.startsWith(normalizedBusca);
      const bStartsWith = normalizedB.startsWith(normalizedBusca);

      if (aStartsWith && !bStartsWith) {
        return -1; // 'a' vem primeiro
      }
      if (!aStartsWith && bStartsWith) {
        return 1; // 'b' vem primeiro
      }
      // Se ambos começam (ou não começam) com a busca, ordena alfabeticamente
      return normalizedA.localeCompare(normalizedB);
    });

    // Retorna a lista final, sempre com "Todos" no topo
    return [
      { value: '', label: 'Todos os Agentes' },
      ...filtered.map(agente => ({
        value: agente.id,
        label: agente.nome
      }))
    ];
  }, [agentes, buscaAgente]);

  const agentesParaModal = useMemo(() => {
    // A função de normalizar é a mesma
    const normalizeText = (text) =>
      text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();

    // A única mudança aqui é usar 'searchTerm' do seu input do modal
    const normalizedSearch = normalizeText(searchTerm);

    // Se a busca estiver vazia, retorna a lista completa, ordenada
    if (!normalizedSearch) {
      return [...agentes].sort((a, b) => a.nome.localeCompare(b.nome));
    }

    // A lógica de filtro é a mesma
    const filtered = agentes.filter(agente =>
      normalizeText(agente.nome).includes(normalizedSearch)
    );

    // A lógica de ordenação é a mesma
    filtered.sort((a, b) => {
      const normalizedA = normalizeText(a.nome);
      const normalizedB = normalizeText(b.nome);
      const aStartsWith = normalizedA.startsWith(normalizedSearch);
      const bStartsWith = normalizedB.startsWith(normalizedSearch);

      if (aStartsWith && !bStartsWith) return -1;
      if (!aStartsWith && bStartsWith) return 1;
      
      return normalizedA.localeCompare(normalizedB);
    });

    // A principal diferença: retornamos a lista filtrada diretamente,
    // sem formatar como {value, label} e sem adicionar "Todos"
    return filtered;

  }, [agentes, searchTerm]);

  const [isLabModalOpen, setIsLabModalOpen] = useState(false);
  const [labData, setLabData] = useState({
    aegypti: { a1: '', a2: '', b: '', c: '', d1: '', d2: '', e: '' },
    albopictus: { a1: '', a2: '', b: '', c: '', d1: '', d2: '', e: '' },
    culex: { a1: '', a2: '', b: '', c: '', d1: '', d2: '', e: '' },
    outros: { a1: '', a2: '', b: '', c: '', d1: '', d2: '', e: '' },
    imoveis: { residencial: '', comercial: '', tb: '', pe: '', outros: '' },
    // ⬇️ ADICIONE ESTE CAMPO ⬇️
    especies: {
      aegyptiImoveis: { residencial: '', comercial: '', tb: '', pe: '', outros: '' },
      aegyptiExemplares: { larvas: '', adultos: '' },
      albopictusImoveis: { residencial: '', comercial: '', tb: '', pe: '', outros: '' },
      albopictusExemplares: { larvas: '', adultos: '' },
      culexImoveis: { residencial: '', comercial: '', tb: '', pe: '', outros: '' },
      culexExemplares: { larvas: '', adultos: '' },
      outrosImoveis: { residencial: '', comercial: '', tb: '', pe: '', outros: '' },
      outrosExemplares: { larvas: '', adultos: '' }
    },
    dataEntrega: '',
    dataConclusao: '',
    laboratorio: '',
    nomeLaboratorista: '',
    assinaturaLaboratorista: '',
    outrosAnimais: [],
    descricaoAmbienteRisco: '',
    digitacaoLab: '',
    digitacaoCampo: ''
  });

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const usersCollection = collection(db, 'usuarios');
        const userSnapshot = await getDocs(usersCollection);
        const mapaDeUsuarios = {};
        const mapaNomeParaApelido = {};
        
        userSnapshot.forEach(doc => {
          const userData = doc.data();
          mapaDeUsuarios[doc.id] = userData.name || doc.id;
          // Mapeia: nome completo -> apelido
          if (userData.name) {
            mapaNomeParaApelido[userData.name] = userData.apelido || userData.name;
          }
        });
        
        setUserMap(mapaDeUsuarios);
        setNomeParaApelidoMap(mapaNomeParaApelido);

        const userDocRef = doc(db, 'usuarios', user.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          const userData = userDoc.data();
          // AQUI VAMOS POPULAR O NOVO ESTADO

          // BUSCA O ROLE (antes estava em 'users', agora em 'usuarios')
          if (userData.role) {
            setCurrentUserRole(userData.role);
          } else {
            setCurrentUserRole('none');
          }
          
          setCurrentUserInfo({
            name: userData.name,
            apelido: userData.apelido 
          });
          if (userData.assinaturaSalva) {
            setSavedSignature(userData.assinaturaSalva);
          }
          if (userData.matrícula) {
            setSupervisorMatricula(userData.matrícula);
          }
          // NOVA LÓGICA PARA CARREGAR A EQUIPE
          if (userData.equipeAgentes && Array.isArray(userData.equipeAgentes)) {
            setSupervisorTeam(userData.equipeAgentes);
            setSelectedAgentsInModal(userData.equipeAgentes); // Pré-popula o modal
          }
        } else {
        // Se o documento não existe, define role como 'none'
        setCurrentUserRole('none');
      }
    } catch (error) {
      console.error("Erro ao buscar dados do usuário:", error);
      setCurrentUserRole('none'); // Garante um estado padrão em caso de erro
    }
  };
  
  fetchUsers();
}, [user.uid]);

  useEffect(() => {
    if (Object.keys(userMap).length === 0) return;
    setLoading(true);
    const q = query(collection(db, 'boletinsPdf'), orderBy('dataCriacao', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const boletinsData = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          dataCriacao: data.dataCriacao?.toDate(),
          dataVisto: data.dataVisto?.toDate(),
          agenteNome: userMap[data.agenteId] || data.agenteNome || data.agenteId
        };
      });
      setBoletins(boletinsData);
      const agentesUnicosMap = new Map();
      boletinsData.forEach(b => {
        if (b.agenteId && !agentesUnicosMap.has(b.agenteId)) {
          agentesUnicosMap.set(b.agenteId, { id: b.agenteId, nome: b.agenteNome });
        }
      });
      setAgentes(Array.from(agentesUnicosMap.values()));
      setLoading(false);
    }, (error) => {
      console.error("Erro ao escutar boletins:", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [userMap]);

  const filteredBoletins = useMemo(() => {
    return boletins.filter(b => {
      const { agenteId, startDate, endDate, status } = filters;

      // LÓGICA DE FILTRO ATUALIZADA
      if (isTeamFilterActive && supervisorTeam.length > 0) {
        // Se o filtro de equipe está ativo, verifica se o agente do boletim pertence à equipe
        if (!supervisorTeam.includes(b.agenteId)) return false;
      } else {
        // Caso contrário, usa o filtro individual de agente (como antes)
        if (agenteId && b.agenteId !== agenteId) return false;
      }

      // O resto da lógica de filtro permanece igual
      if (status && b.status !== status) return false;
      if (!b.dataCriacao) return true;
      if (startDate && b.dataCriacao < new Date(startDate)) return false;
      if (endDate) {
        const endOfDay = new Date(endDate + 'T23:59:59.999');
        if (b.dataCriacao > endOfDay) return false;
      }
      return true;
    });
  }, [boletins, filters, isTeamFilterActive, supervisorTeam]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filteredBoletins]);

  useEffect(() => {
    function handleOrientation() {
      setIsLandscape(window.matchMedia("(orientation: landscape)").matches);
    }
    window.addEventListener("orientationchange", handleOrientation);
    window.addEventListener("resize", handleOrientation);
    return () => {
      window.removeEventListener("orientationchange", handleOrientation);
      window.removeEventListener("resize", handleOrientation);
    };
  }, []);


  const totalPages = Math.ceil(filteredBoletins.length / ITEMS_PER_PAGE);
  const paginatedBoletins = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return filteredBoletins.slice(startIndex, endIndex);
  }, [currentPage, filteredBoletins]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  // Função para selecionar/desselecionar um único boletim
  const handleSelectBoletim = (boletimId) => {
    setSelectedBoletins(prevSelected => {
      if (prevSelected.includes(boletimId)) {
        return prevSelected.filter(id => id !== boletimId); // Remove se já estiver selecionado
      } else {
        return [...prevSelected, boletimId]; // Adiciona se não estiver selecionado
      }
    });
  };

  // Função para selecionar/desselecionar todos os boletins visíveis na página atual
  const handleSelectAll = () => {
    // Pega os IDs apenas dos boletins que estão sendo mostrados na página atual
    const currentPageIds = paginatedBoletins.map(b => b.id);
    
    // Verifica se todos os boletins da página atual já estão selecionados
    const allSelected = currentPageIds.every(id => selectedBoletins.includes(id));

    if (allSelected) {
      // Se todos já estão selecionados, remove todos eles da seleção
      setSelectedBoletins(prev => prev.filter(id => !currentPageIds.includes(id)));
    } else {
      // Se não, adiciona todos (evitando duplicatas)
      setSelectedBoletins(prev => [...new Set([...prev, ...currentPageIds])]);
    }
  };


  const openModal = (boletim) => {
    setSelectedBoletim(boletim);
    setObservacoes(boletim.observacoesSupervisor || '');
    setVistoMethod('digital');
    setTextSignature('');
    setSaveToProfile(false);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setSelectedBoletim(null);
    setObservacoes('');
    setIsModalOpen(false);
  };

  const openSignatureModal = (action) => {
    if (vistoMethod === 'digital') {
      setSignatureAction(action);
      setIsSignatureModalOpen(true);
      setIsModalOpen(false);
    }
  };

  const closeSignatureModal = () => {
    setIsSignatureModalOpen(false);
    setSignatureAction('');
    sigCanvas.current?.clear();
    setSaveToProfile(false);
    setIsModalOpen(true);
  };

  const clearSignature = () => {
    sigCanvas.current?.clear();
  };

  const loadSavedSignature = async () => {
    if (savedSignature) {
      // Se for URL (novo formato)
      if (savedSignature.startsWith('http')) {
        // Converte URL para base64 e carrega no canvas
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const dataURL = canvas.toDataURL('image/png');
          sigCanvas.current.fromDataURL(dataURL);
        };
        img.src = savedSignature;
      } else {
        // Se for base64 (formato antigo)
        sigCanvas.current.fromDataURL(savedSignature);
      }
    } else {
      alert('Nenhuma assinatura salva encontrada no seu perfil.');
    }
  };

  const uploadSignatureToStorage = async (signatureBase64, userId) => {
    try {
      // Remove o prefixo "data:image/png;base64," se existir
      const base64Data = signatureBase64.split(',')[1] || signatureBase64;
      
      // Cria referência única no Storage
      const timestamp = Date.now();
      const signatureRef = ref(storage, `public/vistosupervisor/${userId}/${timestamp}.png`);
      
      // Faz upload da imagem em base64
      await uploadString(signatureRef, base64Data, 'base64', {
        contentType: 'image/png'
      });
      
      // Obtém a URL de download
      const downloadURL = await getDownloadURL(signatureRef);
      return downloadURL;
      
    } catch (error) {
      console.error('Erro ao fazer upload da assinatura:', error);
      throw error;
    }
  };


  // FUNÇÃO CORRIGIDA
  const confirmSignature = async () => {
    if (sigCanvas.current?.isEmpty()) {
      alert('Por favor, faça ou carregue uma assinatura antes de confirmar.');
      return;
    }
    
    try {
      // Converte a assinatura para base64
      const signatureBase64 = sigCanvas.current?.toDataURL('image/png');
      
      // Faz upload para o Storage e obtém a URL
      const signatureURL = await uploadSignatureToStorage(signatureBase64, user.uid);
      
      // Atualiza o documento do boletim com a URL
      const updatedDadosCabecalho = {
        ...selectedBoletim.dadosCabecalho,
        matriculaSupervisor: supervisorMatricula || ''
      };
      
      await updateDoc(doc(db, 'boletinsPdf', selectedBoletim.id), {
        status: signatureAction,
        vistoSupervisor: userMap[user.uid] || user.email,
        observacoesSupervisor: observacoes,
        assinaturaSupervisor: signatureURL, // ✅ Agora salva a URL, não o base64
        tipoAssinaturaSupervisor: 'digital',
        dadosCabecalho: updatedDadosCabecalho,
        dataVisto: new Date()
      });
      
      // Se marcou para salvar no perfil
      if (saveToProfile) {
        await updateDoc(doc(db, 'usuarios', user.uid), {
          assinaturaSalva: signatureURL // ✅ Também salva a URL no perfil
        });
        setSavedSignature(signatureURL);
        alert('Assinatura salva no seu perfil com sucesso!');
      }
      
      setIsSignatureModalOpen(false);
      setIsModalOpen(false);
      setSelectedBoletim(null);
      setObservacoes('');
      setSignatureAction('');
      setSaveToProfile(false);
      alert(`Boletim ${signatureAction} e assinado com sucesso!`);
      
    } catch (error) {
      console.error('Erro ao confirmar assinatura:', error);
      alert('Erro ao salvar assinatura. Tente novamente.');
    }
  };

  const clearLabSignature = () => {
    if (labSigCanvas.current) {
      labSigCanvas.current.clear();
    }
  };

  const confirmLabSignature = () => {
    if (!labSigCanvas.current || labSigCanvas.current.isEmpty()) {
      alert('⚠️ Desenhe sua assinatura primeiro');
      return;
    }

    try {
      const canvas = labSigCanvas.current.getCanvas();
      const signatureDataURL = canvas.toDataURL('image/png');

      setLabData(prev => ({
        ...prev,
        assinaturaLaboratorista: signatureDataURL
      }));

      setIsLabSignatureModalOpen(false);
      alert('✅ Assinatura capturada!');
    } catch (error) {
      console.error('Erro:', error);
      alert('❌ Erro ao capturar. Tente novamente.');
    }
  };

  const confirmTextSignature = async (action) => {
    if (!textSignature.trim()) {
      alert('Por favor, digite ou selecione um nome para o visto.');
      return;
    }
    try {
      const updatedDadosCabecalho = {
        ...selectedBoletim.dadosCabecalho,
        matriculaSupervisor: supervisorMatricula || ''
      };
      await updateDoc(doc(db, 'boletinsPdf', selectedBoletim.id), {
        status: action,
        vistoSupervisor: currentUserInfo?.apelido || currentUserInfo?.name || user.email,
        observacoesSupervisor: observacoes,
        assinaturaSupervisor: textSignature,
        tipoAssinaturaSupervisor: 'texto',
        dadosCabecalho: updatedDadosCabecalho,
        dataVisto: new Date()
      });
      setIsModalOpen(false);
      setSelectedBoletim(null);
      setObservacoes('');
      setTextSignature('');
      alert(`Boletim ${action} com visto de texto salvo com sucesso!`);
    } catch (error) {
      console.error('Erro ao salvar visto de texto:', error);
      alert('Erro ao salvar visto de texto. Tente novamente.');
    }
  };

  const fillMyName = () => {
    const myName = userMap[user.uid] || user.email || 'Supervisor';
    setTextSignature(myName);
  };

  const getFinalHtmlContent = (boletim) => {
    if (!boletim.htmlContent) {
      return null;
    }
    let htmlWithSignature = boletim.htmlContent;

    // Atualiza a matrícula do supervisor
    const matriculaSupervisorRegex = /<td style="width: 14%;"><span class="matriculasupervisor">MATRÍCULA:<\/span><div class="header-value">[^<]*<\/div><\/td>/gi;
    const matriculaCellHtml = `<td style="width: 14%;"><span class="matriculasupervisor">MATRÍCULA:</span><div class="header-value">${boletim.dadosCabecalho?.matriculaSupervisor || ''}</div></td>`;
    htmlWithSignature = htmlWithSignature.replace(matriculaSupervisorRegex, matriculaCellHtml);

    // Adiciona a assinatura se existir
    if (boletim.assinaturaSupervisor && boletim.vistoSupervisor) {
      let signatureCellHtml;
      const isImage = boletim.assinaturaSupervisor.startsWith('data:image') ||
                      boletim.assinaturaSupervisor.startsWith('http://') ||
                      boletim.assinaturaSupervisor.startsWith('https://');
      if (isImage) {
        signatureCellHtml = `
          <td style="width: 120px; overflow: hidden !important; vertical-align: top; padding: 2px !important;">
            <span class="header-label" style="position: absolute; top: 2px; left: 5px; font-size: 8px; font-weight: bold;">VISTO DO SUPERVISOR:</span>
            <div style="padding-top: 5px; height: 30px !important; max-height: 30px !important; overflow: hidden !important; display: flex; flex-direction: column; align-items: center; justify-content: center;">
              <img
                src="${boletim.assinaturaSupervisor}"
                alt="Assinatura do Supervisor"
                style="max-width: 100%; max-height: 28px; object-fit: contain;"
                crossorigin="anonymous"
              />
            </div>
          </td>
        `;
      } else {
        signatureCellHtml = `
          <td style="width: 120px; overflow: hidden !important; vertical-align: top; padding: 2px !important;">
            <span class="header-label" style="position: absolute; top: 2px; left: 5px; font-size: 8px; font-weight: bold;">VISTO DO SUPERVISOR:</span>
            <div style="padding-top: 5px; height: 30px !important; max-height: 30px !important; overflow: hidden !important; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; text-align: center;">
              ${boletim.assinaturaSupervisor}
            </div>
          </td>
        `;
      }
      const vistoRegex = /<td[^>]*style="width: 22%;">.*?<span class="header-label">VISTO DO SUPERVISOR:<\/span><div class="header-value">[^<]*<\/div><\/td>/gi;
      htmlWithSignature = htmlWithSignature.replace(vistoRegex, signatureCellHtml);
    }

    // PARTE NOVA: Dados de Laboratório
    if (boletim.dadosLaboratorio) {
      const lab = boletim.dadosLaboratorio;

      const calcTotal = (obj) => {
        if (!obj) return 0;
        return Object.values(obj).reduce((acc, val) => acc + (parseInt(val) || 0), 0);
      };

      // Aedes aegypti
      if (lab.aegypti) {
        const regex1 = /<div style="text-align: right; font-size: 12px; margin-bottom: 2px;">Número de depósitos com <b>Aedes aegypti<\/b> por tipo\.<\/div>\s*<table class="p2-summary-table"[^>]*>[\s\S]*?<\/table>/i;
        const html1 = `<div style="text-align: right; font-size: 12px; margin-bottom: 2px;">Número de depósitos com <b>Aedes aegypti</b> por tipo.</div>
          <table class="p2-summary-table" style="width: 100%; margin-bottom: 6px;">
            <tr><th>A1</th><th>A2</th><th>B</th><th>C</th><th>D1</th><th>D2</th><th>E</th><th>TOTAL</th></tr>
            <tr>
              <td>${lab.aegypti.a1 || '&nbsp;'}</td>
              <td>${lab.aegypti.a2 || '&nbsp;'}</td>
              <td>${lab.aegypti.b || '&nbsp;'}</td>
              <td>${lab.aegypti.c || '&nbsp;'}</td>
              <td>${lab.aegypti.d1 || '&nbsp;'}</td>
              <td>${lab.aegypti.d2 || '&nbsp;'}</td>
              <td>${lab.aegypti.e || '&nbsp;'}</td>
              <td>${calcTotal(lab.aegypti)}</td>
            </tr>
          </table>`;
        htmlWithSignature = htmlWithSignature.replace(regex1, html1);
      }

      // Aedes albopictus
      if (lab.albopictus) {
        const regex2 = /<div style="text-align: right; font-size: 12px; margin-bottom: 2px;">Número de depósitos com <b>Aedes albopictus<\/b> por tipo\.<\/div>\s*<table class="p2-summary-table"[^>]*>[\s\S]*?<\/table>/i;
        const html2 = `<div style="text-align: right; font-size: 12px; margin-bottom: 2px;">Número de depósitos com <b>Aedes albopictus</b> por tipo.</div>
          <table class="p2-summary-table" style="width: 100%; margin-bottom: 6px;">
            <tr><th>A1</th><th>A2</th><th>B</th><th>C</th><th>D1</th><th>D2</th><th>E</th><th>TOTAL</th></tr>
            <tr>
              <td>${lab.albopictus.a1 || '&nbsp;'}</td>
              <td>${lab.albopictus.a2 || '&nbsp;'}</td>
              <td>${lab.albopictus.b || '&nbsp;'}</td>
              <td>${lab.albopictus.c || '&nbsp;'}</td>
              <td>${lab.albopictus.d1 || '&nbsp;'}</td>
              <td>${lab.albopictus.d2 || '&nbsp;'}</td>
              <td>${lab.albopictus.e || '&nbsp;'}</td>
              <td>${calcTotal(lab.albopictus)}</td>
            </tr>
          </table>`;
        htmlWithSignature = htmlWithSignature.replace(regex2, html2);
      }

      // Culex
      if (lab.culex) {
        const regex3 = /<div style="text-align: right; font-size: 12px; margin-bottom: 2px;">Número de depósitos com <b>Culex quinquefasciatus<\/b> por tipo\.<\/div>\s*<table class="p2-summary-table"[^>]*>[\s\S]*?<\/table>/i;
        const html3 = `<div style="text-align: right; font-size: 12px; margin-bottom: 2px;">Número de depósitos com <b>Culex quinquefasciatus</b> por tipo.</div>
          <table class="p2-summary-table" style="width: 100%; margin-bottom: 6px;">
            <tr><th>A1</th><th>A2</th><th>B</th><th>C</th><th>D1</th><th>D2</th><th>E</th><th>TOTAL</th></tr>
            <tr>
              <td>${lab.culex.a1 || '&nbsp;'}</td>
              <td>${lab.culex.a2 || '&nbsp;'}</td>
              <td>${lab.culex.b || '&nbsp;'}</td>
              <td>${lab.culex.c || '&nbsp;'}</td>
              <td>${lab.culex.d1 || '&nbsp;'}</td>
              <td>${lab.culex.d2 || '&nbsp;'}</td>
              <td>${lab.culex.e || '&nbsp;'}</td>
              <td>${calcTotal(lab.culex)}</td>
            </tr>
          </table>`;
        htmlWithSignature = htmlWithSignature.replace(regex3, html3);
      }

      // Outros
      if (lab.outros) {
        const regex4 = /<div style="text-align: right; font-size: 12px; margin-bottom: 2px;">Número de depósitos com <b>Outros culicídeos<\/b> por tipo\.<\/div>\s*<table class="p2-summary-table"[^>]*>[\s\S]*?<\/table>/i;
        const html4 = `<div style="text-align: right; font-size: 12px; margin-bottom: 2px;">Número de depósitos com <b>Outros culicídeos</b> por tipo.</div>
          <table class="p2-summary-table" style="width: 100%; margin-bottom: 6px;">
            <tr><th>A1</th><th>A2</th><th>B</th><th>C</th><th>D1</th><th>D2</th><th>E</th><th>TOTAL</th></tr>
            <tr>
              <td>${lab.outros.a1 || '&nbsp;'}</td>
              <td>${lab.outros.a2 || '&nbsp;'}</td>
              <td>${lab.outros.b || '&nbsp;'}</td>
              <td>${lab.outros.c || '&nbsp;'}</td>
              <td>${lab.outros.d1 || '&nbsp;'}</td>
              <td>${lab.outros.d2 || '&nbsp;'}</td>
              <td>${lab.outros.e || '&nbsp;'}</td>
              <td>${calcTotal(lab.outros)}</td>
            </tr>
          </table>`;
        htmlWithSignature = htmlWithSignature.replace(regex4, html4);
      }

      // Tabela de Espécies (Tipos de Imóveis com Espécimes)
      if (lab.especies) {
        console.log('🧪 Lab.especies existe:', lab.especies);

        const calcTotalEspecies = (obj) => {
          if (!obj) return 0;
          return Object.values(obj).reduce((acc, val) => acc + (parseInt(val) || 0), 0);
        };

        const tabelaEspeciesRegex = /<table class="p2-summary-table"[^>]*>\s*<tr>\s*<th rowspan="2">ESPÉCIE<\/th>[\s\S]*?<tr><td[^>]*><i>Outros<\/i><\/td>[\s\S]*?<\/tr>\s*<\/table>/i;

        const tabelaEspeciesHtml = `
          <table class="p2-summary-table" style="margin-top: 5px;">
            <tr>
              <th rowspan="2">ESPÉCIE</th>
              <th colspan="6"><b>TIPOS DE IMÓVEIS COM ESPÉCIMES</b></th>
              <th colspan="2">Número Exemplares</th>
            </tr>
            <tr>
              <th>RESIDENCIAL</th><th>COMERCIAL</th><th>TB</th><th>PE</th><th>OUTROS</th><th>TOTAL</th>
              <th>LARVAS</th><th>ADULTOS</th>
            </tr>
            <tr>
              <td style="font-size: 13px;"><i>Aedes aegypti</i></td>
              <td>${lab.especies.aegyptiImoveis?.residencial || '&nbsp;'}</td>
              <td>${lab.especies.aegyptiImoveis?.comercial || '&nbsp;'}</td>
              <td>${lab.especies.aegyptiImoveis?.tb || '&nbsp;'}</td>
              <td>${lab.especies.aegyptiImoveis?.pe || '&nbsp;'}</td>
              <td>${lab.especies.aegyptiImoveis?.outros || '&nbsp;'}</td>
              <td>${calcTotalEspecies(lab.especies.aegyptiImoveis) || '&nbsp;'}</td>
              <td>${lab.especies.aegyptiExemplares?.larvas || '&nbsp;'}</td>
              <td>${lab.especies.aegyptiExemplares?.adultos || '&nbsp;'}</td>
            </tr>
            <tr>
              <td style="font-size: 13px;"><i>Aedes albopictus</i></td>
              <td>${lab.especies.albopictusImoveis?.residencial || '&nbsp;'}</td>
              <td>${lab.especies.albopictusImoveis?.comercial || '&nbsp;'}</td>
              <td>${lab.especies.albopictusImoveis?.tb || '&nbsp;'}</td>
              <td>${lab.especies.albopictusImoveis?.pe || '&nbsp;'}</td>
              <td>${lab.especies.albopictusImoveis?.outros || '&nbsp;'}</td>
              <td>${calcTotalEspecies(lab.especies.albopictusImoveis) || '&nbsp;'}</td>
              <td>${lab.especies.albopictusExemplares?.larvas || '&nbsp;'}</td>
              <td>${lab.especies.albopictusExemplares?.adultos || '&nbsp;'}</td>
            </tr>
            <tr>
              <td style="font-size: 13px;"><i>Culex quinquefasciatus</i></td>
              <td>${lab.especies.culexImoveis?.residencial || '&nbsp;'}</td>
              <td>${lab.especies.culexImoveis?.comercial || '&nbsp;'}</td>
              <td>${lab.especies.culexImoveis?.tb || '&nbsp;'}</td>
              <td>${lab.especies.culexImoveis?.pe || '&nbsp;'}</td>
              <td>${lab.especies.culexImoveis?.outros || '&nbsp;'}</td>
              <td>${calcTotalEspecies(lab.especies.culexImoveis) || '&nbsp;'}</td>
              <td>${lab.especies.culexExemplares?.larvas || '&nbsp;'}</td>
              <td>${lab.especies.culexExemplares?.adultos || '&nbsp;'}</td>
            </tr>
            <tr>
              <td style="font-size: 13px;">Outros</td>
              <td>${lab.especies.outrosImoveis?.residencial || '&nbsp;'}</td>
              <td>${lab.especies.outrosImoveis?.comercial || '&nbsp;'}</td>
              <td>${lab.especies.outrosImoveis?.tb || '&nbsp;'}</td>
              <td>${lab.especies.outrosImoveis?.pe || '&nbsp;'}</td>
              <td>${lab.especies.outrosImoveis?.outros || '&nbsp;'}</td>
              <td>${calcTotalEspecies(lab.especies.outrosImoveis) || '&nbsp;'}</td>
              <td>${lab.especies.outrosExemplares?.larvas || '&nbsp;'}</td>
              <td>${lab.especies.outrosExemplares?.adultos || '&nbsp;'}</td>
            </tr>
          </table>
        `;

        const encontrouTabela = tabelaEspeciesRegex.test(htmlWithSignature);
        console.log('🔍 Regex principal encontrou a tabela?', encontrouTabela);

        if (encontrouTabela) {
          // Regex principal encontrou - usa ele
          htmlWithSignature = htmlWithSignature.replace(tabelaEspeciesRegex, tabelaEspeciesHtml);
          console.log('✅ Tabela substituída com regex principal!');
        } else {
          // Regex principal falhou - tenta alternativo mais genérico
          console.log('❌ Regex principal falhou. Tentando alternativo...');

          // Regex alternativo: busca pela estrutura completa da tabela
          const regexAlternativo = /<table class="p2-summary-table"[^>]*>\s*<tr>\s*<th[^>]*>ESPÉCIE<\/th>[\s\S]*?<td[^>]*>Outros<\/td>[\s\S]*?<\/tr>\s*<\/table>/i;

          const encontrouAlternativo = regexAlternativo.test(htmlWithSignature);
          console.log('🔍 Regex alternativo encontrou?', encontrouAlternativo);

          if (encontrouAlternativo) {
            htmlWithSignature = htmlWithSignature.replace(regexAlternativo, tabelaEspeciesHtml);
            console.log('✅ Tabela substituída com regex alternativo!');
          } else {
            console.log('⚠️ NENHUM regex funcionou. Tabela não foi substituída.');
          }
        }
      }

      // Datas
      if (lab.dataEntrega) {
        const [ano, mes, dia] = lab.dataEntrega.split('-');
        const dataFormatada = `${dia}/${mes}/${ano}`;
        htmlWithSignature = htmlWithSignature.replace(/Data da Entrega:<br>\s*<div[^>]*>___ \/ ___ \/ _____<\/div>/i, `Data da Entrega:<br><div style="margin-top: 4px;">${dataFormatada}</div>`);
      }

      if (lab.dataConclusao) {
        const [ano, mes, dia] = lab.dataConclusao.split('-');
        const dataFormatada = `${dia}/${mes}/${ano}`;
        htmlWithSignature = htmlWithSignature.replace(/Data da Conclusão:<br>\s*<div[^>]*>___ \/ ___ \/ _____<\/div>/i, `Data da Conclusão:<br><div style="margin-top: 4px;">${dataFormatada}</div>`);
      }

      // Laboratório e Laboratorista
      if (lab.laboratorio) {
        htmlWithSignature = htmlWithSignature.replace(/Laboratório:<br><br>/i, `Laboratório:<br>${lab.laboratorio}`);
      }

      if (lab.nomeLaboratorista) {
        htmlWithSignature = htmlWithSignature.replace(/Nome do Laboratorista:<br><br>/i, `Nome do Laboratorista:<br>${lab.nomeLaboratorista}`);
      }

      if (lab.assinaturaLaboratorista) {
        console.log('🖊️ TEM ASSINATURA DO LAB');

        const assinaturaLabRegex = /Assinatura:<br><br>/i;

        // Testa se encontrou o texto
        const encontrou = assinaturaLabRegex.test(htmlWithSignature);
        console.log('🔍 Regex encontrou "Assinatura:<br><br>"?', encontrou);

        const assinaturaHtml = `Assinatura:<br><div style="margin-top: 5px;"><img src="${lab.assinaturaLaboratorista}" alt="Assinatura" style="max-height: 25px; max-width: 400px; object-fit: fill;" /></div>`;

        htmlWithSignature = htmlWithSignature.replace(assinaturaLabRegex, assinaturaHtml);

        console.log('✅ Replace executado');
      }


      // Digitação Sequencial - Lab
      if (lab.digitacaoLab) {
        const digitacaoLabRegex = /<div[^>]*>Lab:________________<\/div>/i;
        htmlWithSignature = htmlWithSignature.replace(digitacaoLabRegex, `<div style="margin-bottom: 12px;">Lab: ${lab.digitacaoLab}</div>`);
      }

      // Digitação Sequencial - Campo
      if (lab.digitacaoCampo) {
        const digitacaoCampoRegex = /Campo:_____________/i;
        htmlWithSignature = htmlWithSignature.replace(digitacaoCampoRegex, `Campo: ${lab.digitacaoCampo}`);
      }

      // Checkboxes dos animais
      if (lab.outrosAnimais && lab.outrosAnimais.length > 0) {
        lab.outrosAnimais.forEach(animal => {
          const regex = new RegExp(`☐ ${animal}`, 'g');
          htmlWithSignature = htmlWithSignature.replace(regex, `☑ ${animal}`);
        });
      }

      // Descrição do ambiente
      if (lab.descricaoAmbienteRisco) {
        htmlWithSignature = htmlWithSignature.replace(/<strong>DESCRIÇÃO DO AMBIENTE DE RISCO:<\/strong>/i, `<strong>DESCRIÇÃO DO AMBIENTE DE RISCO:</strong><br><div style="margin-top: 8px; padding: 10px;">${lab.descricaoAmbienteRisco}</div>`);
      }
    }

    return htmlWithSignature;
  };


  const calcularTotal = (obj) => {
    return Object.values(obj).reduce((acc, val) => {
      const num = parseInt(val) || 0;
      return acc + num;
    }, 0);
  };

  // Abrir modal de laboratório
  const openLabModal = (boletim) => {
    setSelectedBoletim(boletim);

    if (boletim.dadosLaboratorio) {
      setLabData(boletim.dadosLaboratorio);
    } else {
      setLabData({
        aegypti: { a1: '', a2: '', b: '', c: '', d1: '', d2: '', e: '' },
        albopictus: { a1: '', a2: '', b: '', c: '', d1: '', d2: '', e: '' },
        culex: { a1: '', a2: '', b: '', c: '', d1: '', d2: '', e: '' },
        outros: { a1: '', a2: '', b: '', c: '', d1: '', d2: '', e: '' },
        imoveis: { residencial: '', comercial: '', tb: '', pe: '', outros: '' },
        // ⬇️ ADICIONE AQUI ⬇️
        especies: {
          aegyptiImoveis: { residencial: '', comercial: '', tb: '', pe: '', outros: '' },
          aegyptiExemplares: { larvas: '', adultos: '' },
          albopictusImoveis: { residencial: '', comercial: '', tb: '', pe: '', outros: '' },
          albopictusExemplares: { larvas: '', adultos: '' },
          culexImoveis: { residencial: '', comercial: '', tb: '', pe: '', outros: '' },
          culexExemplares: { larvas: '', adultos: '' },
          outrosImoveis: { residencial: '', comercial: '', tb: '', pe: '', outros: '' },
          outrosExemplares: { larvas: '', adultos: '' }
        },
        dataEntrega: '',
        dataConclusao: '',
        laboratorio: '',
        nomeLaboratorista: '',
        assinaturaLaboratorista: '',
        outrosAnimais: [],
        descricaoAmbienteRisco: '',
        digitacaoLab: '',
        digitacaoCampo: ''
      });
    }

    setIsLabModalOpen(true);
  };

  // Salvar dados no Firebase
  const saveLabData = async () => {
    if (!selectedBoletim) return;

    console.log('📊 Dados que vão ser salvos:', labData); // ⬅️ ADICIONE ESTA LINHA

    try {
      const boletimRef = doc(db, 'boletinsPdf', selectedBoletim.id);

      await updateDoc(boletimRef, {
        dadosLaboratorio: {
          ...labData,
          preenchidoPor: currentUserInfo?.name || user.email,
          dataPreenchimento: new Date()
        }
      });

      alert('✅ Dados de laboratório salvos com sucesso!');
      setIsLabModalOpen(false);
    } catch (error) {
      console.error('Erro ao salvar dados:', error);
      alert('❌ Erro ao salvar dados: ' + error.message);
    }
  };

  const generatePdfPreview = (boletim) => {
    let finalHtml = getFinalHtmlContent(boletim);
    if (!finalHtml) {
      alert('Conteúdo HTML não disponível para este boletim');
      return;
    }

    const newWindow = window.open('', '_blank');
    newWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Boletim - ${boletim.nomeArquivo}</title>
          <meta charset="utf-8">
        </head>
        <body>
          ${finalHtml}
        </body>
      </html>
    `);
    newWindow.document.close();
  };

  const handleOneClickDownload = async (boletim) => {
    const originalButton = document.querySelector(`tr[data-boletim-id="${boletim.id}"] .btn-download`);
    if (originalButton) {
      originalButton.textContent = 'Gerando...';
      originalButton.disabled = true;
    }
    try {
      // Passo 1: Pega o HTML base, exatamente como antes.
      let htmlForDownload = getFinalHtmlContent(boletim);
      if (!htmlForDownload) {
        alert('Conteúdo HTML não disponível para gerar o PDF.');
        return;
      }

      // Passo 2: MUDANÇA PRINCIPAL - Inserimos a assinatura no HTML ANTES de enviar.
      // Esta lógica foi copiada da função generatePdfPreview.
      if (boletim.assinaturaSupervisor && boletim.assinaturaSupervisor.startsWith('data:image')) {
        const signatureImageTag = `<img src="${boletim.assinaturaSupervisor}" style="max-width: 200px !important; max-height: 25px !important; object-fit: contain !important; display: block;">`;
        htmlForDownload = htmlForDownload.replace(/<!-- SIGNATURE_PLACEHOLDER -->/g, signatureImageTag);
      }
      
      // Passo 3: O payload agora só precisa do HTML final e completo.
      const payload = {
        htmlContent: htmlForDownload,
      };
      
      // O campo 'signatureData' não é mais necessário, pois a imagem já está no HTML.
      // if (boletim.assinaturaSupervisor && boletim.assinaturaSupervisor.startsWith('data:image')) {
      //   payload.signatureData = boletim.assinaturaSupervisor;
      // }

      const functionUrl = 'https://generatepdf-4byeqz3ska-uc.a.run.app';
      
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Erro do servidor: ${response.statusText}`);
      }

      const pdfBlob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(pdfBlob);
      const nomeDoAgente = boletim.agenteNome; // Assumindo que 'boletim' tem a propriedade 'agenteNome'
      const apelidoDoRemetente = nomeParaApelidoMap[nomeDoAgente]; // Busca o apelido usando o nome completo

      let nomeDoArquivoFinal = boletim.nomeArquivo; // Começa com o nome original

      if (apelidoDoRemetente) {
          // Se encontrarmos um apelido, adicionamos ele ao início do nome do arquivo
          nomeDoArquivoFinal = apelidoDoRemetente + '_' + boletim.nomeArquivo;
      }

      link.download = nomeDoArquivoFinal;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Erro ao baixar o PDF:', error);
      alert('Ocorreu um erro ao gerar o PDF. Tente novamente.');
    } finally {
      if (originalButton) {
        originalButton.textContent = '📥 Baixar'; // Emoji removido para simplicidade, pode adicionar de volta
        originalButton.disabled = false;
      }
    }
  };

  const handleOpenTeamModal = () => {
    // Garante que o modal abra com a seleção mais recente salva
    setSelectedAgentsInModal(supervisorTeam);
    setIsTeamModalOpen(true);
  };

  const handleTeamAgentSelection = (agentId) => {
    setSelectedAgentsInModal(prev => {
      if (prev.includes(agentId)) {
        return prev.filter(id => id !== agentId);
      } else {
        return [...prev, agentId];
      }
    });
  };

  const handleSaveTeam = async () => {
    try {
      const userDocRef = doc(db, 'usuarios', user.uid);
      await updateDoc(userDocRef, {
        equipeAgentes: selectedAgentsInModal
      });
      setSupervisorTeam(selectedAgentsInModal); // Atualiza o estado local
      setIsTeamModalOpen(false);
      alert('Equipe salva com sucesso!');
    } catch (error) {
      console.error("Erro ao salvar equipe:", error);
      alert('Ocorreu um erro ao salvar sua equipe.');
    }
  };

  const toggleTeamFilter = () => {
      const newFilterState = !isTeamFilterActive;
      setIsTeamFilterActive(newFilterState);

      // Se ativamos o filtro de equipe, limpamos o filtro de agente individual para evitar conflitos
      if (newFilterState) {
          setFilters(prev => ({ ...prev, agenteId: '' }));
      }
  };


  const handleMergeAndDownload = async () => {
    if (selectedBoletins.length === 0) {
      alert('Por favor, selecione pelo menos um boletim para baixar.');
      return;
    }

    setIsMerging(true); // Ativa o estado de "carregando"

    try {
      // 1. Pega os dados completos dos boletins selecionados
      const boletinsToMerge = boletins.filter(b => selectedBoletins.includes(b.id));

      boletinsToMerge.sort((a, b) => new Date(a.dataCriacao) - new Date(b.dataCriacao));

      // 2. Gera o HTML final para cada boletim (reutilizando sua lógica existente)
      const htmlContents = boletinsToMerge.map(boletim => {
        let finalHtml = getFinalHtmlContent(boletim);
        if (boletim.assinaturaSupervisor && boletim.assinaturaSupervisor.startsWith('data:image')) {
          const signatureImageTag = `<img src="${boletim.assinaturaSupervisor}" style="max-width: 200px !important; max-height: 25px !important; object-fit: contain !important; display: block;">`;
          finalHtml = finalHtml.replace(/<!-- SIGNATURE_PLACEHOLDER -->/g, signatureImageTag);
        }
        return finalHtml;
      }).filter(html => html); // Filtra qualquer resultado nulo

      if (htmlContents.length === 0) {
        throw new Error('Não foi possível gerar o conteúdo HTML para os boletins selecionados.');
      }

      // 3. Envia para a nova Cloud Function 'mergePdfs'
      const functionUrl = 'https://mergepdfs-4byeqz3ska-uc.a.run.app'; 
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ htmlContents }), // O corpo da requisição agora é um array de HTMLs
      });

      if (!response.ok) {
        throw new Error(`Erro do servidor: ${response.statusText}`);
      }

      // 4. Processa o download do arquivo unificado
      const pdfBlob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(pdfBlob);
      link.download = 'boletins_unificados.pdf'; // Nome do arquivo final
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setSelectedBoletins([]); // Limpa a seleção após o download

    } catch (error) {
      console.error('Erro ao juntar e baixar os PDFs:', error);
      alert('Ocorreu um erro ao gerar o PDF unificado. Tente novamente.');
    } finally {
      setIsMerging(false); // Desativa o estado de "carregando"
    }
  };

  const stats = useMemo(() => {
    const total = filteredBoletins.length;
    const pendentes = filteredBoletins.filter(b => b.status === 'pendente').length;
    const aprovados = filteredBoletins.filter(b => b.status === 'aprovado').length;
    const rejeitados = filteredBoletins.filter(b => b.status === 'rejeitado').length;
    return { total, pendentes, aprovados, rejeitados };
  }, [filteredBoletins]);

  return (
    <div className="pdf-manager-container">
      <header className="pdf-manager-header">
        <h1>Gerenciamento de Boletins PDF...</h1>
      </header>
      
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-title">Total:</span>
          <span className="stat-value">{stats.total}</span>
        </div>
        <div className="stat-card pendente">
          <span className="stat-title">Pendentes:</span>
          <span className="stat-value">{stats.pendentes}</span>
        </div>
        <div className="stat-card aprovado">
          <span className="stat-title">Aprovados:</span>
          <span className="stat-value">{stats.aprovados}</span>
        </div>
        <div className="stat-card rejeitado">
          <span className="stat-title">Rejeitados:</span>
          <span className="stat-value">{stats.rejeitados}</span>
        </div>
      </div>

      <div className="filter-bar">
        <h3>Filtrar Boletins</h3>
        <div className="filters">
          <Select
            name="agenteId"
            value={agenteOptions.find(opt => opt.value === filters.agenteId)}
            onChange={(selectedOption) => {
              handleFilterChange({
                target: {
                  name: 'agenteId',
                  value: selectedOption ? selectedOption.value : ''
                }
              });
              setBuscaAgente('');
            }}
            options={agenteOptions} // Agora usa a lista dinâmica do useMemo
            placeholder="Selecione ou busque um agente..."
            isClearable
            isSearchable
            
            // Props novas e modificadas:
            inputValue={buscaAgente} // Controla o texto dentro do campo de busca
            onInputChange={(newValue, actionMeta) => {
              // Atualiza o estado apenas quando o usuário digita
              if (actionMeta.action === 'input-change') {
                setBuscaAgente(newValue);
              }
              // Limpa quando clica no X
              if (actionMeta.action === 'set-value' || actionMeta.action === 'input-blur' || actionMeta.action === 'menu-close') {
                setBuscaAgente(''); // <--- ADICIONE ESTAS LINHAS
              }
            }}
          />

          <select name="status" value={filters.status} onChange={handleFilterChange}>
            <option value="">Todos os Status</option>
            <option value="pendente">Pendente</option>
            <option value="aprovado">Aprovado</option>
            <option value="rejeitado">Rejeitado</option>
          </select>
          <label>Data Início: </label>
          <input
            type="date"
            name="startDate"
            value={filters.startDate}
            onChange={handleFilterChange}
            placeholder="Data inicial"
          />
          <label>Data Fim: </label>
          <input
            type="date"
            name="endDate"
            value={filters.endDate}
            onChange={handleFilterChange}
            placeholder="Data final"
          />
          {currentUserRole === 'chefe' && (
            <div className="team-filter-actions">
              <button onClick={handleOpenTeamModal} className="btn btn-secondary">
                Gerenciar Equipe
              </button>
              <button
                  onClick={toggleTeamFilter}
                  className={`btn ${isTeamFilterActive ? 'btn-primary' : 'btn-secondary'}`}
                  disabled={supervisorTeam.length === 0}
                  title={supervisorTeam.length === 0 ? "Você precisa montar sua equipe primeiro" : ""}
                >
                  {isTeamFilterActive ? 'Visualizando Equipe' : 'Filtrar Equipe'}
                </button>
            </div>
          )}
        </div>
      </div>

      <div className="bulk-actions-bar">
        <button
          onClick={handleMergeAndDownload}
          disabled={selectedBoletins.length === 0 || isMerging}
          className="juntar-e-baixar"
        >
          {isMerging ? 'Gerando PDF Unificado...' : `📥 Baixar ${selectedBoletins.length} Selecionados`}
        </button>
      </div>

      <div className="data-table-container">
        {loading ? (
          <p>Carregando boletins...</p>
        ) : (
          <>
            <table className="boletins-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      onChange={handleSelectAll}
                      // Marca este checkbox se todos os itens da página atual estiverem selecionados
                      checked={paginatedBoletins.length > 0 && paginatedBoletins.every(b => selectedBoletins.includes(b.id))}
                    />
                  </th>
                  <th>Data Criação</th>
                  <th>Nome do Arquivo</th>
                  <th>Agente</th>
                  <th>Localidade</th>
                  <th>Total Visitas</th>
                  <th>Status</th>
                  <th>Visto por</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {paginatedBoletins.length > 0 ? (
                  paginatedBoletins.map(boletim => (
                    <tr key={boletim.id} data-boletim-id={boletim.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedBoletins.includes(boletim.id)}
                          onChange={() => handleSelectBoletim(boletim.id)}
                        />
                      </td>
                      <td>{boletim.dataCriacao?.toLocaleDateString('pt-BR') || 'N/A'}</td>
                      <td>{boletim.nomeArquivo}</td>
                      <td>{boletim.agenteNome}</td>
                      <td>{boletim.dadosCabecalho?.localidade || '-'}</td>
                      <td>{boletim.resumo?.totalVisitas || 0}</td>
                      <td>
                        <StatusBadge status={boletim.status} />
                        {boletim.assinaturaSupervisor && (
                          <span className="signature-indicator" title="Assinado digitalmente">
                            ✍️
                          </span>
                        )}
                      </td>
                      <td>{nomeParaApelidoMap[boletim.vistoSupervisor] || boletim.vistoSupervisor || '-'}</td>
                      <td>
                        <div className="action-buttons">
                          <button
                            onClick={() => generatePdfPreview(boletim)}
                            className="btn btn-preview"
                          >
                            👁️ Ver
                          </button>

                          {currentUserRole === 'chefe' && (
                            <button
                              onClick={() => openModal(boletim)}
                              className="btn btn-review"
                            >
                              ✍️ Assinar
                            </button>
                          )}

                          {currentUserRole === 'chefe' && (
                            <button
                              onClick={() => openLabModal(boletim)}
                              className="btn btn-lab"
                            >
                              🔬 Laboratório
                            </button>
                          )}
                          
                          <button
                            onClick={() => handleOneClickDownload(boletim)}
                            className="btn btn-download"
                          >
                            📥 Baixar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="9">Nenhum boletim encontrado para os filtros aplicados.</td>
                  </tr>
                )}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="pagination-controls">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                >
                  Anterior
                </button>
                <span>Página {currentPage} de {totalPages}</span>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                >
                  Próxima
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {isModalOpen && selectedBoletim && (
        <div className="modal-overlay">
          <div className="modal-content large">
            <h2>Revisar Boletim: {selectedBoletim.nomeArquivo}</h2>

            {/* ===== NOVO CONTAINER PARA O CABEÇALHO ===== */}
            <div className="modal-header-actions">
              
              {/* --- Lado Esquerdo: Detalhes --- */}
              <div className="boletim-header-details">
                <div className="detail-row">
                  <strong>Agente:</strong> {selectedBoletim.agenteNome}
                </div>
                <div className="detail-row">
                  <strong>Data de Criação:</strong> {selectedBoletim.dataCriacao?.toLocaleString('pt-BR') || 'N/A'}
                </div>
              </div>

              {/* --- Lado Direito: Botões de Ação (MOVIDOS DE LUGAR) --- */}
              <div className="modal-top-actions">
                <div className="visto-method-section" style={{ marginBottom: '20px' }}>
                  <label htmlFor="vistoMethod">Método de Visto:</label>
                  <select
                    id="vistoMethod"
                    value={vistoMethod}
                    onChange={(e) => setVistoMethod(e.target.value)}
                  >
                    <option value="digital">Assinatura Digital</option>
                    <option value="texto">Nome como Texto (Letra de Máquina)</option>
                  </select>
                </div>

                {vistoMethod === 'texto' && (
                  <div className="text-signature-section" style={{ marginBottom: '30px' }}>
                    <label htmlFor="textSignature">Digite o Nome para Visto:</label>
                    <input
                      id="textSignature"
                      type="text"
                      value={textSignature}
                      onChange={(e) => setTextSignature(e.target.value)}
                      placeholder="Ex: Nome do Supervisor"
                    />
                    <button onClick={fillMyName} className="btn btn-secondary">
                      Usar Meu Nome (do Firebase)
                    </button>
                  </div>
                )}

              <div className="modal-button-group">
                <button
                  onClick={() => vistoMethod === 'digital' ? openSignatureModal('aprovado') : confirmTextSignature('aprovado')}
                  className="btn btn-approve"
                  style={{ marginRight: '30px' }}
                >
                  ✅ Aprovar
                </button>
                <button
                  onClick={() => vistoMethod === 'digital' ? openSignatureModal('rejeitado') : confirmTextSignature('rejeitado')}
                  className="btn btn-reject"
                  style={{ marginRight: '30px' }}
                >
                  ❌ Rejeitar
                </button>
                <button onClick={closeModal} className="btn btn-cancel">
                  Cancelar
                </button>
              </div>
              </div>
            </div>
            {/* ===== FIM DO NOVO CONTAINER ===== */}

            <div className="boletim-details">
              {/* O restante do conteúdo do modal continua aqui */}
              {selectedBoletim.assinaturaSupervisor && (
                <div className="detail-row">
                  <strong>Visto Atual:</strong>
                  <div className="existing-signature">
                    {selectedBoletim.assinaturaSupervisor.startsWith('data:image') ? (
                      <img
                        src={selectedBoletim.assinaturaSupervisor}
                        alt="Assinatura do Supervisor"
                        className="signature-preview"
                      />
                    ) : (
                      <p style={{ fontWeight: 'bold', fontSize: '14px' }}>{selectedBoletim.assinaturaSupervisor}</p>
                    )}
                    <p><small>Assinado por: {selectedBoletim.vistoSupervisor}</small></p>
                    <p><small>Em: {selectedBoletim.dataVisto?.toLocaleString('pt-BR')}</small></p>
                  </div>
                </div>
              )}
            </div>

            {/* O antigo div .modal-actions foi removido daqui */}
          </div>
        </div>
      )}

      {isLabModalOpen && selectedBoletim && (
        <div className="modal-overlay">
          <div className="modal-content large lab-modal">
            <h2>📊 Dados de Laboratório - {selectedBoletim.nomeArquivo}</h2>

            <div className="lab-content">
              <div className="lab-section">
                <h3 style={{ textAlign: 'left' }}>Uso da Digitação Sequencial</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <label style={{ minWidth: '60px' }}>Lab:</label>
                    <input
                      type="text"
                      value={labData.digitacaoLab}
                      onChange={(e) => setLabData(prev => ({ ...prev, digitacaoLab: e.target.value }))}
                      placeholder="Ex: 001"
                      maxLength="10"
                      style={{ width: '150px' }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <label style={{ minWidth: '60px' }}>Campo:</label>
                    <input
                      type="text"
                      value={labData.digitacaoCampo}
                      onChange={(e) => setLabData(prev => ({ ...prev, digitacaoCampo: e.target.value }))}
                      placeholder="Ex: 002"
                      maxLength="10"
                      style={{ width: '150px' }}
                    />
                  </div>
                </div>
              </div>



              {/* Seção: Aedes aegypti */}
              <div className="lab-section">
                <h3>Número de depósitos com <i>Aedes aegypti</i> por tipo</h3>
                <div className="lab-inputs-row">
                  {['a1', 'a2', 'b', 'c', 'd1', 'd2', 'e'].map(key => (
                    <div key={key} className="lab-input-group">
                      <label>{key.toUpperCase()}</label>
                      <input
                        type="number"
                        min="0"
                        value={labData.aegypti[key]}
                        onChange={(e) => setLabData(prev => ({
                          ...prev,
                          aegypti: { ...prev.aegypti, [key]: e.target.value }
                        }))}
                      />
                    </div>
                  ))}
                  <div className="lab-input-group total">
                    <label>TOTAL</label>
                    <input 
                      type="number" 
                      value={calcularTotal(labData.aegypti)} 
                      disabled 
                    />
                  </div>
                </div>
              </div>

              {/* Seção: Aedes albopictus */}
              <div className="lab-section">
                <h3>Número de depósitos com <i>Aedes albopictus</i> por tipo</h3>
                <div className="lab-inputs-row">
                  {['a1', 'a2', 'b', 'c', 'd1', 'd2', 'e'].map(key => (
                    <div key={key} className="lab-input-group">
                      <label>{key.toUpperCase()}</label>
                      <input
                        type="number"
                        min="0"
                        value={labData.albopictus[key]}
                        onChange={(e) => setLabData(prev => ({
                          ...prev,
                          albopictus: { ...prev.albopictus, [key]: e.target.value }
                        }))}
                      />
                    </div>
                  ))}
                  <div className="lab-input-group total">
                    <label>TOTAL</label>
                    <input 
                      type="number" 
                      value={calcularTotal(labData.albopictus)} 
                      disabled 
                    />
                  </div>
                </div>
              </div>

              {/* Seção: Culex quinquefasciatus */}
              <div className="lab-section">
                <h3>Número de depósitos com <i>Culex quinquefasciatus</i> por tipo</h3>
                <div className="lab-inputs-row">
                  {['a1', 'a2', 'b', 'c', 'd1', 'd2', 'e'].map(key => (
                    <div key={key} className="lab-input-group">
                      <label>{key.toUpperCase()}</label>
                      <input
                        type="number"
                        min="0"
                        value={labData.culex[key]}
                        onChange={(e) => setLabData(prev => ({
                          ...prev,
                          culex: { ...prev.culex, [key]: e.target.value }
                        }))}
                      />
                    </div>
                  ))}
                  <div className="lab-input-group total">
                    <label>TOTAL</label>
                    <input 
                      type="number" 
                      value={calcularTotal(labData.culex)} 
                      disabled 
                    />
                  </div>
                </div>
              </div>

              {/* Seção: Outros culicídeos */}
              <div className="lab-section">
                <h3>Número de depósitos com <b>Outros culicídeos</b> por tipo</h3>
                <div className="lab-inputs-row">
                  {['a1', 'a2', 'b', 'c', 'd1', 'd2', 'e'].map(key => (
                    <div key={key} className="lab-input-group">
                      <label>{key.toUpperCase()}</label>
                      <input
                        type="number"
                        min="0"
                        value={labData.outros[key]}
                        onChange={(e) => setLabData(prev => ({
                          ...prev,
                          outros: { ...prev.outros, [key]: e.target.value }
                        }))}
                      />
                    </div>
                  ))}
                  <div className="lab-input-group total">
                    <label>TOTAL</label>
                    <input 
                      type="number" 
                      value={calcularTotal(labData.outros)} 
                      disabled 
                    />
                  </div>
                </div>
              </div>

              {/* Seção: TIPOS DE IMÓVEIS COM ESPÉCIMES */}
              <div className="lab-section">
                <h3>Tipos de Imóveis com Espécimes</h3>

                {/* Aedes aegypti */}
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ fontSize: '14px', marginBottom: '10px' }}><i>Aedes aegypti</i></h4>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                    <div className="lab-input-group">
                      <label>RESIDENCIAL</label>
                      <input
                        type="number"
                        min="0"
                        value={labData.especies.aegyptiImoveis.residencial}
                        onChange={(e) => setLabData(prev => ({
                          ...prev,
                          especies: {
                            ...prev.especies,
                            aegyptiImoveis: { ...prev.especies.aegyptiImoveis, residencial: e.target.value }
                          }
                        }))}
                      />
                    </div>
                    <div className="lab-input-group">
                      <label>COMERCIAL</label>
                      <input
                        type="number"
                        min="0"
                        value={labData.especies.aegyptiImoveis.comercial}
                        onChange={(e) => setLabData(prev => ({
                          ...prev,
                          especies: {
                            ...prev.especies,
                            aegyptiImoveis: { ...prev.especies.aegyptiImoveis, comercial: e.target.value }
                          }
                        }))}
                      />
                    </div>
                    <div className="lab-input-group">
                      <label>TB</label>
                      <input
                        type="number"
                        min="0"
                        value={labData.especies.aegyptiImoveis.tb}
                        onChange={(e) => setLabData(prev => ({
                          ...prev,
                          especies: {
                            ...prev.especies,
                            aegyptiImoveis: { ...prev.especies.aegyptiImoveis, tb: e.target.value }
                          }
                        }))}
                      />
                    </div>
                    <div className="lab-input-group">
                      <label>PE</label>
                      <input
                        type="number"
                        min="0"
                        value={labData.especies.aegyptiImoveis.pe}
                        onChange={(e) => setLabData(prev => ({
                          ...prev,
                          especies: {
                            ...prev.especies,
                            aegyptiImoveis: { ...prev.especies.aegyptiImoveis, pe: e.target.value }
                          }
                        }))}
                      />
                    </div>
                    <div className="lab-input-group">
                      <label>OUTROS</label>
                      <input
                        type="number"
                        min="0"
                        value={labData.especies.aegyptiImoveis.outros}
                        onChange={(e) => setLabData(prev => ({
                          ...prev,
                          especies: {
                            ...prev.especies,
                            aegyptiImoveis: { ...prev.especies.aegyptiImoveis, outros: e.target.value }
                          }
                        }))}
                      />
                    </div>
                    <div className="lab-input-group total">
                      <label>TOTAL</label>
                      <input
                        type="number"
                        value={calcularTotal(labData.especies.aegyptiImoveis)}
                        disabled
                      />
                    </div>
                    <div className="lab-input-group">
                      <label>LARVAS</label>
                      <input
                        type="number"
                        min="0"
                        value={labData.especies.aegyptiExemplares.larvas}
                        onChange={(e) => setLabData(prev => ({
                          ...prev,
                          especies: {
                            ...prev.especies,
                            aegyptiExemplares: { ...prev.especies.aegyptiExemplares, larvas: e.target.value }
                          }
                        }))}
                      />
                    </div>
                    <div className="lab-input-group">
                      <label>ADULTOS</label>
                      <input
                        type="number"
                        min="0"
                        value={labData.especies.aegyptiExemplares.adultos}
                        onChange={(e) => setLabData(prev => ({
                          ...prev,
                          especies: {
                            ...prev.especies,
                            aegyptiExemplares: { ...prev.especies.aegyptiExemplares, adultos: e.target.value }
                          }
                        }))}
                      />
                    </div>
                  </div>
                </div>

                {/* Aedes albopictus */}
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ fontSize: '14px', marginBottom: '10px' }}><i>Aedes albopictus</i></h4>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                    <div className="lab-input-group">
                      <label>RESIDENCIAL</label>
                      <input
                        type="number"
                        min="0"
                        value={labData.especies.albopictusImoveis.residencial}
                        onChange={(e) => setLabData(prev => ({
                          ...prev,
                          especies: {
                            ...prev.especies,
                            albopictusImoveis: { ...prev.especies.albopictusImoveis, residencial: e.target.value }
                          }
                        }))}
                      />
                    </div>
                    <div className="lab-input-group">
                      <label>COMERCIAL</label>
                      <input
                        type="number"
                        min="0"
                        value={labData.especies.albopictusImoveis.comercial}
                        onChange={(e) => setLabData(prev => ({
                          ...prev,
                          especies: {
                            ...prev.especies,
                            albopictusImoveis: { ...prev.especies.albopictusImoveis, comercial: e.target.value }
                          }
                        }))}
                      />
                    </div>
                    <div className="lab-input-group">
                      <label>TB</label>
                      <input
                        type="number"
                        min="0"
                        value={labData.especies.albopictusImoveis.tb}
                        onChange={(e) => setLabData(prev => ({
                          ...prev,
                          especies: {
                            ...prev.especies,
                            albopictusImoveis: { ...prev.especies.albopictusImoveis, tb: e.target.value }
                          }
                        }))}
                      />
                    </div>
                    <div className="lab-input-group">
                      <label>PE</label>
                      <input
                        type="number"
                        min="0"
                        value={labData.especies.albopictusImoveis.pe}
                        onChange={(e) => setLabData(prev => ({
                          ...prev,
                          especies: {
                            ...prev.especies,
                            albopictusImoveis: { ...prev.especies.albopictusImoveis, pe: e.target.value }
                          }
                        }))}
                      />
                    </div>
                    <div className="lab-input-group">
                      <label>OUTROS</label>
                      <input
                        type="number"
                        min="0"
                        value={labData.especies.albopictusImoveis.outros}
                        onChange={(e) => setLabData(prev => ({
                          ...prev,
                          especies: {
                            ...prev.especies,
                            albopictusImoveis: { ...prev.especies.albopictusImoveis, outros: e.target.value }
                          }
                        }))}
                      />
                    </div>
                    <div className="lab-input-group total">
                      <label>TOTAL</label>
                      <input
                        type="number"
                        value={calcularTotal(labData.especies.albopictusImoveis)}
                        disabled
                      />
                    </div>
                    <div className="lab-input-group">
                      <label>LARVAS</label>
                      <input
                        type="number"
                        min="0"
                        value={labData.especies.albopictusExemplares.larvas}
                        onChange={(e) => setLabData(prev => ({
                          ...prev,
                          especies: {
                            ...prev.especies,
                            albopictusExemplares: { ...prev.especies.albopictusExemplares, larvas: e.target.value }
                          }
                        }))}
                      />
                    </div>
                    <div className="lab-input-group">
                      <label>ADULTOS</label>
                      <input
                        type="number"
                        min="0"
                        value={labData.especies.albopictusExemplares.adultos}
                        onChange={(e) => setLabData(prev => ({
                          ...prev,
                          especies: {
                            ...prev.especies,
                            albopictusExemplares: { ...prev.especies.albopictusExemplares, adultos: e.target.value }
                          }
                        }))}
                      />
                    </div>
                  </div>
                </div>

                {/* Culex quinquefasciatus */}
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ fontSize: '14px', marginBottom: '10px' }}><i>Culex quinquefasciatus</i></h4>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                    <div className="lab-input-group">
                      <label>RESIDENCIAL</label>
                      <input
                        type="number"
                        min="0"
                        value={labData.especies.culexImoveis.residencial}
                        onChange={(e) => setLabData(prev => ({
                          ...prev,
                          especies: {
                            ...prev.especies,
                            culexImoveis: { ...prev.especies.culexImoveis, residencial: e.target.value }
                          }
                        }))}
                      />
                    </div>
                    <div className="lab-input-group">
                      <label>COMERCIAL</label>
                      <input
                        type="number"
                        min="0"
                        value={labData.especies.culexImoveis.comercial}
                        onChange={(e) => setLabData(prev => ({
                          ...prev,
                          especies: {
                            ...prev.especies,
                            culexImoveis: { ...prev.especies.culexImoveis, comercial: e.target.value }
                          }
                        }))}
                      />
                    </div>
                    <div className="lab-input-group">
                      <label>TB</label>
                      <input
                        type="number"
                        min="0"
                        value={labData.especies.culexImoveis.tb}
                        onChange={(e) => setLabData(prev => ({
                          ...prev,
                          especies: {
                            ...prev.especies,
                            culexImoveis: { ...prev.especies.culexImoveis, tb: e.target.value }
                          }
                        }))}
                      />
                    </div>
                    <div className="lab-input-group">
                      <label>PE</label>
                      <input
                        type="number"
                        min="0"
                        value={labData.especies.culexImoveis.pe}
                        onChange={(e) => setLabData(prev => ({
                          ...prev,
                          especies: {
                            ...prev.especies,
                            culexImoveis: { ...prev.especies.culexImoveis, pe: e.target.value }
                          }
                        }))}
                      />
                    </div>
                    <div className="lab-input-group">
                      <label>OUTROS</label>
                      <input
                        type="number"
                        min="0"
                        value={labData.especies.culexImoveis.outros}
                        onChange={(e) => setLabData(prev => ({
                          ...prev,
                          especies: {
                            ...prev.especies,
                            culexImoveis: { ...prev.especies.culexImoveis, outros: e.target.value }
                          }
                        }))}
                      />
                    </div>
                    <div className="lab-input-group total">
                      <label>TOTAL</label>
                      <input
                        type="number"
                        value={calcularTotal(labData.especies.culexImoveis)}
                        disabled
                      />
                    </div>
                    <div className="lab-input-group">
                      <label>LARVAS</label>
                      <input
                        type="number"
                        min="0"
                        value={labData.especies.culexExemplares.larvas}
                        onChange={(e) => setLabData(prev => ({
                          ...prev,
                          especies: {
                            ...prev.especies,
                            culexExemplares: { ...prev.especies.culexExemplares, larvas: e.target.value }
                          }
                        }))}
                      />
                    </div>
                    <div className="lab-input-group">
                      <label>ADULTOS</label>
                      <input
                        type="number"
                        min="0"
                        value={labData.especies.culexExemplares.adultos}
                        onChange={(e) => setLabData(prev => ({
                          ...prev,
                          especies: {
                            ...prev.especies,
                            culexExemplares: { ...prev.especies.culexExemplares, adultos: e.target.value }
                          }
                        }))}
                      />
                    </div>
                  </div>
                </div>

                {/* Outros */}
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ fontSize: '14px', marginBottom: '10px' }}>Outros</h4>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                    <div className="lab-input-group">
                      <label>RESIDENCIAL</label>
                      <input
                        type="number"
                        min="0"
                        value={labData.especies.outrosImoveis.residencial}
                        onChange={(e) => setLabData(prev => ({
                          ...prev,
                          especies: {
                            ...prev.especies,
                            outrosImoveis: { ...prev.especies.outrosImoveis, residencial: e.target.value }
                          }
                        }))}
                      />
                    </div>
                    <div className="lab-input-group">
                      <label>COMERCIAL</label>
                      <input
                        type="number"
                        min="0"
                        value={labData.especies.outrosImoveis.comercial}
                        onChange={(e) => setLabData(prev => ({
                          ...prev,
                          especies: {
                            ...prev.especies,
                            outrosImoveis: { ...prev.especies.outrosImoveis, comercial: e.target.value }
                          }
                        }))}
                      />
                    </div>
                    <div className="lab-input-group">
                      <label>TB</label>
                      <input
                        type="number"
                        min="0"
                        value={labData.especies.outrosImoveis.tb}
                        onChange={(e) => setLabData(prev => ({
                          ...prev,
                          especies: {
                            ...prev.especies,
                            outrosImoveis: { ...prev.especies.outrosImoveis, tb: e.target.value }
                          }
                        }))}
                      />
                    </div>
                    <div className="lab-input-group">
                      <label>PE</label>
                      <input
                        type="number"
                        min="0"
                        value={labData.especies.outrosImoveis.pe}
                        onChange={(e) => setLabData(prev => ({
                          ...prev,
                          especies: {
                            ...prev.especies,
                            outrosImoveis: { ...prev.especies.outrosImoveis, pe: e.target.value }
                          }
                        }))}
                      />
                    </div>
                    <div className="lab-input-group">
                      <label>OUTROS</label>
                      <input
                        type="number"
                        min="0"
                        value={labData.especies.outrosImoveis.outros}
                        onChange={(e) => setLabData(prev => ({
                          ...prev,
                          especies: {
                            ...prev.especies,
                            outrosImoveis: { ...prev.especies.outrosImoveis, outros: e.target.value }
                          }
                        }))}
                      />
                    </div>
                    <div className="lab-input-group total">
                      <label>TOTAL</label>
                      <input
                        type="number"
                        value={calcularTotal(labData.especies.outrosImoveis)}
                        disabled
                      />
                    </div>
                    <div className="lab-input-group">
                      <label>LARVAS</label>
                      <input
                        type="number"
                        min="0"
                        value={labData.especies.outrosExemplares.larvas}
                        onChange={(e) => setLabData(prev => ({
                          ...prev,
                          especies: {
                            ...prev.especies,
                            outrosExemplares: { ...prev.especies.outrosExemplares, larvas: e.target.value }
                          }
                        }))}
                      />
                    </div>
                    <div className="lab-input-group">
                      <label>ADULTOS</label>
                      <input
                        type="number"
                        min="0"
                        value={labData.especies.outrosExemplares.adultos}
                        onChange={(e) => setLabData(prev => ({
                          ...prev,
                          especies: {
                            ...prev.especies,
                            outrosExemplares: { ...prev.especies.outrosExemplares, adultos: e.target.value }
                          }
                        }))}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Datas e Informações */}
              <div className="lab-section">
                <h3>Informações Gerais</h3>
                <div className="lab-inputs-grid">
                  <div>
                    <label>Data da Entrega</label>
                    <input
                      type="date"
                      value={labData.dataEntrega}
                      onChange={(e) => setLabData(prev => ({ ...prev, dataEntrega: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label>Data da Conclusão</label>
                    <input
                      type="date"
                      value={labData.dataConclusao}
                      onChange={(e) => setLabData(prev => ({ ...prev, dataConclusao: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label>Laboratório</label>
                    <input
                      type="text"
                      value={labData.laboratorio}
                      onChange={(e) => setLabData(prev => ({ ...prev, laboratorio: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label>Nome do Laboratorista</label>
                    <input
                      type="text"
                      value={labData.nomeLaboratorista}
                      onChange={(e) => setLabData(prev => ({ ...prev, nomeLaboratorista: e.target.value }))}
                    />
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label>Assinatura do Laboratorista</label>
                    {labData.assinaturaLaboratorista ? (
                      <div style={{ marginTop: '10px', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}>
                        <img 
                          src={labData.assinaturaLaboratorista} 
                          alt="Assinatura" 
                          style={{ 
                            maxHeight: '25px',      // ⬅️ Altura menor (era 80px)
                            maxWidth: '1100px',      // ⬅️ Largura maior (não tinha)
                            display: 'block' 
                          }}
                        />
                        <button 
                          onClick={() => {
                            if (window.confirm('Remover assinatura?')) {
                              setLabData(prev => ({ ...prev, assinaturaLaboratorista: '' }));
                            }
                          }}
                          className="btn btn-secondary"
                          style={{ marginTop: '10px' }}
                        >
                          🗑️ Remover
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => setIsLabSignatureModalOpen(true)}
                        className="btn btn-primary"
                        style={{ marginTop: '10px' }}
                      >
                        ✍️ Adicionar Assinatura
                      </button>
                    )}
                  </div>

                </div>
              </div>

              {/* Outros Animais */}
              <div className="lab-section">
                <h3>Outros Animais</h3>
                <div className="lab-checkboxes">
                  {['ARANHA', 'CARAMUJO', 'LACRAIA', 'PERCEVEJO', 'PULGA', 'BARBEIRO', 
                    'CARRAPATO', 'MORCEGO', 'PIOLHO DE POMBO', 'BICHO DE PÉ', 
                    'ESCORPIÃO', 'MOSQUITO', 'POMBO'].map(animal => (
                    <label key={animal} className="lab-checkbox-label">
                      <input
                        type="checkbox"
                        checked={labData.outrosAnimais.includes(animal)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setLabData(prev => ({
                              ...prev,
                              outrosAnimais: [...prev.outrosAnimais, animal]
                            }));
                          } else {
                            setLabData(prev => ({
                              ...prev,
                              outrosAnimais: prev.outrosAnimais.filter(a => a !== animal)
                            }));
                          }
                        }}
                      />
                      {animal}
                    </label>
                  ))}
                </div>
              </div>

              {/* Descrição do Ambiente */}
              <div className="lab-section">
                <h3>Descrição do Ambiente de Risco</h3>
                <textarea
                  rows="4"
                  value={labData.descricaoAmbienteRisco}
                  onChange={(e) => setLabData(prev => ({ ...prev, descricaoAmbienteRisco: e.target.value }))}
                  placeholder="Descreva o ambiente de risco..."
                />
              </div>

              {/* Botões de Ação */}
              <div className="modal-actions">
                <button onClick={saveLabData} className="btn btn-approve">
                  💾 Salvar Dados
                </button>
                <button onClick={() => setIsLabModalOpen(false)} className="btn btn-cancel">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isLabSignatureModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>✍️ Assinatura - Laboratorista</h2>

            <div className="signature-container">
              <SignatureCanvas
                ref={labSigCanvas}
                canvasProps={{
                  className: 'signature-canvas',
                  width: 1100,
                  height: 200
                }}
              />
            </div>

            <div className="modal-actions" style={{ marginTop: '20px' }}>
              <button onClick={clearLabSignature} className="btn btn-secondary">
                🗑️ Limpar
              </button>
              <button onClick={confirmLabSignature} className="btn btn-approve">
                ✅ Confirmar
              </button>
              <button 
                onClick={() => setIsLabSignatureModalOpen(false)} 
                className="btn btn-cancel"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {isSignatureModalOpen && (
        <>
          {/* AVISO: Overlay de orientação, FICA AQUI! */}
          {!isLandscape && (
            <div className="orientation-overlay">
              <div className="orientation-message">
                <p><b>Gire o celular para <span style={{ color: "#007bff" }}>horizontal</span> para assinar corretamente.</b></p>
                <p>
                  <span style={{ fontSize: 40, display: 'inline-block', transform: 'rotate(-90deg)' }}>⇆</span>
                </p>
                <p style={{ color: '#888', fontSize: 13 }}>A assinatura só funciona perfeitamente na orientação horizontal.</p>
              </div>
            </div>
          )}

          {/* MODAL DE ASSINATURA NORMAL */}
          <div className="modal-overlay">
            <div className="modal-content signature-modal">
              <h2>
                {signatureAction === 'aprovado' ? '✅ Aprovar' : '❌ Rejeitar'} Boletim
              </h2>
              <p>Por favor, faça sua assinatura digital abaixo:</p>
              <div className="signature-container">
                <SignatureCanvas
                  ref={sigCanvas}
                  canvasProps={{
                    width: 1100,
                    height: 200,
                    className: 'signature-canvas'
                  }}
                  minWidth={2}
                  maxWidth={5}
                  dotSize={2}
                  penColor="black"
                />
              </div>
              <div className="signature-instructions">
                <p>🖥️ Use o mouse ou touch para assinar</p>
                <p>👤 Supervisor: <strong>{userMap[user.uid] || user.email}</strong></p>
              </div>
              {savedSignature && (
                <button
                  onClick={loadSavedSignature}
                  className="btn btn-secondary"
                  style={{ marginBottom: '10px' }}
                >
                  💾 Usar Última Assinatura Salva
                </button>
              )}
              <div className="modal-actions">
                <button
                  onClick={confirmSignature}
                  className={`btn ${signatureAction === 'aprovado' ? 'btn-approve' : 'btn-reject'}`}
                >
                  ✍️ Confirmar Assinatura
                </button>
                <button
                  onClick={clearSignature}
                  className="btn btn-secondary"
                >
                  🗑️ Limpar
                </button>
                <button
                  onClick={closeSignatureModal}
                  className="btn btn-cancel"
                >
                  Cancelar
                </button>
              </div>
              <div className="save-signature-checkbox" style={{ marginTop: '10px' }}>
                <input
                  type="checkbox"
                  id="saveToProfile"
                  checked={saveToProfile}
                  onChange={(e) => setSaveToProfile(e.target.checked)}
                />
                <label htmlFor="saveToProfile">Salvar esta assinatura no meu perfil para uso futuro</label>
              </div>
            </div>
          </div>
        </>
      )}
      {isTeamModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content large">
            <h2>Gerenciar Minha Equipe de Agentes</h2>
            <p>Selecione os agentes à esquerda. Os selecionados aparecerão à direita.</p>
            
            <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
              
              {/* COLUNA ESQUERDA - Lista para selecionar */}
              <div style={{ flex: 1 }}>
                <h3>Selecionar Agentes</h3>
                <input
                  type="text"
                  placeholder="Buscar agente..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ 
                    width: '100%', 
                    padding: '8px', 
                    marginBottom: '10px', 
                    boxSizing: 'border-box' 
                  }}
                />
                <div style={{ 
                  maxHeight: '400px', 
                  overflowY: 'auto', 
                  border: '1px solid #ccc', 
                  padding: '10px', 
                  borderRadius: '5px',
                  backgroundColor: '#f9f9f9'
                }}>
                  {/* Simplesmente faz o .map() na nossa nova variável pronta */}
                  {agentesParaModal.map(agente => (
                    <div 
                      key={agente.id} 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        padding: '8px',
                        marginBottom: '5px',
                        backgroundColor: selectedAgentsInModal.includes(agente.id) ? '#e3f2fd' : 'white',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        border: '1px solid #e0e0e0'
                      }}
                    >
                      <input
                        type="checkbox"
                        id={`agent-${agente.id}`}
                        checked={selectedAgentsInModal.includes(agente.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleTeamAgentSelection(agente.id);
                        }}
                        style={{ marginRight: '10px', cursor: 'pointer' }}
                      />
                      <label 
                        htmlFor={`agent-${agente.id}`} 
                        style={{ 
                          cursor: 'pointer', 
                          margin: 0,
                          textAlign: 'left',
                          width: '100%'
                        }}
                        onClick={() => handleTeamAgentSelection(agente.id)}
                      >
                        {agente.nome}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {/* COLUNA DIREITA - Agentes selecionados */}
              <div style={{ flex: 1 }}>
                <h3>Agentes Selecionados ({selectedAgentsInModal.length})</h3>
                <div style={{ 
                  maxHeight: '464px', 
                  overflowY: 'auto', 
                  border: '1px solid #ccc', 
                  padding: '10px', 
                  borderRadius: '5px',
                  backgroundColor: '#f0f8ff',
                  marginTop: '47px' // Para alinhar com a lista da esquerda
                }}>
                  {selectedAgentsInModal.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#999', marginTop: '20px' }}>
                      Nenhum agente selecionado
                    </p>
                  ) : (
                    selectedAgentsInModal
                      .map(agentId => agentes.find(a => a.id === agentId))
                      .filter(agente => agente) // Remove possíveis undefined
                      .sort((a, b) => a.nome.localeCompare(b.nome))
                      .map(agente => (
                        <div 
                          key={agente.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '10px',
                            marginBottom: '5px',
                            backgroundColor: 'white',
                            borderRadius: '4px',
                            border: '1px solid #e0e0e0'
                          }}
                        >
                          <span style={{ textAlign: 'left', flex: 1 }}>
                            {agente.nome}
                          </span>
                          <button
                            onClick={() => handleTeamAgentSelection(agente.id)}
                            style={{
                              backgroundColor: '#f44336',
                              color: 'white',
                              border: 'none',
                              padding: '5px 10px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '14px',
                              fontWeight: 'bold'
                            }}
                            title="Remover da equipe"
                          >
                            ✕
                          </button>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: '20px' }}>
              <button onClick={handleSaveTeam} className="btn btn-primary">
                Salvar Equipe
              </button>
              <button 
                onClick={() => { 
                  setIsTeamModalOpen(false); 
                  setSearchTerm(''); 
                }} 
                className="btn btn-cancel"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PdfManager;
