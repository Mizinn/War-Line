# ⚔️ WAR-LINE

Estratégia de conquista de territórios no navegador. **Cada partida acontece num mundo gerado na hora**, com continentes, territórios e rotas marítimas próprios. Jogue **solo contra CPUs** ou **online com amigos** por código de sala, com chat, alianças secretas e voz. Funciona no GitHub Pages, sem servidor próprio.

**Jogar:** https://mizinn.github.io/War-Line/

## Destaques
- **Mundos procedurais:** cada semente gera um mapa diferente (Pequeno 30, Médio 42 ou Grande 56 territórios). Repita um mapa usando a mesma semente; a prévia aparece no menu.
- **2 a 6 exércitos**, CPUs em três níveis (Recruta, Veterano, General) ou misturadas.
- **Missões secretas** geradas para cada mapa (conquistar continentes, N territórios, N territórios com 2 tropas, destruir uma cor) ou **dominação total**.
- **Combate com dados animados**, chance de vitória calculada na hora, ataque "até vencer", avanço de tropas com controle deslizante.
- **Cartas** (■ ● ▲ e coringas) com trocas progressivas e +2 tropas no território da carta.
- **Mapa interativo:** zoom com roda/pinça, arrastar, nomes liga/desliga, dicas ao passar o mouse.
- **Online P2P (WebRTC/PeerJS):** sala por código ou link, lobby, quem sai vira CPU, tempo por turno.
- **Social:** chat público e privado, alianças secretas (aliados não se atacam), voz entre os jogadores.
- Sons sintetizados, atalhos de teclado e layout para celular.

## Regras
1. **Posicionamento inicial:** territórios sorteados (1 tropa cada) e uma reserva inicial para cada jogador.
2. **Reforçar:** metade dos seus territórios em tropas (mínimo 3) + bônus dos continentes que você domina, que só pode ir para dentro deles. Com 5 cartas, a troca é obrigatória.
3. **Atacar:** origem com 2+ tropas, até 3 dados contra até 3 da defesa; maior contra maior, empate é da defesa. Ao conquistar, avance pelo menos tantas tropas quanto dados usados.
4. **Remanejar:** mova tropas entre territórios seus ligados por território seu; cada tropa se move uma vez por turno.
5. Conquistou algo no turno? Ganha uma carta. Trocas valem 4, 6, 8, 10, 12, 15, 20…
6. Quem elimina um jogador fica com as cartas dele. Vence quem cumprir a missão.

Atalhos: **Enter** rolar · **B** atacar até vencer · **Esc** cancelar · **Espaço** avançar fase · **Z** desfazer.

## Jogar online
1. Um jogador clica em **CRIAR SALA ONLINE** e passa o código de 6 letras (ou o link ⧉).
2. Os amigos digitam o código e clicam em **ENTRAR** (ou abrem o link).
3. O anfitrião clica em **COMEÇAR PARTIDA**. Vagas vazias viram CPU.

Como funciona: o anfitrião roda a partida no navegador dele e valida todas as jogadas; os outros se conectam direto a ele (WebRTC via PeerJS, carregado do CDN). Só a semente do mapa é enviada: cada navegador gera o mesmo mundo. Se o anfitrião fechar a aba, a sala acaba.

Use sempre o endereço **https** do Pages (o microfone só funciona em https).

Parâmetros opcionais de URL:
- `?peerhost=meu.servidor&peerport=443&peerpath=/` — servidor de sinalização PeerJS próprio
- `?turn=turn:host:3478&turnuser=USUARIO&turnpass=SENHA` — servidor TURN próprio (não coloque credenciais permanentes num link público)
- `?forceTurn=1` — força retransmissão por TURN (diagnóstico entre redes diferentes)

A configuração inclui STUN e um TURN público de teste (Open Relay), que pode ficar indisponível.

## Arquivos
- `index.html` — telas
- `style.css` — visual
- `js/map.js` — gerador de mundos (Voronoi, continentes, nomes, rotas)
- `js/engine.js` — regras, missões, cartas e IA das CPUs
- `js/ui.js` — mapa interativo, combate, painéis e sons
- `js/net.js` — salas online, chat, alianças e voz

GitHub Pages: branch `main`, pasta `/ (root)`.
