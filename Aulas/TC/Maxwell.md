---
layout: TCclass
title: Construção de Maxwell
subtitle: Simulador Interativo de Equilíbrio Líquido-Vapor
---

Arraste a linha tracejada vermelha para cima ou para baixo para encontrar a pressão onde as áreas dos ciclos termodinâmicos se igualam!

<style>
    .maxwell-container { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin-top: 20px; }
    .control-panel { background: #f8f9fa; padding: 20px; border-radius: 12px; margin-bottom: 20px; border: 1px solid #e1e4e8; display: flex; flex-wrap: wrap; gap: 15px; align-items: center;}
    .input-group { display: flex; align-items: center; gap: 8px; }
    .control-panel label { font-weight: bold; font-size: 0.95em; margin-bottom: 0;}
    .control-panel select, .control-panel input[type="number"] { padding: 8px; border: 1px solid #ccc; border-radius: 6px; font-size: 1em;}
    .control-panel input[type="number"] { width: 80px; }
    .tc-alert { color: #dc3545; font-size: 0.85em; margin-left: 10px; font-weight: bold; }
    
    #resultsBox { font-size: 1.1em; padding: 20px; background: #e8f4f8; border-radius: 12px; border: 1px solid #b8dae6; display: flex; flex-direction: column; gap: 5px; margin-top: 20px;}
    .area-display { display: flex; gap: 20px; flex-wrap: wrap;}
    .areas-equal { color: #155724; font-weight: bold; margin-top: 10px; padding: 10px; background: #d4edda; border-radius: 6px; border: 1px solid #c3e6cb;}
    #isothermChart { border-radius: 12px; border: 1px solid #e1e4e8; background-color: white; width: 100%; height: 500px;}
</style>

<script src="https://cdn.plot.ly/plotly-2.27.0.min.js" charset="utf-8"></script>

<div class="maxwell-container">
    <div class="control-panel">
        <div class="input-group">
            <label>Substância:</label>
            <select id="moleculeSelect">
                <option value="H2O" selected>Água (H2O)</option>
                <option value="CO2">Dióxido de Carbono (CO2)</option>
                <option value="N2">Nitrogênio (N2)</option>
            </select>
        </div>
        <div class="input-group">
            <label>T (K):</label>
            <input type="number" id="tempInput" value="550" step="5">
            <span id="tcAlert" class="tc-alert"></span>
        </div>
    </div>

    <div id="isothermChart"></div>

    <div id="resultsBox">
        <div class="area-display">
            <div>Área do Líquido (A<sub>1</sub>): <b id="a1-val">0.00</b></div>
            <div>Área do Vapor (A<sub>2</sub>): <b id="a2-val">0.00</b></div>
        </div>
        <div>Diferença (|A<sub>1</sub> - A<sub>2</sub>|): <b id="diff-val">0.00</b></div>
        <div id="equalAlert" class="areas-equal" style="display: none;">
            🎉 Áreas iguais! Você encontrou a Pressão de Saturação para esta temperatura.
        </div>
    </div>
</div>
