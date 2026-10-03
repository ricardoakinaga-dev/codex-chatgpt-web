# Plano de execução — auditoria profunda 2026-09-30

## Objetivo

Avaliar o Codex ChatGPT Web 6.1.3, corrigir defeitos reproduzíveis de escopo controlado e entregar [relatório com notas 0–100](relatorio-auditoria-profunda-2026-09-30.md). Trata-se de auditoria brownfield com remediação localizada, não de certificação de produção.

## Contexto e limites

- Projeto: `/home/ricardo/codex-chatgpt-web`; HEAD inicial `18603c6`.
- Há alterações anteriores da correção de compactação e `.opencode/` não versionado: preservá-las.
- Runtime instalado em `~/.codex-chatgpt-web/versions/6.1.3-linux-x64`; testes devem usar diretórios e dados isolados.
- Não divulgar credenciais, modificar históricos reais, atualizar dependências sem avaliar compatibilidade ou reiniciar automaticamente tarefas do usuário.
- Execução por um único agente; separar inspeção, implementação e revisão final. Não apresentar essa revisão como independente.
- Evidências brutas desta auditoria: `/tmp/opencode/auditoria-profunda-2026-09-30/`; resultados anteriores são apenas contexto histórico.

## Critérios de aceitação e pontuação congelados

1. Cobrir arquitetura, API/roteamento, streaming, compactação, navegador/CDP, MCP/ferramentas, segurança, persistência, ciclo de vida, desempenho, observabilidade, UX/acessibilidade, testes, dependências e empacotamento/documentação.
2. Cada área recebe cinco subnotas: comportamento/correção (0–30), falhas/recuperação (0–25), verificação (0–20), operação/diagnóstico (0–15), manutenção/clareza (0–10). Soma = nota 0–100.
3. Notas são juízo técnico sustentado por evidências, não percentuais de cobertura nem probabilidades. Média geral aritmética; achados críticos não são compensados por média alta.
4. Todo achado material deve citar evidência, prioridade, confiança, impacto, estado e critério de encerramento. Separar confirmado, hipótese e não verificado.
5. Correções devem possuir reprodução discriminante, regressão adequada e diff revisado. Não diminuir limites de teste para produzir aprovação.
6. Registrar resultados reais de testes/typecheck/build/audit e limitações Linux/conta/rede. Um procedimento não executado não recebe PASS.

## Marcos e passos concretos

1. **Linha de base:** verificar instruções, estado Git, manifestos, CI, comandos e runtime; congelar critérios acima.
2. **Verificação sistêmica:** suíte Bun, suíte Node do launcher, ambos os typechecks, auditorias de dependências, versões, build e diagnóstico. Capturar saídas completas.
3. **Inspeção crítica:** seguir requisições até navegador/broker e volta; examinar concorrência, cancelamento, armazenamento, autorização, URLs, logs e UX. Reproduzir os achados em dados isolados.
4. **Remediação:** selecionar defeitos confirmados com alteração mínima e reversível; testar antes/depois, avaliar integração e documentar o que não será resolvido nesta rodada.
5. **Revisão e relatório:** revisar separadamente o diff, reexecutar checks afetados, pontuar cada área pela rubrica, registrar prioridades e limitações, entregar links.

## Progresso

- 2026-09-30: relatório iniciado com títulos; árvore de trabalho e manifestos inspecionados; nenhum AGENTS encontrado no projeto.
- Linha de base: 873 testes do núcleo e 369 do launcher aprovados; auditorias encontraram 7/25 alertas, com sobreposição entre grafos.
- Reprodução/remediação: seis defeitos de comportamento corrigidos; dependências atualizadas dentro das linhas principais existentes; reproduções negativas preservadas em evidências.
- Isolação CDP: uma reprodução em Chrome separado confirmou interferência de página não relacionada no bootstrap; achado permanece pendente.
- Revisão final: inspeção separada do diff identificou cancelamento não observado durante leitura HTTP; foi reproduzido e corrigido antes de repetir a verificação integral.
- Verificação final: `bun run verify`, 06:43:30–06:45:59 UTC, exit 0; 885/370 testes aprovados, 22/1 ignorados; ambos os audits zerados, builds/typechecks/smoke aprovados.
- Conferência final concluída: 15 áreas, subnotas/médias, contagens, timestamps de verificação e links do relatório validados; `git diff --check` passou.
- Próxima ação fora desta auditoria: preparar instalação controlada do candidato e remediação do bootstrap CDP. Nenhuma instalação/reinício adicional autorizado ou executado nesta auditoria.

## Recuperação

Ler este plano e o relatório, conferir `git status --short` e as evidências capturadas. Não confundir arquivos alterados na tarefa anterior com remediações desta auditoria. A instalação/reinício da tarefa anterior já ocorreu; a auditoria não herda autorização irrestrita para novos reinícios.

## Riscos e verificações pendentes

- Automação depende do DOM e do serviço ChatGPT externo; testes com mocks não provam robustez contra todas as mudanças de UI.
- Testes e métricas locais Linux não demonstram equivalência Windows/macOS.
- Desempenho deve ser medido com dados sintéticos; não usar carga concorrente sobre a conta real como benchmark.

## Resultados

Auditoria e remediação localizada concluídas, com achados pendentes explicitamente registrados. Nota média: 75,3 → 82,6/100; navegador/CDP permanece em 64/100. Os novos arquivos do projeto não foram instalados no runtime em execução. Fonte final de achados, notas, limites e próximos passos: relatório vinculado acima.
