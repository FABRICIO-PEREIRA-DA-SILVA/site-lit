import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, orderBy, getDocs } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from '../utils/firebaseConfig';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './Dashboard.css';
import PdfManager from './PdfManager';
// ponto de partida

// Componente StatCard
const StatCard = ({ title, value, icon }) => (
  <div className="stat-card">
    <div className="stat-icon">{icon}</div>
    <div className="stat-info">
      <span className="stat-title">{title}</span>
      <span className="stat-value">{value}</span>
    </div>
  </div>
);

// Define a quantidade de itens por página
const ITEMS_PER_PAGE = 25;

function Dashboard({ user }) {
  const [visitas, setVisitas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [agentes, setAgentes] = useState([]);
  const [currentView, setCurrentView] = useState('visitas');
  const [filters, setFilters] = useState({
    status: '',
    agenteId: '',
    startDate: '',
    endDate: '',
    amostraColetada: false,
    
  });
  const [userMap, setUserMap] = useState({});
  const [currentPage, setCurrentPage] = useState(1);

  // <-- NOVO: Estado para controlar o modal de PDF
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [isObsModalOpen, setIsObsModalOpen] = useState(false);
  const [selectedObservation, setSelectedObservation] = useState('');
  // State para o texto de busca do filtro de agentes na página principal
  const [buscaAgenteFiltro, setBuscaAgenteFiltro] = useState('');

  // State para controlar a visibilidade do dropdown de agentes
  const [isAgenteDropdownOpen, setIsAgenteDropdownOpen] = useState(false);
  const [currentUserApelido, setCurrentUserApelido] = useState('');
  const [apelidoMap, setApelidoMap] = useState({});

  useEffect(() => {
    const fetchUsers = async () => {
      const usersCollection = collection(db, 'usuarios');
      const userSnapshot = await getDocs(usersCollection);
      const mapaDeUsuarios = {};
      const mapaDeApelidos = {};
      
      userSnapshot.forEach(doc => {
        const userData = doc.data();
        mapaDeUsuarios[doc.id] = userData.name || doc.id;
        mapaDeApelidos[doc.id] = userData.apelido || userData.name || doc.id;
      });
      
      setUserMap(mapaDeUsuarios);
      setApelidoMap(mapaDeApelidos);
    };
    fetchUsers().catch(console.error);
  }, []);

  useEffect(() => {
    const fetchCurrentUserApelido = async () => {
      if (user?.uid) {
        try {
          const usersCollection = collection(db, 'usuarios');
          const userSnapshot = await getDocs(usersCollection);
          const userData = userSnapshot.docs.find(doc => doc.id === user.uid)?.data();
          if (userData?.apelido) {
            setCurrentUserApelido(userData.apelido);
          }
        } catch (error) {
          console.error('Erro ao buscar apelido:', error);
        }
      }
    };
    fetchCurrentUserApelido();
  }, [user]);

  useEffect(() => {
    if (Object.keys(userMap).length === 0) return;
    setLoading(true);
    const q = query(collection(db, 'visitas'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const visitasData = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          dataVisita: data.timestamp?.toDate ? data.timestamp.toDate() : (data.timestamp ? new Date(data.timestamp) : null),
          agenteNome: userMap[data.agenteId] || data.agenteId
        };
      });
      setVisitas(visitasData);
      const agentesUnicosMap = new Map();
      visitasData.forEach(v => {
        if (v.agenteId && !agentesUnicosMap.has(v.agenteId)) {
          agentesUnicosMap.set(v.agenteId, { id: v.agenteId, nome: v.agenteNome });
        }
      });
      setAgentes(Array.from(agentesUnicosMap.values()));
      setLoading(false);
    }, (error) => {
      console.error("Erro ao escutar as atualizações de visitas: ", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [userMap]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const opcoesAgenteFiltrado = useMemo(() => {
    // Função para normalizar o texto (remover acentos e converter para minúsculas)
    const normalizeText = (text) =>
      text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();

    const normalizedBusca = normalizeText(buscaAgenteFiltro);

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

    // Ordena, priorizando os que começam com o termo da busca
    filtered.sort((a, b) => {
      const normalizedA = normalizeText(a.nome);
      const normalizedB = normalizeText(b.nome);
      const aStartsWith = normalizedA.startsWith(normalizedBusca);
      const bStartsWith = normalizedB.startsWith(normalizedBusca);

      if (aStartsWith && !bStartsWith) return -1;
      if (!aStartsWith && bStartsWith) return 1;
      
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
  }, [agentes, buscaAgenteFiltro]);

  const filteredVisitas = useMemo(() => {
    return visitas.filter(v => {
      const { status, agenteId, startDate, endDate, amostraColetada } = filters;
      if (status && v.statusSelecionado?.toLowerCase() !== status.toLowerCase()) return false;
      if (agenteId && v.agenteId !== agenteId) return false;
      if (!v.dataVisita) return true;
      
      // Normalizar dataVisita para o início do dia (00:00:00 local)
      const visitaDate = new Date(v.dataVisita);
      visitaDate.setHours(0, 0, 0, 0);
      
      if (startDate) {
        // Criar data de início no horário local (00:00:00)
        const start = new Date(startDate + 'T00:00:00');
        if (visitaDate < start) return false;
      }
      
      if (endDate) {
        // Criar data de fim no final do dia (23:59:59.999)
        const end = new Date(endDate + 'T23:59:59.999');
        if (visitaDate > end) return false;
      }
      
      if (amostraColetada) {
        if (
          !v.numAmostras ||
          v.numAmostras === '0' ||
          v.numAmostras === 0
        )
          return false;
      }
      return true;
    });
  }, [visitas, filters]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filteredVisitas]);

  const totalPages = Math.ceil(filteredVisitas.length / ITEMS_PER_PAGE);
  const paginatedVisitas = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return filteredVisitas.slice(startIndex, endIndex);
  }, [currentPage, filteredVisitas]);

  const stats = useMemo(() => {
    const total = filteredVisitas.length;
    const abertos = filteredVisitas.filter(v => v.statusSelecionado === 'aberto').length;
    const fechados = filteredVisitas.filter(v => v.statusSelecionado === 'fechado').length;
    const pendentes = filteredVisitas.filter(v => v.statusSelecionado === 'pendente').length;
    const recusados = filteredVisitas.filter(v => v.statusSelecionado === 'recusado').length;
    return { total, abertos, fechados, pendentes, recusados };
  }, [filteredVisitas]);

  const handleLogout = () => {
    signOut(auth).catch(error => console.error("Erro no logout:", error));
  };

  const openObsModal = (text) => {
    setSelectedObservation(text);
    setIsObsModalOpen(true);
  };

  const closeObsModal = () => {
    setIsObsModalOpen(false);
    setSelectedObservation('');
  };

  // <-- MUDANÇA: Esta função agora lida com a lógica de geração do PDF
  const handleConfirmPdfGeneration = (exportType) => {
    const dataToExport = exportType === 'all' ? filteredVisitas : paginatedVisitas;
    const title = exportType === 'all' 
      ? "Relatório de Todas as Visitas Filtradas" 
      : `Relatório de Visitas (Página ${currentPage})`;

    const doc = new jsPDF();
    doc.text(title, 14, 16);
    doc.setFontSize(10);
    doc.text(`Total de registros no relatório: ${dataToExport.length}`, 14, 22);
    
    const tableColumn = ["Data", "Endereço", "Status", "Tipo de Imóvel", "Agente", "Morador", "Amostra Coletada", "Observações"];

    const tableRows = [];
    dataToExport.forEach(visita => {
      const visitaData = [
        visita.dataVisita?.toLocaleDateString('pt-BR') || 'N/A',
        visita.endereco || '-',
        visita.statusSelecionado || '-',
        visita.tipo || '-',
        visita.agenteNome || '-',
        visita.morador || '-',
        visita.numAmostras || '-',
        visita.observacoes || '-'
      ];
      tableRows.push(visitaData);
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 30,
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [22, 160, 133], textColor: 255, fontStyle: 'bold' }
    });

    doc.save('relatorio_visitas.pdf');
    setIsPdfModalOpen(false); // Fecha o modal após gerar
  };

  return (
    <div className="dashboard-container">
    <header className="dashboard-header">
      {/* 1. Saudação do usuário no topo */}
      <div className="user-greeting">
        <span>Olá, {currentUserApelido || userMap[user.uid] || user.email}</span>
      </div>

      {/* 2. Barra de navegação com os botões abaixo da saudação */}
      <nav className="dashboard-nav">
        {/* Grupo de botões que ficará à esquerda */}
        <div className="nav-buttons-left">
          <button
            onClick={() => setCurrentView('visitas')}
            className={currentView === 'visitas' ? 'nav-active' : ''}
          >
            📋 Visitas
          </button>
          <button
            onClick={() => setCurrentView('boletins')}
            className={currentView === 'boletins' ? 'nav-active' : ''}
          >
            📄 PDFs
          </button>
        </div>

        {/* Botão de logout que ficará sozinho à direita */}
        <button onClick={handleLogout} className="logout-button">
          Sair
        </button>
      </nav>
    </header>

    {currentView === 'visitas' ? (
      <main className="dashboard-main">
        {/* Todo o conteúdo atual do main permanece aqui */}
        <div className="stats-grid">
          <StatCard title="Total de Visitas" value={stats.total} icon="🏠" />
          <StatCard title="Imóveis Abertos" value={stats.abertos} icon="✅" />
          <StatCard title="Imóveis Fechados" value={stats.fechados} icon="🔒" />
          <StatCard title="Pendentes" value={stats.pendentes} icon="⏳" />
          <StatCard title="Recusados" value={stats.recusados} icon="❌" />
        </div>
        <div className="filter-bar">
          <h3>Filtrar Visitas</h3>
          <div className="filters">
            <select name="status" value={filters.status} onChange={handleFilterChange}>
              <option value="">Todos os Status</option>
              <option value="aberto">Aberto</option>
              <option value="fechado">Fechado</option>
              <option value="pendente">Pendente</option>
              <option value="recusado">Recusado</option>
            </select>
            <div 
              className="custom-select-container" 
              onBlur={() => setIsAgenteDropdownOpen(false)}
            >
              <input
                type="text"
                placeholder="Buscar Agente..."
                value={buscaAgenteFiltro}
                onChange={(e) => {
                  setBuscaAgenteFiltro(e.target.value);
                  setIsAgenteDropdownOpen(true);
                  // Se o usuário apagar o texto, desfaz o filtro
                  if (e.target.value === '') {
                    handleFilterChange({ target: { name: 'agenteId', value: '' } });
                  }
                }}
                onFocus={() => setIsAgenteDropdownOpen(true)}
                className="filter-input"
              />
              {isAgenteDropdownOpen && (
                <div className="custom-select-dropdown">
                  {opcoesAgenteFiltrado.map(option => (
                    <div
                      key={option.value || 'todos'}
                      className="custom-select-option"
                      onMouseDown={(e) => { // Usamos onMouseDown para disparar antes do onBlur
                        e.preventDefault();
                        handleFilterChange({ target: { name: 'agenteId', value: option.value } });
                        setBuscaAgenteFiltro(option.label === 'Todos os Agentes' ? '' : option.label);
                        setIsAgenteDropdownOpen(false);
                      }}
                    >
                      {option.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="filter-item">
              <label>Data Início: </label>
              <div className="date-input-wrapper">
                <input
                  type="date"
                  name="startDate"
                  value={filters.startDate}
                  onChange={handleFilterChange}
                  placeholder="dd/mm/aaaa" // Apenas adicione o placeholder
                />
              </div>
            </div>
            <div className="filter-item">
              <label>Data Fim: </label>
              <div className="date-input-wrapper">
                <input
                  type="date"
                  name="endDate"
                  value={filters.endDate}
                  onChange={handleFilterChange}
                  placeholder="dd/mm/aaaa" // Apenas adicione o placeholder
                />
              </div>
            </div>
            
            <div className="checkbox-wrapper">
              <input
                type="checkbox"
                name="amostraColetada"
                checked={filters.amostraColetada}
                onChange={e =>
                  setFilters(prev => ({
                    ...prev,
                    amostraColetada: e.target.checked
                  }))
                }
              />
              <label htmlFor="amostraColetada">Apenas com amostra coletada</label>
            </div>

            {/* <-- MUDANÇA: Botão agora abre o modal --> */}
            <button 
              onClick={() => setIsPdfModalOpen(true)} 
              className="pdf-button" 
              disabled={loading || filteredVisitas.length === 0}
            >
              Gerar PDF
            </button>
          </div>
        </div>
        <div className="data-table-container">
          {loading ? (
            <p>Carregando dados...</p>
          ) : (
            <>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Endereço</th>
                    <th>Status</th>
                    <th>Tipo de Imóvel</th>
                    <th>Agente</th>
                    <th>Morador</th>
                    <th>Amostra Coletada</th>
                    <th>Observações</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedVisitas.length > 0 ? (
                    paginatedVisitas.map(v => (
                      <tr key={v.id}>
                        <td>{v.dataVisita?.toLocaleDateString('pt-BR') || 'N/A'}</td>
                        <td>{v.endereco}</td>
                        <td><span className={`status-badge status-${v.statusSelecionado?.toLowerCase()}`}>{v.statusSelecionado}</span></td>
                        <td>{v.tipo}</td>
                        <td>{apelidoMap[v.agenteId] || v.agenteNome}</td>
                        <td>{v.morador || '-'}</td>
                        <td>{v.numAmostras || '-'}</td>
                        <td 
                          className="obs-cell" 
                          onClick={() => v.observacoes && openObsModal(v.observacoes)}
                        >
                          {v.observacoes || '-'}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="8">Nenhum resultado encontrado para os filtros aplicados.</td>
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
                  <span>
                    Página {currentPage} de {totalPages}
                  </span>
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
      </main>
    ) : (
      <PdfManager user={user} />
    )}
  

      {/* <-- NOVO: Modal de Confirmação de PDF --> */}
      {isPdfModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Opções de Exportação de PDF</h3>
            <p>O que você deseja incluir no relatório?</p>
            <div className="modal-actions">
              <button 
                className="modal-button"
                onClick={() => handleConfirmPdfGeneration('current')}
              >
                Apenas a Página Atual ({paginatedVisitas.length} itens)
              </button>
              <button 
                className="modal-button"
                onClick={() => handleConfirmPdfGeneration('all')}
              >
                Todos os Resultados ({filteredVisitas.length} itens)
              </button>
              <button 
                className="modal-button cancel"
                onClick={() => setIsPdfModalOpen(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {isObsModalOpen && (
      <div className="modal-overlay" onClick={closeObsModal}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <h3>Observação Completa</h3>
          <div className="obs-modal-content">
            <p>{selectedObservation}</p>
          </div>
          <div className="modal-actions">
            <button 
              className="modal-button"
              onClick={closeObsModal}
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    )}
    </div>
  );
}

export default Dashboard;
