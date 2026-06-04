# 🚀 Guia de Implantação Hospital HNSR na Hostinger

Este documento contém todas as instruções necessárias para publicar com sucesso o sistema de escalas e folgas do Hospital HNSR na sua hospedagem **Hostinger**.

---

## 🛠️ O que foi preparado no sistema para a Hostinger?

1. **Configuração de Rotas (.htaccess)**: Para evitar erros `404 - Not Found` ao recarregar a página ou navegar por links internos da SPA, foi criado o arquivo `public/.htaccess`. Ele é copiado automaticamente para a pasta de build (`dist/`) e ensina os servidores Apache da Hostinger a direcionar as requisições para o arquivo `index.html`.
2. **Compactação de Build**: Os arquivos gerados são otimizados pelo Vite e minimizados com CSS/JS ideais para carregar instantaneamente, mesmo em conexões móveis dentro do hospital.

---

## 📂 Como publicar na Hostinger (Passo a Passo)

A Hostinger aceita hospedagem de sites estáticos (React SPAs) diretamente no plano de Hospedagem Compartilhada ou Cloud. Siga os passos abaixo:

### Passo 1: Gerar a pasta de publicação (Build)
1. No seu computador, abra o terminal na pasta do projeto.
2. Certifique-se de ter as dependências instaladas rodando:
   ```bash
   npm install
   ```
3. Execute o comando de compilação:
   ```bash
   npm run build
   ```
4. Esse comando criará uma pasta chamada **`dist/`** na raiz do projeto. Esta pasta contém todos os arquivos otimizados (HTML, CSS, JavaScript e o arquivo `.htaccess`).

---

### Passo 2: Fazer o Upload para a Hostinger
Você tem **duas formas** de enviar os arquivos para a Hostinger:

#### Opção A: Pelo Gerenciador de Arquivos da Hostinger (Recomendado & Mais Rápido)
1. Acesse o painel ** hPanel** da Hostinger.
2. Vá em **Hospedagem** > Clique em **Gerenciar** ao lado do seu domínio.
3. No menu lateral ou na barra de busca, ache o **Gerenciador de Arquivos** (File Manager).
4. Entre na pasta **`public_html`** (esta é a raiz do seu site).
5. Se houver algum arquivo padrão (`default.html` ou similar), exclua-o.
6. Abra a pasta **`dist/`** no seu computador local.
7. Selecione **todos os arquivos e pastas** dentro de `dist/` (incluindo o arquivo `.htaccess`, a pasta `assets` e o `index.html`) e arraste-os para dentro da pasta `public_html` no Gerenciador de Arquivos da Hostinger.

---

#### Opção B: Por um cliente FTP (como FileZilla)
1. No painel da Hostinger, localize os seus dados de **Acesso FTP** (Host FTP, Usuário, Porta de Conexão e Senha).
2. Abra o **FileZilla** ou seu cliente FTP favorito e conecte-se ao servidor.
3. No painel esquerdo (seu computador), acesse a pasta **`dist/`** do projeto.
4. No painel direito (servidor), acesse a pasta **`public_html`**.
5. Arraste e solte todos os arquivos da pasta local `dist/` para dentro da pasta do servidor `public_html`.

---

## ✅ Verificação e Conclusão
Após enviar todos os arquivos, limpe o cache do seu navegador e acesse o seu domínio (ex: `seudominio.com.br`). O sistema de escala, controle de férias, atestados e bancos de horas do Hospital HNSR estará ativo e rodando 100% online!

---

### 💡 Recomendações Importantes
- **Persistência de Dados**: O sistema usa o banco de dados dinâmico via `localStorage` do navegador, o que significa que as escalas e modificações criadas são salvas com segurança no navegador do usuário administrador da escala, funcionando offline de forma extremamente resiliente.
- **Backup**: Você pode exportar as escalas para CSV e fazer backup com as ferramentas de limpeza ou redefinição dentro da página de gerenciamento de usuários.
