Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\Pookies\Desktop\dev\akodo"

' Start Vite dev server
WshShell.Run "cmd /c node node_modules\vite\bin\vite.js", 0, False

' Wait for Vite to start
WScript.Sleep 4000

' Start Electron  
WshShell.Environment("Process")("NODE_ENV") = "development"
WshShell.Run "cmd /c node_modules\.bin\electron.cmd . --no-sandbox", 0, False
