// Theme management with pure JavaScript
let currentTheme = localStorage.getItem('dark-mode') === 'true';

// Initialize theme
export const initTheme = () => {
  if (currentTheme) {
    document.body.classList.add('dark-mode');
  }
  return currentTheme;
};

// Toggle theme without React
export const toggleTheme = () => {
  currentTheme = !currentTheme;
  if (currentTheme) {
    document.body.classList.add('dark-mode');
    localStorage.setItem('dark-mode', 'true');
  } else {
    document.body.classList.remove('dark-mode');
    localStorage.setItem('dark-mode', 'false');
  }
  
  // Dispatch custom event for theme change
  const event = new CustomEvent('themeChanged', { detail: { isDark: currentTheme } });
  document.dispatchEvent(event);
  
  return currentTheme;
};

// Get current theme state
export const isDarkMode = () => {
  return currentTheme;
};

// Listen for theme changes
document.addEventListener('themeChanged', (e) => {
  // Update CodeMirror theme if it exists
  const codeMirrorElements = document.querySelectorAll('.cm-editor');
  codeMirrorElements.forEach(element => {
    if (element.cmView) {
      element.cmView.dispatch({
        effects: e.detail.isDark ? 'dark' : 'light'
      });
    }
  });
}); 