---
layout: TCclass
title: Teste do Toolbox
subtitle: Quadráticas
---

<p class="jt">
Quadráticas são simples.
</p>

<div id="Teste.1" class="mathbox-wrapper">
  <div class="mathbox">
    $$\color{blue}{\boldsymbol{y = ax^2 +bx +c }}$$
  </div>
  <div class="eq-numbers">
    <span style="font-weight: bold; color: blue;">Teste.1</span>
  </div>
</div>

<p class="jt">
Faça a sua abaixo:
</p>

{% include toolbox.html
    title="Funções quadráticas"
    subtitle="Mexe aí, vai"
    interactive=true
    interactive_id="quad1"
    content="Considere o seguinte:

$$ f(x) = ax^2 + bx + c $$

Ajuste os sliders abaixo para ver como a parábola muda."
    interactive="<label>a: <input type='range' class='slider-a' min='-5' max='5' step='0.1' value='1'></label> <label>b: <input type='range' class='slider-b' min='-5' max='5' step='0.1' value='0'></label> <canvas class='graph-canvas' width='400' height='250'></canvas>"
%}
