---
layout: TCclass
title: Teste de MC
subtitle: LJ particles
---

<p class="jt">
Vou ver se funciona.
</p>

<div class="toolbox" id="mc-tool">

  <div class="toolbox-header">
    <h2 class="toolbox-title">Pressão de um gás real</h2>
  </div>

  <div class="toolbox-content">

    <!-- CONTROLS -->
    <div class="jsbox-control-panel">
      <div class="jsbox-controls-grid">

        <div>
          <div class="jsbox-col-title sys">Sistema</div>

          <div class="jsbox-input-row">
            <label>N</label>
            <input type="number" class="jsbox-input npart" value="60">
          </div>

          <div class="jsbox-input-row">
            <label>Aresta (Å)</label>
            <input type="number" class="jsbox-input box" value="50">
          </div>

          <div class="jsbox-input-row">
            <label>T (K)</label>
            <input type="number" class="jsbox-input temp" value="300">
          </div>

<!--          <div class="jsbox-input-row">
            <label>dx (Å)</label>
            <input type="number" class="jsbox-input dx" value="5">
          </div> -->

          <div class="jsbox-input-row">
            <label>Passos</label>
            <input type="number" class="jsbox-input steps" value="200000">
          </div>

          <div class="jsbox-input-row">
            <label>Espécie</label>
            <select class="jsbox-input species">
              <option value="Xe">Xe</option>
              <option value="Ar">Ar</option>
              <option value="Ne">Ne</option>
              <option value="He">He</option>
              <option value="HS">Esferas rígidas</option>
              <option value="IG">Gás Ideal</option>
            </select>
          </div>

          
          <div class="jsbox-input-row" id="sigma-row" style="display: none;">
            <label>sigma (Å)</label>
            <input type="number" class="jsbox-input sigma" value="4">
          </div>

          
        </div>      

        <div style="display:flex;align-items:flex-end;">
          <button class="jsbox-btn jsbox-btn-primary">
            Rodar Simulação
          </button>
        </div>

      </div>
    </div>

    <!-- VISUALIZATION (ONLY GRAPHS NOW) -->
    <div class="jsbox-vis-layout">

      <div class="jsbox-vis-right">

        <div class="jsbox-card">
          <div class="jsbox-card-header">Energia</div>
          <div class="jsbox-card-body">
            <canvas id="energyChart" class="jsbox-chart"></canvas>
          </div>
        </div>

        <div class="jsbox-card">
          <div class="jsbox-card-header">Pressão</div>
          <div class="jsbox-card-body">
            <canvas id="pressureChart" class="jsbox-chart"></canvas>
          </div>
        </div>

        <div class="jsbox-card">
          <div class="jsbox-card-header">Histograma de energia</div>
          <div class="jsbox-card-body">
            <canvas id="histChart" class="jsbox-chart"></canvas>
          </div>
        </div>

      </div>

    </div>

    <!-- RESULTS -->
    <div class="jsbox-alert results">
      Resultados da simulação
    </div>

  </div>
</div>
