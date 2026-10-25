# Próximas tarefas

Combinadas em 25/10/2026, para fazer em 26/10/2026.

## 1. Criar uma tarefa "Plano de Teste" no card do Azure ao criar o plano
Ao criar um plano no QA Hub ligado a um card do Azure (hoje `AB#86`), criar também um work item no Azure DevOps, filho desse card, representando o plano de teste.

- Reaproveita o que já existe em `web/lib/azure.ts`, que hoje cria o Bug como filho do card, com o PAT, na mesma área e sprint.
- **A decidir:**
  - tipo do work item: **Task** (mais provável) ou outro;
  - título (ex.: `Plano de Teste: <nome do plano>`) e o que vai na descrição (casos, link para o plano no QA Hub);
  - o que acontece com a tarefa quando o plano é renomeado, arquivado ou quando o card é trocado;
  - se planos ligados ao **Jira** também ganham algo equivalente.

## 2. Atualizar o status "Em andamento" quando todos os casos forem executados
Quando nenhum caso do run estiver pendente (todos com Passou, Falhou ou Bloqueado), o run deixa de aparecer como "em andamento" e passa a **concluído**, gravando a data de término no Kiwi (`stop_date`).

- **A decidir:**
  - se um caso voltar a pendente, o run reabre automaticamente?
  - a tarefa do item 1 no Azure também muda de estado (ex.: *Done* quando o run do plano termina)?

## 3. Novo formato das chaves dos cards
Trocar a forma de escrever e mostrar a ligação do card:

| Hoje | Novo |
|---|---|
| `AB#86` (Azure) | `azure-86` |
| `SHOP-86` (Jira) | `jira-86` |

- **Alcance:** chips, formulários, rastreabilidade, nome do bug criado no Azure e links registrados nas execuções.
- **A decidir:** o formato do Jira. As chaves do Jira incluem o projeto (`SHOP-86`); sem o prefixo do projeto, `jira-86` não basta para montar o link. Opções: `jira-SHOP-86`, ou `jira-86` com o projeto Jira fixo configurado no QA Hub.
- **Compatibilidade:** continuar aceitando `AB#86`, `SHOP-86` e o link colado do card. O que já está gravado no Kiwi (o campo `requirement` dos casos e o link do card no plano) passa a ser exibido no formato novo.
