const skins={
  '3a':{body:'#f5f4ed',stripe:'#0876bd',accent:'#f4ca24',window:'#142f47'},
  '3b':{body:'#f2f1e9',stripe:'#b62342',accent:'#00a3b5',window:'#142f47'},
};
const icons=new Map();

/** Top-down vector icon for one three-car QR EMU unit; no 3D model is embedded. */
export function trainIcon(skin='3a'){
  if(icons.has(skin))return icons.get(skin);
  const colors=skins[skin]??skins['3a'];
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="72" viewBox="0 0 24 72">
    <path d="M12 1C6.2 1 3 4.8 3 10v9h18v-9c0-5.2-3.2-9-9-9ZM3 22h18v19H3zM3 44h18v18c0 5.2-3.2 9-9 9s-9-3.8-9-9z"
      fill="${colors.body}" stroke="#17222a" stroke-width="1.5"/>
    <path d="M3 12h18v4H3zM3 28h18v4H3zM3 50h18v4H3z" fill="${colors.stripe}"/>
    <path d="M6 6c1.3-2 3.2-3 6-3s4.7 1 6 3v4H6z" fill="${colors.window}"/>
    <path d="M6 24h4v12H6zm8 0h4v12h-4zM6 46h4v11H6zm8 0h4v11h-4z" fill="${colors.window}"/>
    <path d="M10 65h4v3h-4z" fill="${colors.accent}"/>
    <path d="M3 20h18M3 42h18" stroke="#17222a" stroke-width="1.5"/>
    <circle cx="3.8" cy="17" r="1.1" fill="#17222a"/><circle cx="20.2" cy="17" r="1.1" fill="#17222a"/>
  </svg>`;
  const icon={url:`data:image/svg+xml,${encodeURIComponent(svg)}`,width:24,height:72,anchorX:12,anchorY:36,mask:false};
  icons.set(skin,icon);
  return icon;
}
