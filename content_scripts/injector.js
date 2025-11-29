// content_scripts/injector.js

console.log("FaceNav: Starting...");

// --- CONFIGURATION (Tweaking the feel) ---
const CONFIG = {
    smoothFactor: 0.15,      // Lower = smoother but slower
    scrollSpeed: 20,         // Pixels per scroll
    mouthThreshold: 0.5,     // How wide mouth must be open to "Click"
    clickCooldown: 2000,     // 2 seconds between clicks (prevents spam)
    headTiltUpLimit: 0.15,   // Threshold for looking UP
    headTiltDownLimit: 0.25  // Threshold for looking DOWN
};

// --- STATE MANAGEMENT ---
let state = {
    isScrolling: false,
    scrollDirection: 0, 
    lastClickTime: 0,
    targetScrollY: window.scrollY
};

// 1. CHECK & CLEANUP
// If the extension is clicked twice, remove the old one first.
if (document.getElementById('facenav-root')) {
    document.getElementById('facenav-root').remove();
    // Ideally we should also stop the camera stream here, 
    // but for a prototype, a reload works best.
}

// 2. CREATE THE UI (The "Cockpit")
const container = document.createElement('div');
container.id = 'facenav-root';

// Style the overlay to sit on top of any website
Object.assign(container.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    width: '320px',
    height: '240px',
    zIndex: '2147483647',
    pointerEvents: 'none' // Clicks pass through the video box
});

container.innerHTML = `
    <style>
        .fn-wrapper {
            position: relative;
            width: 100%;
            height: 100%;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 10px 20px rgba(0,0,0,0.5);
            border: 3px solid #00ff00;
            background: #000;
        }
        .fn-video { display: none; } /* Hide raw webcam */
        .fn-canvas {
            width: 100%;
            height: 100%;
            transform: scaleX(-1); /* Mirror effect */
        }
        .fn-status {
            position: absolute;
            bottom: 0;
            left: 0;
            width: 100%;
            background: rgba(0, 0, 0, 0.8);
            color: #00ff00;
            font-family: monospace;
            font-size: 12px;
            padding: 4px;
            text-align: center;
        }
    </style>
    <div class="fn-wrapper">
        <video class="fn-video" autoplay playsinline></video>
        <canvas class="fn-canvas"></canvas>
        <div class="fn-status">FaceNav: Loading AI...</div>
    </div>
`;
document.body.appendChild(container);

// 3. LOAD AI LIBRARIES (Sequentially)
const libraries = [
    "https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js",
    "https://cdn.jsdelivr.net/npm/@mediapipe/control_utils/control_utils.js",
    "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js"
];

function loadScriptsSequentially(urls, callback) {
    if (urls.length === 0) {
        callback();
        return;
    }
    const script = document.createElement('script');
    script.src = urls[0];
    script.crossOrigin = "anonymous";
    script.onload = () => loadScriptsSequentially(urls.slice(1), callback);
    document.head.appendChild(script);
}

loadScriptsSequentially(libraries, () => {
    console.log("FaceNav: AI Libraries Loaded.");
    startAI();
});


// 4. START THE AI LOGIC
function startAI() {
    const videoElement = document.querySelector('#facenav-root .fn-video');
    const canvasElement = document.querySelector('#facenav-root .fn-canvas');
    const statusBox = document.querySelector('#facenav-root .fn-status');
    const canvasCtx = canvasElement.getContext('2d');

    // Initialize MediaPipe FaceMesh
    const faceMesh = new FaceMesh({locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
    }});

    faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    faceMesh.onResults(onResults);

    // Initialize Camera
    const camera = new Camera(videoElement, {
        onFrame: async () => {
            await faceMesh.send({image: videoElement});
        },
        width: 320,
        height: 240
    });
    camera.start();

    // --- THE LOOP ---
    function onResults(results) {
        // Draw Video
        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

        if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            const landmarks = results.multiFaceLandmarks[0];

            // Visual Debug: Draw Nose & Mouth Points
            drawPoint(canvasCtx, landmarks[1], "#FF0000"); // Nose
            drawPoint(canvasCtx, landmarks[13], "#00FF00"); // Lips
            drawPoint(canvasCtx, landmarks[14], "#00FF00");

            // --- LOGIC A: SCROLLING (Head Pitch) ---
            const noseY = landmarks[1].y;
            const leftEyeY = landmarks[33].y;
            const rightEyeY = landmarks[263].y;
            const eyesMidY = (leftEyeY + rightEyeY) / 2;
            const pitch = noseY - eyesMidY; // Distance between nose and eye-line

            if (pitch < CONFIG.headTiltUpLimit) {
                statusBox.innerText = "Command: Scroll UP ⬆️";
                window.scrollBy({ top: -CONFIG.scrollSpeed, behavior: 'smooth' });
            } else if (pitch > CONFIG.headTiltDownLimit) {
                statusBox.innerText = "Command: Scroll DOWN ⬇️";
                window.scrollBy({ top: CONFIG.scrollSpeed, behavior: 'smooth' });
            } else {
                statusBox.innerText = "Status: Idle";
            }

            // --- LOGIC B: CLICKING (Mouth Open) ---
            const upperLip = landmarks[13];
            const lowerLip = landmarks[14];
            const mouthLeft = landmarks[61];
            const mouthRight = landmarks[291];

            // Calculate Mouth Aspect Ratio (Height / Width)
            const height = Math.hypot(upperLip.x - lowerLip.x, upperLip.y - lowerLip.y);
            const width = Math.hypot(mouthLeft.x - mouthRight.x, mouthLeft.y - mouthRight.y);
            const mar = height / width;

            if (mar > CONFIG.mouthThreshold) {
                const now = Date.now();
                if (now - state.lastClickTime > CONFIG.clickCooldown) {
                    triggerClick(statusBox);
                    state.lastClickTime = now;
                }
            }

        } else {
            statusBox.innerText = "Status: No Face Detected";
        }
        canvasCtx.restore();
    }
}

// Helper: Visual Click Feedback
function triggerClick(statusBox) {
    statusBox.innerText = "💥 CLICK!";
    statusBox.style.color = "red";
    
    // Flash Screen White
    const flash = document.createElement('div');
    Object.assign(flash.style, {
        position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
        background: "white", opacity: 0.5, zIndex: 999999, pointerEvents: "none"
    });
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 150);

    // CLICK ACTION: Clicks the first link it finds (Proof of concept)
    const firstLink = document.querySelector('a');
    if (firstLink) {
        console.log("FaceNav: Clicking link", firstLink);
        firstLink.click();
    }
}

// Helper: Draw Dot
function drawPoint(ctx, point, color) {
    const x = point.x * 320; // Scale to canvas size
    const y = point.y * 240;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, 2 * Math.PI);
    ctx.fill();
}