from flask import Flask, jsonify, render_template
import requests
from datetime import datetime, timezone
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)


app = Flask(
    __name__,
    template_folder="templates",
    static_folder="static",
)

API_EXTERNA = "https://api-status.redhosting.com.br/api/status"
TIMEOUT_SEGUNDOS = 10

def transformar_dados(dados_brutos):
    """
    Transforma o formato complexo da API externa no formato simplificado
    que o frontend (JavaScript) consegue renderizar.

    Args:
        dados_brutos (dict): Resposta JSON direta da API externa.

    Returns:
        dict: Dados transformados no formato do frontend.
    """
    timestamp = dados_brutos.get("ultima_consulta")
    if not timestamp:
        timestamp = datetime.now(timezone.utc).isoformat()


    dados_internos = dados_brutos.get("data", {})
    monitors = dados_internos.get("monitors", [])

    total = len(monitors)
    operacionais = 0
    degradados = 0
    falhas = 0
    soma_uptime = 0.0
    servicos_transformados = []

    STATUS_OK = {"operational", "operacional", "ok", "up", "online", "none"}

    
    for monitor in monitors:
        # --- Nome e descrição ---
        nome = monitor.get("name", "Serviço sem nome")
        descricao = monitor.get("description", "")

        # --- Status (já vem como string: "operational", etc.) ---
        status_raw = (monitor.get("status") or "unknown").lower()
        if status_raw in STATUS_OK:
            operacionais += 1
        elif status_raw in {"degraded_performance", "degraded", "unstable",
                            "degradado", "instavel", "partial_outage", "warning"}:
            degradados += 1
        else:
            falhas += 1

        # --- Latência: extrai o valor médio do objeto latency ---
        latency_raw = monitor.get("latency", {})
        if isinstance(latency_raw, dict):
            # Prefere 'avg', se não houver pega 'min'
            latencia = latency_raw.get("avg") or latency_raw.get("min") or 0
        else:
            latencia = latency_raw or 0

        # --- Uptime: extrai o valor das últimas 24h do objeto uptime ---
        uptime_raw = monitor.get("uptime", {})
        if isinstance(uptime_raw, dict):
            # Prefere '24h', fallback para '30d'
            uptime = uptime_raw.get("24h") or uptime_raw.get("30d") or 0
        else:
            uptime = uptime_raw or 0

        # Se o uptime é um número, acumula para calcular a média
        if isinstance(uptime, (int, float)):
            soma_uptime += float(uptime)

        # --- Timestamp da última verificação ---
        ultima_verificacao = monitor.get("lastCheckedAt", "")

        # --- Monta o objeto simplificado para o frontend ---
        servicos_transformados.append({
            "name": nome,
            "description": descricao,
            "status": status_raw,
            "latency": round(float(latencia), 2) if latencia else 0,
            "uptime": round(float(uptime), 2) if uptime else 0,
            "lastCheckedAt": ultima_verificacao,
        })

   
    if operacionais > 0 and soma_uptime > 0:
        uptime_medio = round(soma_uptime / total, 2)
    else:
        uptime_medio = 0.0


    resumo = {
        "total": total,
        "operational": operacionais,
        "degraded": degradados,
        "failed": falhas,
        "uptime": uptime_medio,
    }

  
    return {
        "summary": resumo,
        "services": servicos_transformados,
        "ultima_consulta": timestamp,
        "status": {
            "indicator": "none" if falhas == 0 else "critical",
            "description": f"{operacionais} de {total} serviços operacionais",
        },
        "meta": dados_internos.get("meta", {}),
    }



def gerar_dados_demo():
    """Retorna dados simulados para modo demonstração."""
    agora = datetime.now(timezone.utc).isoformat()

    servicos_demo = [
        {
            "name": "Website Principal",
            "description": "Site institucional e blog da RedHosting",
            "status": "operational", "latency": 42.5, "uptime": 99.9,
            "lastCheckedAt": agora,
        },
        {
            "name": "Painel de Controle",
            "description": "WHM / cPanel de clientes",
            "status": "operational", "latency": 56.3, "uptime": 99.5,
            "lastCheckedAt": agora,
        },
        {
            "name": "API de Integração",
            "description": "Gateway REST para parceiros",
            "status": "operational", "latency": 78.1, "uptime": 98.2,
            "lastCheckedAt": agora,
        },
        {
            "name": "Banco de Dados Principal",
            "description": "Cluster MySQL/MariaDB",
            "status": "operational", "latency": 12.4, "uptime": 99.8,
            "lastCheckedAt": agora,
        },
        {
            "name": "Node SP-BR-01",
            "description": "Servidor em São Paulo",
            "status": "operational", "latency": 18.2, "uptime": 99.7,
            "lastCheckedAt": agora,
        },
        {
            "name": "Node RJ-BR-02",
            "description": "Servidor no Rio de Janeiro",
            "status": "operational", "latency": 24.7, "uptime": 99.6,
            "lastCheckedAt": agora,
        },
        {
            "name": "Sistema de Backup",
            "description": "Backup automatizado noturno",
            "status": "operational", "latency": 91.0, "uptime": 97.4,
            "lastCheckedAt": agora,
        },
        {
            "name": "Servidor DNS Secundário",
            "description": "DNS resolver e cache",
            "status": "degraded_performance", "latency": 185.3, "uptime": 94.2,
            "lastCheckedAt": agora,
        },
    ]

    return {
        "summary": {
            "total": len(servicos_demo),
            "operational": 7,
            "degraded": 1,
            "failed": 0,
            "uptime": 98.7,
        },
        "services": servicos_demo,
        "ultima_consulta": agora,
        "status": {
            "indicator": "none",
            "description": "8 de 8 serviços operacionais",
        },
        "meta": {},
    }


def consultar_api_externa():
    """
    Consulta a API de status da RedHosting e retorna os dados TRANSFORMADOS.

    Returns:
        dict: Dados transformados no formato do frontend,
              ou dicionário de erro com fallback para dados demo.
    """
    logging.info(f"🌐 Consultando API externa: {API_EXTERNA}")

    try:
        # Faz a requisição GET com timeout configurado
        resposta = requests.get(API_EXTERNA, timeout=TIMEOUT_SEGUNDOS)

        # Se o status HTTP não for 200 (OK), levanta uma exceção
        resposta.raise_for_status()

        # Converte a resposta de JSON para dicionário Python
        dados_brutos = resposta.json()

        logging.info("✅ Dados obtidos com sucesso da API externa.")

        # Adiciona timestamp aos dados brutos
        dados_brutos["ultima_consulta"] = datetime.now(timezone.utc).isoformat()

       
        dados_transformados = transformar_dados(dados_brutos)

        return dados_transformados

    except requests.exceptions.Timeout:
        logging.error("⏰ Timeout: API externa não respondeu dentro do limite.")
        dados_demo = gerar_dados_demo()
        dados_demo["erro"] = True
        dados_demo["mensagem"] = (
            "A API de status está demorando muito para responder. "
            "Exibindo dados de demonstração."
        )
        return dados_demo

    except requests.exceptions.ConnectionError:
        logging.error("🔌 Erro de conexão: API externa está fora do ar.")
        dados_demo = gerar_dados_demo()
        dados_demo["erro"] = True
        dados_demo["mensagem"] = (
            "Não foi possível conectar à API de status da RedHosting. "
            "Exibindo dados de demonstração."
        )
        return dados_demo

    except Exception as e:
        logging.error(f"❌ Erro inesperado ao consultar API: {e}")
        dados_demo = gerar_dados_demo()
        dados_demo["erro"] = True
        dados_demo["mensagem"] = f"Erro inesperado: {str(e)}. Exibindo dados de demonstração."
        return dados_demo


@app.route("/")
def index():
    """Renderiza a página principal do dashboard."""
    return render_template("index.html")


@app.route("/api/dados")
def api_dados():
    """
    Rota interna que retorna os dados transformados em JSON.
    """
    dados = consultar_api_externa()
    return jsonify(dados)



@app.route("/api/health")
def health_check():
    """Rota simples para verificar se o servidor está online."""
    return jsonify({
        "status": "online",
        "servidor": "RedHosting Status Dashboard",
        "versao": "1.0.0",
    })


if __name__ == "__main__":
    print("=" * 60)
    print("  🖥️  RedHosting - Painel de Monitoramento de Status")
    print("  🔗 Acesse: http://127.0.0.1:5000")
    print("=" * 60)
    app.run(host="0.0.0.0", port=5000, debug=True)