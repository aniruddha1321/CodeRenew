// Script to clear GitHub tokens from backend secure storage
// Run this script to clear stale GitHub tokens

const BACKEND_URL = "http://localhost:5000";

async function clearGitHubToken() {
  try {
    console.log("Clearing GitHub token from backend secure storage...");
    
    const response = await fetch(`${BACKEND_URL}/api/gitdelete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'GitHub'
      })
    });

    if (response.ok) {
      const result = await response.json();
      console.log("GitHub token cleared successfully:", result);
    } else {
      const error = await response.json();
      console.error("Failed to clear GitHub token:", error);
    }
  } catch (error) {
    console.error("Error clearing GitHub token:", error);
  }
}

// Also clear localStorage
try {
  const settings = localStorage.getItem('legacyCodeModernizer_settings');
  if (settings) {
    const parsed = JSON.parse(settings);
    if (parsed.githubToken) {
      console.log("Clearing GitHub token from localStorage...");
      parsed.githubToken = '';
      localStorage.setItem('legacyCodeModernizer_settings', JSON.stringify(parsed));
      console.log("GitHub token cleared from localStorage");
    }
  }
} catch (error) {
  console.error("Error clearing localStorage:", error);
}

// Run the function
clearGitHubToken();