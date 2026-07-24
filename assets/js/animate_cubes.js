const stirrer = document.getElementById('stirrer');
const iceCubes = document.getElementById('ice-cubes');
const motionWaves = document.getElementById('motion-waves');
const startBtn = document.getElementById('start-btn');

let animationFrameId;
let progress = 0; // Tracks the state of the system from 0 to 1
let rotationAngle = 0;
let isRunning = false;

function animateSystem() {
  if (progress >= 1) {
    // System has reached equilibrium (all ice melted)
    cancelAnimationFrame(animationFrameId);
    motionWaves.style.opacity = 0; // Stirring stops
    isRunning = false;
    startBtn.innerText = "Ice Melted (System at Equilibrium)";
    startBtn.disabled = true;
    return;
  }

  // 1. Advance the simulation state
  progress += 0.002; // Adjust this value to speed up/slow down the melting
  rotationAngle += 8; // Adjust to speed up the mechanical rotation visual

  // 2. Rotate the stirrer blade
  stirrer.style.transform = `rotate(${rotationAngle}deg)`;

  // 3. Fade out the ice cubes smoothly
  iceCubes.style.opacity = 1 - progress;

  // 4. Make motion waves visible while stirring
  motionWaves.style.opacity = 0.7; 

  // Loop the animation loop
  animationFrameId = requestAnimationFrame(animateSystem);
}

startBtn.addEventListener('click', () => {
  if (!isRunning) {
    isRunning = true;
    startBtn.innerText = "Stirring System...";
    animateSystem();
  }
});
