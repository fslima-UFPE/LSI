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
    
    function calculateLoopAreas(P_test) {
        if (currentPArray.length === 0) return { a1: 0, a2: 0, crossings: 0 };

        let a1 = 0, a2 = 0, crossings = 0;
        let currentlyBelow = currentPArray[0] < P_test;

        for (let i = 1; i < currentPArray.length; i++) {
            const P_vdW_prev = currentPArray[i-1];
            const P_vdW_curr = currentPArray[i];
            const V_prev = currentVArray[i-1];
            const V_curr = currentVArray[i];
            const dV = V_curr - V_prev;

            const isBelow = P_vdW_curr < P_test;
            
            if (isBelow !== currentlyBelow) {
                crossings++;
                currentlyBelow = isBelow;
            }

            if (crossings === 1) {
                a1 += 0.5 * ((P_test - P_vdW_prev) + (P_test - P_vdW_curr)) * dV;
            }
            else if (crossings === 2) {
                a2 += 0.5 * ((P_vdW_prev - P_test) + (P_vdW_curr - P_test)) * dV;
            }
        }
        return { a1: Math.abs(a1), a2: Math.abs(a2), crossings };
    }

    // ==========================================
    // 2. Visualization & Interactive Logic
    // ==========================================
    const chartDiv = document.getElementById('isothermChart');
    if (!chartDiv) return; 

    const a1Label = document.getElementById('a1-val');
    const a2Label = document.getElementById('a2-val');
    const diffLabel = document.getElementById('diff-val');
    const equalAlert = document.getElementById('equalAlert');
    const pSlider = document.getElementById('pSlider');

    // Update UI and check for "win" condition
    function updateAreasUI(P_guess) {
        const results = calculateLoopAreas(P_guess);
        
        a1Label.innerText = results.a1.toFixed(3);
        a2Label.innerText = results.a2.toFixed(3);
        
        const diff = Math.abs(results.a1 - results.a2);
        const totalArea = results.a1 + results.a2;
        
        // Calculate relative percentage error (safeguard against division by zero)
        let percentError = 100; 
        if (totalArea > 0) percentError = (diff / totalArea) * 100;

        diffLabel.innerText = percentError.toFixed(1) + "%";

        // WIN CONDITION: 3 crossings and less than 5% difference
        if (results.crossings === 3 && percentError < 5.0) {
            equalAlert.style.display = "block";
        } else {
            equalAlert.style.display = "none";
        }
    }

    function drawIsotherm() {
        const molKey = document.getElementById('moleculeSelect').value;
        const T = parseFloat(document.getElementById('tempInput').value);
        const { a, b, Tc } = substanceDB[molKey];
        
        // Update Tc Badges
        document.getElementById('tcBadge').innerText = `Tc = ${Tc.toFixed(1)} K`;
        const tcAlert = document.getElementById('tcAlert');

        if (T >= Tc) {
            tcAlert.innerText = `⚠️ Escolha T < ${Tc.toFixed(1)} K`;
            Plotly.purge(chartDiv); 
            pSlider.disabled = true;
            return;
        } else {
            tcAlert.innerText = "";
            pSlider.disabled = false;
        }

        currentVArray = [];
        currentPArray = [];
        
        let V = b * 1.02; // Start very close to b
        const maxV = b * 50; // Generate plenty of data points
        const numPoints = 1500; // High res for good integration
        const dV = (maxV - V) / numPoints;

        let localMinP = null, localMaxP = null;
        let localMaxV = null;
        let goingUp = false;

        // Generate data and find the "Wave" peaks mathematically
        for (let i = 0; i <= numPoints; i++) {
            const P = (R * T) / (V - b) - (a / (V * V));
            currentVArray.push(V);
            currentPArray.push(P);
            
            // Peak/Valley Detection for Smart Autoscaling
            if (i > 0) {
                if (!goingUp && P > currentPArray[i-1]) {
                    localMinP = currentPArray[i-1];
                    goingUp = true;
                } else if (goingUp && P < currentPArray[i-1]) {
                    localMaxP = currentPArray[i-1];
                    localMaxV = currentVArray[i-1];
                    goingUp = false;
                }
            }
            V += dV;
        }

        // Define Smart Plot Boundaries based on the detected wave
        let yDomain = [0, 100];
        let xDomain = [b, b * 20];
        let initialPGuess = 50;

        if (localMinP !== null && localMaxP !== null) {
            const yPadding = (localMaxP - localMinP) * 0.2;
            yDomain = [localMinP - yPadding, localMaxP + yPadding];
            xDomain = [b * 1.1, localMaxV * 5]; // Frame slightly past the maximum peak
            initialPGuess = (localMaxP + localMinP) / 2; // Start line in the exact middle
        }

        // Configure Slider Bounds to match the Y-axis visible area
        pSlider.min = yDomain[0];
        pSlider.max = yDomain[1];
        pSlider.step = (yDomain[1] - yDomain[0]) / 400; // Smooth sliding
        pSlider.value = initialPGuess;

        const isothermTrace = {
            x: currentVArray, y: currentPArray, mode: 'lines', name: 'Isoterma',
            line: { color: '#0056b3', width: 3 }, hoverinfo: 'none'
        };

        const layout = {
            title: { text: `Isoterma vdW (${molKey}) a ${T} K`, font: { family: 'Segoe UI', size: 16 } },
            xaxis: { title: 'Volume Molar (L/mol)', range: xDomain, zeroline: false },
            yaxis: { title: 'Pressão (bar)', range: yDomain, zeroline: false },
            shapes: [{
                type: 'line', xref: 'paper', x0: 0, x1: 1, y0: initialPGuess, y1: initialPGuess,
                line: { color: '#dc3545', width: 3, dash: 'dash' }, editable: true
            }],
            margin: { l: 60, r: 30, b: 60, t: 60 },
            plot_bgcolor: "white", paper_bgcolor: "#f8f9fa",
            dragmode: 'pan' // Better default for mobile
        };

        const config = { responsive: true, displayModeBar: false, edits: { shapePosition: true } };

        Plotly.newPlot(chartDiv, [isothermTrace], layout, config).then(() => {
            updateAreasUI(initialPGuess);
            
            if (chartDiv.removeAllListeners) chartDiv.removeAllListeners('plotly_relayout');

            // Listen to Chart Dragging
            chartDiv.on('plotly_relayout', function(eventData) {
                if (eventData['shapes[0].y0'] !== undefined) {
                    const newP = eventData['shapes[0].y0'];
                    pSlider.value = newP; // Sync slider
                    updateAreasUI(newP);
                }
            });
        });
    }

    // Slider Event Listener
    pSlider.addEventListener('input', function() {
        const val = parseFloat(this.value);
        // Move the Plotly line without redrawing the whole graph
        Plotly.relayout(chartDiv, { 'shapes[0].y0': val, 'shapes[0].y1': val });
        updateAreasUI(val);
    });

    // ==========================================
    // 3. Initialization Listeners
    // ==========================================
    document.getElementById('moleculeSelect').addEventListener('change', drawIsotherm);
    document.getElementById('tempInput').addEventListener('change', drawIsotherm);

    // Run on Load
    drawIsotherm();
});
