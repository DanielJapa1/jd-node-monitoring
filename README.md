# \# 🖥️ JD Node \& Infrastructure Monitoring

# 

# Projeto Extensionista desenvolvido para a disciplina de \*\*Programação Básica Aplicada\*\* do curso de Análise e Desenvolvimento de Sistemas da \*\*UniEVANGÉLICA\*\* (Polo Ceres).

# 

# O \*\*JD Node\*\* é um painel de monitoramento de infraestrutura em tempo real desenvolvido para a empresa parceira \*\*RedHosting\*\*. Ele consome dados de status dos servidores via API e exibe métricas vitais de latência, estabilidade e \*uptime\* em uma interface amigável e responsiva.

# 

# \## 🚀 Funcionalidades (MVP)

# 

# \* \*\*Proxy de API (Backend):\*\* Contorna bloqueios de CORS utilizando o framework Flask em Python para consumir a API oficial da RedHosting de forma segura.

# \* \*\*Dashboard Visual (Dark Mode):\*\* Interface limpa desenvolvida com foco em UI/UX para reduzir a fadiga visual da equipe de TI.

# \* \*\*Indicadores em Tempo Real (KPIs):\*\* Cards automáticos exibindo total de nodes, servidores operacionais, quedas e percentual de disponibilidade.

# \* \*\*Gráficos Interativos:\*\* Utilização da biblioteca `Chart.js` para renderizar a distribuição de status e latência de cada nó.

# \* \*\*Inteligência Assíncrona:\*\* Loop de atualização autônoma (`auto-refresh`) a cada 30 segundos.

# \* \*\*Sistema de Resiliência (Fallback):\*\* Mecanismo de contingência (`try/except`) que exibe alertas vermelhos e dados simulados caso a API da RedHosting sofra quedas ou \*timeouts\*.

# \* \*\*100% Responsivo:\*\* Layout adaptável para uso em monitores desktop ou smartphones.

# 

# \## 🛠️ Tecnologias Utilizadas

# 

# \* \*\*Backend:\*\* Python 3.14, Flask, biblioteca `requests`

# \* \*\*Frontend:\*\* HTML5, CSS3 (Variáveis CSS, Media Queries), JavaScript (ES6, API Fetch, DOM Manipulation)

# \* \*\*Visualização de Dados:\*\* Chart.js

# \* \*\*Implantação (Produção):\*\* Servidor VPS Linux / Docker

# 

# \## ⚙️ Como Instalar e Executar Localmente

# 

# 

# \### Passo a passo

# 1\. Clone este repositório para sua máquina local:

# &#x20;  ```bash

# &#x20;  git clone \[https://github.com/DanielJapa1/jd-node-monitoring.git](https://github.com/DanielJapa1/jd-node-monitoring.git)

