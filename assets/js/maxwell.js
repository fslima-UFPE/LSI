document.addEventListener('DOMContentLoaded', () => {
    
    // ==========================================
    // 1. Thermodynamic Database & Engine
    // ==========================================
    const substanceDB = {
        "H2O": { a: 5.536, b: 0.03049, Tc: 647.1 }, 
        "CO2": { a: 3.640, b: 0.04267, Tc: 304.1 },
        "N2":  { a: 1.370, b: 0.03871, Tc: 126.2 }
    };

    const R = 0.083144; 

    let currentVArray = [];
    let currentPArray = [];
    
    let exactPsat = 0; 
    let currentP_global = 0;
    let stepP = 1;
    let snapThresholdP = 0; 
    
    // NEW: Global boundaries for our warnings
    let globalMinP = 0; 
    let globalMaxP = 0;

    function mathOnlyAreas(P_test) {
        if (currentPArray.length === 0) return { a1: 0, a2: 0 };
        let a1 = 0, a2 = 0, crossings = 0;
        let currentlyBelow = currentPArray[0] < P_test;

        for (let i = 1; i < currentPArray.length; i++) {
            const P_curr = currentPArray[i], P_prev = currentPArray[i-1];
            const V_curr = currentVArray[i], V_prev = currentVArray[i-1];
            const dV = V_curr - V_prev;

            const isBelow = P_curr < P_test;
            if (isBelow !== currentlyBelow) { crossings++; currentlyBelow = isBelow; }

            if (crossings === 1) {
                a1 += 0.5 * ((P_test - P_prev) + (P_test - P_curr)) * dV;
            } else if (crossings === 2) {
                a2 += 0.5 * ((P_prev - P_test) + (P_curr - P_test)) * dV;
            }
        }
        return { a1: Math.abs(a1), a2: Math.abs(a2) };
    }

    function findExactPsat(minP, maxP) {
        let low = minP, high = maxP;
        for (let k = 0; k < 40; k++) {
            let mid = (low + high) / 2;
            let res = mathOnlyAreas(mid);
            if (res.a1 > res.a2) high = mid; 
            else low = mid;
        }
        return (low + high) / 2;
    }

    function calculateMaxwellTraces(P_test) {
        if (currentPArray.length === 0) return { a1: 0, a2: 0, crossings: 0, a1_poly: null, a2_poly: null };

        let a1 = 0, a2 = 0, crossings = 0;
        let a1_X = [], a1_Y = [], a2_X = [], a2_Y = [];
        let currentlyBelow = currentPArray[0] < P_test;

        for (let i = 1; i < currentPArray.length; i++) {
            const P_curr = currentPArray[i], P_prev = currentPArray[i-1];
            const V_curr = currentVArray[i], V_prev = currentVArray[i-1];
            const dV = V_curr - V_prev;

            const isBelow = P_curr < P_test;
            
            if (isBelow !== currentlyBelow) {
                const V_interp = V_prev + (P_test - P_prev) * (V_curr - V_prev) / (P_curr - P_prev);

                if (crossings === 0) { 
                    a1_X = [V_interp, V_curr]; a1_Y = [P_test, P_curr];
                } else if (crossings === 1) { 
                    a1_X.push(V_interp); a1_Y.push(P_test); 
                    a2_X = [V_interp, V_curr]; a2_Y = [P_test, P_curr]; 
                } else if (crossings === 2) { 
                    a2_X.push(V_interp); a2_Y.push(P_test); 
                }
                crossings++;
                currentlyBelow = isBelow;
            } else {
                if (crossings === 1) { a1_X.push(V_curr); a1_Y.push(P_curr); }
                else if (crossings === 2) { a2_X.push(V_curr); a2_Y.push(P_curr); }
            }

            if (crossings === 1 && a1_X.length > 2) {
                a1 += 0.5 * ((P_test - P_prev) + (P_test - P_curr)) * dV;
            } else if (crossings === 2 && a2_X.length > 2) {
                a2 += 0.5 * ((P_prev - P_test) + (P_curr - P_test)) * dV;
            }
        }

        if (crossings === 3) {
            if (a1_X.length > 3) {
                a1_X.push(a1_X[0]); a1_Y.push(P_test);
            }
            if (a2_X.length > 3) {
                a2_X.push(a2_X[0]); a2_Y.push(P_test);
            }
        } else {
            a1_X = []; a1_Y = []; a2_X = []; a2_Y = [];
            a1 = 0; a2 = 0;
        }

        return {
            a1: Math.abs(a1), a2: Math.abs(a2), crossings,
            a1_poly: a1_X.length > 3 ? { x: a1_X, y: a1_Y } : null,
            a2_poly: a2_X.length > 3 ? { x: a2_X, y: a2_Y } : null
        };
    }

    // ==========================================
    // 2. Visualization & Interactive Logic
    // ==========================================
    const chartDiv = document.getElementById('isothermChart');
    if (!chartDiv) return; 

    const a1Label = document.getElementById('a1-val');
    const a2Label = document.getElementById('a2-val');
    const diffLabel = document.getElementById('diff-val');
    const pDisplayBox = document.getElementById('pDisplayBox');
    const pValLabel = document.getElementById('currentP-val');
    const btnUp = document.getElementById('btnUp');
    const btnDown = document.getElementById('btnDown');

    const colorRedMin = 'rgba(220, 53, 69, 0.7)'; 
    const colorBlueMax = 'rgba(0, 123, 255, 0.7)'; 
    const colorPurpleSnap = 'rgba(111, 66, 193, 0.8)'; 

    function handlePressureChange(newP) {
        let results = calculateMaxwellTraces(newP);
        let diff = Math.abs(results.a1 - results.a2);
        let total = results.a1 + results.a2;
        // Fallback to 0 if total area is zero to prevent NaN
        let err = total > 0 ? (diff / total) * 100 : 0; 

        let finalP = newP;
        let isSnapped = false;
        
        let distToExact = Math.abs(newP - exactPsat);

        if (results.crossings === 3 && distToExact < snapThresholdP && distToExact > 1e-4) {
            finalP = exactPsat;
            isSnapped = true;
            results = calculateMaxwellTraces(finalP);
            err = 0; 
            results.a2 = results.a1; 
        }

        currentP_global = finalP;

        let colorA1, colorA2;
        if (isSnapped || (err < 1.0 && results.crossings === 3)) { 
            colorA1 = colorPurpleSnap; colorA2 = colorPurpleSnap;
        } else if (results.a1 > results.a2) { 
            colorA1 = colorBlueMax; colorA2 = colorRedMin;
        } else { 
            colorA1 = colorRedMin; colorA2 = colorBlueMax;
        }

        if (a1Label) a1Label.innerText = results.a1.toFixed(3);
        if (a2Label) a2Label.innerText = results.a2.toFixed(3);
        if (pValLabel) pValLabel.innerText = finalP.toFixed(2);

        // NEW: Warning logic for out-of-bounds pressure
        if (pDisplayBox) {
            pDisplayBox.classList.remove("snapped");
            
            if (finalP > globalMaxP && globalMaxP !== null) {
                if (diffLabel) diffLabel.innerText = "N/A";
                pDisplayBox.innerHTML = `⚠️ Pressure is above local max! (<b id="currentP-val">${finalP.toFixed(2)}</b> bar)`;
            } else if (finalP < globalMinP && globalMinP !== null) {
                if (diffLabel) diffLabel.innerText = "N/A";
                pDisplayBox.innerHTML = `⚠️ Pressure is below local min! (<b id="currentP-val">${finalP.toFixed(2)}</b> bar)`;
            } else {
                // Normal operations
                if (diffLabel) diffLabel.innerText = results.crossings === 3 ? err.toFixed(1) + "%" : "N/A";
                
                if ((isSnapped || err < 1.0) && results.crossings === 3) {
                    pDisplayBox.classList.add("snapped");
                    pDisplayBox.innerHTML = `🎉 Success! Saturation Pressure: <b id="currentP-val">${finalP.toFixed(2)}</b> bar`;
                } else {
                    pDisplayBox.innerHTML = `Current Test Pressure: <b id="currentP-val">${finalP.toFixed(2)}</b> bar`;
                }
            }
        }

        Plotly.relayout(chartDiv, { 
            'shapes[0].y0': finalP, 
            'shapes[0].y1': finalP,
            'shapes[0].x0': 0, 
            'shapes[0].x1': 1  
        });

        const newTraceData = {
            'x': [results.a1_poly ? results.a1_poly.x : [], results.a2_poly ? results.a2_poly.x : []],
            'y': [results.a1_poly ? results.a1_poly.y : [], results.a2_poly ? results.a2_poly.y : []],
            'fillcolor': [colorA1, colorA2]
        };
        Plotly.restyle(chartDiv, newTraceData, [1, 2]);
    }

    function drawIsotherm() {
        const molSelect = document.getElementById('moleculeSelect');
        const tempInput = document.getElementById('tempInput');
        if (!molSelect || !tempInput) return;

        const molKey = molSelect.value;
        const T = parseFloat(tempInput.value);
        const { a, b, Tc } = substanceDB[molKey];
        
        const tcBadge = document.getElementById('tcBadge');
        if (tcBadge) tcBadge.innerText = `Tc = ${Tc.toFixed(1)} K`;
        
        const tcAlert = document.getElementById('tcAlert');

        if (T >= Tc) {
            if (tcAlert) tcAlert.innerText = `⚠️ Choose T < ${Tc.toFixed(1)} K`;
            Plotly.purge(chartDiv); 
            if (btnUp) btnUp.disabled = true; if (btnDown) btnDown.disabled = true;
            if (pDisplayBox) pDisplayBox.style.display = "none";
            return;
        } else {
            if (tcAlert) tcAlert.innerText = "";
            if (btnUp) btnUp.disabled = false; if (btnDown) btnDown.disabled = false;
            if (pDisplayBox) pDisplayBox.style.display = "block";
        }

        currentVArray = [];
        currentPArray = [];

        const maxV = Math.max(b * 1000, (R * T) / 0.01); 
        const numPoints = 2000; 
        const logVStart = Math.log(b * 1.02);
        const logVEnd = Math.log(maxV);
        const dLogV = (logVEnd - logVStart) / numPoints;

        globalMinP = null; 
        globalMaxP = null; 
        let localMaxV = null;
        let goingUp = false;

        for (let i = 0; i <= numPoints; i++) {
            const V = Math.exp(logVStart + i * dLogV);
            const P = (R * T) / (V - b) - (a / (V * V));
            
            currentVArray.push(V); currentPArray.push(P);
            
            if (i > 0) {
                if (!goingUp && P > currentPArray[i-1]) {
                    globalMinP = currentPArray[i-1]; goingUp = true;
                } else if (goingUp && P < currentPArray[i-1]) {
                    globalMaxP = currentPArray[i-1]; localMaxV = currentVArray[i-1]; goingUp = false;
                }
            }
        }

        let yDomain = [0, 100], xDomain = [b, b * 20], initialPGuess = 50;

        if (globalMinP !== null && globalMaxP !== null) {
            const yPadding = (globalMaxP - globalMinP) * 0.2;
            yDomain = [globalMinP - yPadding, globalMaxP + yPadding];
            xDomain = [b * 1.1, localMaxV * 5]; 
            
            initialPGuess = globalMinP + (globalMaxP - globalMinP) * 0.15; 
            exactPsat = findExactPsat(globalMinP, globalMaxP);
            stepP = (globalMaxP - globalMinP) / 100; 
            snapThresholdP = (globalMaxP - globalMinP) * 0.025; 
        }

        const isothermTrace = {
            x: currentVArray, y: currentPArray, mode: 'lines', name: 'Isotherm',
            line: { color: '#0056b3', width: 3 }, hoverinfo: 'none'
        };

        const a1FillTrace = {
            x: [], y: [], fill: 'toself', mode: 'lines', line: { width: 0 },
            name: 'Area 1', hoverinfo: 'none', fillcolor: colorRedMin
        };

        const a2FillTrace = {
            x: [], y: [], fill: 'toself', mode: 'lines', line: { width: 0 },
            name: 'Area 2', hoverinfo: 'none', fillcolor: colorBlueMax
        };

        const layout = {
            title: { text: `vdW Isotherm (${molKey}) at ${T} K`, font: { family: 'Segoe UI', size: 16 } },
            xaxis: { title: 'Molar Volume (L/mol)', range: xDomain, zeroline: false, fixedrange: true },
            yaxis: { title: 'Pressure (bar)', range: yDomain, zeroline: false, fixedrange: true },
            shapes: [{
                type: 'line', xref: 'paper', x0: 0, x1: 1, y0: initialPGuess, y1: initialPGuess,
                line: { color: '#dc3545', width: 3, dash: 'dash' }, editable: true
            }],
            margin: { l: 60, r: 30, b: 60, t: 60 },
            plot_bgcolor: "white", paper_bgcolor: "#f8f9fa", 
            dragmode: false, 
            showlegend: false 
        };

        const data = [isothermTrace, a1FillTrace, a2FillTrace];

        Plotly.newPlot(chartDiv, data, layout, { responsive: true, displayModeBar: false, edits: { shapePosition: true } }).then(() => {
            handlePressureChange(initialPGuess);
            
            if (chartDiv.removeAllListeners) chartDiv.removeAllListeners('plotly_relayout');

            chartDiv.on('plotly_relayout', function(eventData) {
                if (eventData['shapes[0].y0'] !== undefined) {
                    const draggedP = eventData['shapes[0].y0'];
                    if (Math.abs(draggedP - currentP_global) < 1e-4) return; 
                    handlePressureChange(draggedP);
                }
            });
        });
    }

    // ==========================================
    // 3. Initialization Listeners & Safety
    // ==========================================
    
    if (btnUp) btnUp.onclick = () => handlePressureChange(currentP_global + stepP);
    if (btnDown) btnDown.onclick = () => handlePressureChange(currentP_global - stepP);

    const molSelectEl = document.getElementById('moleculeSelect');
    const tempInputEl = document.getElementById('tempInput');

    if (molSelectEl) molSelectEl.addEventListener('change', drawIsotherm);
    if (tempInputEl) tempInputEl.addEventListener('change', drawIsotherm);

    if (molSelectEl && tempInputEl) {
        drawIsotherm();
    }
});
