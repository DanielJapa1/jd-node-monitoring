/**
 * ==========================================================================
 * script.js v1.0.0 — JD Node & Infrastructure Dashboard
 * ==========================================================================
 *
 * FUNCIONALIDADES MANTIDAS:
 * 1. carregarDados() → Busca dados da API (/api/dados)
 * 2. atualizarCards() → Preenche KPI cards
 * 3. atualizarTabela() → Gera Node List
 * 4. AutoRefresh a cada 30s
 * 5. Timestamp brasileiro + fallback demo + error banner
 *
 * NOVAS FUNCIONALIDADES v2.1:
 * 6. navegarPara() → Navegação entre painéis (Dashboard, Alertas, Logs, Config)
 * 7. detectarAlertas() → Gera alertas baseado em latência/status dos nodes
 * 8. registrarLog() → Sistema de log com timeline
 * 9. setTheme() → Alterna entre tema dark e light
 * ==========================================================================
 */

// ===========================================================================
// CONSTANTES
// ===========================================================================
const INTERVALO_AUTO_REFRESH = 30000;
const btnRefresh = document.getElementById("btnRefresh");
let timerAutoRefresh = null;
let contadorRegressivo = 30;
let timerContador = null;
let chartInstances = {};

// Armazenamento de alertas e logs
let alertasAtivos = [];
let logsRegistros = [];
let dadosAnteriores = null;


// ===========================================================================
// NAVEGAÇÃO ENTRE PAINÉIS
// ===========================================================================
function navegarPara(pagina) {
    // Oculta todos os painéis
    document.querySelectorAll(".page-panel").forEach(p => p.classList.remove("active"));
    const alvo = document.getElementById("panel-" + pagina);
    if (alvo) alvo.classList.add("active");

    // Atualiza sidebar
    document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));
    const navItem = document.querySelector(`.nav-item[data-page="${pagina}"]`);
    if (navItem) navItem.classList.add("active");

    // Atualiza breadcrumb e título
    const nomes = {
        dashboard: ["Dashboard", "Infraestrutura", "Visão Geral"],
        alertas: ["Alertas", "Notificações", "Alertas do Sistema"],
        logs: ["Logs", "Eventos", "Histórico do Sistema"],
        configuracoes: ["Configurações", "Sistema", "Personalização"],
    };
    const info = nomes[pagina] || ["Dashboard", "Sistema", "Visão Geral"];
    const breadcrumb = document.getElementById("breadcrumb");
    breadcrumb.innerHTML = `<span class="breadcrumb-item">${info[0]}</span>
        <span class="breadcrumb-sep">/</span>
        <span class="breadcrumb-current">${info[1]}</span>`;
    document.getElementById("headerTitle").textContent = info[2];

    // Fecha sidebar no mobile
    document.getElementById("sidebar").classList.remove("open");

    // Se clicou em Alertas, marca como visualizados
    if (pagina === "alertas") {
        marcarAlertasVistos();
    }
}


// ===========================================================================
// FUNÇÃO PRINCIPAL: carregarDados()
// ===========================================================================
async function carregarDados(isFallback = false) {
    btnRefresh.classList.add("loading");
    mostrarSkeleton(true);

    try {
        let dados;
        if (isFallback) {
            dados = gerarDadosDemo();
            console.log("📦 Usando dados de demonstração (fallback).");
        } else {
            const resposta = await fetch("/api/dados");
            if (!resposta.ok) throw new Error(`Servidor retornou status ${resposta.status}`);
            dados = await resposta.json();
            if (dados.erro) {
                console.warn("⚠️ API reportou erro:", dados.mensagem);
                exibirBannerErro(dados.mensagem || "Erro desconhecido da API.");
            } else {
                fecharBannerErro();
            }
        }
        atualizarInterface(dados);
    } catch (erro) {
        console.error("❌ Erro ao carregar dados:", erro);
        exibirBannerErro("Não foi possível conectar ao servidor. Exibindo dados de demonstração.");
        atualizarInterface(gerarDadosDemo());
    } finally {
        btnRefresh.classList.remove("loading");
        mostrarSkeleton(false);
        reiniciarAutoRefresh();
    }
}


// ===========================================================================
// SKELETON
// ===========================================================================
function mostrarSkeleton(v) {
    const sk = document.getElementById("skeletonLoader");
    const real = document.getElementById("dashboardReal");
    if (v) { sk.style.display = "block"; real.style.display = "none"; }
    else { sk.style.display = "none"; real.style.display = "block"; }
}


// ===========================================================================
// ATUALIZAR INTERFACE
// ===========================================================================
let ultimosDados = null;

function atualizarInterface(dados) {
    ultimosDados = dados; // Guarda para re-renderizar ao trocar tema
    atualizarCards(dados);
    atualizarTabela(dados);
    atualizarTimestamp(dados.ultima_consulta);
    atualizarHeaderStatus(dados);
    renderizarCharts(dados);
    atualizarSysInfo(dados);

    // Alertas e logs
    detectarAlertas(dados);
    registrarLog("info", "Dados atualizados", `${dados.summary?.total || 0} nodes verificados`);
}


// ===========================================================================
// HEADER STATUS
// ===========================================================================
function atualizarHeaderStatus(dados) {
    const el = document.getElementById("systemStatus");
    const dot = el.querySelector(".status-indicator");
    const label = el.querySelector(".status-label");
    const failed = dados.summary?.failed || 0;
    const degraded = dados.summary?.degraded || 0;

    if (failed > 0) {
        dot.className = "status-indicator status-critical";
        label.textContent = `🚨 ${failed} Node(s) com falha`;
    } else if (degraded > 0) {
        dot.className = "status-indicator status-warning";
        label.textContent = `⚠️ ${degraded} Node(s) instáveis`;
    } else {
        dot.className = "status-indicator status-healthy";
        label.textContent = "✅ Ao vivo · 30s";
    }
    document.getElementById("footerUpdate").textContent =
        `${dados.summary?.total || 0} nodes monitorados`;
}


// ===========================================================================
// KPI CARDS
// ===========================================================================
function atualizarCards(dados) {
    const s = dados.summary || dados.sumario || dados.resumo || dados;
    document.getElementById("totalServicos").textContent = s.total || 0;
    document.getElementById("totalTrend").textContent = `${s.total || 0} nodes ativos`;
    document.getElementById("servicosOperacionais").textContent = s.operational || 0;
    document.getElementById("servicosComFalha").textContent = (s.failed || 0) + (s.degraded || 0);
    document.getElementById("uptimePercentual").textContent = `${s.uptime || 0}%`;
    const cnt = document.getElementById("nodesCount");
    if (cnt) cnt.textContent = `${s.total || 0} serviços`;
}


// ===========================================================================
// NODE LIST
// ===========================================================================
function atualizarTabela(dados) {
    const container = document.getElementById("servicesBody");
    const servicos = dados.services || dados.servicos || dados.nodes || [];

    if (servicos.length === 0) {
        container.innerHTML = `<div class="node-row node-row-loading"><span>Nenhum serviço disponível.</span></div>`;
        return;
    }

    let html = "";
    for (const servico of servicos) {
        const nome = servico.name || servico.nome || "Serviço";
        const descricao = servico.description || "";
        const statusRaw = (servico.status || "unknown").toLowerCase();
        const { badgeClass, badgeLabel } = normalizarStatus(statusRaw);
        const latencia = typeof servico.latency === "number" ? servico.latency : parseFloat(servico.latency) || 0;
        const latClass = latencia < 80 ? "latency-low" : (latencia < 200 ? "latency-mid" : "latency-high");
        const uptime = typeof servico.uptime === "number" ? servico.uptime : parseFloat(servico.uptime) || 0;
        const cpu = Math.min(Math.round(latencia * 0.6 + 10 + Math.random() * 10), 98);
        const ram = Math.min(Math.round(latencia * 0.3 + 30 + Math.random() * 15), 95);

        html += `
            <div class="node-row">
                <div class="node-info">
                    <span class="node-name">${nome}</span>
                    ${descricao ? `<span class="node-desc">${descricao}</span>` : ''}
                </div>
                <div><span class="node-status-badge ${badgeClass}"><span class="badge-dot"></span>${badgeLabel}</span></div>
                <div class="node-value ${latClass}">${latencia > 0 ? latencia + ' ms' : '—'}</div>
                <div class="node-progress">
                    <div class="progress-bar"><div class="progress-fill progress-fill-cpu" style="width:${cpu}%"></div></div>
                    <span class="progress-label">CPU ${cpu}%</span>
                </div>
                <div class="node-progress">
                    <div class="progress-bar"><div class="progress-fill progress-fill-ram" style="width:${ram}%"></div></div>
                    <span class="progress-label">RAM ${ram}%</span>
                </div>
                <div class="node-value"><div class="progress-bar"><div class="progress-fill progress-fill-uptime" style="width:${uptime}%"></div></div>
                    <span class="progress-label">${uptime}%</span></div>
            </div>
        `;
    }
    container.innerHTML = html;
}


// ===========================================================================
// NORMALIZAR STATUS
// ===========================================================================
function normalizarStatus(status) {
    const ops = ["operational","operacional","ok","up","online","running","active","none"];
    const inst = ["degraded_performance","degraded","degradado","instavel","unstable","partial_outage","minor","warning"];
    if (ops.includes(status)) return { badgeClass: "badge-online", badgeLabel: "Online" };
    if (inst.includes(status)) return { badgeClass: "badge-warning", badgeLabel: "Instável" };
    return { badgeClass: "badge-offline", badgeLabel: "Offline" };
}


// ===========================================================================
// TIMESTAMP
// ===========================================================================
function atualizarTimestamp(iso) {
    const el = document.getElementById("updateTime");
    if (!iso) { el.textContent = "—"; return; }
    try {
        const d = new Date(iso);
        const pad = n => String(n).padStart(2, "0");
        el.textContent = `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    } catch (e) { el.textContent = iso; }
}


// ===========================================================================
// GRÁFICOS (Chart.js)
// ===========================================================================
function renderizarCharts(dados) {
    Object.values(chartInstances).forEach(c => { if (c) c.destroy(); });
    chartInstances = {};
    if (typeof Chart === "undefined") return;

    Chart.defaults.color = "#AAA1B2";
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.font.size = 11;

    const servicos = dados.services || dados.servicos || dados.nodes || [];
    const summary = dados.summary || {};
    const isLight = document.documentElement.getAttribute("data-theme") === "light";
    const gridColor = isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)";

    // Donut
    const ctx1 = document.getElementById("chartStatusCanvas");
    if (ctx1) {
        chartInstances.status = new Chart(ctx1, {
            type: "doughnut",
            data: {
                labels: ["Online", "Instável", "Offline"],
                datasets: [{
                    data: [summary.operational || 0, summary.degraded || 0.1, summary.failed || 0.1],
                    backgroundColor: ["#4ADE80", "#FACC15", "#FB7185"],
                    borderColor: [isLight ? "#ffffff" : "#15121A", isLight ? "#ffffff" : "#15121A", isLight ? "#ffffff" : "#15121A"],
                    borderWidth: 3, hoverOffset: 8,
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: "70%",
                plugins: { legend: { position: "bottom", labels: { padding: 14, usePointStyle: true, pointStyleWidth: 8 } } }
            }
        });
    }

    // Latência horizontal bar
    const ctx2 = document.getElementById("chartLatencyCanvas");
    if (ctx2 && servicos.length > 0) {
        const labels = servicos.map(s => s.name || "?");
        const data = servicos.map(s => { const v = s.latency || 0; return typeof v === "number" ? Math.round(v*10)/10 : 0; });
        chartInstances.latency = new Chart(ctx2, {
            type: "bar", data: {
                labels, datasets: [{ label: "Latência (ms)", data,
                    backgroundColor: data.map(v => v < 50 ? "rgba(74,222,128,0.6)" : v < 150 ? "rgba(250,204,21,0.6)" : "rgba(251,113,133,0.6)"),
                    borderColor: data.map(v => v < 50 ? "#4ADE80" : v < 150 ? "#FACC15" : "#FB7185"),
                    borderWidth: 1, borderRadius: 4,
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, indexAxis: "y",
                plugins: { legend: { display: false } },
                scales: { x: { grid: { color: gridColor }, ticks: { font: { size: 10 } } }, y: { grid: { display: false }, ticks: { font: { size: 10 } } } }
            }
        });
    }

    // Uptime bars
    const ctx3 = document.getElementById("chartUptimeCanvas");
    if (ctx3 && servicos.length > 0) {
        const labels = servicos.map(s => s.name || "?");
        const data = servicos.map(s => { const v = s.uptime || 0; return typeof v === "number" ? Math.round(v*100)/100 : 0; });
        chartInstances.uptime = new Chart(ctx3, {
            type: "bar", data: {
                labels, datasets: [{ label: "Uptime (%)", data,
                    backgroundColor: data.map(v => v >= 99 ? "rgba(74,222,128,0.5)" : v >= 95 ? "rgba(167,139,250,0.5)" : "rgba(251,113,133,0.5)"),
                    borderColor: data.map(v => v >= 99 ? "#4ADE80" : v >= 95 ? "#A78BFA" : "#FB7185"),
                    borderWidth: 1, borderRadius: 4,
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { x: { grid: { color: gridColor }, ticks: { font: { size: 9 } } }, y: { grid: { display: false }, beginAtZero: true, max: 100, ticks: { font: { size: 10 }, callback: v => v + "%" } } }
            }
        });
    }
}


// ===========================================================================
// 🚨 SISTEMA DE ALERTAS
// ===========================================================================
function detectarAlertas(dados) {
    const servicos = dados.services || dados.servicos || dados.nodes || [];
    const novosAlertas = [];
    const agora = new Date();

    for (const servico of servicos) {
        const nome = servico.name || "Node";
        const statusRaw = (servico.status || "unknown").toLowerCase();
        const latencia = typeof servico.latency === "number" ? servico.latency : parseFloat(servico.latency) || 0;

        // 1. Node offline
        if (!["operational","operacional","ok","up","online","running","active","none"].includes(statusRaw)) {
            const jaExiste = alertasAtivos.some(a => a.node === nome && a.tipo === "offline" && !a.resolvido);
            if (!jaExiste) {
                novosAlertas.push({
                    id: Date.now() + Math.random(),
                    tipo: "offline",
                    severidade: "critical",
                    titulo: `${nome} está offline`,
                    descricao: `O node ${nome} não está respondendo às requisições.`,
                    node: nome,
                    hora: agora,
                    resolvido: false,
                    visto: false, // Novo alerta → não visto
                });
                registrarLog("critical", `Node offline: ${nome}`, `${nome} não responde`);
            }
        }

        // 2. Latência alta (>200ms)
        if (latencia > 200) {
            const jaExiste = alertasAtivos.some(a => a.node === nome && a.tipo === "latencia" && !a.resolvido);
            if (!jaExiste) {
                novosAlertas.push({
                    id: Date.now() + Math.random(),
                    tipo: "latencia",
                    severidade: "warning",
                    titulo: `${nome} com latência elevada`,
                    descricao: `Latência de ${latencia}ms detectada no node ${nome}.`,
                    node: nome,
                    hora: agora,
                    resolvido: false,
                    visto: false,
                });
                registrarLog("warning", `Latência alta: ${nome}`, `${latencia}ms`);
            }
        }

        // 3. Latência moderada (100-200ms) → info alert
        if (latencia > 100 && latencia <= 200) {
            const jaExiste = alertasAtivos.some(a => a.node === nome && a.tipo === "latencia-media" && !a.resolvido);
            if (!jaExiste) {
                novosAlertas.push({
                    id: Date.now() + Math.random(),
                    tipo: "latencia-media",
                    severidade: "info",
                    titulo: `${nome} com latência moderada`,
                    descricao: `Latência de ${latencia}ms — dentro do limite aceitável.`,
                    node: nome,
                    hora: agora,
                    resolvido: false,
                    visto: false,
                });
            }
        }
    }

    // Resolve alertas que não se aplicam mais
    for (const alerta of alertasAtivos) {
        if (alerta.resolvido) continue;
        const node = servicos.find(s => s.name === alerta.node);
        if (!node) { alerta.resolvido = true; continue; }
        const statusNode = (node.status || "").toLowerCase();
        const latNode = typeof node.latency === "number" ? node.latency : parseFloat(node.latency) || 0;

        if (alerta.tipo === "offline" && ["operational","operacional","ok","up","online","running","active","none"].includes(statusNode)) {
            alerta.resolvido = true;
            registrarLog("success", `Node recuperado: ${alerta.node}`, `${alerta.node} está online novamente`);
        }
        if (alerta.tipo === "latencia" && latNode <= 200) {
            alerta.resolvido = true;
            registrarLog("success", `Latência normalizada: ${alerta.node}`, `${latNode}ms`);
        }
        if (alerta.tipo === "latencia-media" && latNode <= 100) {
            alerta.resolvido = true;
        }
    }

    // Adiciona novos alertas
    alertasAtivos = [...novosAlertas, ...alertasAtivos];

    // Atualiza badge — só mostra se houver alertas NÃO vistos E não resolvidos
    const naoVistos = alertasAtivos.filter(a => !a.resolvido && !a.visto).length;
    const badge = document.getElementById("alertBadge");
    if (badge) {
        badge.textContent = naoVistos;
        badge.style.display = naoVistos > 0 ? "flex" : "none";
    }

    // Atualiza a lista de alertas se estiver visível
    renderizarAlertas();
}


// ===========================================================================
// RENDERIZAR ALERTAS
// ===========================================================================
function renderizarAlertas() {
    const container = document.getElementById("alertsList");
    const ativos = alertasAtivos.filter(a => !a.resolvido);
    const resolvidos = alertasAtivos.filter(a => a.resolvido);

    if (alertasAtivos.length === 0) {
        container.innerHTML = `
            <div class="alerts-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                <span>Nenhum alerta no momento.</span>
            </div>`;
        return;
    }

    let html = "";

    if (ativos.length > 0) {
        html += `<div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Ativos (${ativos.length})</div>`;
        for (const a of ativos) {
            const sevClass = a.severidade === "critical" ? "alert-severity-critical" : a.severidade === "warning" ? "alert-severity-warning" : "alert-severity-info";
            const iconClass = a.severidade === "critical" ? "alert-icon-critical" : a.severidade === "warning" ? "alert-icon-warning" : "alert-icon-info";
            const horaStr = a.hora.toLocaleTimeString("pt-BR");
            const svgIcon = a.severidade === "critical"
                ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`
                : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
            const sevLabel = a.severidade === "critical" ? "CRÍTICO" : a.severidade === "warning" ? "ATENÇÃO" : "INFO";
            html += `
                <div class="alert-item" style="border-color:${a.severidade === 'critical' ? 'rgba(251,113,133,0.15)' : a.severidade === 'warning' ? 'rgba(250,204,21,0.15)' : 'rgba(96,165,250,0.15)'}">
                    <div class="alert-icon ${iconClass}">${svgIcon}</div>
                    <div class="alert-body">
                        <div class="alert-title">${a.titulo}</div>
                        <div class="alert-desc">${a.descricao}</div>
                        <div class="alert-time">${horaStr}</div>
                    </div>
                    <span class="alert-severity ${sevClass}">${sevLabel}</span>
                </div>`;
        }
    }

    if (resolvidos.length > 0) {
        html += `<div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-top:16px;margin-bottom:6px;">Resolvidos (${resolvidos.length})</div>`;
        for (const a of resolvidos.slice(0, 10)) {
            const horaStr = a.hora.toLocaleTimeString("pt-BR");
            html += `
                <div class="alert-item" style="opacity:0.6;">
                    <div class="alert-icon alert-icon-info">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    </div>
                    <div class="alert-body">
                        <div class="alert-title">${a.titulo}</div>
                        <div class="alert-desc">Resolvido automaticamente</div>
                        <div class="alert-time">${horaStr}</div>
                    </div>
                    <span class="alert-severity" style="background:rgba(74,222,128,0.1);color:var(--green);border:1px solid rgba(74,222,128,0.15);">RESOLVIDO</span>
                </div>`;
        }
    }

    container.innerHTML = html;
}


// ===========================================================================
// 📋 SISTEMA DE LOGS
// ===========================================================================
function registrarLog(tipo, titulo, descricao) {
    logsRegistros.unshift({
        id: Date.now() + Math.random(),
        tipo: tipo,
        titulo: titulo,
        descricao: descricao,
        hora: new Date(),
    });

    // Limita a 100 logs
    if (logsRegistros.length > 100) logsRegistros = logsRegistros.slice(0, 100);

    renderizarLogs();
}

function renderizarLogs() {
    const container = document.getElementById("logsList");
    if (logsRegistros.length === 0) {
        container.innerHTML = `
            <div class="logs-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span>Nenhum log registrado ainda.</span>
            </div>`;
        return;
    }

    const dotClass = { info: "log-dot-info", success: "log-dot-success", warning: "log-dot-warning", critical: "log-dot-critical" };
    let html = "";
    for (const log of logsRegistros.slice(0, 50)) {
        const horaStr = log.hora.toLocaleTimeString("pt-BR");
        const dot = dotClass[log.tipo] || "log-dot-info";
        html += `
            <div class="log-entry">
                <span class="log-time">${horaStr}</span>
                <span class="log-dot ${dot}"></span>
                <span class="log-message"><strong>${log.titulo}</strong> — ${log.descricao}</span>
            </div>`;
    }
    container.innerHTML = html;
}


// ===========================================================================
// ⚙️ SISTEMA DE INFORMAÇÕES (Configurações)
// ===========================================================================
function atualizarSysInfo(dados) {
    const elNodes = document.getElementById("sysinfoNodes");
    const elUptime = document.getElementById("sysinfoUptime");
    if (elNodes) elNodes.textContent = dados.summary?.total || "—";
    if (elUptime) elUptime.textContent = (dados.summary?.uptime || "—") + "%";
}


// ===========================================================================
// 🎨 TEMA (Dark / Light)
// ===========================================================================
function setTheme(tema) {
    document.documentElement.setAttribute("data-theme", tema);
    localStorage.setItem("jd-node-theme", tema);

    document.getElementById("themeDarkBtn").classList.toggle("active", tema === "dark");
    document.getElementById("themeLightBtn").classList.toggle("active", tema === "light");

    // Re-renderiza gráficos com as cores do tema atual
    // Pequeno delay para garantir que o CSS do tema já foi aplicado
    if (ultimosDados) {
        setTimeout(() => renderizarCharts(ultimosDados), 50);
    }
}


// ===========================================================================
// LIMPAR ALERTAS E LOGS
// ===========================================================================
function marcarAlertasVistos() {
    for (const a of alertasAtivos) {
        if (!a.resolvido) a.visto = true;
    }
    // Esconde o badge imediatamente
    const badge = document.getElementById("alertBadge");
    if (badge) { badge.textContent = "0"; badge.style.display = "none"; }
}

function limparAlertas() {
    alertasAtivos = [];
    renderizarAlertas();
    const badge = document.getElementById("alertBadge");
    if (badge) { badge.textContent = "0"; badge.style.display = "none"; }
    registrarLog("info", "Alertas limpos", "Todos os alertas foram removidos manualmente");
}

function limparLogs() {
    logsRegistros = [];
    renderizarLogs();
}

// ===========================================================================
// DEMO DATA (FALLBACK)
// ===========================================================================
function gerarDadosDemo() {
    const agora = new Date().toISOString();
    return {
        status: { indicator: "none", description: "Todos os sistemas operacionais" },
        summary: { total: 8, operational: 7, degraded: 0, failed: 1, uptime: 98.7 },
        services: [
            { name: "Website Principal", description: "Site institucional e blog", status: "operational", latency: 42, uptime: 99.9 },
            { name: "Painel de Controle", description: "WHM / cPanel de clientes", status: "operational", latency: 56, uptime: 99.5 },
            { name: "API de Integração", description: "Gateway REST para parceiros", status: "operational", latency: 78, uptime: 98.2 },
            { name: "Banco de Dados Principal", description: "Cluster MySQL/MariaDB", status: "operational", latency: 12, uptime: 99.8 },
            { name: "Node SP-BR-01", description: "Servidor em São Paulo", status: "operational", latency: 18, uptime: 99.7 },
            { name: "Node RJ-BR-02", description: "Servidor no Rio de Janeiro", status: "degraded_performance", latency: 185, uptime: 94.2 },
            { name: "Sistema de Backup", description: "Backup automatizado noturno", status: "operational", latency: 91, uptime: 97.4 },
            { name: "Servidor DNS Secundário", description: "DNS resolver e cache", status: "operational", latency: 22, uptime: 99.1 },
        ],
        ultima_consulta: agora,
    };
}
// ===========================================================================
// ERROR BANNER
// ===========================================================================
function exibirBannerErro(msg) {
    document.getElementById("errorBanner").style.display = "block";
    const el = document.getElementById("errorMessage");
    if (el) el.textContent = msg;
}
function fecharBannerErro() {
    document.getElementById("errorBanner").style.display = "none";
}


// ===========================================================================
// AUTO REFRESH
// ===========================================================================
function reiniciarAutoRefresh() {
    if (timerAutoRefresh) clearInterval(timerAutoRefresh);
    if (timerContador) clearInterval(timerContador);
    contadorRegressivo = Math.floor(INTERVALO_AUTO_REFRESH / 1000);
    const label = document.getElementById("autoRefreshLabel");
    if (label) label.textContent = `Atualizando em ${contadorRegressivo}s`;
    timerContador = setInterval(() => {
        contadorRegressivo--;
        if (contadorRegressivo <= 0) contadorRegressivo = Math.floor(INTERVALO_AUTO_REFRESH / 1000);
        if (label) label.textContent = `Atualizando em ${contadorRegressivo}s`;
    }, 1000);
    timerAutoRefresh = setInterval(() => carregarDados(false), INTERVALO_AUTO_REFRESH);
}


// ===========================================================================
// INICIALIZAÇÃO
// ===========================================================================
document.addEventListener("DOMContentLoaded", function () {
    console.log("⚡ JD Node & Infrastructure Monitoring v1.0.0");

    // Sidebar toggle
    document.getElementById("sidebarToggle").addEventListener("click", () => {
        document.getElementById("sidebar").classList.toggle("open");
    });
    document.getElementById("sidebarOverlay").addEventListener("click", () => {
        document.getElementById("sidebar").classList.remove("open");
    });

    // Tema persistido
    const temaSalvo = localStorage.getItem("jd-node-theme") || "dark";
    setTheme(temaSalvo);

    // Primeira carga
    carregarDados(false);
});

// Exposição global
window.carregarDados = carregarDados;
window.fecharBannerErro = fecharBannerErro;
window.navegarPara = navegarPara;
window.setTheme = setTheme;
window.limparAlertas = limparAlertas;
window.limparLogs = limparLogs;