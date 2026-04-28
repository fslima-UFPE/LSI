function createMCSimulation(box) {

    const canvas = box.querySelector(".jsbox-canvas-container canvas");
    const ctx = canvas.getContext("2d");

    const energyChart = new Chart(box.querySelector("#energyChart"), {
        type: "line",
        data: { labels: [], datasets: [{ label: "Energy (kJ/mol)", data: [], borderWidth: 1 }] },
        options: { animation: false, scales: { x: { title: { display: true, text: "MC steps" }}}}
    });

    const pressureChart = new Chart(box.querySelector("#pressureChart"), {
        type: "line",
        data: { labels: [], datasets: [{ label: "Pressure (bar)", data: [], borderWidth: 1 }] },
        options: { animation: false, scales: { x: { title: { display: true, text: "MC steps" }}}}
    });

    const histChart = new Chart(box.querySelector("#histChart"), {
        type: "bar",
        data: { labels: [], datasets: [{ label: "Energy histogram", data: [] }] },
        options: { animation: false }
    });

    const R = 0.0083145;
    const kB = 1.380649e-23;

    let state = null;

    function LJ(dr, eps, sig) {
        const s = sig / dr;
        const s2 = s*s;
        const s6 = s2*s2*s2;
        const s12 = s6*s6;

        return {
            en: 4 * eps * (s12 - s6),
            xi: 24 * eps * (2*s12 - s6)
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

    function initSimulation(params) {

        const { N, boxSize, T, dx, maxSteps, species } = params;

        const positions = [];
        const types = [];

        const ngrid = Math.ceil(Math.cbrt(N));
        const spacing = boxSize / ngrid;

        let count = 0;
        for (let x=0; x<ngrid; x++) {
            for (let y=0; y<ngrid; y++) {
                for (let z=0; z<ngrid; z++) {
                    if (count >= N) break;

                    positions.push([
                        (x+0.5)*spacing,
                        (y+0.5)*spacing,
                        (z+0.5)*spacing
                    ]);

                    types.push(0); // single species for now
                    count++;
                }
            }
        }

        let energy = 0;
        let xi = 0;

        for (let i=0;i<N;i++){
            for (let j=i+1;j<N;j++){
                const dr = dist(positions[i], positions[j], boxSize);
                const res = LJ(dr, species.eps, species.sig);
                energy += res.en;
                xi += res.xi;
            }
        }

        return {
            positions,
            types,
            energy,
            xi,
            step: 0,
            maxSteps,
            T,
            dx,
            box: boxSize,
            N,
            pcoef: kB/(T*(boxSize**3*1e-27)),
            pid: 0.01*N*kB*T/(boxSize**3*1e-27),
            eqStart: Math.floor(0.2*maxSteps),

            sumE: 0,
            sumE2: 0,
            sumP: 0,
            count: 0,

            hist: []
        };
    }

    function mcStep(s, species) {

        const i = Math.floor(Math.random()*s.N);
        const oldPos = [...s.positions[i]];

        let newPos = oldPos.map(v => v + (Math.random()-0.5)*s.dx);
        newPos = newPos.map(v => (v+s.box)%s.box);

        let dE = 0;
        let dXi = 0;

        for (let j=0;j<s.N;j++){
            if (j===i) continue;

            let drOld = dist(oldPos, s.positions[j], s.box);
            let drNew = dist(newPos, s.positions[j], s.box);

            const oldRes = LJ(drOld, species.eps, species.sig);
            const newRes = LJ(drNew, species.eps, species.sig);

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

        if (s.step >= s.eqStart) {

            const E = R*s.energy;
            const P = s.xi*s.pcoef + s.pid;

            s.sumE += E;
            s.sumE2 += E*E;
            s.sumP += P;
            s.count++;

            s.hist.push(E);

            energyChart.data.labels.push(s.step);
            energyChart.data.datasets[0].data.push(E);

            pressureChart.data.labels.push(s.step);
            pressureChart.data.datasets[0].data.push(P);
        }
    }

    function drawParticles(s) {

        ctx.clearRect(0,0,canvas.width,canvas.height);

        const scale = canvas.width / s.box;

        for (let p of s.positions) {
            ctx.beginPath();
            ctx.arc(p[0]*scale, p[1]*scale, 3, 0, 2*Math.PI);
            ctx.fill();
        }
    }

    function finalize(s) {

        const avgE = s.sumE / s.count;
        const avgP = s.sumP / s.count;

        const cv = (s.sumE2/s.count - avgE*avgE)/(s.N*R*s.T*s.T);

        box.querySelector(".results").innerHTML =
            `⟨E⟩ = ${avgE.toFixed(2)} kJ/mol |
             ⟨P⟩ = ${avgP.toFixed(2)} bar |
             Cv = ${cv.toFixed(2)} J/mol·K`;

        // histogram
        const bins = 30;
        const min = Math.min(...s.hist);
        const max = Math.max(...s.hist);

        const hist = new Array(bins).fill(0);

        s.hist.forEach(v=>{
            const i = Math.floor((v-min)/(max-min)*bins);
            hist[Math.min(i,bins-1)]++;
        });

        histChart.data.labels = hist.map((_,i)=>i);
        histChart.data.datasets[0].data = hist;
        histChart.update();
    }

    function run(params) {

        state = initSimulation(params);

        function loop() {

            for (let i=0;i<50;i++) {  // MANY MC steps per frame
                mcStep(state, params.species);
                state.step++;
                updateStats(state);

                if (state.step >= state.maxSteps) {
                    finalize(state);
                    return;
                }
            }

            drawParticles(state);
            energyChart.update();
            pressureChart.update();

            requestAnimationFrame(loop);
        }

        loop();
    }

    return { run };
}
