# 🚀 Guia de Implantação do Hospital HNSR na Hostinger (Node.js + Express + Vite)

Este documento contém o passo a passo completo e simplificado para publicar o seu sistema de escalas e folgas na **Hostinger** funcionando como uma aplicação **Node.js completa** (Backend em Express + Frontend em React/Vite), integrada via GitHub.

---

## 🛠️ 1. O que foi preparado no código para funcionar fora do AI Studio?

Para garantir a compatibilidade tanto no **AI Studio** quanto na **Hostinger (ou qualquer VPS/Hospedagem Node.js)**, configuramos o ecossistema ideal de produção:
1. **Servidor Express Isolado (`server.ts`)**: Um backend em Node.js de produção que serve os arquivos estáticos compilados do React (`dist/`) e oferece portas de escuta dinâmicas.
2. **Build Bundler (`package.json`)**: Configurado com `esbuild` para gerar um arquivo único e empacotado em `dist/server.cjs` para evitar erros de importação ES Modules no Node clássico da Hostinger.
3. **Persistência Segura**: O sistema de segurança e filtros de login mantém os dados sincronizados localmente (`localStorage`), garantindo que a escala do hospital rode rápido e resiliente.

---

## 📦 2. Configurações de Variáveis de Ambiente na Hostinger (Item 3)

Na Hostinger, ao configurar a sua aplicação Node.js pelo painel **hPanel**, você terá uma seção para definir as suas **Variáveis de Ambiente** (Environment Variables). 

Copie o modelo do arquivo `.env.example` e preencha as chaves diretamente no painel de administração da Hostinger:

| Variável | Valor Recomendado | Finalidade | Como extrair / Onde conseguir |
| :--- | :--- | :--- | :--- |
| **`NODE_ENV`** | `production` | Indica ao Node e ao Express para rodar em modo otimizado e seguro de alta performance. | Escrever manualmente. |
| **`PORT`**| `3000` (ou a porta fornecida pela Hostinger) | Porta interna que o servidor Express escutará. | Fornecido automaticamente pela Hostinger ou use `3000`. |
| **`GEMINI_API_KEY`** | *Sua chave de API do Gemini* | Chave se você integrar ou utilizar os recursos de inteligência artificial de escala automática ou assistente de escala. | Acesse o [Google AI Studio API Keys](https://aistudio.google.com/app/apikey), clique em **Create API Key** e copie o código secreto gerado. |

### Passo a passo para definir variáveis no hPanel da Hostinger:
1. Acesse o **hPanel da Hostinger** &rarr; [Painel Hostinger](https://hpanel.hostinger.com/).
2. Vá em **Hospedagem** > clique em **Gerenciar** no seu domínio.
3. No menu lateral esquerdo, pesquise por **Node.js** (em Avançado/Serviços).
4. Na seção da sua aplicação Node.js cadastrada, localize o campo **Variáveis de Ambiente** (Environment Variables).
5. Adicione as chaves (`GEMINI_API_KEY`, `NODE_ENV`, `PORT`) uma por uma com seus respectivos valores e clique em **Salvar/Aplicar**.

---

## 🔒 3. Autorização de Domínio no Firebase (Item 4)

Caso você utilize ou deseje integrar o **Firebase Authentication** futuramente no seu domínio próprio, você precisará liberar o seu domínio para que as requisições de login funcionem corretamente:

### Passo a Passo Direto:
1. Acesse o **Console do Firebase** &rarr; [Firebase Console](https://console.firebase.google.com/).
2. Selecione o projeto criado para o Hospital HNSR.
3. No menu lateral esquerdo, acesse **Authentication** &rarr; aba **Settings** (Configurações) na parte superior.
4. No submenu lateral dessa tela, selecione **Authorized domains** (Domínios autorizados).
5. Clique em **Add domain** (Adicionar Domínio).
6. Digite o seu domínio de publicação: `EnfermagemHNSR.milksistemas.com`.
7. Clique em **Add** (Adicionar). Pronto! O Firebase permitirá logins autorizados originados do seu site.

---

## 🔗 4. Sincronização via GitHub e Publicação Node.js na Hostinger

Para que a publicação seja automática e prática:

### Passo 1: Enviar para o GitHub
1. Crie um repositório privado ou público no seu GitHub &rarr; [GitHub](https://github.com/new).
2. Faça o push do seu código desenvolvido para o repositório.

### Passo 2: Configurar o Node.js no hPanel da Hostinger
1. No hPanel da Hostinger, acesse a ferramenta **Node.js**.
2. Conecte sua conta do GitHub ou configure o repositório Git para puxar o código do repositório HNSR.
3. Defina as seguintes diretrizes de inicialização no painel da Hostinger:
   - **Pasta de Origem / Root**: `/`
   - **Arquivo de Inicialização (Startup File)**: `dist/server.cjs` (Esse arquivo é gerado automaticamente no build completo)
   - **Pasta de Build/Saída**: `dist`
4. Na seção de scripts ou comandos NPM do painel da Hostinger, execute os passos de instalação de dependências e compilação:
   - Executar: **`npm install`** (Instala as dependências de backend e frontend)
   - Executar: **`npm run build`** (Compila os recursos do frontend React otimizado com o Vite e empacota o Express em `dist/server.cjs` via `esbuild`)
5. Clique em **Iniciar / Start Application**.

Pronto! Seu sistema de enfermagem estará escutando no site **EnfermagemHNSR.milksistemas.com** com segurança máxima, isolamento de rotas e desempenho profissional!
