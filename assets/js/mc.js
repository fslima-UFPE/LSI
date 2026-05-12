function createMCSimulation(box) {

    const energyChart = new Chart(box.querySelector("#energyChart"), {
        type: "line",
        data: { labels: [], datasets: [{ label: "Energia (kJ/mol)", data: [], borderWidth: 2, pointRadius: 0 }] },
        options: { animation: false }
    });

    const pressureChart = new Chart(box.querySelector("#pressureChart"), {
        type: "line",
        data: { labels: [], datasets: [{ label: "Pressão (bar)", data: [], borderWidth: 2, pointRadius: 0 }] },
        options: { animation: false }
    });

    const histChart = new Chart(box.querySelector("#histChart"), {
        type: "bar",
        data: { 
            labels: [], 
            datasets: [{ 
                label: "Histograma de Energia (kJ/mol)", 
                data: [],
                barPercentage: 1.0, 
                categoryPercentage: 1.0 
            }] 
        },
        options: { 
            animation: false,
            scales: {
                x: {
                    ticks: {
                        maxTicksLimit: 15, 
                        maxRotation: 45
                    }
                }
            }
        }
    });

    // ==========================================
    // NEW: g(r) CHART INITIALIZATION
    // ==========================================
    const grCanvas = box.querySelector("#grChart");
    let grChart = null;
    if (grCanvas) {
        grChart = new Chart(grCanvas, {
            type: "line",
            data: { labels: [], datasets: [{ label: "g(r)", data: [], borderWidth: 2, pointRadius: 0 }] },
            options: { animation: false }
        });
    }

    const R = 0.0083145;
    const Rj = 8.3145;
    const kB = 138.0649;

    let state = null;

    // ==========================================
    // POTENTIAL FUNCTIONS
    // ==========================================
    function LJ(dr, eps, sig) {
        const s = sig / dr;
        const s2 = s*s;
        const s6 = s2*s2*s2;
        const s12 = s6*s6;

        return {
            en: 4 * eps * (s12 - s6),
            xi: eps * (2*s12 - s6)
        };
    }

    function VDW(dr, eps, sig) {
        if (dr <= sig) return { en: Infinity, xi: 0 }; 
        
        const s = sig / dr;
        const s2 = s*s;
        const s6 = s2*s2*s2;
        
        return {
            en: -4 * eps * s6, 
            xi: -eps * s6      
        };
    }

    function SW(dr, eps, sig, lambda) {
        if (dr <= sig) return { en: Infinity, xi: 0 }; 
        if (dr <= lambda * sig) return { en: -eps, xi: 0 }; 
        return { en: 0, xi: 0 };
    }

    function dist(a, b, box) {
        let dx = a[0]-b[0];
        let dy = a[1]-b[1];
        let dz = a[2]-b[2];

        dx -= Math.round(dx/box)*box;
        dy -= Math.round(dy/box)*box;
        dz -= Math.round(dz/box)*box;

        return Math.sqrt(dx*dx+dy*dy+dz*dz);
    }

    function initSimulation(p) {

        const positions = [];
        const ngrid = Math.ceil(Math.cbrt(p.N));
        const spacing = p.boxSize / ngrid;

        let count = 0;
        for (let x=0;x<ngrid;x++){
            for (let y=0;y<ngrid;y++){
                for (let z=0;z<ngrid;z++){
                    if (count >= p.N) break;

                    positions.push([
                        (x+0.5)*spacing,
                        (y+0.5)*spacing,
                        (z+0.5)*spacing
                    ]);
                    count++;
                }
            }
        }

        let energy = 0;
        let xi = 0;

        if (p.species.type === "LJ" || p.species.type === "VDW" || p.species.type === "SW") {
            for (let i=0;i<p.N;i++){
                for (let j=i+1;j<p.N;j++){
                    const dr = dist(positions[i], positions[j], p.boxSize);
                    let res = {en: 0, xi: 0};
                    
                    if (p.species.type === "LJ") res = LJ(dr, p.species.eps, p.species.sig);
                    else if (p.species.type === "VDW") res = VDW(dr, p.species.eps, p.species.sig);
                    else if (p.species.type === "SW") res = SW(dr, p.species.eps, p.species.sig, p.species.lambda);
                    
                    energy += res.en;
                    xi += res.xi;
                }
            }
        }

        // g(r) Initializations
        const drBin = 0.1;
        const maxR = p.boxSize / 2.0;
        const numBins = Math.floor(maxR / drBin);

        return {
            positions,
            energy,
            xi,
            step: 0,
            eqStart: Math.floor(0.2*p.maxSteps),
            eta: 0,
            Z: 1,        

            meanE: 0,
            M2E: 0,
            meanP: 0,
            count: 0,

            hist: [],

            ...p,

            dx: (p.dx !== undefined) ? p.dx : 5,

            V: p.boxSize**3,
            pid: p.N * kB * p.T / (p.boxSize**3),
            pcoef: 8*kB/((p.boxSize**3)),

            sampleEvery: Math.max(1, Math.floor(p.maxSteps / 300)),

            // ==========================================
            // NEW: g(r) STATE VARIABLES
            // ==========================================
            computeGr: p.computeGr || false, // Guardrail: defaults to false
            drBin: drBin,
            maxR: maxR,
            numBins: numBins,
            grHistogram: new Array(numBins).fill(0),
            grSamples: 0
        };
    }

    // ==========================================
    // NEW: g(r) SAMPLING FUNCTION
    // ==========================================
    function sampleGr(s) {
        if (s.species.type === "IG") return; // Bypass heavy loop for Ideal Gas

        s.grSamples++;
        for (let i = 0; i < s.N - 1; i++) {
            for (let j = i + 1; j < s.N; j++) {
                const r = dist(s.positions[i], s.positions[j], s.boxSize);
                if (r < s.maxR) {
                    const bin = Math.floor(r / s.drBin);
                    if (bin < s.numBins) {
                        s.grHistogram[bin] += 2; // +2 for i-j and j-i pairs
                    }
                }
            }
        }
    }

    function mcStep(s) {

        const i = Math.floor(Math.random()*s.N);
        const old = [...s.positions[i]];

        let newPos = old.map(v => v + (Math.random()-0.5)*s.dx);
        newPos = newPos.map(v => (v+s.boxSize)%s.boxSize);

        let dE = 0;
        let dXi = 0;

        for (let j=0;j<s.N;j++){
            if (j===i) continue;

            const drOld = dist(old, s.positions[j], s.boxSize);
            const drNew = dist(newPos, s.positions[j], s.boxSize);

            if (s.species.type === "HS" || s.species.type === "VDW" || s.species.type === "SW") {
                if (drNew <= s.species.sig) return; 
            }

            if (s.species.type === "HS" || s.species.type === "IG") continue;

            let oldRes = {en: 0, xi: 0};
            let newRes = {en: 0, xi: 0};

            if (s.species.type === "LJ") {
                oldRes = LJ(drOld, s.species.eps, s.species.sig);
                newRes = LJ(drNew, s.species.eps, s.species.sig);
            } else if (s.species.type === "VDW") {
                oldRes = VDW(drOld, s.species.eps, s.species.sig);
                newRes = VDW(drNew, s.species.eps, s.species.sig);
            } else if (s.species.type === "SW") {
                oldRes = SW(drOld, s.species.eps, s.species.sig, s.species.lambda);
                newRes = SW(drNew, s.species.eps, s.species.sig, s.species.lambda);
            }

            dE += newRes.en - oldRes.en;
            dXi += newRes.xi - oldRes.xi;
        }

        if (dE < 0 || Math.random() < Math.exp(-dE/s.T)) {
            s.positions[i] = newPos;
            s.energy += dE;
            s.xi += dXi;
        }
    }

    function updateStats(s) {

        if (s.step < s.eqStart) return;

        s.count++; 

        // ==========================================
        // NEW: SAMPLE g(r) IF REQUESTED
        // ==========================================
        if (s.computeGr && s.step % s.sampleEvery === 0) {
            sampleGr(s);
        }

        let E = 0;
        let P = 0;

        if (s.species.type === "IG") {
            P = s.pid;
        } else if (s.species.type === "HS") {
            const rho = s.N / s.V;
            s.eta = (Math.PI / 6) * rho * s.species.sig**3;
            s.Z = (1 + s.eta + s.eta**2 - s.eta**3) / (1 - s.eta)**3;
            P = s.pid * s.Z;
        } else {
            const E_dim = s.energy;
            E = R * E_dim;

            if (s.species.type === "LJ") {
                P = s.xi * s.pcoef + s.pid;
            } else if (s.species.type === "VDW" || s.species.type === "SW") {
                const rho = s.N / s.V;
                const eta = (Math.PI / 6) * rho * s.species.sig**3;
                const Z_HS = (1 + eta + eta**2 - eta**3) / (1 - eta)**3;
                P = (s.pid * Z_HS) + (s.xi * s.pcoef); 
            }

            const delta = E_dim - s.meanE;
            s.meanE += delta / s.count; 
            s.M2E += delta * (E_dim - s.meanE);
        }

        s.meanP += (P - s.meanP) / s.count;

        s.hist.push(E);

        if (s.step % s.sampleEvery === 0) {
            energyChart.data.labels.push(s.step);
            energyChart.data.datasets[0].data.push(E);

            pressureChart.data.labels.push(s.step);
            pressureChart.data.datasets[0].data.push(P);
        }
    }

    function finalize(s) {

        const hasEnergy = ["LJ", "VDW", "SW"].includes(s.species.type);
        const avgE = hasEnergy ? R * s.meanE : 0;
        const avgP = s.meanP;

        const varianceE = (hasEnergy && s.count > 1)
            ? s.M2E / (s.count - 1)
            : 0;

        const cv_real = (varianceE / (s.N * s.T * s.T)) * Rj;
        const cv_ideal = 1.5 * Rj;
        const cv_total = cv_ideal + cv_real;

        const zFactor = avgP / s.pid;        

        let B2_part = null;
        let P_virial = null;

        if (["HS", "SW", "VDW"].includes(s.species.type)) {
            const sig = s.species.sig;
            const b_part = (2 * Math.PI * Math.pow(sig, 3)) / 3; 
            
            if (s.species.type === "HS") {
                B2_part = b_part;
            } else if (s.species.type === "SW") {
                const eps_T = s.species.eps / s.T;
                const lambda = s.species.lambda;
                B2_part = b_part * (1 + (Math.exp(eps_T) - 1) * (1 - Math.pow(lambda, 3)));
            } else if (s.species.type === "VDW") {
                const eps_T = s.species.eps / s.T;
                B2_part = b_part * (1 - 4 * eps_T); 
            }

            const rho = s.N / s.V; 
            const Z_virial = 1 + B2_part * rho;
            P_virial = s.pid * Z_virial;
        }

        const inject = (className, value) => {
            const el = box.querySelector(className);
            if (el) el.innerText = value;
        };

        inject(".out-avgE", avgE.toFixed(2));
        inject(".out-avgP", avgP.toFixed(2));
        inject(".out-pid", s.pid.toFixed(2));
        inject(".out-z", zFactor.toFixed(3));
        inject(".out-cv-real", cv_real.toFixed(2));
        inject(".out-cv-ideal", cv_ideal.toFixed(2));
        inject(".out-cv-total", cv_total.toFixed(2));

        const virialRow = box.querySelector(".virial-row");
        if (B2_part !== null) {
            const B2V_molar = B2_part * 0.000602214; 
            inject(".out-b2v", B2V_molar.toFixed(4));
            inject(".out-pvirial", P_virial.toFixed(2));
            if (virialRow) virialRow.style.display = "inline";
        } else {
            if (virialRow) virialRow.style.display = "none";
        }

        const statusMsg = box.querySelector(".sim-status-msg");
        const outputsData = box.querySelector(".sim-outputs-data");
        if (statusMsg) statusMsg.style.display = "none";
        if (outputsData) outputsData.style.display = "block";

        if (s.hist.length > 0) {
            let minE = Infinity;
            let maxE = -Infinity;
            for (let i = 0; i < s.hist.length; i++) {
                if (s.hist[i] < minE) minE = s.hist[i];
                if (s.hist[i] > maxE) maxE = s.hist[i];
            }

            let numBins = 50; 

            const uniqueSet = new Set();
            const sampleStep = Math.max(1, Math.floor(s.hist.length / 1000));
            for (let i = 0; i < s.hist.length; i += sampleStep) {
                uniqueSet.add(s.hist[i].toFixed(4));
            }

            if (uniqueSet.size < 100 && uniqueSet.size > 1) {
                const sortedVals = Array.from(uniqueSet).map(Number).sort((a, b) => a - b);
                let minGap = Infinity;
                for (let i = 1; i < sortedVals.length; i++) {
                    const gap = sortedVals[i] - sortedVals[i - 1];
                    if (gap > 1e-5 && gap < minGap) minGap = gap;
                }
                if (minGap !== Infinity) {
                    numBins = Math.round((maxE - minE) / minGap) + 1;
                }
            } else {
                const stdDev = Math.sqrt(varianceE) * R; 
                if (stdDev > 0) {
                    const idealBinWidth = (3.49 * stdDev) / Math.cbrt(s.hist.length);
                    numBins = Math.ceil((maxE - minE) / idealBinWidth);
                }
            }

            numBins = Math.max(10, Math.min(numBins, 100));
            const binSize = (maxE - minE) / numBins || 1; 
            const counts = new Array(numBins).fill(0);
            
            for (let val of s.hist) {
                const idx = Math.min(Math.floor((val - minE) / binSize), numBins - 1);
                counts[idx]++;
            }

            histChart.data.labels = Array.from({length: numBins}, (_, i) => 
                (minE + (i + 0.5) * binSize).toFixed(2)
            );
            histChart.data.datasets[0].data = counts;
            histChart.update();
        }

        // ==========================================
        // NEW: FINALIZE g(r) CHART
        // ==========================================
        if (s.computeGr && grChart) {
            const rho = s.N / s.V;
            const labels = [];
            const data = [];

            for (let i = 0; i < s.numBins; i++) {
                const r = (i + 0.5) * s.drBin;
                labels.push(r.toFixed(2));
                
                // BYPASS INJECTION: Exact analytical result for Ideal Gas
                if (s.species.type === "IG") {
                    data.push(1.0);
                    continue;
                }

                const vol = (4.0 / 3.0) * Math.PI * (Math.pow(r + s.drBin / 2.0, 3) - Math.pow(r - s.drBin / 2.0, 3));
                const ideal = rho * vol;
                let g = 0;
                if (s.grSamples > 0) {
                    g = s.grHistogram[i] / (s.grSamples * s.N * ideal);
                }
                data.push(g);
            }
            grChart.data.labels = labels;
            grChart.data.datasets[0].data = data;
            grChart.update();
        }
    }   

    function run(params) {

        state = initSimulation(params);

        energyChart.data.labels = [];
        energyChart.data.datasets[0].data = [];

        pressureChart.data.labels = [];
        pressureChart.data.datasets[0].data = [];

        histChart.data.labels = [];
        histChart.data.datasets[0].data = [];
        histChart.update();

        // Reset g(r) chart if it exists
        if (grChart) {
            grChart.data.labels = [];
            grChart.data.datasets[0].data = [];
            grChart.update();
        }

        // ==========================================
        // UPDATED BYPASS: 
        // 1. Always bypass MC loop for Ideal Gas.
        // 2. Bypass MC loop for Hard Spheres ONLY IF we aren't computing g(r).
        // ==========================================
        if (state.species.type === "IG" || (state.species.type === "HS" && !state.computeGr)) {
            let P = 0;

            if (state.species.type === "IG") {
                P = state.pid;
            } else { 
                const rho = state.N / state.V;
                const sigma = state.species.sig;
                state.eta = (Math.PI / 6) * rho * sigma**3;
                state.Z = (1 + state.eta + state.eta**2 - state.eta**3) / (1 - state.eta)**3;
                P = state.pid * state.Z;
            }

            energyChart.data.labels = [0, state.maxSteps];
            energyChart.data.datasets[0].data = [0, 0];
            
            pressureChart.data.labels = [0, state.maxSteps];
            pressureChart.data.datasets[0].data = [P, P];

            energyChart.update();
            pressureChart.update();

            state.meanE = 0; 
            state.meanP = P;
            state.count = state.maxSteps; 
            state.M2E = 0;
            state.hist = [0]; 

            finalize(state);
            return; 
        }

        function loop() {
            for (let i=0;i<200;i++) {
                mcStep(state);
                state.step++;
                updateStats(state);

                if (state.step >= state.maxSteps) {
                    finalize(state);
                    return;
                }
            }

            energyChart.update();
            pressureChart.update();

            requestAnimationFrame(loop);
        }

        loop();
    }

    return { run };
}

// ==========================
// UI / BUTTON HANDLER
// ==========================
document.addEventListener("DOMContentLoaded", () => {

    document.querySelectorAll(".toolbox").forEach(box => {

        if (box.id !== "mc-tool") return;

        const sim = createMCSimulation(box);

        const speciesDB = {
            Xe: { eps: 218.18, sig: 4.055, type: "LJ" },
            Kr: { eps: 164.60, sig: 3.650, type: "LJ" },
            Ar: { eps: 116.81, sig: 3.401, type: "LJ" },
            Ne: { eps: 36.831, sig: 2.775, type: "LJ" },
            He: { eps: 5.465, sig: 2.628, type: "LJ" },
            HS: { sig: 8.0, type: "HS" },
            SW: { eps: 120.0, sig: 4.0, lambda: 1.5, type: "SW" }, 
            VDW: { eps: 120.0, sig: 4.0, type: "VDW" },            
            IG: { type: "IG" }
        };

        const btn = box.querySelector(".jsbox-btn-primary");
        const speciesSelect = box.querySelector(".species");
        
        const sigmaRow = box.querySelector("#sigma-row");
        const epsRow = box.querySelector("#eps-row");
        const lambdaRow = box.querySelector("#lambda-row");

        let infoArea = box.querySelector(".species-info");
        if (!infoArea) {
            infoArea = document.createElement("div");
            infoArea.className = "species-info";
            infoArea.style.fontSize = "0.85em";
            infoArea.style.margin = "5px 0 10px 0";
            infoArea.style.color = "#555";
            speciesSelect.parentNode.appendChild(infoArea);
        }

        speciesSelect.addEventListener("change", (e) => {
            const val = e.target.value;
            const spec = speciesDB[val];

            sigmaRow.style.display = ["HS", "SW", "VDW"].includes(val) ? "flex" : "none";
            epsRow.style.display = ["SW", "VDW"].includes(val) ? "flex" : "none";
            lambdaRow.style.display = (val === "SW") ? "flex" : "none";

            if (spec && spec.type === "LJ") {
                infoArea.innerHTML = `Parâmetros fixos: σ = <b>${spec.sig}</b> Å, ε/k<sub>B</sub> = <b>${spec.eps}</b> K`;
            } else if (["HS", "SW", "VDW"].includes(val)) {
                infoArea.innerHTML = `Defina os parâmetros do modelo abaixo:`;
            } else {
                infoArea.innerHTML = ""; 
            }
        });

        speciesSelect.dispatchEvent(new Event("change"));

        btn.addEventListener("click", () => {

            const speciesType = box.querySelector(".species").value;
            const base = speciesDB[speciesType];
            let species = { ...base };

            if (["HS", "SW", "VDW"].includes(speciesType)) {
                const sigVal = parseFloat(box.querySelector(".sigma").value);
                if (!isNaN(sigVal)) species.sig = sigVal;
            }
            if (["SW", "VDW"].includes(speciesType)) {
                const epsVal = parseFloat(box.querySelector(".eps").value);
                if (!isNaN(epsVal)) species.eps = epsVal;
            }
            if (speciesType === "SW") {
                const lamVal = parseFloat(box.querySelector(".lambda").value);
                if (!isNaN(lamVal)) species.lambda = lamVal;
            }

            const statusMsg = box.querySelector(".sim-status-msg");
            const outputsData = box.querySelector(".sim-outputs-data");
            
            if (statusMsg) {
                statusMsg.innerText = "Calculando simulação... aguarde.";
                statusMsg.style.display = "block";
            }
            if (outputsData) outputsData.style.display = "none";

            // ==========================================
            // NEW: READ COMPUTE GR FLAG FROM HTML
            // ==========================================
            const grInput = box.querySelector(".compute-gr");
            const doComputeGr = grInput ? (grInput.value === "true" || grInput.checked) : false;

            sim.run({
                N: parseInt(box.querySelector(".npart").value),
                boxSize: parseFloat(box.querySelector(".box").value),
                T: parseFloat(box.querySelector(".temp").value),
                dx: box.querySelector(".dx") 
                    ? parseFloat(box.querySelector(".dx").value)
                    : undefined,
                maxSteps: parseInt(box.querySelector(".steps").value),
                species: species,
                computeGr: doComputeGr // Passes the flag dynamically!
            });
        });
    });
});
