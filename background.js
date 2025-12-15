// background.js

// 1. Initialize Default Settings on Install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({
    isActive: false
  });
  console.log("FaceNav Installed: Defaults set.");
});

// 2. Listen for the Extension Icon Click
chrome.action.onClicked.addListener(async (tab) => {
  // Check if we can run on this tab (avoid chrome:// URLs)
  if (tab.url.startsWith("chrome://") || tab.url.startsWith("edge://")) return;

  // Retrieve current state from the badge text (simplest way to toggle)
  const prevState = await chrome.action.getBadgeText({ tabId: tab.id });
  const isON = prevState === 'ON';

  if (!isON) {
    // --- TURN ON ---
    console.log(`Turning FaceNav ON for tab: ${tab.id}`);

    // Update Icon Badge
    await chrome.action.setBadgeText({ tabId: tab.id, text: "ON" });
    await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#00FF00" });

    // Inject Libraries FIRST, then the Core Logic
    // We do NOT inject libs/face_mesh.js because it is empty now.
    // We inject libs/mediapipe/face_mesh.js (the actual library).
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: [
        'libs/mediapipe/face_mesh.js',  // The AI Library
        'libs/camera_utils.js',         // Camera Tools
        'libs/control_utils.js',        // Drawing Tools
        'content_scripts/injector.js'   // Your Main App Logic
      ]
    });

  } else {
    // --- TURN OFF ---
    console.log(`Turning FaceNav OFF for tab: ${tab.id}`);

    // Remove Badge
    await chrome.action.setBadgeText({ tabId: tab.id, text: "" });

    // Send message to injector.js to remove itself
    // (Note: Your injector.js needs a listener for this, OR just reload the page)
    // For now, reloading the page is the cleanest way to stop all cameras/AI.
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        if (document.getElementById('facenav-root')) {
          document.getElementById('facenav-root').remove();
          window.location.reload(); // Hard stop for camera
        }
      }
    });
  }
});