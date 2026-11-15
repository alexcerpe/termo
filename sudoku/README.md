# Sudoku — Jogos do Alex

Nova área independente em `/sudoku/` do repositório `alexcerpe/termo`. Não requer framework nem alterações no Cloudflare Worker do Xadrez.

## Implementado nesta base

- Tabuleiro clássico 9×9 com navegação por teclado e layout adaptado para celulares.
- Geração determinística por semente, com **uma única solução** validada por backtracking.
- Quatro níveis por quantidade aproximada de casas pré-preenchidas (44, 38, 32 e 28).
- Modo livre com partidas ilimitadas e desafio diário separado por nível.
- Modo de anotações por célula, **preenchimento automático de candidatos**, exclusão automática de notas relacionadas ao inserir a solução correta, apagar, desfazer e refazer.
- **Dicas explicativas em duas etapas** (candidato único, único oculto, correção ou revelação), verificação de entradas, conflitos e opção de revelar respostas incorretas.
- Cronômetro (pausa manual e pausa quando a página não está visível), indicadores, estatísticas, média, sequência de dias e melhor tempo sem dicas.
- Progresso local persistido por nível e modo usando `localStorage` (sem cadastro).
- Compartilhamento de convite ou resultado sem entregar a solução; navegação entre Termo, Xadrez e Sudoku.
- Arquivos estáticos disponíveis offline após o primeiro carregamento e instalação do Service Worker.
- Nenhuma dependência de API, CDN ou backend.

## Testes

Rodar a partir da raiz do repositório:

```sh
node sudoku/tests/engine.test.cjs
node sudoku/tests/app.test.cjs
```

Os testes geram 80 tabuleiros, verificam regras completas (linhas, colunas e blocos), soluções únicas e reprodução determinística. Os testes de interface simulam navegação, entrada de números, pausa, anotações, dicas, desfazer/refazer e conclusão. O GitHub Actions executa os testes a cada alteração relevante.

## Regras técnicas e limitações

1. A geração garante **solução única**, mas o nível atual é estimado pela quantidade de pistas. Isso **não constitui classificação lógica de dificuldade**. Para níveis rigorosos, é necessário implementar um solucionador por técnicas humanas e classificar cada puzzle por técnicas empregadas.
2. O desafio diário usa o fuso `America/Sao_Paulo` e sementes derivadas de data + dificuldade + versão. O mesmo dia e nível geram o mesmo tabuleiro em todos os dispositivos com a mesma versão.
3. Toda persistência é local, portanto trocar navegador/dispositivo não sincroniza progresso ou recordes. Dados locais podem ser alterados pelo jogador; não são adequados a rankings competitivos.
4. O cronômetro pausa quando a aba fica oculta; para competições online seriam necessárias regras de cronometragem e auditoria definidas no servidor.
5. O Service Worker usa cache de versão. Alterações nos arquivos devem atualizar a versão de cache e as URLs dos scripts/estilos para assegurar atualização offline.
6. Rejogar um desafio diário concluído pode incrementar a contagem total de vitórias, porém a sequência de dias contabiliza cada data apenas uma vez.

## Próximas etapas propostas

**Experiência:** animações discretas, temas claro/escuro, contraste e acessibilidade, sons opcionais e regras opcionais de penalização por erros.

**Jogo inteligente:** solucionador explicativo (single, hidden single, pares, locked candidates, X-Wing etc.), pistas graduais, classificação real de dificuldade, modo de treinamento e revisão.

**Diário e progressão:** calendário completo de desafios, conquistas, histórico de partidas e links de desafios livres com tabuleiros idênticos entre jogadores.

**Social e competição (precisa de backend):** contas, ranking validado, desafios assíncronos entre amigos, salas multiplayer em tempo real, torneios, moderação e medidas anti-fraude.

**Variantes:** 4×4, 6×6, 16×16, diagonal, Killer Sudoku, Thermo, irregular, Samurai e editor/importador de tabuleiros.

## Arquivos

- `index.html`: estrutura e controles
- `styles.css`: interface responsiva
- `engine.js`: regras do gerador e validador
- `app.js`: interação, estado, autosave e estatísticas
- `manifest.webmanifest`, `icon.svg`, `sw.js`: recursos de aplicativo e offline
- `tests/engine.test.cjs` e `tests/app.test.cjs`: testes de regressão sem dependências
- `.github/workflows/sudoku.yml`: validação automática de regressões

O módulo foi desenvolvido em uma branch separada, validado com testes locais e publicado após o merge da branch de produção. Para uma próxima versão, validar acessibilidade em dispositivos reais e classificar puzzles por técnicas lógicas humanas.
