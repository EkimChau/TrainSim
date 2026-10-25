const skins={
  '3a':{body:'#f5f4ed',stripe:'#0876bd',accent:'#f4ca24',window:'#142f47'},
  '3b':{body:'#f2f1e9',stripe:'#b62342',accent:'#00a3b5',window:'#142f47'},
};
const icons=new Map();

/** Small, top-down vector coach for the map overlay; real Sketchfab geometry is not embedded. */
export function trainIcon(skin='3a'){
  if(icons.has(skin))return icons.get(skin);
  const colors=skins[skin]??skins['3a'];
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="36" viewBox="0 0 24 36">
    <path d="M12 1C5.7 1 3 5.1 3 11v17c0 4 3.6 7 9 7s9-3 9-7V11C21 5.1 18.3 1 12 1Z" fill="${colors.body}" stroke="#17222a" stroke-width="1.5"/>
    <path d="M4 12h16v5H4zM4 26h16v3H4z" fill="${colors.stripe}"/>
    <path d="M7 8c.8-3 2.5-4.4 5-4.4s4.2 1.4 5 4.4v3H7z" fill="${colors.window}" stroke="#fff" stroke-width=".7"/>
    <path d="M7 19h3v4H7zm7 0h3v4h-3z" fill="${colors.window}"/>
    <path d="M10.3 32h3.4v2h-3.4z" fill="${colors.accent}"/>
    <circle cx="3.8" cy="14.5" r="1" fill="#17222a"/><circle cx="20.2" cy="14.5" r="1" fill="#17222a"/>
  </svg>`;
  const icon={url:`data:image/svg+xml,${encodeURIComponent(svg)}`,width:24,height:36,anchorX:12,anchorY:18,mask:false};
  icons.set(skin,icon);
  return icon;
}
