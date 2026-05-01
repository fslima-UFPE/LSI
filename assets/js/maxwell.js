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
    
    // Globals for state management
    let exactPsat = 0; 
    let currentP_global = 0;
    let stepP = 1;

    // Numerical Solver for exact Psat (no fills, just math)
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

    // Engine: Generates Trace Coordinates and Area Data
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
            
            // Detect Intersection
            if (isBelow !== currentlyBelow) {
                // Precise intersection using linear interpolation
                // x = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
                const V_interp = V_prev + (P_test - P_prev) * (V_curr - V_prev) / (P_curr - P_prev);

                if (crossings === 0) { // C1: Entering Loop 1 (A1)
                    a1_X = [V_interp, V_curr]; a1_Y = [P_test, P_curr];
                } else if (crossings === 1) { // C2: Exiting Loop 1, Entering Loop 2 (A2)
                    a1_X.push(V_interp); a1_Y.push(P_test); // Finalize A1 path
                    a2_X = [V_interp, V_curr]; a2_Y = [P_test, P_curr]; // Start A2 path
                } else if (crossings === 2) { // C3: Exiting Loop 2
                    a2_X.push(V_interp); a2_Y.push(P_test); // Finalize A2 path
                }
                crossings++;
                currentlyBelow = isBelow;
            } else {
                // Just moving along the isotherm curve
                if (crossings === 1) { a1_X.push(V_curr); a1_Y.push(P_curr); }
                else if (crossings === 2) { a2_X.push(V_curr); a2_Y.push(P_curr); }
            }

            // Area math using Trapezoidal rule
            if (crossings === 1 && a1_X.length > 2) {
                a1 += 0.5 * ((P_test - P_prev) + (P_test - P_curr)) * dV;
            } else if (crossings === 2 && a2_X.length > 2) {
                a2 += 0.5 * ((P_prev - P_test) + (P_curr - P_test)) * dV;
            }
        }

        // Close the polygons (loop back to P_test)
        if (a1_X.length > 3) {
            a1_X.push(a1_X[0]); a1_Y.push(P_test);
        }
        if (a2_X.length > 3) {
            a2_X.push(a2_X[0]); a2_Y.push(P_test);
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

    // UI Colors (RGBA for transparency)
    const colorRedMin = 'rgba(220, 53, 69, 0.7)'; // Loop is smaller
    const colorBlueMax = 'rgba(0, 123, 255, 0.7)'; // Loop is larger
    const colorPurpleSnap = 'rgba(111, 66, 193, 0.8)'; // Loop is balanced

    function handlePressureChange(newP, isFromDrag = false) {
        let results = calculateMaxwellTraces(newP);
        let diff = Math.abs(results.a1 - results.a2);
        let total = results.a1 + results.a2;
        let err = total > 0 ? (diff / total) * 100 : 100;

        let finalP = newP;
        let isSnapped = false;

        // MAGNETIC SNAP: If error < 5%
        if (results.crossings === 3 && err < 5.0 && err > 0.05) {
            finalP = exactPsat;
            isSnapped = true;
            // Recalculate everything against the true truth
            results = calculateMaxwellTraces(finalP);
            err = 0; 
        }

        currentP_global = finalP;

        // 1. DYNAMIC COLOR LOGIC
        let colorA1, colorA2;
        
        if (err < 1.0) { // The BALANCED state
            colorA1 = colorPurpleSnap;
            colorA2 = colorPurpleSnap;
        } else if (results.a1 > results.a2) { // A1 > A2
            colorA1 = colorBlueMax;
            colorA2 = colorRedMin;
        } else { // A2 > A1
            colorA1 = colorRedMin;
            colorA2 = colorBlueMax;
        }

        // 2. UI Updates (Text/Labels)
        a1Label.innerText = results.a1.toFixed(3);
        a2Label.innerText = results.a2.toFixed(3);
        diffLabel.innerText = err.toFixed(1) + "%";
        pValLabel.innerText = finalP.toFixed(2);

        if (err < 1.0 && results.crossings === 3) {
            pDisplayBox.classList.add("snapped");
            pDisplayBox.innerHTML = `🎉 Sucesso! Pressão de Saturação: <b id="currentP-val">${finalP.toFixed(2)}</b> bar`;
        } else {
            pDisplayBox.classList.remove("snapped");
            pDisplayBox.innerHTML = `Pressão de Teste Atual: <b id="currentP-val">${finalP.toFixed(2)}</b> bar`;
        }

        // 3. PLOTLY UPDATE (Restyle)
        // Move the line physically if needed
        if (isSnapped || !isFromDrag) {
            Plotly.relayout(chartDiv, { 'shapes[0].y0': finalP, 'shapes[0].y1': finalP });
        }

        // Update Trace 1 (A1 Fill) and Trace 2 (A2 Fill) with new polygon data and colors
        // Restyle uses arrays of indices [1, 2] to apply to both traces simultaneously
        const newTraceData = {
            'x': [results.a1_poly ? results.a1_poly.x : [], results.a2_poly ? results.a2_poly.x : []],
            'y': [results.a1_poly ? results.a1_poly.y : [], results.a2_poly ? results.a2_poly.y : []],
            'fillcolor': [colorA1, colorA2]
        };
        Plotly.restyle(chartDiv, newTraceData, [1, 2]);
    }

    function drawIsotherm() {
        const molKey = document.getElementById('moleculeSelect').value;
        const T = parseFloat(document.getElementById('tempInput').value);
        const { a, b, Tc } = substanceDB[molKey];
        
        document.getElementById('tcBadge').innerText = `Tc = ${Tc.toFixed(1)} K`;
        const tcAlert = document.getElementById('tcAlert');

        if (T >= Tc) {
            tcAlert.innerText = `⚠️ Escolha T < ${Tc.toFixed(1)} K`;
            Plotly.purge(chartDiv); 
            btnUp.disabled = true; btnDown.disabled = true;
            pDisplayBox.style.display = "none";
            return;
        } else {
            tcAlert.innerText = "";
            btnUp.disabled = false; btnDown.disabled = false;
            pDisplayBox.style.display = "block";
        }

        currentVArray = [];
        currentPArray = [];
        let V = b * 1.02; 
        const maxV = b * 50; 
        const numPoints = 1500; 
        const dV = (maxV - V) / numPoints;

        let localMinP = null, localMaxP = null, localMaxV = null;
        let goingUp = false;

        // Generate full high-res isotherm data
        for (let i = 0; i <= numPoints; i++) {
            const P = (R * T) / (V - b) - (a / (V * V));
            currentVArray.push(V); currentPArray.push(P);
            if (i > 0) {
                if (!goingUp && P > currentPArray[i-1]) {
                    localMinP = currentPArray[i-1]; goingUp = true;
                } else if (goingUp && P < currentPArray[i-1]) {
                    localMaxP = currentPArray[i-1]; localMaxV = currentVArray[i-1]; goingUp = false;
                }
            }
            V += dV;
        }

        let yDomain = [0, 100], xDomain = [b, b * 20], initialPGuess = 50;

        if (localMinP !== null && localMaxP !== null) {
            const yPadding = (localMaxP - localMinP) * 0.2;
            yDomain = [localMinP - yPadding, localMaxP + yPadding];
            xDomain = [b * 1.1, localMaxV * 5]; 
            initialPGuess = localMinP + (localMaxP - localMinP) * 0.15; 
            
            exactPsat = findExactPsat(localMinP, localMaxP);
            stepP = (localMaxP - localMinP) / 100;
        }

        // --- DEFINING THE 3 TRACES ---

        // Trace 0: The Isotherm Line (Solid, no fill)
        const isothermTrace = {
            x: currentVArray, y: currentPArray, mode: 'lines', name: 'Isoterma',
            line: { color: '#0056b3', width: 3 }, hoverinfo: 'none'
        };

        // Trace 1: A1 Loop Fill (Closed polygon, solid color)
        const a1FillTrace = {
            x: [], y: [], fill: 'toself', mode: 'lines', line: { width: 0 },
            name: 'Área 1', hoverinfo: 'none', fillcolor: colorRedMin
        };

        // Trace 2: A2 Loop Fill
        const a2FillTrace = {
            x: [], y: [], fill: 'toself', mode: 'lines', line: { width: 0 },
            name: 'Área 2', hoverinfo: 'none', fillcolor: colorBlueMax
        };

        const layout = {
            title: { text: `Isoterma vdW (${molKey}) a ${T} K`, font: { family: 'Segoe UI', size: 16 } },
            xaxis: { title: 'Volume Molar (L/mol)', range: xDomain, zeroline: false },
            yaxis: { title: 'Pressão (bar)', range: yDomain, zeroline: false },
            // Red draggable line
            shapes: [{
                type: 'line', xref: 'paper', x0: 0, x1: 1, y0: initialPGuess, y1: initialPGuess,
                line: { color: '#dc3545', width: 3, dash: 'dash' }, editable: true
            }],
            margin: { l: 60, r: 30, b: 60, t: 60 },
            plot_bgcolor: "white", paper_bgcolor: "#f8f9fa", dragmode: 'pan',
            showlegend: false // Legend is clutter here
        };

        const data = [isothermTrace, a1FillTrace, a2FillTrace];

        Plotly.newPlot(chartDiv, data, layout, { responsive: true, displayModeBar: false, edits: { shapePosition: true } }).then(() => {
            // Initial render
            handlePressureChange(initialPGuess, false);
            
            if (chartDiv.removeAllListeners) chartDiv.removeAllListeners('plotly_relayout');

            chartDiv.on('plotly_relayout', function(eventData) {
                if (eventData['shapes[0].y0'] !== undefined) {
                    const draggedP = eventData['shapes[0].y0'];
                    if (Math.abs(draggedP - exactPsat) < 1e-4) return; 
                    handlePressureChange(draggedP, true);
                }
            });
        });
    }

    // Button Listeners
    btnUp.onclick = () => handlePressureChange(currentP_global + stepP, false);
    btnDown.onclick = () => handlePressureChange(currentP_global - stepP, false);

    // Initial Listeners
    document.getElementById('moleculeSelect').addEventListener('change', drawIsotherm);
    document.getElementById('tempInput').addEventListener('change', drawIsotherm);

    drawIsotherm();
});
