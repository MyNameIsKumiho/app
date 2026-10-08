; The bundled server is a Next.js build whose file names change every release.
; NSIS only overwrites files, so stale chunks from an older version would be
; served after an update. Remove the old server folder before copying the new one.
; User data (saves, database, aetherfall.env) lives in %APPDATA% and is not touched.
!macro NSIS_HOOK_PREINSTALL
  RMDir /r "$INSTDIR\server"
!macroend
