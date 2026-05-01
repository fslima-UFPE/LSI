document.addEventListener('DOMContentLoaded', () => {
    
    // ==========================================
    // 1. Thermodynamic Database & Engine
    // ==========================================
    const substanceDB = {
        "H2O": { a: 5.536, b: 0.03049, Tc: 647.1 }, 
        "CO2": { a: 3.640, b: 0.04267, Tc: 304.1 },
        "N2":  { a: 1.370, b: 0.03871, Tc: 126.2 }
    };

    const R = 0.083144; // L bar / (mol K)

    let currentVArray = [];
    let currentPArray = [];
    
    function calculateLoopAreas(P_test) {
        if (currentPArray.length === 0) return { a1: 0, a2: 0, crossings: 0 };

        let a1 = 0; 
        let a2 = 0; 
        let crossings = 0;
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
                const heightPrev = P_test - P_vdW_prev;
                const heightCurr = P_test - P_vdW_curr;
                a1 += 0.5 * (heightPrev + heightCurr) * dV;
            }
            else if (crossings === 2) {
                const heightPrev = P_vdW_prev - P_test;
                const heightCurr = P_vdW_curr - P_test;
                a2 += 0.5 * (heightPrev + heightCurr) * dV;
            }
        }
        return { a1: Math.abs(a1), a2: Math.abs(a2), crossings };
    }

    // ==========================================
    // 2. Visualization & Interactive Logic
    // ==========================================
    const chartDiv = document.getElementById('isothermChart');
    
    // SAFETY CHECK: Prevents crash if the chart div isn't on the current page
    if (!chartDiv) return; 

    const a1Label = document.getElementById('a1-val');
    const a2Label = document.getElementById('a2-val');
    const diffLabel = document.getElementById('diff-val');
    const equalAlert = document.getElementById('equalAlert');

    function updateAreasUI(P_guess) {
        const results = calculateLoopAreas(P_guess);
        
        a1Label.innerText = results.a1.toFixed(2);
        a2Label.innerText = results.a2.toFixed(2);
        
        const diff = Math.abs(results.a1 - results.a2);
        diffLabel.innerText = diff.toFixed(3);

        if (results.crossings === 3 && diff < 0.25) {
            equalAlert.style.display = "block";
        } else {
            equalAlert.style.display = "none";
        }
    }

    function drawIsotherm() {
        const molKey = document.getElementById('moleculeSelect').value;
        const T = parseFloat(document.getElementById('tempInput').value);
        
        const { a, b, Tc } = substanceDB[molKey];
        const tcAlert = document.getElementById('tcAlert');

        if (T >= Tc) {
            tcAlert.innerText = `⚠️ T deve ser < que Tc (${Tc.toFixed(1)} K)`;
            Plotly.purge(chartDiv); 
            return;
        } else {
            tcAlert.innerText = "";
        }

        currentVArray = [];
        currentPArray = [];
        
        let V = b * 1.05; 
        const maxV = b * 30; 
        const numPoints = 600;
        const dV = (maxV - V) / numPoints;

        let minPSeen = Infinity;
        let maxPSeen = -Infinity;

        for (let i = 0; i <= numPoints; i++) {
            const P = (R * T) / (V - b) - (a / (V * V));
            currentVArray.push(V);
            currentPArray.push(P);
            
            if (P > maxPSeen) maxPSeen = P;
            if (P < minPSeen) minPSeen = P;
            V += dV;
        }

        const isothermTrace = {
            x: currentVArray,
            y: currentPArray,
            mode: 'lines',
            name: 'Isoterma vdW',
            line: { color: '#0056b3', width: 3 },
            hoverinfo: 'x+y'
        };

        const initialPGuess = (maxPSeen + minPSeen) / 2;
        const data = [isothermTrace];

        const layout = {
            title: {
                text: `Isoterma de van der Waals para ${molKey} a ${T} K`,
                font: { family: 'Segoe UI', size: 18 }
            },
            xaxis: { title: 'Volume Molar (L/mol)', zeroline: false, gridcolor: '#e1e4e8' },
            yaxis: { title: 'Pressão (bar)', gridcolor: '#e1e4e8', range: [Math.max(-50, minPSeen * 1.5), maxPSeen * 1.1] },
            shapes: [{
                type: 'line', xref: 'paper', x0: 0, x1: 1, y0: initialPGuess, y1: initialPGuess,
                line: { color: '#dc3545', width: 3, dash: 'dash' },
                editable: true
            }],
            margin: { l: 60, r: 30, b: 60, t: 80 },
            plot_bgcolor: "white", paper_bgcolor: "#f8f9fa"
        };

        const config = { responsive: true, displayModeBar: false, edits: { shapePosition: true } };

        Plotly.newPlot(chartDiv, data, layout, config).then(() => {
            updateAreasUI(initialPGuess);
            
            if (chartDiv.removeAllListeners) {
                chartDiv.removeAllListeners('plotly_relayout');
            }

            chartDiv.on('plotly_relayout', function(eventData) {
                if (eventData['shapes[0].y0'] !== undefined) {
                    const newPGuess = eventData['shapes[0].y0'];
                    updateAreasUI(newPGuess);
                }
            });
        });
    }

    // ==========================================
    // 3. Initialization Listeners
    // ==========================================
    document.getElementById('moleculeSelect').addEventListener('change', drawIsotherm);
    document.getElementById('tempInput').addEventListener('change', drawIsotherm);

    // Run on Load
    drawIsotherm();
});
