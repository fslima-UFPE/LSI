---
layout: TCclass
title: Construção de Maxwell
subtitle: Simulador Interativo de Equilíbrio Líquido-Vapor
---

Arraste a linha tracejada vermelha no gráfico ou use a barra de rolagem abaixo para encontrar a pressão onde as áreas dos ciclos termodinâmicos se igualam!

<style>
    .maxwell-container { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin-top: 20px; }
    .control-panel { background: #f8f9fa; padding: 20px; border-radius: 12px; margin-bottom: 20px; border: 1px solid #e1e4e8; display: flex; flex-direction: column; gap: 15px;}
    .input-row { display: flex; flex-wrap: wrap; gap: 15px; align-items: center; }
    .input-group { display: flex; align-items: center; gap: 8px; }
    .control-panel label { font-weight: bold; font-size: 0.95em; margin-bottom: 0;}
    .control-panel select, .control-panel input[type="number"] { padding: 8px; border: 1px solid #ccc; border-radius: 6px; font-size: 1em;}
    .control-panel input[type="number"] { width: 90px; }
    .tc-badge { background: #e2e3e5; padding: 5px 10px; border-radius: 15px; font-size: 0.85em; font-weight: bold; color: #495057;}
    .tc-alert { color: #dc3545; font-size: 0.85em; font-weight: bold; }
    
    .slider-container { width: 100%; display: flex; align-items: center; gap: 10px; background: #fff; padding: 10px 15px; border-radius: 8px; border: 1px solid #dee2e6;}
    .slider-container input[type="range"] { flex-grow: 1; cursor: pointer; }

    #resultsBox { font-size: 1.1em; padding: 20px; background: #e8f4f8; border-radius: 12px; border: 1px solid #b8dae6; display: flex; flex-direction: column; gap: 5px; margin-top: 20px;}
    .area-display { display: flex; gap: 20px; flex-wrap: wrap;}
    .areas-equal { color: #155724; font-weight: bold; margin-top: 10px; padding: 10px; background: #d4edda; border-radius: 6px; border: 1px solid #c3e6cb;}
    #isothermChart { border-radius: 12px; border: 1px solid #e1e4e8; background-color: white; width: 100%; height: 500px;}
</style>

<script src="https://cdn.plot.ly/plotly-2.27.0.min.js" charset="utf-8"></script>

<div class="maxwell-container">
    <div class="control-panel">
        <div class="input-row">
            <div class="input-group">
                <label>Substância:</label>
                <select id="moleculeSelect">
                    <option value="H2O" selected>Água (H2O)</option>
                    <option value="CO2">Dióxido de Carbono (CO2)</option>
                    <option value="N2">Nitrogênio (N2)</option>
                </select>
                <span id="tcBadge" class="tc-badge"></span>
            </div>
            <div class="input-group">
                <label>Temperatura (K):</label>
                <input type="number" id="tempInput" value="550" step="5">
                <span id="tcAlert" class="tc-alert"></span>
            </div>
        </div>
        
        <div class="slider-container">
            <label>Ajuste Fino (Mobile):</label>
            <input type="range" id="pSlider" value="0">
        </div>
    </div>

    <div id="isothermChart"></div>

    <div id="resultsBox">
        <div class="area-display">
            <div>Área 1 (A<sub>1</sub>): <b id="a1-val">0.00</b></div>
            <div>Área 2 (A<sub>2</sub>): <b id="a2-val">0.00</b></div>
        </div>
        <div>Erro Relativo: <b id="diff-val">0.0%</b></div>
        <div id="equalAlert" class="areas-equal" style="display: none;">
            🎉 Excelente! Você encontrou a Pressão de Transição de Fase (margem de erro &lt; 5%).
        </div>
    </div>
</div>

<script src="{{ '/assets/js/maxwell.js' | relative_url }}"></script>
