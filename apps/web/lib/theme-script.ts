/** Inline script — evita flash de tema. Sin "use client" para poder importarlo en el root layout.
 *  Default: light (el login y la marca se diseñaron en claro; el SO en dark no debe forzar negro). */
export const THEME_STORAGE_KEY = "vekino.theme";

export const themeInitScript = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}')||'light';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();`;
