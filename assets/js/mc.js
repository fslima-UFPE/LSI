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

    const grCanvas = box.querySelector("#grChart");
    let grChart = null;
    if (grCanvas) {
        grChart = new Chart(grCanvas, {
            type: "line",
            data: { 
                labels: [], 
                datasets: [
                    { 
                        label: "g(r)", 
                        data: [], 
                        borderColor: "blue", 
                        borderWidth: 1,      
                        pointRadius: 0 
                    },
                    { 
                        label: "g(r) = exp(-βV(r))", 
                        data: [], 
                        borderColor: "red",  
                        borderWidth: 2,      
                        borderDash: [5, 5],  
                        pointRadius: 0 
                    }
                ] 
            },
            options: { animation: false }
        });
    }

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

    // Numerical Integrator for LJ Second Virial Coefficient
    function computeB2_LJ(eps, sig, T) {
        const rMin = 0.5 * sig; 
        const rMax = 10.0 * sig; 
        const nSteps = 1000;
        const dr = (rMax - rMin) / nSteps;
        
        let integral = 0;
        
        for (let i = 0; i <= nSteps; i++) {
            const r = rMin + i * dr;
            const s = sig / r;
            const s6 = Math.pow(s, 6);
            const s12 = s6 * s6;
            const v = 4 * eps * (s12 - s6);
            
            const f = (Math.exp(-v / T) - 1.0) * r * r;
            let weight = (i === 0 || i === nSteps) ? 0.5 : 1.0;
            integral += f * weight;
        }
        integral *= dr;
        
        const coreIntegral = -Math.pow(rMin, 3) / 3.0;
        return -2.0 * Math.PI * (coreIntegral + integral);
    }

    function getG_of_bin(s, binIndex) {
        if (s.grSamples === 0 || binIndex < 0 || binIndex >= s.numBins) return 0;
        const r = (binIndex + 0.5) * s.drBin;
        const vol = (4.0 / 3.0) * Math.PI * (Math.pow(r + s.drBin / 2.0, 3) - Math.pow(r - s.drBin / 2.0, 3));
        const rho = s.N / s.V;
        const ideal = rho * vol;
        return s.grHistogram[binIndex] / (s.grSamples * s.N * ideal);
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
            const rc = p.boxSize / 2.0; 
            for (let i=0;i<p.N;i++){
                for (let j=i+1;j<p.N;j++){
                    const dr = dist(positions[i], positions[j], p.boxSize);
                    if (dr > rc) continue; 

                    let res = {en: 0, xi: 0};
                    if (p.species.type === "LJ") res = LJ(dr, p.species.eps, p.species.sig);
                    else if (p.species.type === "VDW") res = VDW(dr, p.species.eps, p.species.sig);
                    else if (p.species.type === "SW") res = SW(dr, p.species.eps, p.species.sig, p.species.lambda);
                    
                    energy += res.en;
                    xi += res.xi;
                }
            }
        }

        const drBin = p.species.sig ? (p.species.sig / 50.0) : 0.1;
        const maxR = p.boxSize / 2.0;
        const numBins = Math.floor(maxR / drBin);

        return {
            positions,
            energy,
            xi,
            step: 0,
            eqStart: Math.floor(0.4 * p.maxSteps), 
            eta: 0,
            Z: 1,        

            meanE: 0,
            M2E: 0,
            meanP: 0,
            count: 0,

            hist: [],

            ...p,

            dx: (p.dx !== undefined) ? p.dx : 5,
            accCount: 0, 
            attCount: 0,

            V: p.boxSize**3,
            pid: p.N * kB * p.T / (p.boxSize**3),
            pcoef: 8*kB/((p.boxSize**3)),

            sampleEvery: Math.max(1, Math.floor(p.maxSteps / 2000)), 

            computeGr: p.computeGr || false,
            drBin: drBin,
            maxR: maxR,
            numBins: numBins,
            grHistogram: new Array(numBins).fill(0),
            grSamples: 0
        };
    }

    function sampleGr(s) {
        if (s.species.type === "IG") return; 

        s.grSamples++;
        for (let i = 0; i < s.N - 1; i++) {
            for (let j = i + 1; j < s.N; j++) {
                const r = dist(s.positions[i], s.positions[j], s.boxSize);
                if (r < s.maxR) {
                    const bin = Math.floor(r / s.drBin);
                    if (bin < s.numBins) {
                        s.grHistogram[bin] += 2; 
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

        s.attCount++;
        const rc = s.boxSize / 2.0;

        for (let j=0;j<s.N;j++){
            if (j===i) continue;

            const drOld = dist(old, s.positions[j], s.boxSize);
            const drNew = dist(newPos, s.positions[j], s.boxSize);

            if (drOld > rc && drNew > rc) continue;

            if (s.species.type === "HS" || s.species.type === "VDW" || s.species.type === "SW") {
                if (drNew <= s.species.sig) return; 
            }

            if (s.species.type === "HS" || s.species.type === "IG") continue;

            let oldRes = {en: 0, xi: 0};
            let newRes = {en: 0, xi: 0};

            if (s.species.type === "LJ") {
                oldRes = (drOld <= rc) ? LJ(drOld, s.species.eps, s.species.sig) : {en: 0, xi: 0};
                newRes = (drNew <= rc) ? LJ(drNew, s.species.eps, s.species.sig) : {en: 0, xi: 0};
            } else if (s.species.type === "VDW") {
                oldRes = (drOld <= rc) ? VDW(drOld, s.species.eps, s.species.sig) : {en: 0, xi: 0};
                newRes = (drNew <= rc) ? VDW(drNew, s.species.eps, s.species.sig) : {en: 0, xi: 0};
            } else if (s.species.type === "SW") {
                oldRes = (drOld <= rc) ? SW(drOld, s.species.eps, s.species.sig, s.species.lambda) : {en: 0, xi: 0};
                newRes = (drNew <= rc) ? SW(drNew, s.species.eps, s.species.sig, s.species.lambda) : {en: 0, xi: 0};
            }

            dE += newRes.en - oldRes.en;
            dXi += newRes.xi - oldRes.xi;
        }

        if (dE < 0 || Math.random() < Math.exp(-dE/s.T)) {
            s.positions[i] = newPos;
            s.energy += dE;
            s.xi += dXi;
            s.accCount++;
        }
    }

    function updateStats(s) {
        if (s.step < s.eqStart) return;
        s.count++; 

        if (s.computeGr && s.step % s.sampleEvery === 0) {
            sampleGr(s);
        }

        let E = 0;
        let P_sim = 0;

        if (s.species.type === "IG") {
            P_sim = s.pid;
        } else if (s.species.type === "HS") {
            const rho = s.N / s.V;
            s.eta = (Math.PI / 6) * rho * s.species.sig**3;
            s.Z = (1 + s.eta + s.eta**2 - s.eta**3) / (1 - s.eta)**3;
            P_sim = s.pid * s.Z;
        } else {
            const E_dim = s.energy;
            E = R * E_dim;

            if (s.species.type === "LJ") {
                P_sim = s.pid + (s.xi * s.pcoef);            
            } else if (s.species.type === "VDW") {
                // ALWAYS use Carnahan-Starling for the Hard Core part of VDW
                const rho = s.N / s.V;
                const eta = (Math.PI / 6) * rho * s.species.sig**3;
                const Z_sim_core = (1 + eta + eta**2 - eta**3) / (1 - eta)**3;
                
                // Add the instantaneous continuous tail virial (s.xi) 
                P_sim = (s.pid * Z_sim_core) + (s.xi * s.pcoef); 

            } else if (s.species.type === "SW") {
                if (s.computeGr && s.grSamples > 0) {
                    const rho = s.N / s.V;

                    // Helper function to linearly extrapolate g(r) to the exact contact boundaries
                    const extrapolateG = (targetR, bin1, bin2) => {
                        const r1 = (bin1 + 0.5) * s.drBin;
                        const r2 = (bin2 + 0.5) * s.drBin;
                        const g1 = getG_of_bin(s, bin1);
                        const g2 = getG_of_bin(s, bin2);
                        const slope = (g2 - g1) / (r2 - r1);
                        return Math.max(0, g1 + slope * (targetR - r1));
                    };

                    const sig = s.species.sig;
                    const lam = s.species.lambda;

                    // Extrapolate g(sigma+)
                    const bin_sig_plus = Math.floor(sig / s.drBin);
                    const g_sig_plus = extrapolateG(sig, bin_sig_plus, bin_sig_plus + 1);

                    // Extrapolate g(lambda-) [approaching from the inside]
                    const bin_lam_minus = Math.floor((sig * lam) / s.drBin) - 1;
                    const g_lam_minus = extrapolateG(sig * lam, bin_lam_minus, bin_lam_minus - 1);

                    // Extrapolate g(lambda+) [approaching from the outside]
                    const bin_lam_plus = Math.floor((sig * lam) / s.drBin);
                    const g_lam_plus = extrapolateG(sig * lam, bin_lam_plus, bin_lam_plus + 1);

                    const term1 = Math.pow(sig, 3) * g_sig_plus;
                    const term2 = Math.pow(sig * lam, 3) * (g_lam_plus - g_lam_minus);

                    const Z_sim = 1 + (2 * Math.PI * rho / 3) * (term1 + term2);
                    P_sim = s.pid * Z_sim;
                } else {
                    // Fallback if g(r) is turned off
                    P_sim = s.pid; 
                }
            }

            const delta = E_dim - s.meanE;
            s.meanE += delta / s.count; 
            s.M2E += delta * (E_dim - s.meanE);
        }

        s.meanP += (P_sim - s.meanP) / s.count;
        s.hist.push(E);

        const plotEvery = Math.max(1, Math.floor(s.maxSteps / 300));
        if (s.step % plotEvery === 0) {
            energyChart.data.labels.push(s.step);
            energyChart.data.datasets[0].data.push(E);

            pressureChart.data.labels.push(s.step);
            pressureChart.data.datasets[0].data.push(P_sim);
        }
    }

    function finalize(s) {
        let e_lrc = 0;
        let p_lrc = 0;
        const rc = s.boxSize / 2.0;
        const rho = s.N / s.V;

        if (s.species.type === "LJ" || s.species.type === "VDW") {
            const s_rc = s.species.sig / rc;
            const s_rc3 = Math.pow(s_rc, 3);
            const s_rc9 = Math.pow(s_rc3, 3);
            const sig3 = Math.pow(s.species.sig, 3);
            
            if (s.species.type === "LJ") {
                e_lrc = s.N * (8.0 / 3.0) * Math.PI * rho * s.species.eps * sig3 * ((1.0 / 3.0) * s_rc9 - s_rc3);
                p_lrc = (16.0 / 3.0) * Math.PI * rho * rho * s.species.eps * kB * sig3 * ((2.0 / 3.0) * s_rc9 - s_rc3);
            } else if (s.species.type === "VDW") {
                e_lrc = -s.N * (8.0 / 3.0) * Math.PI * rho * s.species.eps * sig3 * s_rc3;
                p_lrc = -(16.0 / 3.0) * Math.PI * rho * rho * s.species.eps * kB * sig3 * s_rc3;
            }
        } else if (s.species.type === "SW" && (s.species.lambda * s.species.sig > rc)) {
            const r_end = s.species.lambda * s.species.sig;
            e_lrc = -s.N * (2.0 / 3.0) * Math.PI * rho * s.species.eps * (Math.pow(r_end, 3) - Math.pow(rc, 3));
        }

        const hasEnergy = ["LJ", "VDW", "SW"].includes(s.species.type);
        const avgE = hasEnergy ? R * (s.meanE + e_lrc) : 0;
        const avgP = s.meanP + p_lrc;

        const varianceE = (hasEnergy && s.count > 1) ? s.M2E / (s.count - 1) : 0;
        const cv_real = (varianceE / (s.N * s.T * s.T)) * Rj;
        const cv_ideal = 1.5 * Rj;
        const cv_total = cv_ideal + cv_real;

        let zFactor = 1.0; 
        if (s.species.type === "HS") {
            const eta = (Math.PI / 6) * rho * s.species.sig**3;
            zFactor = (1 + eta + eta**2 - eta**3) / (1 - eta)**3;
        } else if (s.species.type !== "IG") {
            zFactor = avgP / s.pid; 
        }

        // MC Apparent Second Virial Coefficient 
        const b2v_mc_part = (zFactor - 1) / rho;
        const b2v_mc_molar = b2v_mc_part * 0.000602214;

        let B2_part = null;
        let P_virial = null;
        let Z_virial = null;

        // Model Virial Expansion
        if (["HS", "SW", "VDW", "LJ"].includes(s.species.type)) {
            const sig = s.species.sig;
            const b_part = (2 * Math.PI * Math.pow(sig, 3)) / 3; 
            
            if (s.species.type === "LJ") {
                B2_part = computeB2_LJ(s.species.eps, s.species.sig, s.T);
            } else if (s.species.type === "HS") {
                B2_part = b_part;
            } else if (s.species.type === "SW") {
                const eps_T = s.species.eps / s.T;
                const lambda = s.species.lambda;
                B2_part = b_part * (1 + (Math.exp(eps_T) - 1) * (1 - Math.pow(lambda, 3)));
            } else if (s.species.type === "VDW") {
                const eps_T = s.species.eps / s.T;
                B2_part = b_part * (1 - eps_T); 
            }

            Z_virial = 1 + B2_part * rho;
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
        inject(".out-b2v-mc", s.species.type === "IG" ? "0.0000" : b2v_mc_molar.toFixed(4));
        
        inject(".out-cv-real", cv_real.toFixed(2));
        inject(".out-cv-ideal", cv_ideal.toFixed(2));
        inject(".out-cv-total", cv_total.toFixed(2));

        const virialRow = box.querySelector(".virial-row");
        if (B2_part !== null) {
            const B2V_molar = B2_part * 0.000602214; 
            inject(".out-b2v", B2V_molar.toFixed(4));
            inject(".out-z-model", Z_virial.toFixed(3));
            inject(".out-pvirial", P_virial.toFixed(2));
            if (virialRow) virialRow.style.display = "inline";
        } else {
            if (virialRow) virialRow.style.display = "none";
        }

        const outputsData = box.querySelector(".sim-outputs-data");
        if (outputsData) outputsData.style.display = "block";

        const btnStatus = box.querySelector(".btn-status-msg");
        if (btnStatus) {
            btnStatus.innerText = "Simulação concluída!";
            setTimeout(() => btnStatus.innerText = "", 3000);
        }

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

        if (s.computeGr && grChart) {
            const rho = s.N / s.V;
            const labels = [];
            const data = [];
            const dataExp = []; 

            for (let i = 0; i < s.numBins; i++) {
                const r = (i + 0.5) * s.drBin;
                labels.push(r.toFixed(2));
                
                if (s.species.type === "IG") {
                    data.push(1.0);
                    dataExp.push(1.0);
                    continue;
                }

                const vol = (4.0 / 3.0) * Math.PI * (Math.pow(r + s.drBin / 2.0, 3) - Math.pow(r - s.drBin / 2.0, 3));
                const ideal = rho * vol;
                let g = 0;
                if (s.grSamples > 0) {
                    g = s.grHistogram[i] / (s.grSamples * s.N * ideal);
                }
                data.push(g);

                let vr = 0;
                if (s.species.type === "HS") {
                    vr = (r <= s.species.sig) ? Infinity : 0;
                } else if (s.species.type === "LJ") {
                    vr = LJ(r, s.species.eps, s.species.sig).en;
                } else if (s.species.type === "VDW") {
                    vr = VDW(r, s.species.eps, s.species.sig).en;
                } else if (s.species.type === "SW") {
                    vr = SW(r, s.species.eps, s.species.sig, s.species.lambda).en;
                }

                dataExp.push(Math.exp(-vr / s.T));
            }
            grChart.data.labels = labels;
            grChart.data.datasets[0].data = data;
            
            if (grChart.data.datasets.length > 1) {
                grChart.data.datasets[1].data = dataExp;
            }
            
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

        if (grChart) {
            grChart.data.labels = [];
            grChart.data.datasets[0].data = [];
            if (grChart.data.datasets.length > 1) {
                grChart.data.datasets[1].data = [];
            }
            grChart.update();
        }

        if (state.species.type === "IG" || (state.species.type === "HS" && !state.computeGr)) {
            let P_sim = 0;

            if (state.species.type === "IG") {
                P_sim = state.pid;
            } else { 
                const rho = state.N / state.V;
                const sigma = state.species.sig;
                state.eta = (Math.PI / 6) * rho * sigma**3;
                state.Z = (1 + state.eta + state.eta**2 - state.eta**3) / (1 - state.eta)**3;
                P_sim = state.pid * state.Z;
            }

            energyChart.data.labels = [0, state.maxSteps];
            energyChart.data.datasets[0].data = [0, 0];
            
            pressureChart.data.labels = [0, state.maxSteps];
            pressureChart.data.datasets[0].data = [P_sim, P_sim];

            energyChart.update();
            pressureChart.update();

            state.meanE = 0; 
            state.meanP = P_sim;
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
                
                if (state.step < state.eqStart && state.step % 1000 === 0) {
                    const ratio = state.accCount / state.attCount;
                    if (ratio > 0.5) state.dx *= 1.05;
                    else if (ratio < 0.3) state.dx *= 0.95;
                    
                    if (state.dx > state.boxSize / 2) state.dx = state.boxSize / 2;
                    
                    state.accCount = 0;
                    state.attCount = 0;
                }

                if (state.step === state.eqStart) {
                    const btnStatus = box.querySelector(".btn-status-msg");
                    if (btnStatus) {
                        btnStatus.innerText = "Amostrando dados...";
                    }
                }

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

        let btnStatus = box.querySelector(".btn-status-msg");
        if (!btnStatus) {
            btnStatus = document.createElement("span");
            btnStatus.className = "btn-status-msg";
            btnStatus.style.marginLeft = "15px";
            btnStatus.style.fontWeight = "bold";
            btnStatus.style.color = "#007BFF";
            btn.parentNode.insertBefore(btnStatus, btn.nextSibling);
        }

        const legacyStatusMsg = box.querySelector(".sim-status-msg");
        if (legacyStatusMsg) legacyStatusMsg.style.display = "none";

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

            const outputsData = box.querySelector(".sim-outputs-data");
            
            if (btnStatus) {
                btnStatus.innerText = "Equilibrando o sistema, aguarde...";
            }
            if (outputsData) outputsData.style.display = "none";

            const grInput = box.querySelector(".compute-gr");
            const doComputeGr = grInput ? (grInput.value === "true" || grInput.checked) : false;

            sim.run({
                N: parseInt(box.querySelector(".npart").value),
                boxSize: parseFloat(box.querySelector(".box").value),
                T: parseFloat(box.querySelector(".temp").value),
                dx: box.querySelector(".dx") ? parseFloat(box.querySelector(".dx").value) : undefined,
                maxSteps: parseInt(box.querySelector(".steps").value),
                species: species,
                computeGr: doComputeGr 
            });
        });
    });
});
