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
    
    // SAFETY: If the chart container doesn't exist on this page, stop running the script.
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
            results = calculateMaxwellTraces(finalP);
            err = 0; 
        }

        currentP_global = finalP;

        // 1. DYNAMIC COLOR LOGIC
        let colorA1, colorA2;
        
        if (err < 1.0) { // BALANCED state
            colorA1 = colorPurpleSnap;
            colorA2 = colorPurpleSnap;
        } else if (results.a1 > results.a2) { // A1 > A2
            colorA1 = colorBlueMax;
            colorA2 = colorRedMin;
        } else { // A2 > A1
            colorA1 = colorRedMin;
            colorA2 = colorBlueMax;
        }

        // 2. UI Updates (Safety checks included)
        if (a1Label) a1Label.innerText = results.a1.toFixed(3);
        if (a2Label) a2Label.innerText = results.a2.toFixed(3);
        if (diffLabel) diffLabel.innerText = err.toFixed(1) + "%";
        if (pValLabel) pValLabel.innerText = finalP.toFixed(2);

        if (pDisplayBox) {
            if (err < 1.0 && results.crossings === 3) {
                pDisplayBox.classList.add("snapped");
                pDisplayBox.innerHTML = `🎉 Success! Saturation Pressure: <b id="currentP-val">${finalP.toFixed(2)}</b> bar`;
            } else {
                pDisplayBox.classList.remove("snapped");
                pDisplayBox.innerHTML = `Current Test Pressure: <b id="currentP-val">${finalP.toFixed(2)}</b> bar`;
            }
        }

        // 3. PLOTLY UPDATE
        if (isSnapped || !isFromDrag) {
            Plotly.relayout(chartDiv, { 'shapes[0].y0': finalP, 'shapes[0].y1': finalP });
        }

        const newTraceData = {
            'x': [results.a1_poly ? results.a1_poly.x : [], results.a2_poly ? results.a2_poly.x : []],
            'y': [results.a1_poly ? results.a1_poly.y : [], results.a2_poly ? results.a2_poly.y : []],
            'fillcolor': [colorA1, colorA2]
        };
        Plotly.restyle(chartDiv, newTraceData, [1, 2]);
