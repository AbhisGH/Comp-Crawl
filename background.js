// background.js - Service Worker for RedBus initialization

// Track RedBus tab state
let redbusTabId = null;
let isRedbusReady = false;
let initializationPromise = null;

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "INIT_REDBUS") {
    handleRedbusInit()
      .then(() => sendResponse({ success: true, ready: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }
  
  if (request.type === "CHECK_REDBUS_STATUS") {
    sendResponse({ ready: isRedbusReady, tabId: redbusTabId });
    return false;
  }
});

// Handle RedBus initialization
async function handleRedbusInit() {
  // If already initializing, return existing promise
  if (initializationPromise) {
    return initializationPromise;
  }
  
  // If already ready, return immediately
  if (isRedbusReady && redbusTabId) {
    const tabExists = await checkTabExists(redbusTabId);
    if (tabExists) {
      console.log("RedBus already initialized");
      return Promise.resolve();
    } else {
      // Tab was closed, reset state
      isRedbusReady = false;
      redbusTabId = null;
    }
  }
  
  // Create new initialization promise
  initializationPromise = initializeRedbus();
  
  try {
    await initializationPromise;
    return Promise.resolve();
  } finally {
    initializationPromise = null;
  }
}

// Initialize RedBus session
async function initializeRedbus() {
  console.log("Initializing RedBus session...");
  
  try {
    // Check if RedBus tab already exists
    const tabs = await chrome.tabs.query({ url: "https://www.redbus.in/*" });
    
    if (tabs.length > 0) {
      console.log("Found existing RedBus tab:", tabs[0].id);
      redbusTabId = tabs[0].id;
      isRedbusReady = true;
      return Promise.resolve();
    }
    
    // Create new inactive RedBus tab
    console.log("Creating new RedBus tab...");
    const tab = await chrome.tabs.create({
      url: "https://www.redbus.in",
      active: false // Keep tab in background
    });
    
    redbusTabId = tab.id;
    
    // Wait for tab to load and cookies to be set
    await waitForTabLoad(tab.id);
    
    // Additional wait to ensure cookies are fully set
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    isRedbusReady = true;
    console.log("RedBus session initialized successfully");
    
    return Promise.resolve();
    
  } catch (error) {
    console.error("Failed to initialize RedBus:", error);
    isRedbusReady = false;
    redbusTabId = null;
    throw error;
  }
}

// Wait for tab to complete loading
function waitForTabLoad(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Tab load timeout"));
    }, 15000); // 15 second timeout
    
    const listener = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    
    chrome.tabs.onUpdated.addListener(listener);
    
    // Check if already loaded
    chrome.tabs.get(tabId, (tab) => {
      if (tab.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    });
  });
}

// Check if tab still exists
async function checkTabExists(tabId) {
  try {
    await chrome.tabs.get(tabId);
    return true;
  } catch {
    return false;
  }
}

// Listen for tab closure
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === redbusTabId) {
    console.log("RedBus tab closed, resetting state");
    redbusTabId = null;
    isRedbusReady = false;
  }
});

// Keep service worker alive
chrome.runtime.onInstalled.addListener(() => {
  console.log("RedBus extension installed/updated");
});

console.log("RedBus background service worker loaded");