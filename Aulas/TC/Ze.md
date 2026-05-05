---
layout: TCclass
title: Zé Testando Coisas
subtitle: Testes do simulador de gases bidimensionais
---

## Verificando se "esferas.js" está seguindo a distribuição de Maxwell-Boltzmann.
<br>
<div class="toolbox" id="aula-5-virtual-lab">
  <div class="toolbox-header">
    <h2 class="toolbox-title">Laboratório Virtual: Distribuição de Velocidades</h2>
  </div>

  <div class="toolbox-content">
    
    <div class="jsbox-control-panel">
      <div class="jsbox-controls-grid">
        
        <div>
          <div class="jsbox-col-title sys">Sistema</div>
          <div class="jsbox-input-row">
            <label>Partículas (N):</label>
            <input type="number" id="inp-n1" value="400" class="jsbox-input">
          </div>
          <div class="jsbox-input-row">
            <label>Lado (L):</label>
            <input type="number" id="inp-edge" value="100" class="jsbox-input">
          </div>
        </div>

        <div>
          <div class="jsbox-col-title p1">Termodinâmica</div>
          <div class="jsbox-input-row">
            <label>Massa (m):</label>
            <input type="number" id="inp-m1" value="20" class="jsbox-input">
          </div>
          <div class="jsbox-input-row">
            <label>Temp. (T):</label>
            <input type="number" id="inp-T" value="300" class="jsbox-input">
          </div>
        </div>

        <div>
          <div class="jsbox-col-title opt">Parâmetros</div>
          <div class="jsbox-input-row">
            <label>Diâmetro (&sigma;):</label>
            <input type="number" id="inp-sigma" value="1" step="0.1" class="jsbox-input">
          </div>
          <div class="jsbox-input-row">
            <label>Passos:</label>
            <input type="number" id="inp-steps" value="15000" class="jsbox-input">
          </div>
        </div>
        
      </div>
      
      <div style="margin-top: 15px; text-align: center;">
        <button id="btn-run" class="jsbox-btn jsbox-btn-primary" style="width: auto; padding: 10px 30px;">Iniciar Simulação</button>
      </div>
    </div>

    <div id="ui-progress" class="jsbox-alert" style="display:none;">
      <span id="progress-text">Calculando a termalização e as colisões...</span>
    </div>

    <div id="ui-visualization" style="display:none; flex-direction: column; gap: 20px; max-width: 800px; margin: 0 auto;">
      
      <div class="jsbox-card">
        <div class="jsbox-card-header">Câmera da Simulação</div>
        <div class="jsbox-card-body" style="text-align: center;">
          <canvas id="sim-canvas" width="600" height="600" class="jsbox-canvas-container" style="max-width: 100%; height: auto;"></canvas>
          
          <div class="jsbox-player-bar" style="margin-top: 15px;">
            <button id="btn-play" class="jsbox-btn jsbox-btn-success">Reproduzir</button>
            <input type="range" id="inp-scrubber" value="0" min="0" step="1" class="jsbox-scrubber">
          </div>
        </div>
      </div>

      <div class="jsbox-card">
        <div class="jsbox-card-header">Frequência de Colisões (Parede)</div>
        <div class="jsbox-card-body">
          <canvas id="freq-canvas" class="jsbox-chart" style="height: 200px; width: 100%;"></canvas>
        </div>
      </div>

      <div class="jsbox-card">
        <div class="jsbox-card-header">Componentes da Velocidade (Maxwell-Boltzmann)</div>
        <div class="jsbox-card-body">
          <div style="position: relative; height: 300px; width: 100%;">
            <canvas id="plot-canvas" class="jsbox-chart"></canvas>
          </div>
          <div class="jsbox-legend" style="margin-top: 15px;">
            <div class="jsbox-legend-item">
              <span class="jsbox-color-box" style="background:#007bff;"></span> Atual (Frame)
            </div>
            <div class="jsbox-legend-item">
              <span class="jsbox-color-box" style="background:#dc3545; border: 2px dashed #dc3545;"></span> Média Histórica
            </div>
            <div class="jsbox-legend-item">
              <span class="jsbox-color-box" style="background:#333;"></span> Teórico
            </div>
          </div>
        </div>
      </div>

    </div>

  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script src="{{ '/assets/js/esferas.js' | relative_url }}"></script>
