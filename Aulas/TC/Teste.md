---
layout: TCclass
title: Teste de MC
subtitle: LJ particles
---

<p class="jt">
Vou ver se funciona.
</p>

<div class="toolbox" id="mc-lj-tool">
  <div class="toolbox-header">
    <h2 class="toolbox-title">Monte Carlo Lennard-Jones (3D)</h2>
    <p class="toolbox-subtitle">Interactive simulation</p>
  </div>

  <div class="toolbox-content">

    <!-- Controls -->
    <div class="jsbox-control-panel">
      <div class="jsbox-controls-grid">

        <div>
          <div class="jsbox-col-title sys">System</div>

          <div class="jsbox-input-row">
            <label>N particles</label>
            <input class="jsbox-input" id="np" type="number" value="50">
          </div>

          <div class="jsbox-input-row">
            <label>Box (Å)</label>
            <input class="jsbox-input" id="box" type="number" value="30">
          </div>

          <div class="jsbox-input-row">
            <label>Temperature (K)</label>
            <input class="jsbox-input" id="temp" type="number" value="300">
          </div>

          <div class="jsbox-input-row">
            <label>dx (Å)</label>
            <input class="jsbox-input" id="dx" type="number" value="1">
          </div>

        </div>

        <div>
          <div class="jsbox-col-title opt">Run</div>

          <button class="jsbox-btn jsbox-btn-primary" id="startBtn">Start</button>
          <button class="jsbox-btn jsbox-btn-success" id="stepBtn">Step</button>

        </div>

      </div>
    </div>

    <!-- Visualization -->
    <div class="jsbox-vis-layout">

      <div class="jsbox-vis-left">
        <div class="jsbox-card">
          <div class="jsbox-card-header">Particles</div>
          <div class="jsbox-card-body">
            <canvas id="mcCanvas" class="jsbox-canvas-container"></canvas>
          </div>
        </div>
      </div>

      <div class="jsbox-vis-right">

        <div class="jsbox-card">
          <div class="jsbox-card-header">Energy</div>
          <div class="jsbox-card-body">
            <canvas id="energyChart" class="jsbox-chart"></canvas>
          </div>
        </div>

        <div class="jsbox-card">
          <div class="jsbox-card-header">Pressure</div>
          <div class="jsbox-card-body">
            <canvas id="pressureChart" class="jsbox-chart"></canvas>
          </div>
        </div>

      </div>

    </div>

    <div class="jsbox-alert" id="status">Idle</div>

  </div>
</div>
