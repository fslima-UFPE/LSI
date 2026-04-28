function createMCSimulation(box) {

    const energyChart = new Chart(box.querySelector("#energyChart"), {
        type: "line",
        data: { labels: [], datasets: [{ data: [], borderWidth: 1, pointRadius: 0 }] },
        options: { animation: false }
    });

    const pressureChart = new Chart(box.querySelector("#pressureChart"), {
        type: "line",
        data: { labels: [], datasets: [{ data: [], borderWidth: 1, pointRadius: 0 }] },
        options: { animation: false }
    });

    const histChart = new Chart(box.querySelector("#histChart"), {
        type: "bar",
        data: { labels: [], datasets: [{ data: [] }] },
        options: { animation: false }
    });

    const R = 0.0083145;
    const kB = 1.380649e-23;

    function dist(a, b, box) {
        let dx = a[0] - b[0];
        let dy = a[1] - b[1];
        let dz = a[2] - b[2];

        dx -= Math.round(dx / box) * box;
        dy -= Math.round(dy / box) * box;
        dz -= Math.round(dz / box) * box;

        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    function LJ(dr, eps, sig) {
        const s = sig / dr;
        const s2 = s * s;
        const s6 = s2 * s2 * s2;
        const s12 = s6 * s6;

        return {
            en: 4 * eps * (s12 - s6),
            xi: 24 * eps * (2 * s12 - s6)
        };
    }

    function init(params) {

        const { species, boxSize, T, dx, maxSteps, cutoff } = params;
        const N = species.length;

        const pos = [];
        const ngrid = Math.ceil(Math.cbrt(N));
        const spacing = boxSize / ngrid;

        let c = 0;
        for (let x = 0; x < ngrid; x++) {
            for (let y = 0; y < ngrid; y++) {
                for (let z = 0; z < ngrid; z++) {
                    if (c >= N) break;
                    pos.push([(x + 0.5) * spacing, (y + 0.5) * spacing, (z + 0.5) * spacing]);
                    c++;
                }
            }
        }

        let en = 0, xi = 0;

        for (let i = 0; i < N; i++) {
            for (let j = i + 1; j < N; j++) {

                const eps = Math.sqrt(species[i].eps * species[j].eps);
                const sig = 0.5 * (species[i].sig + species[j].sig);
                const rcut = cutoff * sig;

                const dr = dist(pos[i], pos[j], boxSize);
                if (dr > rcut) continue;

                const r = LJ(dr, eps, sig);
                en += r.en;
                xi += r.xi;
            }
        }

        return {
            pos, species, N,
            en, xi,
            step: 0, maxSteps,
            box: boxSize, T, dx, cutoff,
            eqStart: Math.floor(0.2 * maxSteps),

            sumE: 0, sumE2: 0, sumP: 0, count: 0,
            hist: [],

            pcoef: kB / (T * (boxSize ** 3 * 1e-27)),
            pid: 0.01 * N * kB * T / (boxSize ** 3 * 1e-27)
        };
    }

    function mcStep(s) {

        const i = Math.floor(Math.random() * s.N);
        const oldPos = s.pos[i];
        const sp_i = s.species[i];

        let newPos = oldPos.map(v => (v + (Math.random() - 0.5) * s.dx + s.box) % s.box);

        let dE = 0, dXi = 0;

        for (let j = 0; j < s.N; j++) {
            if (j === i) continue;

            const sp_j = s.species[j];

            const eps = Math.sqrt(sp_i.eps * sp_j.eps);
            const sig = 0.5 * (sp_i.sig + sp_j.sig);
            const rcut = s.cutoff * sig;

            const drOld = dist(oldPos, s.pos[j], s.box);
            const drNew = dist(newPos, s.pos[j], s.box);

            let oldE = 0, oldXi = 0, newE = 0, newXi = 0;

            if (drOld < rcut) {
                const r = LJ(drOld, eps, sig);
                oldE = r.en; oldXi = r.xi;
            }

            if (drNew < rcut) {
                const r = LJ(drNew, eps, sig);
                newE = r.en; newXi = r.xi;
            }

            dE += newE - oldE;
            dXi += newXi - oldXi;
        }

        if (dE < 0 || Math.random() < Math.exp(-dE / s.T)) {
            s.pos[i] = newPos;
            s.en += dE;
            s.xi += dXi;
        }
    }

    function updateStats(s, stride, energyData, pressureData, labels) {

        if (s.step >= s.eqStart) {

            const E = R * s.en;
            const P = s.xi * s.pcoef + s.pid;

            s.sumE += E;
            s.sumE2 += E * E;
            s.sumP += P;
            s.count++;

            s.hist.push(E);

            if (s.step % stride === 0) {
                energyData.push(E);
                pressureData.push(P);
                labels.push(s.step);
            }
        }
    }

    function finalize(s) {

        const avgE = s.sumE / s.count;
        const avgP = s.sumP / s.count;
        const avgE2 = s.sumE2 / s.count;

        const cvm = (avgE2 - avgE * avgE) / (s.N * R * s.T * s.T) * 1000;
        const cvid = 1.5 * R * 1000;

        box.querySelector(".results").innerHTML =
            `⟨E⟩ = ${avgE.toFixed(2)} kJ/mol |
             ⟨P⟩ = ${avgP.toFixed(2)} bar |
             Cv = ${(cvm + cvid).toFixed(2)} J/mol·K 
             (real: ${cvm.toFixed(2)})`;

        const bins = 40;
        const data = s.hist;

        if (data.length === 0) return;

        let min = data[0];
        let max = data[0];

        for (let i = 1; i < data.length; i++) {
            if (data[i] < min) min = data[i];
            if (data[i] > max) max = data[i];
        }

        if (Math.abs(max - min) < 1e-12) max = min + 1e-6;

        const hist = new Array(bins).fill(0);

        for (let v of data) {
            let idx = Math.floor((v - min) / (max - min) * bins);
            idx = Math.max(0, Math.min(bins - 1, idx));
            hist[idx]++;
        }

        const norm = hist.reduce((a, b) => a + b, 0);
        const histNorm = hist.map(v => v / norm);

        const labels = histNorm.map((_, i) =>
            (min + (i + 0.5) * (max - min) / bins).toFixed(1)
        );

        histChart.data.labels = labels;
        histChart.data.datasets[0].data = histNorm;
        histChart.update();
    }

    function run(params) {

        // RESET charts
        energyChart.data.labels = [];
        energyChart.data.datasets[0].data = [];
        pressureChart.data.labels = [];
        pressureChart.data.datasets[0].data = [];
        histChart.data.labels = [];
        histChart.data.datasets[0].data = [];

        energyChart.update();
        pressureChart.update();
        histChart.update();

        const s = init(params);

        const energyData = [];
        const pressureData = [];
        const labels = [];

        const stride = Math.max(1, Math.floor(s.maxSteps / 500));

        function loop() {

            for (let i = 0; i < 200; i++) {
                mcStep(s);
                s.step++;

                updateStats(s, stride, energyData, pressureData, labels);

                if (s.step >= s.maxSteps) {

                    energyChart.data.labels = labels;
                    energyChart.data.datasets[0].data = energyData;

                    pressureChart.data.labels = labels;
                    pressureChart.data.datasets[0].data = pressureData;

                    energyChart.update("none");
                    pressureChart.update("none");

                    finalize(s);
                    return;
                }
            }

            // 🔥 REAL-TIME UPDATE
            if (s.step % (stride * 5) === 0) {
                energyChart.data.labels.push(s.step);
                energyChart.data.datasets[0].data.push(E);

                pressureChart.data.labels.push(s.step);
                pressureChart.data.datasets[0].data.push(P);

                energyChart.update("none");
                pressureChart.update("none");
            }

            requestAnimationFrame(loop);
        }

        loop();
    }

    return { run };
}


// ===== INIT =====
document.addEventListener("DOMContentLoaded", () => {

    document.querySelectorAll(".toolbox").forEach(box => {
        if (box.id !== "mc-tool") return;

        const sim = createMCSimulation(box);

        const speciesDB = {
            Xe: { eps: 218.18, sig: 4.055 },
            Ar: { eps: 116.81, sig: 3.401 },
            Ne: { eps: 36.831, sig: 2.775 },
            He: { eps: 5.465, sig: 2.628 },
            HS: { eps: 1e-6, sig: 4.0 },
            IG: { eps: 1e-9, sig: 1.0 }
        };

        box.querySelector(".jsbox-btn-primary").addEventListener("click", () => {

            const getVal = (selector) => {
                const el = box.querySelector(selector);
                if (!el) return null;
                return el.value;
            };

            const sp1 = getVal(".sp1");
            const sp2 = getVal(".sp2");
            const n1 = parseInt(getVal(".n1"));
            const n2 = parseInt(getVal(".n2"));

            if (sp1 === null || sp2 === null || isNaN(n1) || isNaN(n2)) return;

            const species = [];

            if (sp1 !== "None") {
                for (let i = 0; i < n1; i++) species.push({ ...speciesDB[sp1] });
            }

            if (sp2 !== "None") {
                for (let i = 0; i < n2; i++) species.push({ ...speciesDB[sp2] });
            }

            if (species.length === 0) return;

            sim.run({
                species,
                boxSize: parseFloat(getVal(".box")),
                T: parseFloat(getVal(".temp")),
                dx: parseFloat(getVal(".dx")),
                maxSteps: parseInt(getVal(".steps")),
                cutoff: parseFloat(getVal(".cutoff"))
            });
        });
    });
});
