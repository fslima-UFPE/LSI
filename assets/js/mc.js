function createMCSimulation(box) {
    // Check if g(r) is requested via the data-gr attribute on the toolbox div
    const computeGRRequested = box.getAttribute("data-gr") === "true";
    
    // Initialize Charts
    const energyChart = new Chart(box.querySelector("#energyChart"), {
        type: "line",
        data: { labels: [], datasets: [{ label: "Energia (kJ/mol)", data: [], borderWidth: 2, pointRadius: 0, borderColor: '#007bff' }] },
        options: { animation: false, responsive: true }
    });

    const pressureChart = new Chart(box.querySelector("#pressureChart"), {
        type: "line",
        data: { labels: [], datasets: [{ label: "Pressão (bar)", data: [], borderWidth: 2, pointRadius: 0, borderColor: '#28a745' }] },
        options: { animation: false, responsive: true }
    });

    const histChart = new Chart(box.querySelector("#histChart"), {
        type: "bar",
        data: { labels: [], datasets: [{ label: "Frequência", data: [], backgroundColor: '#dc3545', barPercentage: 1.0, categoryPercentage: 1.0 }] },
        options: { animation: false, scales: { x: { ticks: { maxTicksLimit: 10 } } } }
    });

    // Optional g(r) Chart
    let grChart = null;
    const grCanvas = box.querySelector("#grChart");
    if (grCanvas) {
        if (computeGRRequested) box.querySelector(".gr-card").style.display = "block";
        grChart = new Chart(grCanvas, {
            type: "line",
            data: { labels: [], datasets: [{ label: "g(r)", data: [], borderColor: '#6f42c1', borderWidth: 2, pointRadius: 0, fill: false }] },
            options: { animation: false, scales: { x: { title: { display: true, text: 'r (Å)' } }, y: { beginAtZero: true } } }
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
        return { en: 4 * eps * (s12 - s6), xi: eps * (2*s12 - s6) };
    }

    function VDW(dr, eps, sig) {
        if (dr <= sig) return { en: Infinity, xi: 0 }; 
        const s6 = Math.pow(sig / dr, 6);
        return { en: -4 * eps * s6, xi: -eps * s6 };
    }

    function SW(dr, eps, sig, lambda) {
        if (dr <= sig) return { en: Infinity, xi: 0 }; 
        if (dr <= lambda * sig) return { en: -eps, xi: 0 }; 
        return { en: 0, xi: 0 };
    }

    function dist(a, b, L) {
        let dx = a[0]-b[0];
        let dy = a[1]-b[1];
        let dz = a[2]-b[2];
        dx -= Math.round(dx/L)*L;
        dy -= Math.round(dy/L)*L;
        dz -= Math.round(dz/L)*L;
        return Math.sqrt(dx*dx+dy*dy+dz*dz);
    }

    function initSimulation(p) {
        const positions = [];
        const ngrid = Math.ceil(Math.cbrt(p.N));
        const spacing = p.boxSize / ngrid;

        let count = 0;
        for (let x=0; x<ngrid; x++) {
            for (let y=0; y<ngrid; y++) {
                for (let z=0; z<ngrid; z++) {
                    if (count >= p.N) break;
                    positions.push([(x+0.5)*spacing, (y+0.5)*spacing, (z+0.5)*spacing]);
                    count++;
                }
            }
        }

        // g(r) Data Structure
        const maxR = p.boxSize / 2;
        const drBin = 0.05;
        const nBins = Math.floor(maxR / drBin);

        return {
            ...p,
            positions,
            energy: 0, xi: 0, step: 0,
            eqStart: Math.floor(0.25 * p.maxSteps),
            meanE: 0, M2E: 0, meanP: 0, count: 0, hist: [],
            V: p.boxSize**3,
            pid: p.N * kB * p.T / (p.boxSize**3),
            pcoef: 8*kB/((p.boxSize**3)),
            sampleEvery: Math.max(1, Math.floor(p.maxSteps / 300)),
            // g(r) specifics
            computeGR: computeGRRequested,
            grHist: new Array(nBins).fill(0),
            grCount: 0,
            drBin: drBin,
            maxR: maxR
        };
    }

    function mcStep(s) {
        const i = Math.floor(Math.random()*s.N);
        const old = [...s.positions[i]];
        let newPos = old.map(v => (v + (Math.random()-0.5)*s.dx + s.boxSize) % s.boxSize);

        let dE = 0, dXi = 0;
        for (let j=0; j<s.N; j++) {
            if (j===i) continue;
            const drOld = dist(old, s.positions[j], s.boxSize);
            const drNew = dist(newPos, s.positions[j], s.boxSize);

            if (["HS", "VDW", "SW"].includes(s.species.type) && drNew <= s.species.sig) return;

            let oR = {en: 0, xi: 0}, nR = {en: 0, xi: 0};
            if (s.species.type === "LJ") {
                oR = LJ(drOld, s.species.eps, s.species.sig);
                nR = LJ(drNew, s.species.eps, s.species.sig);
            } else if (s.species.type === "VDW") {
                oR = VDW(drOld, s.species.eps, s.species.sig);
                nR = VDW(drNew, s.species.eps, s.species.sig);
            } else if (s.species.type === "SW") {
                oR = SW(drOld, s.species.eps, s.species.sig, s.species.lambda);
                nR = SW(drNew, s.species.eps, s.species.sig, s.species.lambda);
            }
            dE += nR.en - oR.en;
            dXi += nR.xi - oR.xi;
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

        // 1. g(r) sampling (Requirement 1 & 2)
        if (s.computeGR && s.step % 10 === 0) {
            for (let i=0; i<s.N; i++) {
                for (let j=i+1; j<s.N; j++) {
                    const r = dist(s.positions[i], s.positions[j], s.boxSize);
                    if (r < s.maxR) {
                        const bin = Math.floor(r / s.drBin);
                        s.grHist[bin] += 2;
                    }
                }
            }
            s.grCount += s.N;
        }

        let P = 0;
        const rho = s.N / s.V;

        // 2. Pressure Calculation (Requirement 3)
        if (s.species.type === "SW" && s.computeGR && s.grCount > 0) {
            // Pressure for SW via g(r) contact values
            const sig = s.species.sig;
            const lamSig = s.species.lambda * sig;
            
            // Find g(r) at sigma+ and lambda*sigma-
            const idxSig = Math.floor(sig / s.drBin) + 1;
            const idxLam = Math.floor(lamSig / s.drBin) - 1;
            
            const shellVolSig = (4/3)*Math.PI*(Math.pow((idxSig+1)*s.drBin,3) - Math.pow(idxSig*s.drBin,3));
            const g_sig_plus = s.grHist[idxSig] / (shellVolSig * rho * s.grCount);
            
            const shellVolLam = (4/3)*Math.PI*(Math.pow((idxLam+1)*s.drBin,3) - Math.pow(idxLam*s.drBin,3));
            const g_lam_minus = s.grHist[idxLam] / (shellVolLam * rho * s.grCount);

            const eTerm = Math.exp(s.species.eps / s.T) - 1;
            const Z = 1 + (2/3)*Math.PI*rho*(Math.pow(sig,3)*g_sig_plus - Math.pow(lamSig,3)*eTerm*g_lam_minus);
            P = s.pid * Z;
        } else if (s.species.type === "HS") {
            const eta = (Math.PI/6)*rho*s.species.sig**3;
            P = s.pid * (1+eta+eta**2-eta**3)/Math.pow(1-eta, 3);
        } else if (s.species.type === "IG") {
            P = s.pid;
        } else if (s.species.type === "LJ") {
            P = s.xi * s.pcoef + s.pid;
        } else if (s.species.type === "VDW") {
            const eta = (Math.PI/6)*rho*s.species.sig**3;
            const Z_HS = (1+eta+eta**2-eta**3)/Math.pow(1-eta, 3);
            P = (s.pid * Z_HS) + (s.xi * s.pcoef);
        }

        s.meanP += (P - s.meanP) / s.count;
        const E_molar = s.energy * R;
        const delta = E_molar - s.meanE;
        s.meanE += delta / s.count;
        s.M2E += delta * (E_molar - s.meanE);
        s.hist.push(E_molar);

        if (s.step % s.sampleEvery === 0) {
            energyChart.data.labels.push(s.step);
            energyChart.data.datasets[0].data.push(E_molar);
            pressureChart.data.labels.push(s.step);
            pressureChart.data.datasets[0].data.push(P);
        }
    }

    function finalize(s) {
        // Standard outputs
        const inject = (cls, val) => { const el = box.querySelector(cls); if(el) el.innerText = val; };
        inject(".out-avgE", s.meanE.toFixed(2));
        inject(".out-avgP", s.meanP.toFixed(2));
        inject(".out-pid", s.pid.toFixed(2));
        inject(".out-z", (s.meanP / s.pid).toFixed(3));

        // g(r) Chart Update
        if (s.computeGR && grChart) {
            const rho = s.N / s.V;
            const grData = [];
            const labels = [];
            
            for (let i=0; i<s.grHist.length; i++) {
                const rInner = i * s.drBin;
                const rOuter = rInner + s.drBin;
                const shellVol = (4/3) * Math.PI * (Math.pow(rOuter,3) - Math.pow(rInner,3));
                const idealCount = shellVol * rho * s.grCount;
                
                labels.push((rInner + s.drBin/2).toFixed(2));
                grData.push(s.grCount > 0 ? (s.grHist[i] / idealCount) : 0);
            }
            grChart.data.labels = labels;
            grChart.data.datasets[0].data = grData;
            grChart.update();
        }

        // Histograma logic (Simplified for brevity)
        if (s.hist.length > 0) {
            const minE = Math.min(...s.hist), maxE = Math.max(...s.hist);
            const bins = 30, bSize = (maxE - minE)/bins;
            const counts = new Array(bins).fill(0);
            s.hist.forEach(v => counts[Math.min(Math.floor((v-minE)/bSize), bins-1)]++);
            histChart.data.labels = counts.map((_,i) => (minE + (i+0.5)*bSize).toFixed(1));
            histChart.data.datasets[0].data = counts;
            histChart.update();
        }

        box.querySelector(".sim-status-msg").style.display = "none";
        box.querySelector(".sim-outputs-data").style.display = "block";
    }

    function run(params) {
        state = initSimulation(params);
        energyChart.data.labels = []; energyChart.data.datasets[0].data = [];
        pressureChart.data.labels = []; pressureChart.data.datasets[0].data = [];
        
        function loop() {
            for (let i=0; i<400; i++) {
                mcStep(state);
                state.step++;
                updateStats(state);
                if (state.step >= state.maxSteps) { finalize(state); return; }
            }
            energyChart.update();
            pressureChart.update();
            requestAnimationFrame(loop);
        }
        loop();
    }

    return { run };
}

// UI Initialization
document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".toolbox").forEach(box => {
        if (box.id !== "mc-tool") return;
        const sim = createMCSimulation(box);
        const speciesDB = {
            SW: { eps: 120.0, sig: 4.0, lambda: 1.5, type: "SW" },
            HS: { sig: 8.0, type: "HS" },
            IG: { type: "IG" },
            Ar: { eps: 116.81, sig: 3.401, type: "LJ" }
        };

        const btn = box.querySelector(".jsbox-btn-primary");
        btn.addEventListener("click", () => {
            const speciesType = box.querySelector(".species").value;
            const species = { ...speciesDB[speciesType] };
            
            // Override with UI values for SW/HS
            const sig = parseFloat(box.querySelector(".sigma").value);
            const eps = parseFloat(box.querySelector(".eps").value);
            const lam = parseFloat(box.querySelector(".lambda").value);
            if(!isNaN(sig)) species.sig = sig;
            if(!isNaN(eps)) species.eps = eps;
            if(!isNaN(lam)) species.lambda = lam;

            sim.run({
                N: parseInt(box.querySelector(".npart").value),
                boxSize: parseFloat(box.querySelector(".box").value),
                T: parseFloat(box.querySelector(".temp").value),
                maxSteps: parseInt(box.querySelector(".steps").value),
                dx: 2.0,
                species: species
            });
        });
    });
});
