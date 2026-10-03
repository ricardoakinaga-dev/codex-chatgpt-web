# Estabilização do compositor e redução de latência

## Objetivo e estado recuperado

Eliminar falhas recuperáveis antes do envio, isolar a aquisição CDP da aba proprietária e reduzir esperas comprovadamente evitáveis. Preservar as alterações da auditoria anterior; o runtime instalado ainda não contém essas correções. Logs confirmam `chatgpt_composer_unavailable` após ~60 s, sem mensagens/enviou na aba; a auditoria reproduziu interferência de renderers não relacionados no bootstrap CDP.

## Contratos de aceitação

1. Aba não relacionada bloqueada não pode atrasar a conexão à aba proprietária nem ser manipulada por essa conexão.
2. Recuperação automática do compositor ocorre no máximo uma vez e somente no chat novo sem mensagens, antes de Send. Histórico existente, ambiguidade, autenticação, quota e cancelamento não podem causar replay.
3. Todas as esperas de preparação devem respeitar o AbortSignal e orçamento limitado; caminho saudável retorna imediatamente, sem atraso artificial.
4. Latência comparada no mesmo cenário isolado, com tempo de conexão e recuperação registrado. Não prometer limite sobre geração/quotas do ChatGPT.
5. Typechecks, regressão afetada, verificação integrada e fluxo real devem passar antes de concluir. Registrar restrições da evidência.
6. Instalação deve incluir backup e verificar os arquivos/revisão carregados. Se houver tarefa ativa, obter decisão para interrupção antes de reiniciar.

## Desenho mínimo

- Usar transporte público `ConnectOverCDPTransport` do Playwright; restringir auto-attach CDP ao `targetId` já publicado pelo launcher (`Target.autoAttachRelated`), preservando frames/workers filhos e conexão independente por proprietário. Não usar campos privados do Playwright nem conexão compartilhada entre tarefas.
- Recuperar apenas a preparação de chat vazio: janela curta de hidratação inicial, alerta/autenticação verificados, uma recarga limitada, nova prova do compositor. Não ampliar seletores para qualquer textarea.
- Avaliar transporte multipart adaptativo somente se os contratos atuais permitirem demonstrar preservação integral do contexto; caso contrário, manter a regra e informar a latência residual.

## Passos e progresso

1. Diagnóstico: árvore Git e runtime reconciliados; diagnósticos de falha mostram zero compositores reconhecidos e zero mensagens. A página principal atual está responsiva.
2. Criar reproduções discriminantes de CDP isolado e preparação/cancelamento/ambiguidade.
3. Implementar, medir, revisar separadamente e executar regressões.
4. Gerar runtime, instalar com backup em janela autorizada, verificar health/doctor e operação real.

## Limitações e recuperação

Não alterar tarefas/históricos reais para benchmarks. O ChatGPT externo pode mudar DOM, limitar a conta ou falhar; a correção deve diferenciar esses casos de um erro recuperável de bootstrap. Uma retomada desta sessão deve ler este plano, conferir status Git e os testes/evidências atuais antes de continuar. Evidências locais: `/tmp/opencode/estabilizacao-2026-09-30/`.

## Resultado

Concluído no ambiente Linux instalado, com evidência limitada aos cenários abaixo.

- CDP: teste com renderer não relacionado bloqueado passou; aquisição final registrada em 11 ms, contra timeout de 1.500 ms no cenário anterior. Sessões independentes e frames filhos foram exercitados.
- Compositor: uma recuperação pré-envio em chat vazio; cancelamento, conversa não vazia, ambiguidade e sessão expirada impedem recarga/replay.
- Autenticação: o primeiro teste real revelou a página pública sem usuário/token em `/api/auth/session`. O usuário entrou novamente; a sessão foi confirmada válida. A página pública agora produz `chatgpt_sign_in_required`, sem esperar a hidratação do compositor da conta.
- Foco: o primeiro pacote com `noDefaults` revelou uma regressão de teclado em segundo plano. A reprodução mostrou slider parado; emulação de foco apenas no alvo proprietário resolveu o caso. Essa correção integra o pacote final.
- Latência: compactação adaptativa 1/2/6 partes, sem aparar histórico para caber em uma mensagem. Casos pequenos eliminam cinco acknowledgements; casos grandes continuam completos.
- Verificação final: `bun run verify`, 16:21:39–16:24:08 UTC, exit 0; 897 testes do núcleo e 370 do launcher aprovados, 22/1 ignorados, zero falhas. Typechecks, audits, builds e smoke relocável passaram.
- Pacote final: AppImage passou no gate ABI/libnotify e smoke de inicialização em perfil separado. O primeiro empacotamento sem o toolset próprio foi rejeitado pelo gate e refeito; não foi instalado.
- Instalação autorizada pelo usuário: launcher e runtime completos atualizados, incluindo correções da auditoria anterior. Hashes conferidos; pacote embarcado e runtime instalado têm o mesmo bundleId `80dccd346f0c44724b3a89028692da4c75549f4e8aaac9d197b7e1de9a57e57a`.
- Backup final: `~/.codex-chatgpt-web/backups/estabilidade-2026-09-30T16-25-35.770Z`.
- Runtime: novo daemon pid 673534, launcher pid 672259; health aceita turnos, doctor `ok=true`, navegador autenticado, túnel saudável. Audit do runtime instalado: zero alertas em 108 pacotes.
- Dois testes reais consecutivos de compactação: HTTP 200, marcador/contexto preservado, 16.113 ms e 16.017 ms.

### Limitações e próxima ação

Esses tempos são duas amostras de contextos pequenos, não SLA de geração nem garantia de todas as condições futuras do ChatGPT. Quotas, rede e mudanças de UI externas continuam podendo exigir intervenção. O fluxo completo de ferramentas em uma tarefa real do usuário não foi certificado por esses testes de compactação; os contratos MCP têm regressão automatizada e o doctor mantém o aviso de verificação do conector.

A revisão local permanece sem commit/push. A AppImage instalada contém o runtime corrigido, evitando que a reabertura restaure o pacote antigo. Próxima ação do usuário: retomar a mesma conversa com uma nova instrução, como “continue de onde parou”.
