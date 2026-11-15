# Sudoku — Jogos do Alex

Nova área independente em `/sudoku/` do repositório `alexcerpe/termo`. Não requer framework nem alterações no Cloudflare Worker do Xadrez.

## Implementado nesta base

- Tabuleiro clássico 9×9 com navegação por teclado e layout adaptado para celulares.
- Geração determinística por semente, com **uma única solução** validada por backtracking.
- Quatro níveis por quantidade aproximada de casas pré-preenchidas (44, 38, 32 e 28).
- Modo livre com partidas ilimitadas e desafio diário separado por nível.
- Modo de anotações por célula, exclusão automática de notas relacionadas ao inserir a solução correta, apagar, desfazer e refazer.
- Dicas que completam uma casa, verificação de entradas, conflitos e opção de revelar respostas incorretas.
- Cronômetro (pausado enquanto a página não está visível), indicadores, estatísticas e melhor tempo sem dicas.
- Progresso local persistido por nível e modo usando `localStorage` (sem cadastro).
- Arquivos estáticos disponíveis offline após o primeiro carregamento e instalação do Service Worker.
- Nenhuma dependência de API, CDN ou backend.

## Testes

Rodar a partir da raiz do repositório:

```sh
node sudoku/tests/engine.test.cjs
```

Os testes geram 80 tabuleiros, verificam regras completas (linhas, colunas e blocos), soluções únicas e reprodução determinística.

## Regras técnicas e limitações

1. A geração garante **solução única**, mas o nível atual é estimado pela quantidade de pistas. Isso **não constitui classificação lógica de dificuldade**. Para níveis rigorosos, é necessário implementar um solucionador por técnicas humanas e classificar cada puzzle por técnicas empregadas.
2. O desafio diário usa o fuso `America/Sao_Paulo` e sementes derivadas de data + dificuldade + versão. O mesmo dia e nível geram o mesmo tabuleiro em todos os dispositivos com a mesma versão.
3. Toda persistência é local, portanto trocar navegador/dispositivo não sincroniza progresso ou recordes. Dados locais podem ser alterados pelo jogador; não são adequados a rankings competitivos.
4. O cronômetro pausa quando a aba fica oculta; para competições online seriam necessárias regras de cronometragem e auditoria definidas no servidor.
5. O Service Worker usa cache de versão. Alterações nos arquivos devem atualizar a versão de cache e as URLs dos scripts/estilos para assegurar atualização offline.
6. As estatísticas não são retroativamente corrigidas caso o jogador reinicie um desafio já concluído.

## Próximas etapas propostas

**Experiência:** animações discretas, temas claro/escuro, contraste e acessibilidade, sons opcionais, favoritos, controle de erros e notas automáticas.

**Jogo inteligente:** solucionador explicativo (single, hidden single, pares, locked candidates, X-Wing etc.), pistas graduais, classificação real de dificuldade, modo de treinamento e revisão.

**Diário e progressão:** calendário de desafios, sequências, conquistas, histórico de partidas, exportação de resultados sem spoilers e desafios compartilháveis por URL.

**Social e competição (precisa de backend):** contas, ranking validado, desafios assíncronos entre amigos, salas multiplayer em tempo real, torneios, moderação e medidas anti-fraude.

**Variantes:** 4×4, 6×6, 16×16, diagonal, Killer Sudoku, Thermo, irregular, Samurai e editor/importador de tabuleiros.

## Arquivos

- `index.html`: estrutura e controles
- `styles.css`: interface responsiva
- `engine.js`: regras do gerador e validador
- `app.js`: interação, estado, autosave e estatísticas
- `manifest.webmanifest`, `icon.svg`, `sw.js`: recursos de aplicativo e offline
- `tests/engine.test.cjs`: testes de regressão sem dependências

Este módulo foi criado em uma branch separada e deve ser revisado antes do merge na branch de produção.
