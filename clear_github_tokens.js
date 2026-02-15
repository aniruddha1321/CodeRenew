// Script to clear stale GitHub tokens from localStorage
// Run this in the browser console or as a script

console.log("Clearing stale GitHub tokens...");

// Clear localStorage settings
try {
  const settings = localStorage.getItem('legacyCodeModernizer_settings');
  if (settings) {
    const parsed = JSON.parse(settings);
    if (parsed.githubToken) {
      console.log("Found GitHub token in localStorage, clearing...");
      parsed.githubToken = '';
      localStorage.setItem('legacyCodeModernizer_settings', JSON.stringify(parsed));
      console.log("GitHub token cleared from localStorage");
    } else {
      console.log("No GitHub token found in localStorage");
    }
  } else {
    console.log("No settings found in localStorage");
  }
} catch (error) {
  console.error("Error clearing GitHub token:", error);
}

// Clear any other potential GitHub-related data
const keys = Object.keys(localStorage);
const githubKeys = keys.filter(key => key.toLowerCase().includes('github') || key.toLowerCase().includes('git'));

if (githubKeys.length > 0) {
  console.log("Found GitHub-related localStorage keys:", githubKeys);
  githubKeys.forEach(key => {
    localStorage.removeItem(key);
    console.log(`Removed localStorage key: ${key}`);
  });
} else {
  console.log("No additional GitHub-related localStorage keys found");
}

console.log("GitHub token cleanup completed!");