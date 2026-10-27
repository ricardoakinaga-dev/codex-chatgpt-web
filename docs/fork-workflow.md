# Manutenção deste fork

Este fork mantém duas branches com funções distintas:

- `main`: espelho exato de `miuuyy/codex-chatgpt-web`, sem commits próprios.
- `custom`: única branch permanente de customizações e branch padrão do fork.

Todas as melhorias locais são feitas na `custom`. As atualizações oficiais entram por
merge de `main` em `custom`, preservando os dois históricos. Não faça merge de `custom`
em `main` e não use rebase ou push forçado para sincronizar essas branches.

Os remotos são `origin` (este fork) e `upstream` (repositório oficial):

```sh
git remote -v
# origin    https://github.com/ricardoakinaga-dev/codex-chatgpt-web.git
# upstream  https://github.com/miuuyy/codex-chatgpt-web.git
```

## Incorporar novas versões oficiais

Comece com a árvore de trabalho limpa. Execute cada etapa apenas se a anterior
terminou com sucesso:

```sh
git status --short
git fetch --prune origin
git fetch --prune upstream

git switch main
git merge --ff-only origin/main
git merge --ff-only upstream/main
git push origin main

git switch custom
git merge --ff-only origin/custom
git merge --no-ff main
```

Se houver conflitos, revise os dois comportamentos, preserve as customizações ainda
aplicáveis e adapte-as aos novos contratos oficiais. Depois use `git add <arquivos>` e
`git commit` para concluir o merge. Antes de publicar, execute:

```sh
bun install --frozen-lockfile
bun install --frozen-lockfile --cwd launcher
bun run verify
git merge-base --is-ancestor main custom
git diff --exit-code main upstream/main
git push origin custom
```

Se alguma etapa falhar, resolva a causa antes de continuar. Para cancelar um merge
em andamento, use `git merge --abort`. A CI verifica pushes em `main` e `custom`.
Os testes locais não substituem a validação real da sessão ChatGPT ou de pacotes
nativos em cada sistema operacional.

Branches temporárias só devem ser apagadas depois de confirmar que o histórico foi
incorporado à `custom`:

```sh
git merge-base --is-ancestor <branch-temporaria> custom
git branch -d <branch-temporaria>
git push origin --delete <branch-temporaria>
```

## Integração de 27/10/2026

Base oficial: `v6.1.14`, commit `cfeaf04bc7f54cea29e1ff2adbcad63bd038b119`.
A branch `fix/linux-launcher-lifecycle` já estava incorporada à `custom`.

Foram preservadas as melhorias locais de ciclo de vida do launcher Linux, foco da
janela, isolamento de CDP, recuperação do navegador, controles em português,
normalização explícita de esforço e streaming provisório com resposta final autoritativa.
O planejador adaptativo de compactação Sol continua escolhendo uma, duas ou seis
mensagens sem descartar histórico; a nova compactação Luna mantém as seis partes oficiais.

As adaptações seguem a remoção oficial de Temporary Chat e o novo suporte de Bigger
Context para Luna. A antiga restrição local que desativava Bigger Context em contas
somente Luna foi removida, pois esse limite foi superado pelo upstream.
