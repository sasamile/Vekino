/** Inline script — evita flash de tema. Sin "use client" para poder importarlo en el root layout. */
export const THEME_STORAGE_KEY = "vekino.theme";

export const themeInitScript = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();`;
