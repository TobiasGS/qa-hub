# QA Hub

Interface moderna para o time de QA sobre o **Kiwi TCMS**. O Kiwi continua sendo o "motor" (banco, regras, integração com Jira/Azure Boards, recebimento do Cypress). O QA Hub é só um front que conversa com a API JSON-RPC dele.

```
navegador ──► QA Hub (Next.js, qa.seu-dominio.com)
                 │  BFF: rotas /api/* guardam a sessão do Kiwi num cookie cifrado
                 ▼
              Kiwi TCMS (Docker, kiwi.seu-dominio.com via Cloudflare Tunnel) ──► Jira / Azure Boards
                 ▲
              Azure Pipelines: Cypress → junit.xml → tcms-junit.xml-plugin
```

**O que tem:**
- **Dashboard:** filtro por projeto, taxa de sucesso (por build ou por semana), tempo médio por caso, tabela "Por projeto", progresso dos runs, casos que mais falham e bugs recentes.
- **Planos:** organizados em seções por **projeto** (com filtro); criar com Projeto (ou "+ Projeto"), Tipo Manual/Automatizado e card do épico/feature; editar, arquivar e restaurar.
- **Casos:** criar, editar, desativar e remover do plano, cada um ligado a um ou mais cards do Jira/Azure (`SHOP-101, AB#55`).
- **Runs:**
  - criar a partir do plano, escolhendo build (ou criando uma nova), casos e quem testa cada um;
  - **Re-testar falhas**, que cria um run só com o que falhou ou ficou bloqueado;
  - filtros por plano, build e situação.
- **Meus testes:** o que está pendente para quem está logado, com aviso no dashboard.
- **Execução manual:**
  - atalhos de teclado (`P` passou, `F` falhou, `B` bloqueado, `C` comentário, `J`/`K` navegar, `Espaço` pausar/retomar);
  - **cronômetro** que começa ao abrir o caso, com pausa e **histórico** de tempo e re-testes;
  - **evidências**: prints, imagens, vídeos de até 100 MB, PDF, logs e HAR, com arrastar e soltar, miniaturas e player;
  - botão **Abrir bug**: com card do Azure no plano, o bug nasce no Azure DevOps como **filho do card**, na mesma sprint.
- **Matriz de rastreabilidade:** card (história do Jira/Azure) → casos → último resultado → bugs.

**Por que um front separado em vez de mexer no layout do Kiwi:** as atualizações do Kiwi continuam simples, sem conflitos de template. O QA Hub só chama a API, então não é obra derivada sob a GPL do Kiwi. A UI original fica disponível para a administração.

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `docker-compose.yml` | Kiwi + MariaDB, e o `cloudflared` opcional (profile `tunnel`) |
| `web/` | QA Hub (Next.js 15, Tailwind 4, Recharts) |
| `web/lib/kiwi/` | `rpc.ts` (cliente real), `mock.ts` (dados de exemplo), `types.ts` (contrato) |
| `scripts/` | `seed.mjs` (dados de exemplo no Kiwi) e `kiwi-inspect.mjs` (confere métodos e campos) |
| `ci/` | pipeline do Azure, config do Cypress e um `sample-junit.xml` |

---

## 1. Pré-requisito: Docker

O Kiwi roda em Docker. No Windows:

1. Num PowerShell **como administrador**, rode o comando abaixo e reinicie o PC:
   ```bash
   wsl --install
   ```
2. Instale o [Docker Desktop](https://www.docker.com/products/docker-desktop/) (gratuito para uso pessoal e para empresas pequenas; confira a licença no site).

A máquina que roda o Kiwi precisa ficar ligada para o time acessar. Quando quiserem o Kiwi no ar 24 horas, o mesmo `docker-compose.yml` roda numa VM (Oracle Cloud Always Free ou uma VPS barata).

## 2. Subir o Kiwi

```bash
cp .env.example .env
```
Edite o `.env` e troque as senhas do banco. Depois:

```bash
docker compose up -d --build
```

```bash
docker compose exec web /Kiwi/manage.py initial_setup
```

O `up` sobe o banco, o Kiwi e o QA Hub (container `qa-hub`, configurado por `web/.env.production.local`). O `initial_setup` cria as tabelas, preenche as permissões padrão dos grupos (Administrator e Tester), configura o domínio e pede o superusuário.

**Rodou só `manage.py migrate` em vez do `initial_setup`?** Complete com os comandos abaixo. Sem eles, o grupo Tester fica sem nenhuma permissão, e usuários desse grupo veem "Application error" no QA Hub logo depois do login.

```bash
docker compose exec web /Kiwi/manage.py refresh_permissions
```

```bash
docker compose exec web /Kiwi/manage.py set_domain kiwi.seu-dominio.com
```

O QA Hub também precisa que o grupo Tester possa **ver a lista de usuários**, para escolher responsáveis e criar runs. No admin do Kiwi: *Groups → Tester →* adicione a permissão `auth | user | Can view user`.

Depois disso:
- o Kiwi abre em **https://localhost:8443** (o certificado é autoassinado; aceite o aviso do navegador);
- o QA Hub abre em **http://localhost:3000**, com login pelo usuário do Kiwi.

**Fixe a versão:** só a tag `latest` do Kiwi é pública. Depois do primeiro pull, rode:
```bash
docker inspect kiwitcms/kiwi:latest --format "{{index .RepoDigests 0}}"
```
Coloque o resultado em `KIWI_IMAGE=` no `.env`. Assim um `docker compose pull` não atualiza o Kiwi sem você querer.

### Configuração inicial no Kiwi (admin)

1. **Admin → Sites:** troque `example.com` por `kiwi.seu-dominio.com` (ou `localhost` em dev). Os links dos e-mails e dos bugs usam esse domínio.
2. **Usuários:** crie um usuário por testador e um técnico para o CI (ex.: `ci-bot`).
3. **Bug tracker:** em **Admin → Test cases → Bug trackers → Add**:
   - **Jira:** tipo `JIRA`, Base URL `https://sua-empresa.atlassian.net`, API username = seu e-mail, API password = um [API token do Jira](https://id.atlassian.com/manage-profile/security/api-tokens).
   - **Azure Boards:** tipo `Azure Boards`, API password = um PAT com permissão de Work Items (leitura e escrita). Na Base URL:
     - **nuvem:** `https://dev.azure.com/<org>/<projeto>`;
     - **Azure DevOps Server (on-premises):** `https://<servidor>/tfs/<coleção>/<projeto>`. Aqui o servidor do Kiwi precisa alcançar esse endereço na rede, e o certificado HTTPS precisa ser válido para ele.
   - O número na URL do bug tracker é o `KIWI_BUG_TRACKER_ID` do QA Hub.

   Quem cadastra os tokens é você, com as suas credenciais.

### Dados de exemplo e conferência da API

Os scripts usam Node 20+ e não têm dependências.

```bash
KIWI_USER=admin KIWI_PASSWORD=... NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/seed.mjs
```

```bash
KIWI_USER=admin KIWI_PASSWORD=... NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/kiwi-inspect.mjs
```

O `kiwi-inspect` lista os métodos e campos que o QA Hub usa e aponta o que mudou. Rode de novo a cada atualização do Kiwi. (`NODE_TLS_REJECT_UNAUTHORIZED=0` serve só para o certificado autoassinado local. Contra `https://kiwi.seu-dominio.com`, tire essa variável.)

No PowerShell, defina as variáveis antes do comando, por exemplo `$env:KIWI_USER="admin"`.

## 3. Rodar o QA Hub

```bash
cd web
```

```bash
npm install
```

```bash
npm run dev
```

Crie o `web/.env.local` a partir do `web/.env.example`. Com `KIWI_MODE=mock`, o QA Hub sobe com **dados de exemplo em memória**: qualquer usuário entra, e dá para mostrar ao time antes de o Kiwi estar no ar. Para usar o Kiwi de verdade:

```
KIWI_MODE=real
KIWI_URL=https://localhost
NODE_TLS_REJECT_UNAUTHORIZED=0   # só em dev, por causa do certificado local
```

Cada pessoa entra com o **próprio usuário do Kiwi**, então cada execução fica registrada em nome de quem testou.

### Cards do Jira/Azure

No formulário do caso, o campo **Cards do Jira/Azure** aceita uma ou mais chaves separadas por vírgula. Elas ficam gravadas no campo `requirement` do caso no Kiwi.

- **Jira:** `SHOP-123` vira link pelo `REQUIREMENT_URL_JIRA`.
- **Azure Boards:** `AB#456` vira link pelo `REQUIREMENT_URL_AZURE` (o `{key}` recebe só o número).

Também dá para **colar o link do card**: ao sair do campo, ele vira a chave. Por exemplo, o link do quadro da sprint `…/_sprints/taskboard/…?workitem=86` (ou `…/_workitems/edit/86`) vira `AB#86`, e `…/browse/SHOP-1` vira `SHOP-1`.

**Azure DevOps Server (on-premises):** o modelo de link é `https://<servidor>/tfs/<coleção>/<projeto>/_workitems/edit/{key}`. Neste projeto ele já está configurado para `https://<servidor>/tfs/<coleção>/<projeto>/_workitems/edit/{key}`.

Um caso com duas chaves aparece nos dois requisitos da rastreabilidade. O plano também pode apontar para o épico/feature (uma chave ou uma URL, no campo `extra_link`). O QA Hub não consulta o Jira nem o Azure; ele só monta os links, então não precisa de token deles.

### Projetos e tipo do plano

No Kiwi, "Projeto" é o **Product**. No "Novo plano", escolha o projeto na lista ou use **+ Projeto…** para criar um novo. O QA Hub cria o Product com a classificação "Projetos" e garante a versão "unspecified" e a categoria padrão. O Kiwi exige uma versão em todo plano; como o QA Hub não usa versões, cada projeto fica com uma só, a "unspecified", que não aparece na tela.

O **Tipo** tem duas opções: **Manual** ou **Automatizado**. Elas viram os PlanTypes "Manual" e "Automatizado" no Kiwi, criados na primeira vez que forem usados. O tempo médio do dashboard considera só os planos manuais, porque os testes automáticos levam segundos e distorceriam a média.

### Bugs no Azure DevOps (filho do card)

Quando o **card do plano** é do Azure (`AB#86`), o "Abrir bug" da execução cria o Bug direto no Azure DevOps:
- como **filho** do card (aparece embaixo da história no taskboard), na mesma **área e sprint**;
- com título, severidade e observações escolhidos no diálogo;
- com os **Repro Steps** montados sozinhos: passos do caso, comentários da execução, links das evidências, run, build, testador e um link de volta para a execução no QA Hub.

O link `AB#<novo>` fica gravado como defeito na execução do Kiwi, e por isso aparece no dashboard e na rastreabilidade. Plano com card do Jira, ou sem card, continua abrindo o bug pelo bug tracker do Kiwi.

**Para ligar:**
1. No Azure DevOps, clique no seu avatar → **Personal access tokens** → **New Token**, com o escopo **Work Items: Read & Write**.
2. No `web/.env.local`, coloque `AZURE_DEVOPS_PAT=<token>`. A URL já está em `AZURE_DEVOPS_URL`. Em produção, use `npx wrangler secret put AZURE_DEVOPS_PAT`.
3. Se o seu processo for o **Basic**, troque `AZURE_BUG_TYPE` para `Issue`.

**Rede:** quem chama o Azure é o servidor do QA Hub. Rodando no seu PC, dentro da rede da empresa, funciona. No Cloudflare Workers, só funciona se `<servidor-do-azure-devops>` for acessível pela internet. Se não for, rode o QA Hub dentro da rede (por exemplo, na mesma máquina do Kiwi, publicado pelo Tunnel).

Sem PAT, o diálogo explica o que falta e o botão fica desabilitado. O QA Hub nunca inventa um número de bug, porque ele viraria um link quebrado no Azure. Se o card do plano não puder ser lido (por rede, PAT ou permissão), o diálogo mostra o erro do Azure e também não deixa criar o bug.

### Cronômetro e histórico

- **Começo e pausas:** o cronômetro começa sozinho ao abrir um caso pendente (depois de 1,5 s no caso, para que navegar rápido com `J`/`K` não registre nada). Ele pausa ao trocar de caso, ao esconder a aba ou ao fechar a página, e retoma ao voltar. `Espaço` pausa e retoma.
- **Onde fica o tempo:** ao registrar o resultado, o tempo **efetivo** (sem as pausas) fica gravado na própria execução do Kiwi: `stop_date − start_date`. Por isso o dashboard calcula o tempo médio sem chamadas extras.
- **Linha do tempo:** início, pausas, retomadas e fim viram comentários legíveis na execução, como `⏱ Pausado · 4min 12s`.
- **Histórico:** o painel "Histórico de execuções e tempo" mostra as últimas 10 tentativas do caso (o run original e os re-testes), com resultado, testador, tempo e as pausas.

### Perfis e visibilidade

Cada pessoa vê no QA Hub o que **criou** mais o que foi **atribuído** a ela:

| Item | Aparece quando… | Pode editar quando… |
|---|---|---|
| Run | ela é o manager ou o testador padrão, tem execução atribuída, ou o run é de um plano dela | — (executa se pode ver) |
| Plano | ela é a autora, ou tem algum run visível nele | é a autora |
| Caso | está num plano visível, ou ela é a autora | é autora do caso ou do plano |
| Projeto | ela criou pelo "+ Projeto", ou tem plano visível nele | — |

- **Plano compartilhado:** um plano de outra pessoa que aparece só por atribuição vem com o selo **"Compartilhado comigo · só leitura"**. Dá para executar os casos atribuídos, mas não editar, arquivar, criar caso, clonar ou criar run.
- **Admin:** quem é **superusuário no Kiwi** vê tudo. No topo há o seletor **Tudo / Só os meus**, para ver como um usuário comum.
- **Bloqueio no servidor:** a regra também vale para links e para a API. Abrir pela URL um plano ou run que não é seu dá "não encontrado", e tentar alterar dá erro 403.
- **Dono do projeto:** o Kiwi não registra quem criou um projeto (Product). O QA Hub grava `[qahub-owner:<usuário>]` na descrição dele. Projetos antigos, sem essa marca, aparecem só pelos planos.
- **O admin do Kiwi** (`kiwi.seu-dominio.com`) mostra tudo para quem tem acesso a ele. Deixe essa aplicação liberada só para administradores no Cloudflare Access.

### Arquivar em vez de excluir

A API do Kiwi não apaga planos. Apagar casos destruiria o histórico de execuções, que é a base do dashboard. Por isso:
- **Plano:** **Arquivar** (some da lista; "Mostrar arquivados" e **Restaurar** trazem de volta).
- **Caso:** **Desativar** (sai dos novos runs e da rastreabilidade) ou **Remover do plano** (o caso continua existindo).

A exclusão definitiva, se for mesmo necessária, é feita no admin do Kiwi.

### Evidências

Na tela de execução, **Anexar** (ou arrastar arquivos) envia prints, imagens, vídeos (mp4, webm, mov, até 100 MB), PDF, txt, log e HAR (até 20 MB). O arquivo fica no armazenamento do QA Hub. Na execução do Kiwi fica um link "Evidência: nome.png", que só abre para quem está logado no QA Hub.

- **Em dev** (`EVIDENCE_STORAGE=local`): os arquivos vão para `web/.evidence/`, que fica fora do git.
- **Em produção** (`EVIDENCE_STORAGE=r2`): vão para o Cloudflare R2 (gratuito até 10 GB). Veja a seção 4.

## 4. Publicar neste PC (Kiwi real em kiwi.seu-dominio.com, QA Hub em qa.seu-dominio.com)

Tudo roda no Docker deste PC (`db`, `web` = Kiwi, `qa-hub`), com `restart: unless-stopped`. Quem publica os dois endereços é o **serviço cloudflared do Windows**, que já está instalado e conectado a um Tunnel.

**Uma vez só:**
1. **Docker:** num PowerShell **como administrador**, rode `wsl --install` e reinicie o PC. Depois rode `winget install Docker.DockerDesktop` e, nas configurações do Docker Desktop, ligue **Start Docker Desktop when you sign in**.
2. **Subir tudo:** `docker compose up -d --build`, depois `docker compose exec web /Kiwi/manage.py initial_setup` para criar o seu administrador.
3. **Cloudflare, Tunnel:** em Zero Trust → Networks → Tunnels → o tunnel **conectado a este PC** → Public Hostname → Add:
   - `qa.seu-dominio.com` → Type `HTTP` → URL `localhost:3000`;
   - `kiwi.seu-dominio.com` → Type `HTTPS` → URL `localhost:8443` → Additional application settings → TLS → **No TLS Verify** ligado.
4. **Cloudflare, Access:** em Zero Trust → Access → Applications → Add → Self-hosted, crie uma aplicação para `qa.seu-dominio.com` e outra para `kiwi.seu-dominio.com`, cada uma com uma política **Allow** → Include → Emails → o seu e-mail. O login passa a ser por um código enviado ao e-mail.

**No dia a dia (depois de ligar o PC):**
1. Entre no Windows normalmente.
2. Na pasta do projeto, dê **dois cliques em `Iniciar QA Hub.cmd`**.
3. Espere a janela mostrar **"Tudo no ar!"** (leva de 40 segundos a 2 minutos). O navegador abre sozinho no endereço público.

O iniciador (`scripts\iniciar.ps1`) faz e confere quatro coisas:
1. **Docker:** abre o Docker Desktop se ele estiver fechado.
2. **Containers:** sobe o banco, o Kiwi e o QA Hub e espera os três ficarem saudáveis.
3. **Tunnel:** confere o serviço `cloudflared` do Windows (ele já inicia sozinho com o PC).
4. **Acesso:** testa o QA Hub no próprio PC e o endereço público. O endereço é lido de `QA_HUB_URL` no `web/.env.production.local`.

Se algo der errado, a janela mostra `[!!]` com o que fazer. Com o PC desligado ou o Docker fechado, o site fica fora do ar.

**Para não precisar nem do clique:** em Docker Desktop → *Settings* → *General*, ligue **Start Docker Desktop when you sign in**. Os containers voltam sozinhos quando o Docker abre, porque usam `restart: unless-stopped`.

**Ao desligar o PC:** não precisa fazer nada; os dados ficam no banco (volume do Docker). Para parar tudo antes, rode `docker compose stop` na pasta do projeto.

**Atualizar o QA Hub** depois de mudar o código:

```bash
docker compose up -d --build qa-hub
```

**Backup:** os dados reais ficam no volume `db_data` (o banco) e `evidence` (os prints e vídeos).

```bash
powershell -ExecutionPolicy Bypass -File scripts\backup.ps1
```

Isso gera `backups\kiwi-AAAA-MM-DD_HHmm.sql` e guarda os 14 mais recentes. Para rodar todo dia, crie uma tarefa no Agendador de Tarefas do Windows com esse comando, na pasta do projeto. Para restaurar (substitui os dados atuais):

```bash
powershell -ExecutionPolicy Bypass -File scripts\restore.ps1 backups\kiwi-2026-10-25_1200.sql
```

**Desenvolver sem mexer nos dados reais:** o container usa a porta 3000. Para o modo de exemplo em dev, rode `npm run dev -- -p 3001` dentro de `web/` (usa o `web/.env.local`, com `KIWI_MODE=mock`).

**Mudar para uma VPS no futuro:** faça o backup, suba o mesmo compose na VPS, restaure o `.sql` e aponte os hostnames do Tunnel para a VPS (ou use `docker compose --profile tunnel up -d` com o token do Tunnel no `.env`).

## 4b. Alternativa: VPS ou QA Hub no Cloudflare Workers

Use esta seção só se **não** for rodar neste PC (seção 4): por exemplo, numa VPS sem o serviço cloudflared do Windows, ou com o QA Hub no Workers (que só faz sentido com o Kiwi real acessível pela internet).

### Kiwi em kiwi.seu-dominio.com (Cloudflare Tunnel)

1. No painel do Cloudflare: **Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared**. Dê o nome `kiwi` e copie o token.
2. Em **Public Hostname**: hostname `kiwi.seu-dominio.com`, service `HTTPS` → `web:8443`. Em **Additional settings → TLS**, ligue **No TLS Verify** (o certificado interno do Kiwi é autoassinado; o público é do Cloudflare).
3. Coloque o token em `CLOUDFLARE_TUNNEL_TOKEN=` no `.env` e suba:
   ```bash
   docker compose --profile tunnel up -d
   ```

### QA Hub em qa.seu-dominio.com (Cloudflare Workers)

```bash
cd web
```

```bash
npx wrangler login
```

```bash
npx wrangler secret put SESSION_SECRET
```

```bash
npm run cf:deploy
```

Antes do primeiro deploy, crie o bucket das evidências:

```bash
npx wrangler r2 bucket create qa-hub-evidence
```

As variáveis públicas (`KIWI_URL`, `KIWI_BUG_TRACKER_ID`, `REQUIREMENT_URL_JIRA`, `REQUIREMENT_URL_AZURE`, `EVIDENCE_STORAGE`, `QA_HUB_URL`) estão em `web/wrangler.jsonc`. Troque o `<org>/<projeto>` do Azure por seus valores. O bucket está ligado como `EVIDENCE`, e a rota `qa.seu-dominio.com` já vem configurada como custom domain. Depois do deploy, confira se o selo "dados de exemplo" **não** aparece no topo; se aparecer, o `KIWI_MODE=mock` do seu `.env.local` entrou no build, e é preciso rodar o deploy sem ele. Se o `npm` tiver bloqueado o script de instalação do `workerd`, libere com `npm install-scripts approve workerd` antes do `cf:preview`.

### Proteção com Cloudflare Access (recomendado)

Em **Zero Trust → Access → Applications**, crie uma aplicação self-hosted para `qa.seu-dominio.com` e outra para `kiwi.seu-dominio.com`, com uma política *Allow* para os e-mails do time. É gratuito para até 50 usuários.

Para o Kiwi, adicione uma política **Bypass** nos caminhos `kiwi.seu-dominio.com/json-rpc/` e `kiwi.seu-dominio.com/xml-rpc/`. O QA Hub e o plugin do CI chamam a API por esses caminhos, e eles continuam exigindo usuário e senha do Kiwi. Se preferir travar a API também, crie um **Service Token** e configure `CF_ACCESS_CLIENT_ID`/`CF_ACCESS_CLIENT_SECRET` no QA Hub. O plugin do CI não envia esses cabeçalhos, então nesse caso o CI precisaria rodar numa rede liberada.

## 5. Cypress no Azure Pipelines

1. No projeto Cypress, rode `npm i -D mocha-junit-reporter junit-report-merger` e copie o trecho de `ci/cypress.config.example.js`.
2. No Azure DevOps, crie o variable group `kiwi-tcms` com `KIWI_USER` e `KIWI_PASSWORD` (marcada como secreta).
3. Use `ci/azure-pipelines.cypress.yml` como base.

Cada execução do pipeline vira um **TestRun** no Kiwi, com a build `$(Build.BuildNumber)`, e aparece sozinha no dashboard do QA Hub. Para testar o envio sem pipeline:

```bash
pip install kiwitcms-junit.xml-plugin
```

```bash
TCMS_PRODUCT="Loja Web" TCMS_PRODUCT_VERSION=1.x TCMS_BUILD=teste-local tcms-junit.xml-plugin ci/sample-junit.xml
```

O plugin lê a URL e as credenciais de `~/.tcms.conf`. O modelo está no passo do pipeline.

O plugin identifica cada caso pelo título (`classname.name`) e cria o caso no Kiwi na primeira vez. Se você renomear um `describe`/`it`, ele vira um caso novo.

## Custos

Tudo aqui é gratuito: Kiwi (GPLv2), MariaDB, Cloudflare Tunnel, Workers e Access (até 50 usuários) e o Azure Pipelines (1.800 min/mês em projetos privados). O **Azure Test Plans**, que seria a alternativa nativa do Azure DevOps, é pago (licença Basic + Test Plans por usuário).

## Limitações conhecidas

- **Evidências:** o limite de 100 MB por vídeo vem do tamanho máximo de requisição do Cloudflare Workers no plano gratuito. Para vídeos maiores, comprima ou corte antes de enviar.
- **Abrir bug** usa `Bug.report` do Kiwi. Para trackers em que o Kiwi não cria a issue pela API, ele devolve um link de "nova issue" pré-preenchida, que abre numa aba nova. O link "vincular um bug existente" é a alternativa manual.
- No modo `mock`, os dados ficam na memória e voltam ao estado inicial quando o servidor reinicia.
- Os nomes de métodos e campos da API foram escritos com base na documentação do Kiwi e conferidos no modo mock. Rode o `kiwi-inspect` assim que o Kiwi real subir.

## Licença

Código do QA Hub sob a licença [MIT](LICENSE). O Kiwi TCMS, usado como serviço separado via API, tem a licença própria dele (GPLv2).
