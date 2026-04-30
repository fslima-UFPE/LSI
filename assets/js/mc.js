function createMCSimulation(box) {

    const energyChart = new Chart(box.querySelector("#energyChart"), {
        type: "line",
        data: { labels: [], datasets: [{ label: "Energy (kJ/mol)", data: [], borderWidth: 2, pointRadius: 0 }] },
        options: { animation: false }
    });

    const pressureChart = new Chart(box.querySelector("#pressureChart"), {
        type: "line",
        data: { labels: [], datasets: [{ label: "Pressure (bar)", data: [], borderWidth: 2, pointRadius: 0 }] },
        options: { animation: false }
    });

    const histChart = new Chart(box.querySelector("#histChart"), {
        type: "bar",
        data: { labels: [], datasets: [{ label: "Energy histogram (kJ/mol)", data: [] }] },
        options: { animation: false }
    });

    const R = 0.0083145;
    const Rj = 8.3145;
    const kB = 138.0649;

    let state = null;

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

        if (p.species.type === "LJ") {
            for (let i=0;i<p.N;i++){
                for (let j=i+1;j<p.N;j++){
                    const dr = dist(positions[i], positions[j], p.boxSize);
                    const res = LJ(dr, p.species.eps, p.species.sig);
                    energy += res.en;
                    xi += res.xi;
                }
            }
        }

        return {
            positions,
            energy,
            xi,
            step: 0,
            eqStart: Math.floor(0.2*p.maxSteps),
            eta: 0,
            Z:1,        

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

            sampleEvery: Math.max(1, Math.floor(p.maxSteps / 300))
        };
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

            if (s.species.type === "HS") {
                if (drNew < s.species.sig) return;
                continue;
            }

            if (s.species.type === "IG") continue;

            const oldRes = LJ(drOld, s.species.eps, s.species.sig);
            const newRes = LJ(drNew, s.species.eps, s.species.sig);

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

        // FIX 1: Increment count FIRST to prevent divide-by-zero
        s.count++; 

        let E = 0;
        let P = 0;

        if (s.species.type === "IG") {

            P = s.pid;

        } else if (s.species.type === "HS") {

            const sigma = s.species.sig;
            const rho = s.N / s.V;

            s.eta = (Math.PI / 6) * rho * sigma**3;
            s.Z = (1 + s.eta + s.eta**2 - s.eta**3) / (1 - s.eta)**3;

            P = s.pid * s.Z;

        } else {

            const E_dim = s.energy;
            E = R * E_dim;

            P = s.xi * s.pcoef + s.pid;

            const delta = E_dim - s.meanE;
            s.meanE += delta / s.count; // Now perfectly safe!
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

        const avgE = (s.species.type === "LJ") ? R * s.meanE : 0;
        const avgP = s.meanP;

        const varianceE = (s.species.type === "LJ" && s.count > 1)
            ? s.M2E / (s.count - 1)
            : 0;

        const cv_real = (varianceE / (s.N * s.T * s.T)) * Rj;
        const cv_ideal = 1.5 * Rj;
        const cv_total = cv_ideal + cv_real;

        // ==========================================
        // COMPRESSIBILITY FACTOR (Z) CALCULATION
        // ==========================================
        // Z = P_real / P_ideal
        // Since s.pid is exactly the ideal gas pressure, this safely 
        // works for IG (returns 1), HS, and LJ!
        const zFactor = avgP / s.pid;

        if (s.species.type === "HS") {
            console.log("FINAL HS VALUES:");
            console.log("eta =", s.eta);
            console.log("Z =", s.Z);
        }

        // Updated innerHTML to include Z = zFactor.toFixed(3)
        box.querySelector(".results").innerHTML =
            `⟨E⟩ = ${avgE.toFixed(2)} kJ/mol |
             ⟨P⟩ = ${avgP.toFixed(2)} bar |
             P(ideal) = ${pid.toFixed(2)} bar |
             Z = ${zFactor.toFixed(3)} <br>
             Cv(real) = ${cv_real.toFixed(2)} |
             Cv(total) = ${cv_total.toFixed(2)} J/mol·K`;

        // Process the raw history into histogram bins safely
        if (s.hist.length > 0) {
            
            // FIX: Use a loop instead of the spread operator (...s.hist)
            let minE = Infinity;
            let maxE = -Infinity;
            for (let i = 0; i < s.hist.length; i++) {
                if (s.hist[i] < minE) minE = s.hist[i];
                if (s.hist[i] > maxE) maxE = s.hist[i];
            }

            const numBins = 50; 
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
    }

    function run(params) {

        state = initSimulation(params);

        energyChart.data.labels = [];
        energyChart.data.datasets[0].data = [];

        pressureChart.data.labels = [];
        pressureChart.data.datasets[0].data = [];

        histChart.data.labels = [];
        histChart.data.datasets[0].data = [];

        // ==========================================
        // 🚀 BYPASS FOR IDEAL GAS & HARD SPHERES
        // ==========================================
        if (state.species.type === "IG" || state.species.type === "HS") {
            let P = 0;

            if (state.species.type === "IG") {
                P = state.pid;
            } else { // Hard Spheres
                const rho = state.N / state.V;
                const sigma = state.species.sig;
                state.eta = (Math.PI / 6) * rho * sigma**3;
                state.Z = (1 + state.eta + state.eta**2 - state.eta**3) / (1 - state.eta)**3;
                P = state.pid * state.Z;
            }

            // 1. Draw perfectly flat lines for E and P from step 0 to maxSteps
            energyChart.data.labels = [0, state.maxSteps];
            energyChart.data.datasets[0].data = [0, 0];
            
            pressureChart.data.labels = [0, state.maxSteps];
            pressureChart.data.datasets[0].data = [P, P];

            energyChart.update();
            pressureChart.update();

            // 2. Fake the state statistics so finalize() formats the text correctly
            state.meanE = 0; 
            state.meanP = P;
            state.count = state.maxSteps; // Pretend we ran all steps
            state.M2E = 0;
            
            // 3. Put a single zero in the history so the histogram renders a spike at 0
            state.hist = [0]; 

            // 4. Instantly print results and EXIT (skip the MC loop)
            finalize(state);
            return; 
        }
        // ==========================================

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
            Ar: { eps: 116.81, sig: 3.401, type: "LJ" },
            Ne: { eps: 36.831, sig: 2.775, type: "LJ" },
            He: { eps: 5.465, sig: 2.628, type: "LJ" },
            HS: { sig: 8.0, type: "HS" },
            IG: { type: "IG" }
        };

        const btn = box.querySelector(".jsbox-btn-primary");
        
        // --- NEW CODE START ---
        const speciesSelect = box.querySelector(".species");
        const sigmaRow = box.querySelector("#sigma-row");

        // Listen for changes in the dropdown menu
        speciesSelect.addEventListener("change", (e) => {
            if (e.target.value === "HS") {
                // 'flex' or 'block' depending on how your CSS is set up. 
                // Usually 'flex' works best for input rows.
                sigmaRow.style.display = "flex"; 
            } else {
                sigmaRow.style.display = "none";
            }
        });
        // --- NEW CODE END ---

        btn.addEventListener("click", () => {

            const speciesType = box.querySelector(".species").value;

            const base = speciesDB[speciesType];
            let species = { ...base };

            // ✅ read sigma ONLY for HS (This stays exactly as you had it!)
            if (speciesType === "HS") {
                const sigmaInput = box.querySelector(".sigma");
                if (sigmaInput) {
                    const val = parseFloat(sigmaInput.value);
                    if (!isNaN(val)) species.sig = val;
                }
            }

            sim.run({
                N: parseInt(box.querySelector(".npart").value),
                boxSize: parseFloat(box.querySelector(".box").value),
                T: parseFloat(box.querySelector(".temp").value),
                dx: box.querySelector(".dx") 
                    ? parseFloat(box.querySelector(".dx").value)
                    : undefined,
                maxSteps: parseInt(box.querySelector(".steps").value),
                species: species
            });
        });
    });
});
