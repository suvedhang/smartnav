// background.js

// 1. Initialize Default Settings on Install
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync.set({
      isActive: false,
      sensitivity: 50, // Default sensitivity (0-100)
      useVoice: true   // Default voice enabled
    });
    console.log("FaceNav Installed: Defaults set.");
});

// 2. Listen for the Extension Icon Click
chrome.action.onClicked.addListener(async (tab) => {
    // Check if we can run on this tab (avoid chrome:// URLs)
    if (tab.url.startsWith("chrome://") || tab.url.startsWith("edge://")) return;

    // Retrieve current state
    chrome.storage.sync.get(['isActive'], (data) => {
      const nextState = !data.isActive;

      // Toggle the State
      chrome.storage.sync.set({ isActive: nextState });

      if (nextState) {
        // TURN ON: Inject Libraries FIRST, then the Core Logic
        console.log(`Turning FaceNav ON for tab: ${tab.id}`);
        
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          // The order matters here! Libraries first.
          files: [
            'libs/camera_utils.js', 
            'libs/control_utils.js', 
            'libs/face_mesh.js', 
            'content_scripts/injector.js'
          ]
        });

        // Update Icon Badge to show "ON"
        chrome.action.setBadgeText({ text: "ON" });
        chrome.action.setBadgeBackgroundColor({ color: "#00FF00" });

      } else {
        // TURN OFF: Send a message to the tab to stop the AI loop
        console.log(`Turning FaceNav OFF for tab: ${tab.id}`);
        
        chrome.tabs.sendMessage(tab.id, { action: "STOP_TRACKING" });

        // Update Icon Badge to show nothing
        chrome.action.setBadgeText({ text: "" });
      }
    });
});