# Auditoria profunda — Codex ChatGPT Web

> **Evolução posterior à auditoria:** a tarefa de estabilização instalou o pacote completo corrigido e tratou o bootstrap CDP, foco e transporte de compactação. Consulte [os resultados da estabilização](estabilizacao-plano-2026-09-30.md). As notas e afirmações de implantação abaixo registram o estado histórico desta auditoria, não uma nova avaliação do pacote posteriormente instalado.

## Resumo executivo

**Data:** 30/09/2026. **Versão:** 6.1.3, base Git `18603c6`, com alterações locais preservadas. **Ambiente de execução:** Linux, Bun 1.4.0.

**Nota geral inicial: 75,3/100. Nota do código após as correções desta auditoria: 82,6/100.** São médias das 15 áreas abaixo, não percentuais de cobertura, disponibilidade ou ausência de bugs.

O programa possui uma base de testes extensa e controles cuidadosos de autorização, identidade de tarefa, cancelamento e entrega de ferramentas. Os maiores problemas estão na **isolação da conexão com o navegador**, no custo da compactação em múltiplas mensagens e na concentração de responsabilidades em arquivos grandes.

Nesta rodada foram corrigidos **seis defeitos de comportamento**, além dos alertas de dependências:

1. Falha inicial de IPC que deixava a interface carregando indefinidamente.
2. Limites HTTP aplicados tarde demais, depois da leitura/descompressão completa.
3. Leitura HTTP que podia continuar esperando bytes depois do cancelamento da requisição.
4. Contabilidade de armazenamento que confundia caracteres com bytes UTF-8.
5. Perda de eventos `undefined` na fila genérica.
6. Diagnóstico que confundia navegador ocupado com indisponível.

As auditorias do projeto passaram de **7 alertas no núcleo e 25 no launcher para zero alertas** nos respectivos grafos verificados. Existem avisos repetidos entre os grafos; esses números não representam 32 vulnerabilidades únicas nem 32 explorações comprovadas.

**Verificação integrada:** `bun run verify` terminou com código **0**. Foram **1.255 testes aprovados**, **23 ignorados** e **nenhuma falha** entre núcleo e launcher. Também passaram os typechecks, builds, verificações de versão e smoke do runtime relocável.

**Limitação principal ainda pendente:** numa reprodução controlada, uma aba não relacionada com JavaScript travado impediu `connectOverCDP`, mesmo com a aba correta respondendo. A correção da tarefa anterior limita consultas de seleção de abas, mas **não isola a inicialização global do Playwright**. Portanto, não considero eliminada a classe inteira de travamentos de compactação.

**Distinção importante:** as novas correções estão no projeto e foram verificadas. **Não foram instaladas no aplicativo em execução durante esta auditoria.** O runtime instalado ainda apresentou os 7 alertas antigos do núcleo. As notas pós-correção referem-se ao **candidato de código**, não a uma implantação já concluída.

## Escopo e metodologia de pontuação

### O que foi avaliado

- Arquitetura e divisão de responsabilidades.
- API Responses, roteamento nativo/Web, limites HTTP e classificações de erro.
- Streaming, replay, encerramento de respostas e filas.
- Compactação v1/v2/memento, handoff e preservação do contexto.
- Automação do navegador e conexão CDP.
- Broker MCP, identidade, capacidades e ferramentas.
- Segurança local, credenciais, dependências e fronteiras Electron/IPC.
- Persistência, contabilidade de memória e recuperação.
- Ciclo de vida, cancelamento, shutdown e supervisão.
- Desempenho, logs e diagnóstico.
- UX, estados de falha e acessibilidade.
- Testes, CI, empacotamento e documentação.

Foram mapeados 130 arquivos de implementação/scripts na coleta inicial; a leitura foi **dirigida aos fluxos críticos**, e não uma afirmação de revisão exaustiva de cada linha. Os testes completos complementaram essa inspeção.

### Rubrica congelada antes da remediação

Cada nota é a soma de cinco dimensões:

| Dimensão | Máximo | O que foi considerado |
|---|---:|---|
| C — Comportamento e correção | 30 | Cumprimento dos contratos e defeitos observados |
| R — Falhas e recuperação | 25 | Cancelamento, concorrência, limites e degradação |
| V — Verificação | 20 | Testes executados e fidelidade da evidência |
| O — Operação e diagnóstico | 15 | Logs, clareza dos erros, suporte e observabilidade |
| M — Manutenção e clareza | 10 | Responsabilidades, legibilidade e custo de evolução |

**Interpretação:** 90–100: muito forte no escopo verificado; 80–89: bom com lacunas; 70–79: funcional, mas exige melhorias; 60–69: fragilidade significativa; abaixo de 60: insuficiente naquela área. Não há certificação de produção implícita nessas faixas.

As notas são **juízo técnico**, não uma medição objetiva de toda a qualidade do produto. A média é aritmética, com o mesmo peso por área; um achado P1 continua prioritário independentemente da média.

**Prioridades:** P1 = tratar antes de confiar em operação longa/alta concorrência ou publicar a correção; P2 = próxima rodada de robustez/experiência; P3 = evolução planejada. Não foi estabelecida nesta auditoria uma exploração ativa ou perda irreversível de dados que justificasse P0.

**Estados de evidência:** reprodução confirmada; inspeção confirmada; hipótese; não verificado. Uma recomendação não é uma correção concluída. A auditoria e a revisão final foram realizadas por um único agente; a revisão final foi separada temporalmente da implementação e **não é revisão independente**.

## Ambiente e evidências executadas

### Linha de base e verificação final

| Procedimento | Linha de base | Resultado após correções |
|---|---|---|
| `bun test ./tests` | 873 passaram; 22 ignorados; 0 falhas | 885 passaram; 22 ignorados; 0 falhas; 907 casos em 71 arquivos |
| `bun run launcher:test` | 369 passaram; 1 ignorado; 0 falhas | 370 passaram; 1 ignorado; 0 falhas; 371 casos |
| `bun run typecheck` | Passou | Passou |
| `bun run launcher:typecheck` | Passou | Passou; cobre o renderer TypeScript |
| `bun run check-version` | `VERSION_SYNC_OK 6.1.3 bun@1.4.0` | Passou |
| `bun audit` | 7 alertas: 2 altos e 5 moderados | Zero alertas; 108 pacotes verificados |
| `bun run launcher:audit` | 25 alertas: 11 altos, 10 moderados e 4 baixos | Zero alertas; 351 pacotes verificados |
| `bun run verify` | Não usado como baseline integral | Código 0; 149,2 s; inclui testes, auditorias, builds e smoke |
| Build do renderer | — | Passou; Vite informou 1,34 s |
| Smoke do runtime | Histórico da tarefa anterior não usado como aprovação atual | `RELOCATABLE_RUNTIME_SMOKE_OK` nesta auditoria |
| `git diff --check` | — | Passou |

Execução integrada final: **06:43:30–06:45:59 UTC**. A revisão final encontrou um caso adicional de cancelamento HTTP; ele foi reproduzido, corrigido e incluído nesta nova execução integral. Os casos ignorados não foram contabilizados como aprovados. Não foi gerado percentual de cobertura de linhas/branches.

### Reprodução real do problema de isolação CDP

Foi usado um **Chrome headless separado**, com páginas sintéticas, sem cookies, perfil ou tarefa reais:

1. A página que seria usada pelo agente continuou respondendo.
2. Outra página, num contexto distinto, executou JavaScript bloqueante.
3. `chromium.connectOverCDP` expirou em aproximadamente **1.505 ms**, com orçamento de 1.500 ms.
4. Após fechar apenas a página bloqueada, a conexão voltou a funcionar.

O próprio Playwright instalado inicializa todos os alvos antes de concluir a conexão: `lib/coreBundle.js`, métodos `CRBrowser.connect` e `_waitForAllPagesToBeInitialized`. Essa dependência explica por que limitar a consulta individual de abas não fecha todo o problema.

### Métricas observadas, sem transformar logs em benchmark

Nos registros de 30/09, entre 03:08 e 06:00 UTC, a coleta encontrou:

| Etapa | Amostras concluídas | Mediana | P95 observado |
|---|---:|---:|---:|
| Aquisição da página (`browser_page`) | 31 | 381 ms | 43.305 ms |
| Preparação do chat | 24 | 3.959 ms | 5.583 ms |
| Seleção de esforço | 31 | 1.740 ms | 2.965 ms |
| Envio final | 29 | 3.301 ms | 50.801 ms |
| Confirmação de parte multipart | 33 | 10.966 ms | 40.252 ms |
| Reconexão à mesma página | 8 | 22.679 ms | 44.921 ms |

Esses dados misturam versões, tarefas, interrupções e diagnósticos. **Não são SLA, disponibilidade ou comparação causal antes/depois.** Eles identificam etapas que merecem medição controlada.

No microbenchmark local da fila, cinco amostras por tamanho produziram medianas de **6,91 ms para drenar 50.000 eventos** e **12,97 ms para 100.000 eventos**. Não houve evidência de que reescrever `Array.shift` fosse uma prioridade útil no Bun utilizado.

### Evidências disponíveis

- Resumo persistente, rubrica e notas verificáveis: [arquivo JSON de evidências](auditoria-profunda-evidencias-2026-09-30.json).
- Plano e limites de execução: [plano da auditoria](auditoria-profunda-plano-2026-09-30.md).
- Saídas brutas locais: `/tmp/opencode/auditoria-profunda-2026-09-30/`, incluindo reproduções negativas, métricas e verificação integrada. Esse diretório é temporário; os resultados essenciais estão preservados neste relatório e no JSON.

## Notas por área analisada

**“Antes”** corresponde ao estado do projeto no início desta auditoria, que já incluía a correção anterior de compactação. **“Depois”** corresponde ao código candidato validado nesta rodada.

| Área analisada | Antes /100 | Depois /100 | Subnotas depois: C/R/V/O/M | Justificativa principal |
|---|---:|---:|---|---|
| 1. Arquitetura e organização | 74 | **74** | 24/19/14/10/7 | Fronteiras identificáveis, mas arquivos centrais concentram responsabilidades |
| 2. API, roteamento e limites HTTP | 82 | **91** | 28/23/18/14/8 | Contratos fortes; leitura/descompressão agora limitadas e excesso retorna 413 |
| 3. Streaming, replay e filas | 86 | **88** | 28/23/18/12/7 | Boa preservação de resultados e encerramento; perda genérica de eventos corrigida |
| 4. Compactação e continuidade | 79 | **79** | 26/20/19/9/5 | Handoff e identidade bem protegidos; custo multipart e dependência CDP permanecem |
| 5. Navegador e isolação CDP | 64 | **64** | 21/13/17/8/5 | Travamento cruzado reproduzido na inicialização global do Playwright |
| 6. MCP, ferramentas e permissões | 88 | **88** | 29/23/19/10/7 | Capacidades por turno, replay e fence de conclusão cobertos por testes |
| 7. Segurança e limites de confiança | 75 | **86** | 27/21/17/13/8 | Correções de limites e dependências; falta endurecimento adicional de IPC |
| 8. Persistência e memória | 73 | **83** | 27/22/17/10/7 | Quotas UTF-8 corrigidas; quotas globais e diagnóstico de cache ainda incompletos |
| 9. Ciclo de vida e recuperação | 85 | **85** | 28/22/19/10/6 | Drain, cancelamento e supervisão têm contratos e regressões extensas |
| 10. Desempenho e eficiência | 70 | **74** | 22/17/13/13/9 | Recursos HTTP melhor limitados; gargalos dominantes são DOM/CDP/multipart |
| 11. Observabilidade e diagnóstico | 70 | **83** | 27/21/17/11/7 | Falso erro de navegador ocupado corrigido; faltam métricas agregadas e avisos de cache |
| 12. UX e acessibilidade | 68 | **78** | 25/18/15/12/8 | Falha inicial agora visível e recuperável; teclado das abas/modais precisa melhorar |
| 13. Testes e integração contínua | 87 | **91** | 27/23/19/13/9 | 1.255 casos aprovados e 13 novos casos; cobertura e CJS tipado ainda ausentes |
| 14. Dependências e cadeia de suprimentos | 43 | **90** | 28/23/18/13/8 | Alertas removidos por atualizações compatíveis; distribuição instalada ainda antiga |
| 15. Empacotamento e documentação | 85 | **85** | 27/22/18/11/7 | Lockfiles, hashes, licenças e smoke bons; revisão local ainda não é release instalada |
| **Média aritmética** | **75,3** | **82,6** | — | O achado CDP P1 continua limitando a confiabilidade operacional |

### 1. Arquitetura — 74/100

O caminho real é: Codex → servidor Responses → parser/roteamento → adapter → sessão/broker → helper de navegador → ChatGPT, com retorno por eventos/SSE. O launcher possui controle HTTP autenticado, IPC do renderer e supervisão de processos separados.

O problema não é falta de separação total, mas a densidade dos coordenadores: `browser-worker.ts` tem aproximadamente 5,7 mil linhas, `browser-host.cjs` 3,1 mil, `App.tsx` 2,7 mil e `runtime-supervisor.cjs` 2,2 mil. Transporte, observação, recuperação e políticas ficam próximos demais. Os testes que acessam protótipos privados também tornam refatorações mais caras.

**Evidência:** mapeamento de módulos, métricas de arquivos, `src/server.ts`, `src/adapters/chatgpt-web/index.ts` e arquivos acima. **Confiança:** alta na concentração; média na quantificação do custo de manutenção. Não foi calculada complexidade ciclomática.

### 2. API e HTTP — 91/100

O roteamento preserva a distinção entre modelos Web e encaminhamento nativo. Há rejeição de modelos indisponíveis, entradas inválidas, continuação sem estado e contratos separados de compactação. A nova leitura interrompe corpos sem tamanho declarado quando passam de 64 MiB, limita a saída zstd a 128 MiB e retorna HTTP 413 para excesso.

**Evidência:** `src/http-body.ts`, `src/server.ts`, `tests/http-body.test.ts`, `tests/server-compaction.test.ts`, testes de modelos e passthrough. A autorização do endpoint nativo e sua compatibilidade continuam sendo fronteiras sensíveis; não foi feito fuzzing exaustivo de todo formato de entrada.

### 3. Streaming — 88/100

Há cuidado com respostas incompletas, erro durante o stream, texto provisório versus definitivo, replay de ferramentas e cancelamento do consumidor. O caminho Linux/macOS conserva backpressure; Windows tem tratamento específico para o ciclo de vida do stream.

A fila genérica podia interpretar `undefined` como fila vazia e encerrar antes dos eventos seguintes. A correção usa a existência de uma posição na fila para distinguir vazio de valor. Os eventos de adapter atuais são objetos; o impacto mais direto era no contrato genérico/reutilização, não uma prova de perda de todo SSE do Codex.

**Evidência:** `src/bridge.ts`, `src/event-queue.ts`, `HttpTurnCounter`, testes `bridge-incomplete`, `bridge-platform`, `server-lifecycle` e `event-queue`. O cenário Windows real não foi executado nesta máquina.

### 4. Compactação — 79/100

Pontos fortes: transação de uso único, handoff ligado a token e identificador, proibição de trabalho comum durante compactação, replay idempotente e espera pela liberação física antes de concorrência. A resposta comum do assistente não é aceita como handoff estruturado na conversa retida.

As lacunas são operacionais: o fallback depende da conexão global CDP; com Bigger Context, a compactação recebe seis partes mesmo quando pequena; parte da autorização de continuidade fica em memória e deve falhar de forma conservadora após perda desse estado. Não recomendo simplesmente remover essa proteção ou truncar histórico para ganhar velocidade.

**Evidência:** `compaction-handoff.ts`, `compaction-transaction.ts`, `compaction-continuation.ts`, `usage.ts` e testes `retained-compaction`/`server-compaction`/`compaction-browser-recovery`.

### 5. Navegador/CDP — 64/100

Os seletores são específicos, há leases por tarefa, orçamento por etapa, recuperação da mesma página e limite de cinco abas. Mesmo assim, a biblioteca conecta-se ao navegador inteiro e aguarda a inicialização de todos os alvos. O experimento isolado provou que uma página correta e responsiva não basta para garantir aquisição.

**Evidência:** `src/launcher-browser-host.ts`, etapa `browser_page` em `browser-worker.ts`, implementação do Playwright instalada e reprodução `cdp-bootstrap-reproduction.json`. Esse é o maior achado pendente. Aumentar o timeout apenas adia o erro; não fornece isolação.

### 6. MCP e ferramentas — 88/100

Há tokens aleatórios por turno, correspondência entre chamada e resultado, restrição às ferramentas expostas pelo turno externo, revogação e barreira de conclusão contra chamadas simultâneas. A autoridade de ambiente é ligada ao Codex e ao rollout; texto de usuário com aparência de contexto não deve sozinho conceder acesso.

**Evidência:** `turn-broker.ts`, `environment.ts`, contratos de controle e testes de lifecycle/ambiente/harness/Zero Risk. O scanner encontrou dependências do SDK fora do caminho stdio utilizado; isso é risco de dependência, não demonstração de acesso arbitrário às ferramentas. O comportamento de quota/restrições do serviço ChatGPT continua externo.

### 7. Segurança — 86/100

São positivos: loopback obrigatório, tokens de controle comparados com `timingSafeEqual`, arquivos privados, validação de identidade, sandbox e `contextIsolation` no Electron, bloqueio de navegação e exportação sanitizada de logs. Foram corrigidas as quotas HTTP e as dependências vulneráveis.

O endpoint Responses é intencionalmente dependente da confiança no usuário/processos locais, conforme `docs/security-model.md`. O helper de registro de IPC não valida explicitamente remetente/frame antes de executar cada ação; as proteções de renderer reduzem o risco, mas essa é uma oportunidade de defesa em profundidade. **Não foi demonstrada uma exploração desse ponto.**

**Evidência:** `config.ts`, `server.ts`, `control-server.cjs`, `main.cjs`, `preload.cjs`, `logging.cjs`, política de segurança e auditorias de dependências. Zero alertas de scanner não equivale a certificação de segurança.

### 8. Persistência/memória — 83/100

O cache de continuação possui TTL, limites por quantidade, snapshot com debounce e gravação atômica. A contabilidade usava `.length` de string para limites chamados “bytes”; 800 mil caracteres `漢` ultrapassam 2 MiB em UTF-8 e eram persistidos como se coubessem. Agora o cálculo usa `Buffer.byteLength`.

Persistem duas lacunas: falhas do snapshot são silenciosas por projeto e outros registries/feeds têm limites de quantidade ou tempo, mas não um orçamento global de bytes. A quota de cache é aproximação do payload serializado, não teto exato de RSS/heap, e o código admite manter uma última entrada grande em memória.

**Evidência:** `src/responses/state.ts`, teste isolado `response-state-limits.test.ts`, `turn-execution.ts` e registries de compactação. Não foi realizado teste de OOM ou de horas de uso contínuo.

### 9. Ciclo de vida — 85/100

Há drain autenticado, recusa de shutdown com atividade, diferenciação entre conclusão lógica e liberação física, cancelamento por identidade e supervisão com recuperação/cooldown. Os testes de shutdown, rollback e propriedade de processo são fortes.

**Evidência:** `src/service.ts`, `src/server.ts`, `runtime-supervisor.cjs`, testes de lifecycle e supervisão. A dependência de CDP continua podendo prolongar limpeza; não foi provocado crash no serviço real durante esta auditoria.

### 10. Desempenho — 74/100

O principal custo observado está no caminho navegador/serviço externo, não na fila local. Cinco confirmações multipart, com mediana próxima de 11 s cada, podem representar aproximadamente 55 s de espera antes do prompt final, sem contar seleção de esforço e envio.

A leitura HTTP passou a ter buffer de crescimento limitado, sem acumular uma lista potencialmente enorme de pequenos chunks; a descompressão tem limite de saída. Recomendo medir compilação/tokenização, DOM e CDP antes de introduzir caches ou refatorar estruturas de dados.

**Evidência:** métricas de etapas, microbenchmark de fila e testes de limite. Não foi alegado ganho percentual na latência total do ChatGPT, nem foram medidos Core Web Vitals, RSS sob carga ou throughput de produção.

### 11. Observabilidade — 83/100

Logs possuem correlação por trace, estágio e duração, além de diagnóstico sanitizado de streams. O doctor agora diferencia “ocupado; inspeção adiada” de “indisponível”. O erro HTTP 502 de inspeção permanece erro; a mudança não afirma autenticação que não foi observada.

**Evidência:** testes positivos/negativos de doctor, controle HTTP real de teste, execução do doctor de fonte contra o launcher antigo e logs por etapa. Faltam indicadores agregados de falha/latência por etapa e avisos sanitizados de falhas de persistência.

### 12. UX/acessibilidade — 78/100

O launcher oferece estados de setup, atividade, idioma, operação e erro, e vários controles têm nomes/roles acessíveis. A falha inicial foi corrigida: a mensagem fica visível, com botão de recarga operável por teclado; o teste executa o App em Chrome headless.

As abas são `div` com `role="tab"` e clique, mas sem `tabIndex` ou tratamento equivalente de teclado. Alguns modais têm `aria-modal`, porém falta evidência de contenção/restauração de foco. Há cinco idiomas de interface, sem português; isso é oportunidade de produto, não defeito contra um requisito existente.

**Evidência:** `launcher/src/App.tsx`, CSS de foco/reduced-motion e teste de startup em navegador. Não houve auditoria completa com leitor de tela, zoom/reflow ou contraste medido.

### 13. Testes/CI — 91/100

O volume de regressão é um diferencial: 1.255 casos aprovados nesta rodada, 23 ignorados e 13 novos casos executáveis em relação à linha de base. Houve reproduções negativas antes das correções, e o teste de UI exercita comportamento renderizado.

**Evidência:** verificação integrada, reproduções negativas e workflows CI/release. A matriz de CI declara Linux/Windows/macOS, mas só Linux foi executado localmente. O typecheck do launcher inclui apenas `src`; os módulos Electron `.cjs` não são cobertos por ele. Não há métrica de cobertura usada nesta nota.

### 14. Dependências — 90/100

Atualizações controladas corrigiram `fast-uri`, `ip-address`, as três linhas principais de `brace-expansion` e as duas linhas de `undici`, sem troca de major por dependente. Os lockfiles mantêm hashes e o pipeline bloqueia release quando a auditoria falha.

**Evidência:** diff dos manifestos/lockfiles, consulta de versões e auditorias após atualização. Ainda é necessário instalar o candidato: o grafo do runtime em execução continua antigo. Automação de revisão periódica das dependências ajudaria a evitar novos pins obsoletos.

### 15. Empacotamento/documentação — 85/100

São positivos: consistência de versão, runtime relocável, hashes de arquivos, lockfile congelado, licenças e checagens de artefatos nos workflows. A documentação explica limites de confiança e recuperação.

**Evidência:** scripts de build/verify/smoke, workflows e documentação. Não foram gerados/testados nesta máquina todos os instaladores finais das três plataformas. O health usa versão/pid, mas isso sozinho não distingue duas revisões locais diferentes com o mesmo número 6.1.3; a identificação por bundle/revisão merece ser mais explícita no diagnóstico.

## Achados, impactos e prioridades

| ID | Prioridade | Achado | Evidência/confiança | Estado |
|---|---|---|---|---|
| AUD-01 | P1 | Dependências com alertas altos/moderados | Scanner e lockfiles; alta; exploração direta não demonstrada | Corrigido no candidato; instalação pendente |
| AUD-02 | P1 | Falha de startup ficava escondida pelo loader | Reproduzido em App real renderizado; alta | Corrigido e verificado |
| AUD-03 | P1 | Limites HTTP pós-leitura/pós-descompressão | Reproduzido com stream sintético; alta | Corrigido e verificado |
| AUD-04 | P2 | Quotas de persistência contavam caracteres | Reprodução com UTF-8 multibyte; alta | Corrigido e verificado |
| AUD-05 | P2 | Fila perde `undefined` e eventos seguintes | Reprodução unitária; alta; impacto atual no adapter limitado | Corrigido e verificado |
| AUD-06 | P2 | Doctor trata ocupado como indisponível | Logs reais e testes HTTP; alta | Corrigido e verificado |
| AUD-07 | P1 | Uma aba bloqueada impede bootstrap CDP global | Reprodução em Chrome isolado; alta | Pendente |
| AUD-08 | P2 | Compactação pequena ainda usa seis partes em Bigger Context | Inspeção e logs; alta na regra, média no ganho potencial | Otimização a estudar |
| AUD-09 | P2 | Ausência de quota global de bytes em registries/feeds | Inspeção; alta na ausência; OOM não reproduzido | Pendente |
| AUD-10 | P2 | Coordenadores grandes e testes acoplados a métodos privados | Métricas/inspeção; alta | Refatoração gradual pendente |
| AUD-11 | P2 | Abas e modais com lacunas de teclado/foco | Inspeção; alta nas abas; validação assistiva não executada | Pendente |
| AUD-12 | P2 | CJS fora do typecheck; cobertura não medida | Configurações e pipeline; alta | Melhoria de gate pendente |
| AUD-13 | P1 | Candidato corrigido diverge do runtime instalado | Auditoria do runtime instalado; alta | Implantação controlada pendente |
| AUD-14 | P2 | Falha de snapshot é silenciosa | Inspeção; alta na política, impacto operacional depende do incidente | Melhoria de diagnóstico pendente |
| AUD-15 | P2 | IPC sem validação explícita de sender/frame | Inspeção; alta na ausência; exploração não demonstrada | Endurecimento pendente |
| AUD-16 | P1 | Cancelar uma requisição não liberava sua leitura HTTP parada | Reprodução com stream sem bytes; alta | Corrigido e verificado na revisão final |

### Critérios para encerrar os achados pendentes

- **AUD-07:** a reprodução de duas páginas deve manter conexão/operação da página correta com a outra travada; cancelamento de uma tarefa não pode desconectar as demais. Testar aquisição, rebind, logout e shutdown.
- **AUD-08:** comparar 1/2/6 partes com o mesmo contexto e esforço, preservando integralmente histórico, imagens e checkpoints. Aceitar apenas ganhos medidos sem regressão de limite ou identidade.
- **AUD-09:** definir orçamentos por tarefa e globais, exercitar desconexões longas e outputs grandes, preservando os contratos de replay/cancelamento. Não basta expulsar dados ainda necessários.
- **AUD-10:** extrair responsabilidades coesas em pequenos passos com comportamento equivalente, substituindo mocks de métodos privados por fronteiras estáveis quando possível.
- **AUD-11:** testar Tab/Shift+Tab, Enter/Espaço, setas nas abas, Escape e restauração de foco, inclusive com a superfície nativa Electron ativa.
- **AUD-12:** executar checks relevantes nos módulos Electron e medir cobertura antes de definir metas. Manter casos ignorados visíveis e justificados.
- **AUD-13:** gerar e validar artefatos, instalar em janela controlada, conferir hashes/revisão carregada e repetir auditoria/diagnóstico/smoke, com rollback disponível.
- **AUD-14:** erro de persistência deve gerar aviso sanitizado e limitado, sem expor conteúdo e sem interromper o turno; validar recuperação após corrigir permissões/disco.
- **AUD-15:** aceitar IPC apenas do renderer/frame proprietário esperado; testes devem rejeitar remetentes não proprietários sem bloquear fluxos legítimos.

## Correções e otimizações realizadas

### Código e testes

| Correção | Arquivos principais | Demonstração |
|---|---|---|
| Startup com falha visível e recarga | `launcher/src/App.tsx`, `tests/launcher-startup-browser.test.ts` | Erro aparece com role de alerta; recarga por Enter provoca nova navegação |
| Limites e cancelamento HTTP durante processamento | `src/http-body.ts`, `src/server.ts`, `tests/http-body.test.ts` | Stream de 70 chunks de 1 MiB é interrompido antes do fim; clone não bloqueia rejeição; excesso retorna 413; zstd tem saída limitada; cancelamento libera leitor parado |
| Quotas UTF-8 | `src/responses/state.ts`, `tests/response-state-limits.test.ts` | Entrada multibyte acima de 2 MiB não entra no snapshot |
| Fila genérica sem perda | `src/event-queue.ts`, `tests/event-queue.test.ts` | Coleta preserva `[undefined, 7]` |
| Ocupado versus indisponível | `src/doctor.ts`, `src/launcher-browser-host.ts`, controle/host Electron e testes | 409 tipado/400 legado de ocupado viram aviso; 502 continua erro; não navega na aba ativa |

A limitação de leitura é uma melhoria de uso de recursos; não foi atribuída a ela uma redução inventada de latência total. A reescrita da fila para “otimizar” `shift` foi descartada por falta de benefício prioritário medido.

### Dependências

| Pacote | Versões anteriores | Versões verificadas |
|---|---|---|
| `fast-uri` | 3.1.6 | 3.1.8 nos dois projetos |
| `ip-address` | 10.3.1 | 10.7.2 |
| `brace-expansion` | 1.1.18 / 2.1.4 / 5.0.9 | 1.1.21 / 2.1.7 / 5.0.12 |
| `undici` | 6.28.0 / 7.29.0 | 6.29.0 / 7.30.0 |

Atualizações foram direcionadas, dentro das linhas principais existentes, com lifecycle scripts ignorados no update. Manifestos e lockfiles foram revisados; toda a verificação integrada passou depois.

As alterações pré-existentes da tarefa anterior, incluindo anexos e compactação, foram preservadas. Não foram realizados commit, push ou publicação de release nesta auditoria.

## Plano priorizado de melhorias

### Ordem recomendada

1. **Preparar implantação controlada do candidato** — entregar ao runtime instalado as correções já validadas. Preservar configuração, perfil do navegador, histórico e rollback; identificar a revisão carregada, não apenas “6.1.3”.
2. **Resolver isolação do bootstrap CDP** — maior problema remanescente de confiabilidade. Projetar ownership por alvo/conexão e validar com a reprodução já criada; não esconder o problema com timeout maior ou retry adicional.
3. **Otimizar compactação a partir de medidas** — avaliar transporte adaptativo para contextos pequenos e reduzir passos desnecessários, mantendo os contratos de completude.
4. **Definir orçamento global de memória e observabilidade de cache** — medir heap/RSS em workload sintético antes de escolher limites; preservar replay e dados ainda ativos.
5. **Completar teclado/foco e endurecer IPC** — testes de interação e de remetente, especialmente na convivência renderer/WebContentsView.
6. **Refatorar por responsabilidade e reforçar gates** — separar aquisição/lease, compositor/transporte e projeção/conclusão; adicionar análise incremental de CJS, cobertura e revisão periódica das dependências.

### O que não recomendo como primeira ação

- Refatorar todo o programa de uma vez.
- Aumentar todos os timeouts sem isolar o motivo da espera.
- Acrescentar retries automáticos em pontos onde um envio pode já ter sido aceito.
- Remover validações de checkpoint/identidade para simplificar a retomada.
- Usar quantidade de testes ou scanner zerado como argumento de que todos os bugs foram eliminados.

## Limitações e conclusão

- A verificação atual é do **código candidato Linux**. As novas alterações não foram instaladas na aplicação em execução.
- Windows/macOS constam da matriz de CI, mas não foram executados localmente nesta auditoria.
- O teste renderizado valida a falha inicial e recarga com IPC simulado. Não substitui teste de todos os fluxos no Electron empacotado.
- Não houve revisão independente, fuzzing integral, teste prolongado de OOM, auditoria completa com tecnologia assistiva ou benchmark de conta real sob carga.
- O teste de compactação real da tarefa anterior foi útil como histórico, mas não foi usado para declarar aprovada a nova revisão inteira.
- Restrições de conta, quota, rede e mudanças do DOM do ChatGPT continuam externas ao projeto.
- As fontes/artefatos receberam avaliação técnica com evidências; as notas não são certificação nem garantia estatística.

**Conclusão:** o código melhorou de **75,3 para 82,6/100** nesta rodada e possui uma base de verificação acima da média para uma integração deste tipo. Ainda assim, a área de navegador/CDP permanece em **64/100**, com um defeito de isolação reproduzido que limita a confiança em tarefas longas e concorrentes.

**Próximo passo concreto:** preparar a instalação controlada do candidato validado e, na sequência, tratar o bootstrap CDP com a reprodução isolada como teste de aceitação. O relatório não declara resolvidos os achados pendentes.
